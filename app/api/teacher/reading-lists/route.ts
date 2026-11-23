import type { NextRequest, NextResponse } from 'next/server';
import { jsonResponse, validationErrorResponse } from '@/lib/api';
import { prisma } from '@/lib/prisma';
import { logger } from '@/lib/logger';
import { buildActivityLogData } from '@/lib/activity-log';
import { BODY_LIMITS, READING_LIST_QUOTAS } from '@/lib/constants';
import { payloadTooLargeResponse, readJsonBodyOrNull } from '@/lib/json-body';
import { beginTeacherWrite, conflictResponse, teacherDepartment } from '@/lib/write-route';
import { readingListCreateSchema } from '@/schemas/reading-list';

export const runtime = 'nodejs';

class QuotaError extends Error {}

/** Crée une liste de lectures (brouillon) dans le département de l'enseignant, relu en base. */
export async function POST(request: NextRequest): Promise<NextResponse> {
  const begin = await beginTeacherWrite(request, 'teacher-reading-list');

  if (!begin.ok) {
    return begin.response;
  }

  const department = teacherDepartment(begin.user);

  if (!department.ok) {
    return department.response;
  }

  try {
    const parsed = readingListCreateSchema.safeParse(await readJsonBodyOrNull(request, BODY_LIMITS.default));

    if (!parsed.success) {
      return validationErrorResponse(parsed.error);
    }

    const { programId, ...fields } = parsed.data;

    if (programId) {
      const program = await prisma.program.findFirst({ where: { id: programId, departmentId: department.departmentId }, select: { id: true } });

      if (!program) {
        return jsonResponse({ success: false, message: 'Programme inconnu dans votre département' }, 400);
      }
    }

    const list = await prisma.$transaction(async (tx) => {
      if ((await tx.readingList.count({ where: { ownerId: begin.user.id } })) >= READING_LIST_QUOTAS.listsPerTeacher) {
        throw new QuotaError();
      }

      const created = await tx.readingList.create({
        data: { ...fields, programId: programId ?? null, ownerId: begin.user.id, departmentId: department.departmentId },
        select: { id: true, title: true, status: true },
      });
      await tx.activityLog.create({
        data: buildActivityLogData({ action: 'reading_list.create', userId: begin.user.id, headers: request.headers, details: { listId: created.id } }),
      });

      return created;
    });

    return jsonResponse({ success: true, message: 'Liste créée', data: list }, 201);
  } catch (error) {
    const tooLarge = payloadTooLargeResponse(error);

    if (tooLarge) {
      return tooLarge;
    }

    if (error instanceof QuotaError) {
      return conflictResponse(`Vous avez atteint la limite de ${READING_LIST_QUOTAS.listsPerTeacher} listes. Supprimez une liste avant d'en créer une autre.`);
    }

    logger.error('Reading list creation failed', { error: error instanceof Error ? error.message : 'unknown error' });
    return jsonResponse({ success: false, message: 'Impossible de créer la liste' }, 500);
  }
}
