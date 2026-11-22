import type { Prisma, PrismaClient } from '@prisma/client';
import { createStaffMfaActivationIdentifier } from '@/lib/tokens';
import {
  ACTIVATION_CODE_TTL_MS,
  generateActivationCode,
  generateRecoveryCodes,
  hashActivationCode,
  hashRecoveryCode,
} from '@/lib/staff-mfa';

/**
 * Accès base de la double authentification, partagés par les routes et les
 * scripts d'administration. Toutes les écritures sensibles sont atomiques.
 */
export type MfaDb = PrismaClient | Prisma.TransactionClient;

/** Crée (ou remplace) le code d'activation : renvoyé UNE fois, stocké haché, 24 h. */
export async function issueActivationCode(db: MfaDb, userId: string): Promise<string> {
  const identifier = createStaffMfaActivationIdentifier(userId);
  const code = generateActivationCode();

  await db.verificationToken.deleteMany({ where: { identifier } });
  await db.verificationToken.create({
    data: { identifier, token: hashActivationCode(code), expires: new Date(Date.now() + ACTIVATION_CODE_TTL_MS) },
  });

  return code;
}

/** Le code d'activation est-il valable pour CET utilisateur (non expiré, non consommé) ? */
export async function isActivationCodeValid(db: MfaDb, userId: string, code: string): Promise<boolean> {
  const token = await db.verificationToken.findFirst({
    where: {
      identifier: createStaffMfaActivationIdentifier(userId),
      token: hashActivationCode(code),
      expires: { gt: new Date() },
    },
    select: { token: true },
  });

  return Boolean(token);
}

export async function deleteActivationCodes(db: MfaDb, userId: string): Promise<void> {
  await db.verificationToken.deleteMany({ where: { identifier: createStaffMfaActivationIdentifier(userId) } });
}

/**
 * Consomme un pas TOTP de façon atomique : accepté seulement s'il est
 * strictement postérieur au dernier pas utilisé (rejeu refusé).
 */
export async function consumeTotpStep(db: MfaDb, userId: string, step: number, phase: 'enrollment' | 'enabled'): Promise<boolean> {
  const { count } = await db.staffMfa.updateMany({
    where: {
      userId,
      enabledAt: phase === 'enabled' ? { not: null } : null,
      OR: [{ lastUsedStep: null }, { lastUsedStep: { lt: step } }],
    },
    data: { lastUsedStep: step },
  });

  return count === 1;
}

/** Remplace tous les codes de secours ; les codes en clair ne sont renvoyés qu'une fois. */
export async function replaceRecoveryCodes(db: MfaDb, userId: string): Promise<string[]> {
  const codes = generateRecoveryCodes();

  await db.staffRecoveryCode.deleteMany({ where: { userId } });
  await db.staffRecoveryCode.createMany({ data: codes.map((code) => ({ userId, codeHash: hashRecoveryCode(code) })) });

  return codes;
}

/** Usage unique, atomique : un même code ne passe qu'une fois. */
export async function consumeRecoveryCode(db: MfaDb, userId: string, code: string): Promise<boolean> {
  const { count } = await db.staffRecoveryCode.updateMany({
    where: { userId, codeHash: hashRecoveryCode(code), usedAt: null },
    data: { usedAt: new Date() },
  });

  return count === 1;
}

export async function countRemainingRecoveryCodes(db: MfaDb, userId: string): Promise<number> {
  return db.staffRecoveryCode.count({ where: { userId, usedAt: null } });
}

/**
 * Réinitialisation : l'époque est incrémentée (toutes les preuves existantes
 * deviennent invalides), le secret et les codes de secours sont supprimés.
 * La ligne est conservée pour garder l'époque.
 */
export async function resetStaffMfa(db: MfaDb, userId: string): Promise<void> {
  const existing = await db.staffMfa.findUnique({ where: { userId }, select: { id: true } });

  if (existing) {
    await db.staffMfa.update({
      where: { userId },
      data: { secretCipher: '', enabledAt: null, lastUsedStep: null, epoch: { increment: 1 } },
    });
  }

  await db.staffRecoveryCode.deleteMany({ where: { userId } });
}

/** Retrait complet (dernière affectation révoquée) : secret, codes de secours, code d'activation. */
export async function removeStaffMfa(db: MfaDb, userId: string): Promise<void> {
  await db.staffMfa.deleteMany({ where: { userId } });
  await db.staffRecoveryCode.deleteMany({ where: { userId } });
  await deleteActivationCodes(db, userId);
}
