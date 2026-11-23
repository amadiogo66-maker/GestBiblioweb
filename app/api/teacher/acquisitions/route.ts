import type { NextRequest, NextResponse } from 'next/server';
import { jsonResponse, validationErrorResponse } from '@/lib/api';
import { prisma } from '@/lib/prisma';
import { logger } from '@/lib/logger';
import { buildActivityLogData } from '@/lib/activity-log';
import { ACQUISITION_OPEN_QUOTA, BODY_LIMITS, DUPLICATE_WARNING_CODE, RATE_LIMITS } from '@/lib/constants';
import { payloadTooLargeResponse, readJsonBodyOrNull } from '@/lib/json-body';
import { OPEN_STATUSES, findAcquisitionWarnings } from '@/lib/acquisitions';
import { beginTeacherWrite, conflictResponse, teacherDepartment } from '@/lib/write-route';
import { acquisitionCreateSchema } from '@/schemas/acquisition';

export const runtime = 'nodejs';

class QuotaError extends Error {}

/**
 * Nouvelle proposition d'acquisition, dans le département de l'enseignant
 * (relu en base). Doublon possible (ISBN déjà au catalogue, ou déjà proposé
 * dans le département) : 409 avec code duplicate_warning et le détail ; la
 * proposition n'est créée que si l'enseignant confirme (acknowledgeDuplicates).
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
  const begin = await beginTeacherWrite(request, 'acquisition-create', RATE_LIMITS.acquisitionCreate);

  if (!begin.ok) {
    return begin.response;
  }

  const department = teacherDepartment(begin.user);

  if (!department.ok) {
    return department.response;
  }

  try {
    const parsed = acquisitionCreateSchema.safeParse(await readJsonBodyOrNull(request, BODY_LIMITS.default));

    if (!parsed.success) {
      return validationErrorResponse(parsed.error);
    }

    const { acknowledgeDuplicates, ...fields } = parsed.data;
    const warnings = await findAcquisitionWarnings(prisma, { departmentId: department.departmentId, isbn: fields.isbn ?? null });

    if ((warnings.catalogBook || warnings.pendingInDepartment) && !acknowledgeDuplicates) {
      return jsonResponse(
        {
          success: false,
          code: DUPLICATE_WARNING_CODE,
          message: 'Cet ouvrage est peut-être déjà au catalogue ou déjà proposé. Vérifiez avant de confirmer.',
          data: warnings,
        },
        409
      );
    }

    const created = await prisma.$transaction(async (tx) => {
      if ((await tx.acquisitionRequest.count({ where: { requesterId: begin.user.id, status: { in: OPEN_STATUSES } } })) >= ACQUISITION_OPEN_QUOTA) {
        throw new QuotaError();
      }

      const result = await tx.acquisitionRequest.create({
        data: {
          ...fields,
          isbn: fields.isbn ?? null,
          publisher: fields.publisher ?? null,
          year: fields.year ?? null,
          requesterId: begin.user.id,
          departmentId: department.departmentId,
        },
        select: { id: true, status: true },
      });
      await tx.activityLog.create({
        data: buildActivityLogData({
          action: 'acquisition.submit',
          userId: begin.user.id,
          headers: request.headers,
          details: { requestId: result.id, departmentId: department.departmentId },
        }),
      });

      return result;
    });

    return jsonResponse({ success: true, message: 'Proposition envoyée au responsable de votre département', data: created }, 201);
  } catch (error) {
    const tooLarge = payloadTooLargeResponse(error);

    if (tooLarge) {
      return tooLarge;
    }

    if (error instanceof QuotaError) {
      return conflictResponse(`Vous avez déjà ${ACQUISITION_OPEN_QUOTA} propositions en cours. Attendez une décision avant d'en déposer une autre.`);
    }

    logger.error('Acquisition request creation failed', { error: error instanceof Error ? error.message : 'unknown error' });
    return jsonResponse({ success: false, message: 'Impossible d’envoyer la proposition' }, 500);
  }
}
