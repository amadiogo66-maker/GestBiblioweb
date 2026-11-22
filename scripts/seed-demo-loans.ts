/**
 * Prêts FICTIFS de démonstration pour test@test.com (externalId préfixés DEMO-).
 * Idempotent : un prêt déjà présent n'est pas modifié. Ne touche ni aux
 * utilisateurs, ni aux mots de passe, ni aux livres. Jamais appelé par prisma/seed.ts.
 *
 *   npm run db:seed-demo-loans           → simulation
 *   npm run db:seed-demo-loans -- --yes  → création
 */
import { addDays } from 'date-fns';
import type { LoanStatus } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { describeDatabaseTarget, hasFlag } from './db-target';

const DEMO_EMAIL = 'test@test.com';

interface DemoLoan {
  externalId: string;
  bookExternalId: string;
  borrowOffset: number;
  dueOffset: number;
  returnOffset: number | null;
  status: LoanStatus;
}

const DEMO_LOANS: DemoLoan[] = [
  { externalId: 'DEMO-LOAN-EN-COURS', bookExternalId: 'SEED-BOOK-001', borrowOffset: -3, dueOffset: 11, returnOffset: null, status: 'ACTIVE' },
  { externalId: 'DEMO-LOAN-BIENTOT', bookExternalId: 'SEED-BOOK-002', borrowOffset: -12, dueOffset: 2, returnOffset: null, status: 'ACTIVE' },
  { externalId: 'DEMO-LOAN-RENDU', bookExternalId: 'SEED-BOOK-003', borrowOffset: -40, dueOffset: -26, returnOffset: -28, status: 'RETURNED' },
];

async function main(): Promise<void> {
  console.log(`Base visée : ${describeDatabaseTarget()}`);

  const user = await prisma.user.findUnique({ where: { email: DEMO_EMAIL }, select: { id: true, matricule: true } });

  if (!user) {
    console.error(`Erreur : compte ${DEMO_EMAIL} introuvable.`);
    process.exitCode = 1;
    return;
  }

  const [existing, books] = await Promise.all([
    prisma.loan.findMany({ where: { externalId: { in: DEMO_LOANS.map((loan) => loan.externalId) } }, select: { externalId: true } }),
    prisma.book.findMany({ where: { externalId: { in: DEMO_LOANS.map((loan) => loan.bookExternalId) } }, select: { id: true, externalId: true } }),
  ]);
  const present = new Set(existing.map((loan) => loan.externalId));
  const bookIds = new Map(books.map((book) => [book.externalId, book.id]));
  const missing = DEMO_LOANS.filter((loan) => !present.has(loan.externalId));

  if (!hasFlag(process.argv.slice(2), '--yes')) {
    console.log(`Simulation : ${missing.length} prêt(s) de démonstration seraient créés. Ajoutez --yes pour appliquer.`);
    return;
  }

  const now = new Date();
  let created = 0;

  for (const loan of missing) {
    const bookId = bookIds.get(loan.bookExternalId);

    if (!bookId) {
      console.error(`Livre ${loan.bookExternalId} introuvable : prêt ${loan.externalId} ignoré.`);
      continue;
    }

    await prisma.loan.create({
      data: {
        externalId: loan.externalId,
        userId: user.id,
        matricule: user.matricule,
        bookId,
        borrowDate: addDays(now, loan.borrowOffset),
        dueDate: addDays(now, loan.dueOffset),
        returnDate: loan.returnOffset === null ? null : addDays(now, loan.returnOffset),
        status: loan.status,
      },
    });
    created += 1;
  }

  console.log(`Fait : ${created} prêt(s) créé(s), ${present.size} déjà présent(s).`);
}

main()
  .catch((error: unknown) => {
    console.error(`Échec : ${error instanceof Error ? error.message : 'erreur inconnue'}`);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
