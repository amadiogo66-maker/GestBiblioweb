/**
 * Deux listes de lectures de démonstration pour un enseignant EXISTANT, avec des
 * ouvrages déjà au catalogue. Ne crée aucun compte. Idempotent : relancé, il
 * retrouve ses listes par leur titre et n'ajoute pas d'ouvrage en double.
 *
 *   npm run db:seed-demo-reading-lists -- --teacher <email>          → simulation
 *   npm run db:seed-demo-reading-lists -- --teacher <email> --yes    → écriture
 */
import { prisma } from '../lib/prisma';
import { describeDatabaseTarget, hasFlag } from './db-target';

const DEMO_LISTS = [
  { title: 'Démonstration : lectures essentielles', courseCode: 'DEMO-101', status: 'PUBLISHED' as const, books: 4 },
  { title: 'Démonstration : pour aller plus loin', courseCode: 'DEMO-201', status: 'DRAFT' as const, books: 3 },
];

function fail(message: string): never {
  console.error(`Erreur : ${message}`);
  console.error('Usage : npm run db:seed-demo-reading-lists -- --teacher <email> [--yes]');
  process.exit(1);
}

async function main(): Promise<void> {
  const argv = process.argv.slice(2);
  const index = argv.indexOf('--teacher');
  const email = index === -1 ? undefined : argv[index + 1]?.trim().toLowerCase();
  const apply = hasFlag(argv, '--yes');

  if (!email || !email.includes('@')) fail('--teacher <email> est obligatoire');

  console.log(`Base visée : ${describeDatabaseTarget()}`);

  const teacher = await prisma.user.findUnique({ where: { email }, select: { id: true, role: true, status: true, departmentId: true } });

  if (!teacher) fail(`aucun compte avec l'email ${email} (ce script ne crée aucun compte)`);
  if (teacher.role !== 'TEACHER') fail(`le compte n'est pas enseignant (rôle ${teacher.role})`);
  if (teacher.status !== 'ACTIVE') fail(`le compte est ${teacher.status}`);
  if (!teacher.departmentId) fail("l'enseignant n'est rattaché à aucun département officiel");

  // Ouvrages du département de préférence, complétés par le reste du catalogue.
  const needed = Math.max(...DEMO_LISTS.map((list) => list.books)) + DEMO_LISTS.length;
  const inDepartment = await prisma.book.findMany({ where: { departmentId: teacher.departmentId }, orderBy: { title: 'asc' }, take: needed, select: { id: true } });
  const others = inDepartment.length < needed
    ? await prisma.book.findMany({ where: { id: { notIn: inDepartment.map((book) => book.id) } }, orderBy: { title: 'asc' }, take: needed - inDepartment.length, select: { id: true } })
    : [];
  const books = [...inDepartment, ...others];

  if (books.length === 0) fail('le catalogue est vide : synchronisez des ouvrages avant');

  for (const [offset, demo] of DEMO_LISTS.entries()) {
    const existing = await prisma.readingList.findFirst({ where: { ownerId: teacher.id, title: demo.title }, select: { id: true } });
    const chosen = books.slice(offset, offset + demo.books);

    if (!apply) {
      console.log(`Simulation : ${existing ? 'compléter' : 'créer'} « ${demo.title} » (${demo.status}) avec ${chosen.length} ouvrage(s).`);
      continue;
    }

    const list =
      existing ??
      (await prisma.readingList.create({
        data: { ownerId: teacher.id, departmentId: teacher.departmentId, title: demo.title, courseCode: demo.courseCode, status: demo.status },
        select: { id: true },
      }));
    const { count } = await prisma.readingListItem.createMany({
      data: chosen.map((book, position) => ({ listId: list.id, bookId: book.id, position })),
      skipDuplicates: true,
    });

    console.log(`${existing ? 'Complétée' : 'Créée'} : « ${demo.title} » (+${count} ouvrage(s)).`);
  }

  if (!apply) console.log('Aucune écriture. Ajoutez --yes pour appliquer.');
}

main()
  .catch((error: unknown) => {
    console.error(`Échec : ${error instanceof Error ? error.message : 'erreur inconnue'}`);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
