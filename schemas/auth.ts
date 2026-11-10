import { z } from 'zod';

export const passwordRegex = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/;
const passwordMessage = 'Password must contain at least one lowercase letter, one uppercase letter and one number';

export const loginSchema = z.object({
  username: z.string().trim().min(3).max(254),
  password: z.string().min(8).max(100),
});

export const registerSchema = z
  .object({
    matricule: z.string().trim().min(1).max(50),
    verificationToken: z.string().min(32).max(256),
    email: z.string().trim().toLowerCase().email(),
    username: z.string().trim().min(3).max(50).regex(/^[a-zA-Z0-9_]+$/),
    password: z.string().min(8).max(100).regex(passwordRegex, {
      message: passwordMessage,
    }),
    confirmPassword: z.string(),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: 'Passwords do not match',
    path: ['confirmPassword'],
  });

export const verifyMemberSchema = z.object({
  matricule: z.string().trim().min(1).max(50),
  dateNaissance: z.coerce.date(),
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
