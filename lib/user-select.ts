import type { Prisma } from '@prisma/client';

/**
 * Champs d'un utilisateur qui peuvent circuler dans le code applicatif
 * (helpers d'autorisation, réponses, composants). JAMAIS `password` ni
 * `qrCode` : un appelant qui a besoin du hachage fait sa propre requête dédiée.
 */
export const publicUserSelect = {
  id: true,
  email: true,
  username: true,
  firstName: true,
  lastName: true,
  role: true,
  status: true,
  autoSuspendedAt: true,
  photo: true,
  libraryCard: true,
  department: true,
  departmentId: true,
  programId: true,
  matricule: true,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.UserSelect;

export type PublicUser = Prisma.UserGetPayload<{ select: typeof publicUserSelect }>;
