import type { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { logger } from '@/lib/logger';
import { getClientIp } from '@/lib/client-ip';

export interface ActivityEntry {
  action: string;
  userId?: string | null;
  /** En-têtes de la requête : IP et user-agent en sont extraits. */
  headers?: Headers;
  /** Ne jamais y placer de mot de passe ni d'identifiant brut d'un compte inconnu. */
  details?: Prisma.InputJsonValue;
}

/**
 * Données d'une entrée d'ActivityLog. À utiliser directement dans une
 * transaction quand l'entrée doit être écrite avec l'action (tout ou rien).
 */
export function buildActivityLogData(entry: ActivityEntry): Prisma.ActivityLogUncheckedCreateInput {
  return {
    action: entry.action,
    userId: entry.userId ?? null,
    ipAddress: entry.headers ? getClientIp(entry.headers) : null,
    userAgent: entry.headers?.get('user-agent') ?? null,
    details: entry.details,
  };
}

/**
 * Écrit une entrée d'ActivityLog. Ne lève jamais : un échec de journalisation
 * ne doit pas faire échouer l'action journalisée.
 */
export async function logActivity(entry: ActivityEntry): Promise<void> {
  try {
    await prisma.activityLog.create({ data: buildActivityLogData(entry) });
  } catch (error) {
    logger.error('Activity log write failed', {
      action: entry.action,
      error: error instanceof Error ? error.message : 'unknown error',
    });
  }
}
