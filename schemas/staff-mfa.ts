import { z } from 'zod';

const totpCode = z.string().trim().regex(/^\d{6}$/, 'Saisissez le code à 6 chiffres de votre application.');
const activationCode = z.string().trim().min(10).max(60);

/** Étape 1 de l'activation : code d'activation remis par l'administrateur. */
export const mfaEnrollmentSchema = z.object({ activationCode });

/** Étape 2 : confirmation avec un code TOTP (le code d'activation est revérifié). */
export const mfaActivationSchema = z.object({ activationCode, code: totpCode });

/** Vérification : code TOTP à 6 chiffres OU code de secours. */
export const mfaVerifySchema = z.object({ code: z.string().trim().min(6).max(40) });

/** Régénération des codes de secours : code TOTP uniquement. */
export const mfaRegenerateSchema = z.object({ code: totpCode });
