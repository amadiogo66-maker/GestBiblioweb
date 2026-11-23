import type { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { READING_LISTS_PAGE_SIZE, showReadingListTeacherName } from '@/lib/constants';
import type { ReadingListsQuery } from '@/schemas/reading-list';

/**
 * Lecture des listes de lectures. Côté membres, SEULES les listes PUBLISHED
 * sont visibles ; le nom de l'enseignant n'est chargé que si l'affichage est
 * activé (showReadingListTeacherName), sinon il ne quitte jamais la base.
 */

const departmentSelect = { id: true, slug: true, name: true } satisfies Prisma.DepartmentSelect;
const programSelect = { id: true, slug: true, name: true } satisfies Prisma.ProgramSelect;

function ownerSelect(): { select: { firstName: true; lastName: true } } | false {
  return showReadingListTeacherName() ? { select: { firstName: true, lastName: true } } : false;
}

export interface PublishedListSummary {
  id: string;
  title: string;
  courseCode: string | null;
  academicYear: string | null;
  updatedAt: Date;
  department: { id: string; slug: string; name: string };
  program: { id: string; slug: string; name: string } | null;
  itemCount: number;
  teacherName: string | null;
}

type OwnerName = { firstName: string; lastName: string } | null | undefined;
const teacherName = (owner: OwnerName): string | null => (owner ? `${owner.firstName} ${owner.lastName}` : null);

/** Listes publiées, filtrées et paginées par l'URL (filtres par slug, recherche titre ou code de cours). */
export async function listPublishedReadingLists(query: ReadingListsQuery) {
  const [departments, department] = await Promise.all([
    prisma.department.findMany({ select: departmentSelect, orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }] }),
    query.departement ? prisma.department.findUnique({ where: { slug: query.departement }, select: { id: true } }) : null,
  ]);
  const programs = department
    ? await prisma.program.findMany({ where: { departmentId: department.id }, select: programSelect, orderBy: { sortOrder: 'asc' } })
    : [];
  const program = query.programme ? programs.find((item) => item.slug === query.programme) ?? null : null;

  const where: Prisma.ReadingListWhereInput = {
    status: 'PUBLISHED',
    ...(query.departement ? { departmentId: department?.id ?? '__aucun__' } : {}),
    ...(program ? { programId: program.id } : {}),
    ...(query.q
      ? {
          OR: [
            { title: { contains: query.q, mode: 'insensitive' } },
            { courseCode: { contains: query.q, mode: 'insensitive' } },
          ],
        }
      : {}),
  };

  const total = await prisma.readingList.count({ where });
  const totalPages = Math.max(1, Math.ceil(total / READING_LISTS_PAGE_SIZE));
  const page = Math.min(query.page, totalPages);
  const rows = await prisma.readingList.findMany({
    where,
    orderBy: [{ updatedAt: 'desc' }, { id: 'asc' }],
    skip: (page - 1) * READING_LISTS_PAGE_SIZE,
    take: READING_LISTS_PAGE_SIZE,
    select: {
      id: true,
      title: true,
      courseCode: true,
      academicYear: true,
      updatedAt: true,
      department: { select: departmentSelect },
      program: { select: programSelect },
      owner: ownerSelect(),
      _count: { select: { items: true } },
    },
  });

  const lists: PublishedListSummary[] = rows.map((row) => ({
    id: row.id,
    title: row.title,
    courseCode: row.courseCode,
    academicYear: row.academicYear,
    updatedAt: row.updatedAt,
    department: row.department,
    program: row.program,
    itemCount: row._count.items,
    teacherName: teacherName((row as { owner?: OwnerName }).owner),
  }));

  return { lists, total, page, totalPages, departments, programs };
}

/** Détail d'une liste PUBLIÉE ; null pour un brouillon ou une liste inconnue (même réponse). */
export async function getPublishedReadingList(id: string) {
  const list = await prisma.readingList.findFirst({
    where: { id, status: 'PUBLISHED' },
    select: {
      id: true,
      title: true,
      courseCode: true,
      description: true,
      academicYear: true,
      updatedAt: true,
      department: { select: departmentSelect },
      program: { select: programSelect },
      owner: ownerSelect(),
      items: {
        orderBy: [{ position: 'asc' }, { createdAt: 'asc' }],
        select: {
          id: true,
          note: true,
          book: { select: { id: true, title: true, author: true, year: true, availableCopies: true, totalCopies: true, status: true } },
        },
      },
    },
  });

  if (!list) {
    return null;
  }

  return { ...list, teacherName: teacherName((list as { owner?: OwnerName }).owner) };
}

/** Listes PUBLIÉES qui contiennent un ouvrage : une seule requête (jointure), sans requête par ligne. */
export async function publishedListsForBook(bookId: string, take = 10) {
  const items = await prisma.readingListItem.findMany({
    where: { bookId, list: { status: 'PUBLISHED' } },
    orderBy: { list: { updatedAt: 'desc' } },
    take,
    select: { list: { select: { id: true, title: true, courseCode: true, department: { select: { name: true } } } } },
  });

  return items.map((item) => item.list);
}

/** Liste appartenant à l'enseignant (tout statut) ; null si elle est à un autre ou n'existe pas. */
export async function findOwnedReadingList(id: string, ownerId: string) {
  return prisma.readingList.findFirst({ where: { id, ownerId }, select: { id: true, title: true, status: true, departmentId: true } });
}

/**
 * Échange la position d'un ouvrage avec son voisin (haut ou bas). Positions
 * renumérotées 0..n-1 dans la transaction : aucun trou ni doublon durable.
 * Renvoie false si l'ouvrage est déjà en tête ou en fin de liste.
 */
export async function moveReadingListItem(
  tx: Prisma.TransactionClient,
  listId: string,
  itemId: string,
  direction: 'up' | 'down'
): Promise<boolean> {
  const items = await tx.readingListItem.findMany({
    where: { listId },
    orderBy: [{ position: 'asc' }, { createdAt: 'asc' }],
    select: { id: true },
  });
  const index = items.findIndex((item) => item.id === itemId);
  const target = direction === 'up' ? index - 1 : index + 1;

  if (index === -1 || target < 0 || target >= items.length) {
    return false;
  }

  const ordered = items.map((item) => item.id);
  [ordered[index], ordered[target]] = [ordered[target], ordered[index]];

  await Promise.all(ordered.map((id, position) => tx.readingListItem.update({ where: { id }, data: { position } })));
  return true;
}
