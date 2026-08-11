import { createHash, randomBytes } from 'crypto';

export function createSecureToken(byteLength = 32): string {
  return randomBytes(byteLength).toString('base64url');
}

export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

export function createPasswordResetIdentifier(email: string): string {
  return `password-reset:${email}`;
}

