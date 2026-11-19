import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { logger } from '@/lib/logger';
import { getClientIp } from '@/lib/client-ip';
import { hashIdentifier } from '@/lib/tokens';
import {
  RATE_LIMIT_CLEANUP_PROBABILITY,
  RATE_LIMIT_MESSAGE,
  RATE_LIMIT_RETENTION_MS,
  type RateLimitRule,
} from '@/lib/constants';
import type { ApiResponse } from '@/types';

export interface RateLimitCheck {
  key: string;
  rule: RateLimitRule;
}

export interface RateLimitResult {
  allowed: boolean;
  count: number;
  limit: number;
  retryAfterSeconds: number;
}

interface HitOptions {
  /** Injection pour les tests ; par défaut RATE_LIMIT_CLEANUP_PROBABILITY. */
  cleanupProbability?: number;
}

/** Clé de compteur : un espace de noms lisible suivi d'un hachage, jamais de donnée brute. */
export function rateLimitKey(scope: string, value: string): string {
  return `${scope}:${hashIdentifier(value)}`;
}

/** Clé par adresse IP ; une IP inconnue partage un compteur commun. */
export function ipRateLimitKey(scope: string, headers: Headers): string {
  return rateLimitKey(`${scope}:ip`, getClientIp(headers) ?? 'unknown');
}

/**
 * Incrémente atomiquement le compteur `key` (fenêtre fixe) et indique si la
 * requête est autorisée. Un seul INSERT ... ON CONFLICT DO UPDATE : PostgreSQL
 * verrouille la ligne, donc des requêtes concurrentes obtiennent des compteurs
 * distincts. Les horodatages sont calculés par la base (UTC) pour éviter tout
 * décalage d'horloge entre instances.
 */
export async function hitRateLimit(key: string, rule: RateLimitRule, options: HitOptions = {}): Promise<RateLimitResult> {
  const windowSeconds = rule.windowMs / 1000;
  const rows = await prisma.$queryRaw<Array<{ count: number; retry_after: number }>>`
    INSERT INTO "RateLimitBucket" ("key", "count", "windowStart")
    VALUES (${key}, 1, now() AT TIME ZONE 'UTC')
    ON CONFLICT ("key") DO UPDATE SET
      "count" = CASE
        WHEN "RateLimitBucket"."windowStart" <= (now() AT TIME ZONE 'UTC') - make_interval(secs => ${windowSeconds}::float8)
        THEN 1
        ELSE "RateLimitBucket"."count" + 1
      END,
      "windowStart" = CASE
        WHEN "RateLimitBucket"."windowStart" <= (now() AT TIME ZONE 'UTC') - make_interval(secs => ${windowSeconds}::float8)
        THEN now() AT TIME ZONE 'UTC'
        ELSE "RateLimitBucket"."windowStart"
      END
    RETURNING
      "count",
      GREATEST(1, CEIL(EXTRACT(EPOCH FROM (
        "windowStart" + make_interval(secs => ${windowSeconds}::float8) - (now() AT TIME ZONE 'UTC')
      ))))::int AS retry_after
  `;

  await maybeCleanup(options.cleanupProbability ?? RATE_LIMIT_CLEANUP_PROBABILITY);

  const { count, retry_after: retryAfterSeconds } = rows[0];

  return { allowed: count <= rule.limit, count, limit: rule.limit, retryAfterSeconds };
}

/** Purge opportuniste des compteurs dont la fenêtre est largement expirée. */
async function maybeCleanup(probability: number): Promise<void> {
  if (Math.random() >= probability) {
    return;
  }

  try {
    await prisma.rateLimitBucket.deleteMany({
      where: { windowStart: { lt: new Date(Date.now() - RATE_LIMIT_RETENTION_MS) } },
    });
  } catch (error) {
    logger.error('Rate limit cleanup failed', { error: error instanceof Error ? error.message : 'unknown error' });
  }
}

/**
 * Réponse 429 générique. `extra` permet d'ajouter des champs attendus par un
 * client particulier (ex. `url` pour next-auth/react signIn).
 */
export function rateLimitedResponse(
  retryAfterSeconds: number,
  extra: Record<string, string> = {}
): NextResponse<ApiResponse<never>> {
  return NextResponse.json(
    { success: false, message: RATE_LIMIT_MESSAGE, ...extra },
    { status: 429, headers: { 'Retry-After': String(retryAfterSeconds) } }
  );
}

/**
 * Applique toutes les règles (chacune est comptabilisée) et renvoie le plus
 * long délai d'attente si l'une d'elles est dépassée, sinon null.
 * En cas d'erreur de base, la requête est laissée passer (fail-open) et
 * l'erreur est journalisée : la route échouera de toute façon si la base est indisponible.
 */
export async function checkRateLimits(checks: RateLimitCheck[]): Promise<number | null> {
  try {
    const results = await Promise.all(checks.map((check) => hitRateLimit(check.key, check.rule)));
    const blocked = results.filter((result) => !result.allowed);

    return blocked.length > 0 ? Math.max(...blocked.map((result) => result.retryAfterSeconds)) : null;
  } catch (error) {
    logger.error('Rate limit check failed', { error: error instanceof Error ? error.message : 'unknown error' });
    return null;
  }
}

/** Raccourci pour les routes /api : réponse 429 prête à renvoyer, ou null. */
export async function enforceRateLimits(checks: RateLimitCheck[]): Promise<NextResponse<ApiResponse<never>> | null> {
  const retryAfter = await checkRateLimits(checks);

  return retryAfter === null ? null : rateLimitedResponse(retryAfter);
}
