import { PrismaClient, BookStatus } from '@prisma/client';
import { logger } from '../lib/logger';

const prisma = new PrismaClient();

const DEMO_BOOKS = [
  {
    externalId: 'DEMO-BOOK-001',
    title: 'Le Petit Prince',
    author: 'Antoine de Saint-Exupéry',
    isbn: '9782070408504',
    publisher: 'Gallimard',
    summary: 'Un conte poétique et philosophique sous l’apparence d’un livre pour enfants.',
    coverImage: 'https://covers.openlibrary.org/b/isbn/9780156012195-L.jpg',
    year: 2000,
    department: 'Lettres',
    category: 'Littérature',
    location: 'Rayon G-02',
    totalCopies: 3,
    availableCopies: 3,
    status: BookStatus.AVAILABLE,
    isNew: true,
    loanCount: 6,
  },
  {
    externalId: 'DEMO-BOOK-002',
    title: 'Data Structures and Algorithm Analysis',
    author: 'Mark Allen Weiss',
    isbn: '9780132576277',
    publisher: 'Pearson',
    summary: 'Analyse rigoureuse des structures de données et des algorithmes, illustrée en Java.',
    coverImage: 'https://covers.openlibrary.org/b/isbn/9780132576277-L.jpg',
    year: 2012,
    department: 'Informatique',
    category: 'Algorithmique',
    location: 'Rayon A-13',
    totalCopies: 2,
    availableCopies: 0,
    status: BookStatus.BORROWED,
    isNew: false,
    loanCount: 40,
  },
  {
    externalId: 'DEMO-BOOK-003',
    title: 'Principes de Chimie Organique',
    author: 'Paul Arnaud',
    isbn: '9782100747406',
    publisher: 'Dunod',
    summary: 'Introduction complète aux mécanismes réactionnels de la chimie organique.',
    coverImage: null,
    year: 2022,
    department: 'Chimie',
    category: 'Chimie organique',
    location: 'Rayon D-09',
    totalCopies: 4,
    availableCopies: 2,
    status: BookStatus.AVAILABLE,
    isNew: true,
    loanCount: 11,
  },
];

async function main(): Promise<void> {
  for (const book of DEMO_BOOKS) {
    await prisma.book.upsert({
      where: { externalId: book.externalId },
      update: book,
      create: book,
    });
  }
}

main()
  .then(() => logger.info('3 livres de démonstration ajoutés avec succès'))
  .catch((error: unknown) => {
    logger.error('Ajout des livres de démonstration échoué', {
      error: error instanceof Error ? error.message : 'unknown error',
    });
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
