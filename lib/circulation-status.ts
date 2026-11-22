import { randomUUID } from 'crypto';
import { CIRCULATION_STALE_MINUTES } from '@/lib/constants';
import { logger } from '@/lib/logger';
import { prisma } from '@/lib/prisma';

export const CIRCULATION_CONTACT_KEY = 'circulation.lastContactAt';

/**
 * Note le dernier contact du logiciel de gestion, avec au plus une écriture par
 * minute (un seul INSERT ... ON CONFLICT conditionnel, sûr en concurrence).
 * Ne lève jamais : un échec ne doit pas faire échouer la synchronisation.
 * Renvoie true si la valeur a été écrite.
 */
export async function recordCirculationContact(now = new Date()): Promise<boolean> {
  const iso = now.toISOString();

  try {
    const written = await prisma.$executeRaw`
      INSERT INTO "SiteSetting" ("id", "key", "value", "updatedAt")
      VALUES (${randomUUID()}, ${CIRCULATION_CONTACT_KEY}, to_jsonb(${iso}::text), (${iso}::timestamptz AT TIME ZONE 'UTC'))
      ON CONFLICT ("key") DO UPDATE
        SET "value" = EXCLUDED."value", "updatedAt" = EXCLUDED."updatedAt"
        WHERE "SiteSetting"."updatedAt" <= EXCLUDED."updatedAt" - interval '1 minute'
    `;

    return written === 1;
  } catch (error) {
    logger.error('Circulation contact write failed', { error: error instanceof Error ? error.message : 'unknown error' });
    return false;
  }
}

/** Vrai si le logiciel a contacté le site depuis moins de CIRCULATION_STALE_MINUTES. */
export async function isCirculationReachable(now = new Date()): Promise<boolean> {
  try {
    const setting = await prisma.siteSetting.findUnique({ where: { key: CIRCULATION_CONTACT_KEY }, select: { value: true } });
    const last = typeof setting?.value === 'string' ? new Date(setting.value).getTime() : Number.NaN;

    return !Number.isNaN(last) && now.getTime() - last < CIRCULATION_STALE_MINUTES * 60 * 1000;
  } catch (error) {
    logger.error('Circulation status read failed', { error: error instanceof Error ? error.message : 'unknown error' });
    return false;
  }
}
