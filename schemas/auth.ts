import { z } from 'zod';
import { UserRole } from '@prisma/client';

export const passwordRegex = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/;
const passwordMessage = 'Password must contain at least one lowercase letter, one uppercase letter and one number';

export const loginSchema = z.object({
  username: z.string().trim().min(3).max(254),
  password: z.string().min(8).max(100),
});

export const registerSchema = z
  .object({
    email: z.string().trim().toLowerCase().email(),
    username: z.string().trim().min(3).max(50).regex(/^[a-zA-Z0-9_]+$/),
    password: z.string().min(8).max(100).regex(passwordRegex, {
      message: passwordMessage,
    }),
    confirmPassword: z.string(),
    firstName: z.string().trim().min(2).max(100),
    lastName: z.string().trim().min(2).max(100),
    role: z.nativeEnum(UserRole).default(UserRole.STUDENT),
    department: z.string().trim().max(100).optional(),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: 'Passwords do not match',
    path: ['confirmPassword'],
  });

export const forgotPasswordSchema = z.object({
  email: z.string().trim().toLowerCase().email(),
});

export const resetPasswordSchema = z
  .object({
    email: z.string().trim().toLowerCase().email(),
    token: z.string().min(32).max(256),
    password: z.string().min(8).max(100).regex(passwordRegex, {
      message: passwordMessage,
    }),
    confirmPassword: z.string(),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: 'Passwords do not match',
    path: ['confirmPassword'],
  });
