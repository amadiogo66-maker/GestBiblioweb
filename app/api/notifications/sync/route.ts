import { NextResponse, type NextRequest } from 'next/server';
import type { z } from 'zod';
import { notificationSyncSchema, notificationsBatchSchema } from '@/schemas/notification';
import { jsonResponse, validationErrorResponse } from '@/lib/api';
import { rejectInvalidApiKey } from '@/lib/api-key';
import { prisma } from '@/lib/prisma';
import { logger } from '@/lib/logger';
import { createNotification, notificationSelect } from '@/lib/notifications';
import { BODY_LIMITS } from '@/lib/constants';
import { payloadTooLargeResponse, readJsonBody } from '@/lib/json-body';
import { getClientIp } from '@/lib/client-ip';

export const runtime = 'nodejs';

type NotificationItem = z.output<typeof notificationSyncSchema>;

interface Targets {
  userIds: Set<string>;
  userIdByMatricule: Map<string, string>;
  knownMatricules: Set<string>;
}

class DedupeKeyConflict extends Error {}

/** Référentiels chargés une fois pour tout le lot. */
async function loadTargets(items: NotificationItem[]): Promise<Targets> {
  const ids = items.flatMap((item) => (item.userId ? [item.userId] : []));
  const matricules = items.flatMap((item) => (item.matricule ? [item.matricule] : []));
  const [byId, byMatricule, members] = await Promise.all([
    prisma.user.findMany({ where: { id: { in: ids } }, select: { id: true } }),
    prisma.user.findMany({ where: { matricule: { in: matricules } }, select: { id: true, matricule: true } }),
    prisma.libraryMember.findMany({ where: { matricule: { in: matricules } }, select: { matricule: true } }),
  ]);

  return {
    userIds: new Set(byId.map((user) => user.id)),
    userIdByMatricule: new Map(byMatricule.map((user) => [user.matricule as string, user.id])),
    knownMatricules: new Set(members.map((member) => member.matricule)),
  };
}

function resolveTarget(item: NotificationItem, targets: Targets): { userId: string } | { reason: string } {
  if (item.userId) {
    return targets.userIds.has(item.userId) ? { userId: item.userId } : { reason: 'Utilisateur introuvable' };
  }

  const userId = targets.userIdByMatricule.get(item.matricule as string);

  if (userId) return { userId };

  return { reason: targets.knownMatricules.has(item.matricule as string) ? 'Membre sans compte web' : 'Membre inconnu' };
}

/** Écrit la notification et son journal, sans doublon si dedupeKey est fourni. */
async function deliver(item: NotificationItem, userId: string, request: NextRequest) {
  const dedupeKey = item.dedupeKey ? `sw:${item.dedupeKey}` : null;
  const content = { userId, type: item.type, title: item.title, message: item.message, isRead: item.isRead, source: 'software' };

  return prisma.$transaction(async (tx) => {
    let created = true;
    let notification;

    if (dedupeKey) {
      created = await createNotification(tx, { ...content, source: 'software', dedupeKey });
      notification = await tx.notification.findUniqueOrThrow({ where: { dedupeKey }, select: notificationSelect });

      // Clé déjà utilisée pour un autre compte : ne jamais masquer cette notification.
      if (notification.userId !== userId) {
        throw new DedupeKeyConflict();
      }
    } else {
      notification = await tx.notification.create({ data: content, select: notificationSelect });
    }

    if (created) {
      await tx.activityLog.create({
        data: {
          userId,
          action: 'notification.sync.create',
          ipAddress: getClientIp(request.headers),
          userAgent: request.headers.get('user-agent'),
          details: { notificationId: notification.id, type: notification.type },
        },
      });
    }

    return { notification, created };
  });
}

async function handleSingle(payload: unknown, request: NextRequest): Promise<NextResponse> {
  const parsed = notificationSyncSchema.safeParse(payload);

  if (!parsed.success) {
    return validationErrorResponse(parsed.error);
  }

  const target = resolveTarget(parsed.data, await loadTargets([parsed.data]));

  if ('reason' in target) {
    return jsonResponse({ success: false, message: target.reason }, 404);
  }

  try {
    const { notification, created } = await deliver(parsed.data, target.userId, request);

    return jsonResponse({
      success: true,
      message: 'Notification synchronisée',
      data: { ...notification, deduplicated: !created },
    });
  } catch (error) {
    if (error instanceof DedupeKeyConflict) {
      return jsonResponse({ success: false, message: 'dedupeKey déjà utilisée pour un autre compte' }, 409);
    }

    throw error;
  }
}

async function handleBatch(rawItems: unknown[], request: NextRequest): Promise<NextResponse> {
  const items = rawItems.map((raw) => ({ raw, result: notificationSyncSchema.safeParse(raw) }));
  const targets = await loadTargets(items.flatMap((item) => (item.result.success ? [item.result.data] : [])));
  const rejectedDetails: Array<{ index: number; reason: string }> = [];
  let created = 0;
  let duplicates = 0;

  for (const [index, { result }] of items.entries()) {
    if (!result.success) {
      rejectedDetails.push({ index, reason: result.error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`).join('; ') });
      continue;
    }

    const target = resolveTarget(result.data, targets);

    if ('reason' in target) {
      rejectedDetails.push({ index, reason: target.reason });
      continue;
    }

    try {
      const outcome = await deliver(result.data, target.userId, request);

      if (outcome.created) created += 1;
      else duplicates += 1;
    } catch (error) {
      if (!(error instanceof DedupeKeyConflict)) {
        logger.error('Notification sync item failed', { index, error: error instanceof Error ? error.message : 'unknown error' });
      }
      rejectedDetails.push({
        index,
        reason: error instanceof DedupeKeyConflict ? 'dedupeKey déjà utilisée pour un autre compte' : 'Erreur interne lors de l’enregistrement',
      });
    }
  }

  const rejected = rejectedDetails.length;

  return jsonResponse({
    success: true,
    message: `${created} création(s), ${duplicates} doublon(s) ignoré(s), ${rejected} rejet(s)`,
    data: { created, duplicates, rejected, rejectedDetails },
  });
}

/**
 * Notification envoyée par le logiciel. Forme historique : un objet (userId), ou
 * matricule en alternative. Forme lot : { notifications: [ ... ] }, élément par élément.
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
  const rejectedKey = rejectInvalidApiKey(request, 'Gest Biblio notification sync API key is not configured');

  if (rejectedKey) {
    return rejectedKey;
  }

  try {
    const payload: unknown = await readJsonBody(request, BODY_LIMITS.sync);

    if (payload && typeof payload === 'object' && 'notifications' in payload) {
      const batch = notificationsBatchSchema.safeParse(payload);

      return batch.success ? await handleBatch(batch.data.notifications, request) : validationErrorResponse(batch.error);
    }

    return await handleSingle(payload, request);
  } catch (error) {
    const tooLarge = payloadTooLargeResponse(error);

    if (tooLarge) {
      return tooLarge;
    }

    logger.error('Notification sync failed', { error: error instanceof Error ? error.message : 'unknown error' });
    return jsonResponse({ success: false, message: 'Impossible de synchroniser la notification' }, 500);
  }
}
