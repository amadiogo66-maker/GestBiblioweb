import { PrismaClient, NewsCategory } from '@prisma/client';
import { hash } from 'bcryptjs';
import { logger } from '../lib/logger';

const prisma = new PrismaClient();

const BOOKS = [
  {
    externalId: 'SEED-BOOK-001',
    title: 'Introduction à l’Algorithmique',
    author: 'Thomas H. Cormen',
    isbn: '9782100544260',
    publisher: 'Dunod',
    summary: 'Un panorama complet des algorithmes fondamentaux et de leur analyse.',
    coverImage: 'https://covers.openlibrary.org/b/isbn/9780262033848-L.jpg',
    year: 2010,
    department: 'Informatique',
    category: 'Algorithmique',
    location: 'Rayon A-12',
    totalCopies: 5,
    availableCopies: 4,
    isNew: true,
    loanCount: 18,
  },
  {
    externalId: 'SEED-BOOK-002',
    title: 'Bases de Données Relationnelles',
    author: 'Georges Gardarin',
    isbn: '9782212120369',
    publisher: 'Eyrolles',
    summary: 'Modélisation, conception et administration des systèmes de gestion de bases de données.',
    coverImage: 'https://covers.openlibrary.org/b/isbn/9782212120369-L.jpg',
    year: 2003,
    department: 'Informatique',
    category: 'Bases de données',
    location: 'Rayon A-14',
    totalCopies: 3,
    availableCopies: 3,
    isNew: false,
    loanCount: 27,
  },
  {
    externalId: 'SEED-BOOK-003',
    title: 'Précis de Droit Constitutionnel',
    author: 'Louis Favoreu',
    isbn: '9782247183456',
    publisher: 'Dalloz',
    summary: 'Les grands principes du droit constitutionnel comparé.',
    coverImage: null,
    year: 2019,
    department: 'Droit',
    category: 'Droit public',
    location: 'Rayon B-03',
    totalCopies: 4,
    availableCopies: 2,
    isNew: false,
    loanCount: 12,
  },
  {
    externalId: 'SEED-BOOK-004',
    title: 'Économie du Développement',
    author: 'Debraj Ray',
    isbn: '9780691017068',
    publisher: 'Princeton University Press',
    summary: 'Une analyse approfondie des enjeux économiques des pays en développement.',
    coverImage: 'https://covers.openlibrary.org/b/isbn/9780691017068-L.jpg',
    year: 1998,
    department: 'Économie',
    category: 'Économie du développement',
    location: 'Rayon C-07',
    totalCopies: 3,
    availableCopies: 1,
    isNew: true,
    loanCount: 9,
  },
  {
    externalId: 'SEED-BOOK-005',
    title: 'Physique Générale — Mécanique',
    author: 'Douglas C. Giancoli',
    isbn: '9782804166322',
    publisher: 'De Boeck',
    summary: 'Les fondements de la mécanique classique illustrés par de nombreux exercices.',
    coverImage: null,
    year: 2014,
    department: 'Physique',
    category: 'Mécanique',
    location: 'Rayon D-02',
    totalCopies: 6,
    availableCopies: 6,
    isNew: false,
    loanCount: 5,
  },
  {
    externalId: 'SEED-BOOK-006',
    title: 'Anatomie Humaine',
    author: 'Frank H. Netter',
    isbn: '9782294758963',
    publisher: 'Elsevier Masson',
    summary: 'Atlas de référence illustré de l’anatomie du corps humain.',
    coverImage: 'https://covers.openlibrary.org/b/isbn/9780702052309-L.jpg',
    year: 2021,
    department: 'Médecine',
    category: 'Anatomie',
    location: 'Rayon E-01',
    totalCopies: 4,
    availableCopies: 3,
    isNew: true,
    loanCount: 31,
  },
  {
    externalId: 'SEED-BOOK-007',
    title: 'Histoire de l’Afrique de l’Ouest',
    author: 'Djibril Tamsir Niane',
    isbn: '9782708707393',
    publisher: 'Présence Africaine',
    summary: 'Une synthèse historique des grands empires ouest-africains.',
    coverImage: null,
    year: 1975,
    department: 'Histoire',
    category: 'Histoire africaine',
    location: 'Rayon F-05',
    totalCopies: 5,
    availableCopies: 5,
    isNew: false,
    loanCount: 14,
  },
  {
    externalId: 'SEED-BOOK-008',
    title: 'Grammaire Pratique du Français',
    author: 'Maïa Grégoire',
    isbn: '9782090381487',
    publisher: 'CLE International',
    summary: 'Grammaire progressive avec exercices pour tous niveaux.',
    coverImage: 'https://covers.openlibrary.org/b/isbn/9782090381487-L.jpg',
    year: 2017,
    department: 'Lettres',
    category: 'Linguistique',
    location: 'Rayon G-08',
    totalCopies: 8,
    availableCopies: 6,
    isNew: false,
    loanCount: 22,
  },
  {
    externalId: 'SEED-BOOK-009',
    title: 'Statistiques Appliquées à la Gestion',
    author: 'Douglas A. Lind',
    isbn: '9782807301186',
    publisher: 'De Boeck',
    summary: 'Méthodes statistiques appliquées aux problématiques de gestion et d’économie.',
    coverImage: null,
    year: 2016,
    department: 'Gestion',
    category: 'Statistiques',
    location: 'Rayon C-11',
    totalCopies: 4,
    availableCopies: 4,
    isNew: true,
    loanCount: 3,
  },
  {
    externalId: 'SEED-BOOK-010',
    title: 'Réseaux Informatiques',
    author: 'Andrew S. Tanenbaum',
    isbn: '9782744077893',
    publisher: 'Pearson',
    summary: 'Référence sur l’architecture et les protocoles des réseaux informatiques.',
    coverImage: 'https://covers.openlibrary.org/b/isbn/9780132126953-L.jpg',
    year: 2011,
    department: 'Informatique',
    category: 'Réseaux',
    location: 'Rayon A-16',
    totalCopies: 5,
    availableCopies: 2,
    isNew: false,
    loanCount: 25,
  },
];

const NEWS = [
  {
    title: 'Nouveaux horaires d’ouverture pour le semestre',
    content:
      'À partir de la rentrée, la bibliothèque universitaire élargit ses horaires d’ouverture en semaine jusqu’à 20h00 afin de faciliter les révisions. Le service de prêt reste accessible jusqu’à 30 minutes avant la fermeture.',
    image: 'https://images.unsplash.com/photo-1521587760476-6c12a4b040da',
    category: NewsCategory.ANNOUNCEMENT,
  },
  {
    title: 'Conférence : Intelligence Artificielle et Recherche Documentaire',
    content:
      'La bibliothèque organise une conférence ouverte à tous les étudiants et enseignants sur les usages de l’intelligence artificielle dans la recherche documentaire moderne. Inscription gratuite à l’accueil.',
    image: 'https://images.unsplash.com/photo-1524178232363-1fb2b075b655',
    category: NewsCategory.CONFERENCE,
  },
  {
    title: 'Arrivée de 200 nouveaux ouvrages en sciences et médecine',
    content:
      'La collection s’enrichit ce mois-ci de 200 nouveaux titres dans les départements de sciences et de médecine, incluant plusieurs éditions récentes recommandées par le corps enseignant.',
    image: null,
    category: NewsCategory.NEW_BOOK,
  },
];

const LIBRARY_MEMBERS = [
  {
    matricule: 'ETU-2026-001',
    nom: 'Diallo',
    prenom: 'Mariama',
    dateNaissance: new Date('2003-04-12'),
    email: 'mariama.diallo@example.com',
    role: 'STUDENT',
    departement: 'Informatique',
    inscriptionActive: true,
  },
  {
    matricule: 'ENS-2026-002',
    nom: 'Barry',
    prenom: 'Ibrahima',
    dateNaissance: new Date('1978-09-03'),
    email: 'ibrahima.barry@example.com',
    role: 'TEACHER',
    departement: 'Droit',
    inscriptionActive: true,
  },
  {
    matricule: 'ETU-2026-003',
    nom: 'Camara',
    prenom: 'Fatoumata',
    dateNaissance: new Date('2000-01-20'),
    email: null,
    role: 'STUDENT',
    departement: 'Gestion',
    inscriptionActive: false,
  },
  {
    matricule: 'ETU-2026-000',
    nom: 'Test',
    prenom: 'Étudiant',
    dateNaissance: new Date('1999-06-15'),
    email: 'test@test.com',
    role: 'STUDENT',
    departement: 'Informatique',
    inscriptionActive: true,
  },
  {
    matricule: 'VIS-2026-004',
    nom: 'Sow',
    prenom: 'Aïssatou',
    dateNaissance: new Date('1990-12-01'),
    email: null,
    role: 'VISITOR',
    departement: null,
    inscriptionActive: true,
  },
] as const;

async function seedLibraryMembers(): Promise<void> {
  for (const member of LIBRARY_MEMBERS) {
    await prisma.libraryMember.upsert({
      where: { matricule: member.matricule },
      update: member,
      create: member,
    });
  }
}

async function seedSettings(): Promise<void> {
  await prisma.siteSetting.upsert({
    where: { key: 'app_name' },
    update: { value: 'Gest Biblio' },
    create: { key: 'app_name', value: 'Gest Biblio' },
  });

  await prisma.siteSetting.upsert({
    where: { key: 'university_name' },
    update: { value: 'Université de Labé' },
    create: { key: 'university_name', value: 'Université de Labé' },
  });
}

async function seedBooks(): Promise<void> {
  for (const book of BOOKS) {
    await prisma.book.upsert({
      where: { externalId: book.externalId },
      update: book,
      create: book,
    });
  }
}

async function seedNews(): Promise<void> {
  await prisma.news.deleteMany({ where: { title: { in: NEWS.map((item) => item.title) } } });
  await prisma.news.createMany({
    data: NEWS.map((item, index) => ({
      ...item,
      publishedAt: new Date(Date.now() - index * 1000 * 60 * 60 * 24),
    })),
  });
}

async function seedTestUser(): Promise<void> {
  // Mot de passe du compte de test : SEED_TEST_PASSWORD si défini (non vide), sinon valeur par défaut.
  const testPassword = process.env.SEED_TEST_PASSWORD || 'Test1234!';
  const hashedPassword = await hash(testPassword, 12);

  await prisma.user.upsert({
    where: { email: 'test@test.com' },
    update: { matricule: 'ETU-2026-000', password: hashedPassword },
    create: {
      email: 'test@test.com',
      username: 'test',
      password: hashedPassword,
      firstName: 'Étudiant',
      lastName: 'Test',
      role: 'STUDENT',
      status: 'ACTIVE',
      department: 'Informatique',
      matricule: 'ETU-2026-000',
    },
  });
}

async function main(): Promise<void> {
  await seedSettings();
  await seedBooks();
  await seedNews();
  await seedLibraryMembers();
  await seedTestUser();
}

main()
  .catch((error: unknown) => {
    logger.error('Seed failed', { error: error instanceof Error ? error.message : 'unknown error' });
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
