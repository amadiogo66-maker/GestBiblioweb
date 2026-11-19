import { z } from 'zod';

export const updateProfileSchema = z.object({
  firstName: z.string().trim().min(2).max(100).optional(),
  lastName: z.string().trim().min(2).max(100).optional(),
  photo: z.string().url().optional().or(z.literal('')).optional(),
  // Le département n'est pas modifiable par l'utilisateur : il provient de
  // l'inscription (LibraryMember). Une clé `department` envoyée est ignorée (strip Zod).
});

export const changePasswordSchema = z
  .object({
    currentPassword: z.string().min(1),
    newPassword: z.string().min(8).max(100).regex(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/, {
      message: 'Password must contain at least one lowercase letter, one uppercase letter and one number',
    }),
    confirmPassword: z.string(),
  })
  .refine((data) => data.newPassword === data.confirmPassword, {
    message: 'Passwords do not match',
    path: ['confirmPassword'],
  });
