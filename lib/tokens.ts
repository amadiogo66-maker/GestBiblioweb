import { createHash, randomBytes } from 'crypto';

export function createSecureToken(byteLength = 32): string {
  return randomBytes(byteLength).toString('base64url');
}

export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

/**
 * SHA-256 d'un identifiant normalisé (espaces retirés, minuscules) : email,
 * matricule, nom d'utilisateur ou IP. À utiliser partout où un identifiant
 * doit être stocké ou comparé sans être conservé en clair.
 */
export function hashIdentifier(value: string): string {
  return hashToken(value.trim().toLowerCase());
}

export function createPasswordResetIdentifier(email: string): string {
  return `password-reset:${email}`;
}

export function createMemberVerificationIdentifier(matricule: string): string {
  return `member-verification:${matricule}`;
}


/** Code d'activation de la double authentification d'un membre du personnel. */
export function createStaffMfaActivationIdentifier(userId: string): string {
  return `staff-mfa-activation:${userId}`;
}
