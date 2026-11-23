import { NextResponse, type NextRequest } from 'next/server';
import { createBookSchema, syncBookSchema } from '@/schemas/book';
import { bookSelect, toBookCreateData, toBookUpdateData } from '@/lib/books';
import { jsonResponse, prismaErrorResponse, validationErrorResponse } from '@/lib/api';
import { rejectInvalidApiKey } from '@/lib/api-key';
import { prisma } from '@/lib/prisma';
import { logger } from '@/lib/logger';
import { UnresolvedDepartments, loadDepartmentIndex, resolveReceivedDepartment } from '@/lib/departments';
import { BODY_LIMITS } from '@/lib/constants';
import { payloadTooLargeResponse, readJsonBody } from '@/lib/json-body';
import { getClientIp } from '@/lib/client-ip';

export const runtime = 'nodejs';

export async function POST(request: NextRequest): Promise<NextResponse> {
  const rejectedKey = rejectInvalidApiKey(request, 'Gest Biblio sync API key is not configured');

  if (rejectedKey) {
    return rejectedKey;
  }

  try {
    const payload = await readJsonBody(request, BODY_LIMITS.sync);
    const parsed = syncBookSchema.safeParse(payload);

    if (!parsed.success) {
      return validationErrorResponse(parsed.error);
    }

    const { action, book } = parsed.data;

    if (action === 'DELETE') {
      const deletedBook = await prisma.book.delete({
        where: { externalId: book.externalId },
        select: bookSelect,
      });

      await prisma.activityLog.create({
        data: {
          action: 'book.sync.delete',
          ipAddress: getClientIp(request.headers),
          userAgent: request.headers.get('user-agent'),
          details: { externalId: deletedBook.externalId, isbn: deletedBook.isbn },
        },
      });

      return jsonResponse({ success: true, message: 'Livre supprimé', data: deletedBook });
    }

    // Le texte reste la source : le département officiel est recalculé à
    // chaque synchronisation ; un libellé inconnu est accepté (id null) et signalé.
    const unresolvedDepartments = new UnresolvedDepartments<'externalId'>();
    const departmentId = resolveReceivedDepartment(
      await loadDepartmentIndex(prisma),
      book.department,
      unresolvedDepartments,
      { externalId: book.externalId }
    );
    // Livre existant : seuls les champs reçus changent, les autres sont conservés.
    // Nouveau livre : les valeurs par défaut s'appliquent.
    const creation = createBookSchema.safeParse(book);
    const existing = await prisma.book.findUnique({ where: { externalId: book.externalId }, select: { id: true } });

    if (!existing && !creation.success) {
      return validationErrorResponse(creation.error);
    }

    const updateData = {
      ...toBookUpdateData(book),
      officialDepartment: departmentId ? { connect: { id: departmentId } } : { disconnect: true },
    };
    const syncedBook = creation.success
      ? await prisma.book.upsert({
          where: { externalId: book.externalId },
          create: {
            ...toBookCreateData(creation.data),
            ...(departmentId ? { officialDepartment: { connect: { id: departmentId } } } : {}),
          },
          update: updateData,
          select: bookSelect,
        })
      : await prisma.book.update({ where: { externalId: book.externalId }, data: updateData, select: bookSelect });

    await prisma.activityLog.create({
      data: {
        action: action === 'CREATE' ? 'book.sync.create' : 'book.sync.update',
        ipAddress: getClientIp(request.headers),
        userAgent: request.headers.get('user-agent'),
        details: {
          externalId: syncedBook.externalId,
          isbn: syncedBook.isbn,
          unresolvedDepartments: unresolvedDepartments.count,
        },
      },
    });

    return jsonResponse({
      success: true,
      message: action === 'CREATE' ? 'Livre synchronisé' : 'Livre mis à jour',
      data: {
        ...syncedBook,
        // Champs ajoutés (optionnels pour les appelants existants).
        unresolvedDepartments: unresolvedDepartments.count,
        unresolvedDetails: unresolvedDepartments.details,
      },
    });
  } catch (error) {
    const tooLarge = payloadTooLargeResponse(error);

    if (tooLarge) {
      return tooLarge;
    }

    const prismaResponse = prismaErrorResponse(error);

    if (prismaResponse) {
      return prismaResponse;
    }

    logger.error('Book sync failed', { error: error instanceof Error ? error.message : 'unknown error' });
    return jsonResponse({ success: false, message: 'Impossible de synchroniser le livre' }, 500);
  }
}

