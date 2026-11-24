import type { NextRequest, NextResponse } from 'next/server';
import { jsonResponse, validationErrorResponse } from '@/lib/api';
import { prisma } from '@/lib/prisma';
import { logger } from '@/lib/logger';
import { buildActivityLogData } from '@/lib/activity-log';
import { BODY_LIMITS, RATE_LIMITS } from '@/lib/constants';
import { enforceRateLimits, rateLimitKey } from '@/lib/rate-limit';
import { notifyReadingListPublished, type NotifyResult } from '@/lib/reading-list-notify';
import { payloadTooLargeResponse, readJsonBodyOrNull } from '@/lib/json-body';
import { findOwnedReadingList } from '@/lib/reading-lists';
import { beginTeacherWrite, notFoundResponse } from '@/lib/write-route';
import { readingListUpdateSchema } from '@/schemas/reading-list';

export const runtime = 'nodejs';

interface RouteContext {
  params: Promise<{ id: string }>;
}

const NOT_FOUND = 'Liste introuvable';

function publishMessage(result: NotifyResult | null): string {
  if (!result) return 'Liste publiée';
  if (result.alreadyNotified) return 'Liste publiée. Les étudiants avaient déjà été prévenus pour cette liste.';

  const base = `Liste publiée. ${result.notified} étudiant${result.notified > 1 ? 's' : ''} prévenu${result.notified > 1 ? 's' : ''}.`;

  return result.notNotified > 0 ? `${base} ${result.notNotified} non prévenu(s) : plafond par publication atteint.` : base;
}

/**
 * Modifie une liste de l'enseignant : champs, publication (PUBLISHED) ou
 * dépublication (DRAFT). La liste d'un autre enseignant répond 404, comme
 * une liste inexistante. Le département ne change jamais.
 */
export async function PATCH(request: NextRequest, context: RouteContext): Promise<NextResponse> {
  const begin = await beginTeacherWrite(request, 'teacher-reading-list');

  if (!begin.ok) {
    return begin.response;
  }

  try {
    const parsed = readingListUpdateSchema.safeParse(await readJsonBodyOrNull(request, BODY_LIMITS.default));

    if (!parsed.success) {
      return validationErrorResponse(parsed.error);
    }

    const { id } = await context.params;
    const list = await findOwnedReadingList(id, begin.user.id);

    if (!list) {
      return notFoundResponse(NOT_FOUND);
    }

    const { programId, status, notifyStudents, ...fields } = parsed.data;

    if (programId) {
      const program = await prisma.program.findFirst({ where: { id: programId, departmentId: list.departmentId }, select: { id: true } });

      if (!program) {
        return jsonResponse({ success: false, message: 'Programme inconnu dans ce département' }, 400);
      }
    }

    const statusChanged = status !== undefined && status !== list.status;
    const publishing = statusChanged && status === 'PUBLISHED';
    // Seul le propriétaire arrive ici (liste d'un autre : 404 ci-dessus) ; la
    // notification n'est envisagée qu'au passage à PUBLISHED.
    const notify = publishing && notifyStudents === true;
    const action = statusChanged ? (publishing ? 'reading_list.publish' : 'reading_list.unpublish') : 'reading_list.update';

    if (notify) {
      const limited = await enforceRateLimits([{ key: rateLimitKey('reading-list-notify', begin.user.id), rule: RATE_LIMITS.readingListNotify }]);

      if (limited) {
        return limited;
      }
    }

    const { updated, notification } = await prisma.$transaction(
      async (tx) => {
        const result = await tx.readingList.update({
          where: { id: list.id },
          data: { ...fields, ...(programId !== undefined ? { programId } : {}), ...(status ? { status } : {}) },
          select: { id: true, title: true, status: true, departmentId: true },
        });
        const sent = notify ? await notifyReadingListPublished(tx, result, begin.user.id) : null;
        // Journal : liste, département et nombres seulement, jamais d'identité de destinataire.
        const details = sent
          ? { listId: list.id, departmentId: result.departmentId, notified: sent.notified, notNotified: sent.notNotified }
          : { listId: list.id };
        await tx.activityLog.create({ data: buildActivityLogData({ action, userId: begin.user.id, headers: request.headers, details }) });

        return { updated: { id: result.id, title: result.title, status: result.status }, notification: sent };
      },
      { timeout: 30_000 }
    );

    if (notification && notification.notNotified > 0) {
      logger.warn('Reading list notification capped', { listId: list.id, notified: notification.notified, notNotified: notification.notNotified });
    }

    const message = statusChanged
      ? publishing
        ? publishMessage(notification)
        : 'Liste repassée en brouillon'
      : 'Liste enregistrée';

    return jsonResponse({
      success: true,
      message,
      data: {
        ...updated,
        notified: notification?.notified ?? 0,
        ...(notification?.notNotified ? { notNotified: notification.notNotified } : {}),
        ...(notification?.alreadyNotified ? { alreadyNotified: true } : {}),
      },
    });
  } catch (error) {
    const tooLarge = payloadTooLargeResponse(error);

    if (tooLarge) {
      return tooLarge;
    }

    logger.error('Reading list update failed', { error: error instanceof Error ? error.message : 'unknown error' });
    return jsonResponse({ success: false, message: 'Impossible d’enregistrer la liste' }, 500);
  }
}

/** Supprime une liste de l'enseignant (et ses ouvrages : suppression en cascade). */
export async function DELETE(request: NextRequest, context: RouteContext): Promise<NextResponse> {
  const begin = await beginTeacherWrite(request, 'teacher-reading-list');

  if (!begin.ok) {
    return begin.response;
  }

  try {
    const { id } = await context.params;
    const list = await findOwnedReadingList(id, begin.user.id);

    if (!list) {
      return notFoundResponse(NOT_FOUND);
    }

    await prisma.$transaction([
      prisma.readingList.delete({ where: { id: list.id } }),
      prisma.activityLog.create({
        data: buildActivityLogData({ action: 'reading_list.delete', userId: begin.user.id, headers: request.headers, details: { listId: list.id } }),
      }),
    ]);

    return jsonResponse({ success: true, message: 'Liste supprimée' });
  } catch (error) {
    logger.error('Reading list deletion failed', { error: error instanceof Error ? error.message : 'unknown error' });
    return jsonResponse({ success: false, message: 'Impossible de supprimer la liste' }, 500);
  }
}
