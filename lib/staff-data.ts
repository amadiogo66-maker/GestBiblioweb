import type { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { STAFF_ACCOUNTS_PAGE_SIZE, STAFF_AUDIT_PAGE_SIZE, STAFF_RECENT_ACTIONS } from '@/lib/constants';
import { auditActorId, auditTargetId } from '@/lib/audit-format';
import type { AuditLogQuery, StaffAccountsQuery } from '@/schemas/staff';

/**
 * Lectures de l'espace du personnel. Sélections EXPLICITES uniquement :
 * jamais password, qrCode, jetons ni sessions. Nombre de requêtes fixe,
 * indépendant du nombre de lignes affichées.
 */

/** Champs d'un compte dans la liste. */
export const accountListSelect = {
  id: true,
  firstName: true,
  lastName: true,
  email: true,
  username: true,
  matricule: true,
  role: true,
  status: true,
  department: true,
  createdAt: true,
  officialDepartment: { select: { name: true } },
} satisfies Prisma.UserSelect;

/** Champs du détail d'un compte. */
export const accountDetailSelect = {
  ...accountListSelect,
  autoSuspendedAt: true,
  libraryCard: true,
  updatedAt: true,
  libraryMember: {
    select: { matricule: true, nom: true, prenom: true, departement: true, inscriptionActive: true, dateExpiration: true, syncedAt: true },
  },
  staffAssignments: { where: { revokedAt: null }, select: { role: true } },
} satisfies Prisma.UserSelect;

export type AccountListItem = Prisma.UserGetPayload<{ select: typeof accountListSelect }>;
export type AccountDetail = Prisma.UserGetPayload<{ select: typeof accountDetailSelect }>;

/** Comptes ACTIVE dont l'inscription bibliothèque est inactive ou expirée. */
function inconsistentActiveWhere(now: Date): Prisma.UserWhereInput {
  return {
    status: 'ACTIVE',
    libraryMember: { is: { OR: [{ inscriptionActive: false }, { dateExpiration: { lt: now } }] } },
  };
}

const autoSuspendedWhere: Prisma.UserWhereInput = { status: 'SUSPENDED', autoSuspendedAt: { not: null } };

/** Noms des utilisateurs cités (acteurs, cibles) : UNE requête pour toute la page. */
export async function loadUserLabels(ids: Array<string | null>): Promise<Map<string, { name: string; email: string }>> {
  const unique = [...new Set(ids.filter((id): id is string => Boolean(id)))];

  if (unique.length === 0) {
    return new Map();
  }

  const users = await prisma.user.findMany({
    where: { id: { in: unique } },
    select: { id: true, firstName: true, lastName: true, email: true },
  });

  return new Map(users.map((user) => [user.id, { name: `${user.firstName} ${user.lastName}`, email: user.email }]));
}

const auditEntrySelect = { id: true, action: true, userId: true, details: true, createdAt: true } satisfies Prisma.ActivityLogSelect;

export async function getStaffDashboardData(now = new Date()) {
  const [byStatus, byRole, inconsistentCount, inconsistent, autoSuspendedCount, autoSuspended, recentActions] =
    await Promise.all([
      prisma.user.groupBy({ by: ['status'], _count: { _all: true } }),
      prisma.user.groupBy({ by: ['role'], _count: { _all: true } }),
      prisma.user.count({ where: inconsistentActiveWhere(now) }),
      prisma.user.findMany({ where: inconsistentActiveWhere(now), select: accountListSelect, orderBy: { lastName: 'asc' }, take: 10 }),
      prisma.user.count({ where: autoSuspendedWhere }),
      prisma.user.findMany({ where: autoSuspendedWhere, select: accountListSelect, orderBy: { lastName: 'asc' }, take: 10 }),
      prisma.activityLog.findMany({
        where: { action: { startsWith: 'staff.' } },
        select: auditEntrySelect,
        orderBy: { createdAt: 'desc' },
        take: STAFF_RECENT_ACTIONS,
      }),
    ]);
  const labels = await loadUserLabels(recentActions.flatMap((entry) => [auditActorId(entry), auditTargetId(entry)]));

  return {
    byStatus: Object.fromEntries(byStatus.map((row) => [row.status, row._count._all])) as Record<string, number>,
    byRole: Object.fromEntries(byRole.map((row) => [row.role, row._count._all])) as Record<string, number>,
    inconsistentCount,
    inconsistent,
    autoSuspendedCount,
    autoSuspended,
    recentActions,
    labels,
  };
}

/** Recherche : chaque mot doit apparaître dans au moins un champ (insensible à la casse). */
function accountsWhere(query: StaffAccountsQuery): Prisma.UserWhereInput {
  const terms = (query.q ?? '').split(/\s+/).filter(Boolean).slice(0, 5);

  return {
    ...(query.status ? { status: query.status } : {}),
    ...(query.role ? { role: query.role } : {}),
    ...(query.departmentId ? { departmentId: query.departmentId } : {}),
    AND: terms.map((term) => ({
      OR: (['firstName', 'lastName', 'email', 'username', 'matricule'] as const).map((field) => ({
        [field]: { contains: term, mode: 'insensitive' as const },
      })),
    })),
  };
}

export async function listStaffAccounts(query: StaffAccountsQuery) {
  const where = accountsWhere(query);
  const [total, accounts] = await prisma.$transaction([
    prisma.user.count({ where }),
    prisma.user.findMany({
      where,
      select: accountListSelect,
      orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }, { id: 'asc' }],
      skip: (query.page - 1) * STAFF_ACCOUNTS_PAGE_SIZE,
      take: STAFF_ACCOUNTS_PAGE_SIZE,
    }),
  ]);

  return { total, accounts, totalPages: Math.max(1, Math.ceil(total / STAFF_ACCOUNTS_PAGE_SIZE)) };
}

export async function getDepartmentOptions() {
  return prisma.department.findMany({
    select: { id: true, name: true, faculty: { select: { name: true } } },
    orderBy: [{ faculty: { sortOrder: 'asc' } }, { sortOrder: 'asc' }],
  });
}

export async function getStaffAccount(id: string): Promise<AccountDetail | null> {
  return prisma.user.findUnique({ where: { id }, select: accountDetailSelect });
}

/** Actions du personnel sur un compte : modérations (cible) et rôles attribués par script. */
export async function getAccountStaffHistory(id: string) {
  const entries = await prisma.activityLog.findMany({
    where: {
      OR: [
        { action: { startsWith: 'staff.account.' }, details: { path: ['targetUserId'], equals: id } },
        { action: { in: ['staff.grant', 'staff.revoke'] }, userId: id },
      ],
    },
    select: auditEntrySelect,
    orderBy: { createdAt: 'desc' },
    take: 50,
  });

  return { entries, labels: await loadUserLabels(entries.map(auditActorId)) };
}

/** Bornes de période en UTC (jour entier inclus). */
function periodFilter(query: AuditLogQuery): Prisma.DateTimeFilter | undefined {
  if (!query.from && !query.to) return undefined;

  return {
    ...(query.from ? { gte: new Date(`${query.from}T00:00:00.000Z`) } : {}),
    ...(query.to ? { lte: new Date(`${query.to}T23:59:59.999Z`) } : {}),
  };
}

export async function listAuditLog(query: AuditLogQuery) {
  let actorIds: string[] | undefined;

  if (query.actor) {
    const actors = await prisma.user.findMany({
      where: {
        OR: [
          { email: { contains: query.actor, mode: 'insensitive' } },
          { username: { contains: query.actor, mode: 'insensitive' } },
        ],
      },
      select: { id: true },
      take: 50,
    });
    actorIds = actors.map((actor) => actor.id);
  }

  const createdAt = periodFilter(query);
  const where: Prisma.ActivityLogWhereInput = {
    ...(query.action ? { action: { startsWith: query.action } } : {}),
    ...(createdAt ? { createdAt } : {}),
    ...(actorIds ? { userId: { in: actorIds } } : {}),
  };
  const [total, entries] = await prisma.$transaction([
    prisma.activityLog.count({ where }),
    prisma.activityLog.findMany({
      where,
      select: { ...auditEntrySelect, ipAddress: true },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      skip: (query.page - 1) * STAFF_AUDIT_PAGE_SIZE,
      take: STAFF_AUDIT_PAGE_SIZE,
    }),
  ]);
  const labels = await loadUserLabels(entries.flatMap((entry) => [auditActorId(entry), auditTargetId(entry)]));

  return { total, entries, labels, totalPages: Math.max(1, Math.ceil(total / STAFF_AUDIT_PAGE_SIZE)) };
}
