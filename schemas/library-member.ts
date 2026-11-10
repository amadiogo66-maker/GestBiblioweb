import { z } from 'zod';
import { UserRole } from '@prisma/client';

export const libraryMemberInputSchema = z.object({
  matricule: z.string().trim().min(1).max(50),
  nom: z.string().trim().min(1).max(100),
  prenom: z.string().trim().min(1).max(100),
  dateNaissance: z.coerce.date(),
  email: z.string().trim().toLowerCase().email().optional().or(z.literal('')),
  role: z.nativeEnum(UserRole).default(UserRole.STUDENT),
  departement: z.string().trim().max(100).optional(),
  inscriptionActive: z.boolean().default(true),
  dateExpiration: z.coerce.date().optional(),
});

export const membersSyncSchema = z.object({
  members: z.array(z.unknown()).min(1).max(1000),
});
