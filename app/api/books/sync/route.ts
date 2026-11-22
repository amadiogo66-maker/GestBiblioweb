import { timingSafeEqual } from 'crypto';
import { NextResponse, type NextRequest } from 'next/server';
import { syncBookSchema } from '@/schemas/book';
import { bookSelect, toBookCreateData } from '@/lib/books';
import { jsonResponse, prismaErrorResponse, validationErrorResponse } from '@/lib/api';
import { prisma } from '@/lib/prisma';
import { logger } from '@/lib/logger';
import { UnresolvedDepartments, loadDepartmentIndex, resolveReceivedDepartment } from '@/lib/departments';

export const runtime = 'nodejs';

function isValidApiKey(apiKey: string | null): boolean {
  const expectedApiKey = process.env.GEST_BIBLIO_API_KEY;

  if (!apiKey || !expectedApiKey) {
    return false;
  }

  const provided = Buffer.from(apiKey);
  const expected = Buffer.from(expectedApiKey);

  return provided.length === expected.length && timingSafeEqual(provided, expected);
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  if (!process.env.GEST_BIBLIO_API_KEY) {
    logger.error('Gest Biblio sync API key is not configured');
    return jsonResponse({ success: false, message: 'Synchronisation indisponible' }, 500);
  }

  if (!isValidApiKey(request.headers.get('x-api-key'))) {
    return jsonResponse({ success: false, message: 'Clé API invalide' }, 401);
  }

  try {
    const payload = await request.json();
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
          ipAddress: request.headers.get('x-forwarded-for'),
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
    const data = toBookCreateData(book);
    // Champ absent : à la création il vaut totalCopies, mais à la mise à jour il ne
    // doit pas écraser la disponibilité réelle transmise par /api/loans/sync.
    const { availableCopies: _defaultCopies, ...dataWithoutCopies } = data;
    const updateData = book.availableCopies === undefined ? dataWithoutCopies : data;
    const syncedBook = await prisma.book.upsert({
      where: { externalId: book.externalId },
      create: { ...data, ...(departmentId ? { officialDepartment: { connect: { id: departmentId } } } : {}) },
      update: { ...updateData, officialDepartment: departmentId ? { connect: { id: departmentId } } : { disconnect: true } },
      select: bookSelect,
    });

    await prisma.activityLog.create({
      data: {
        action: action === 'CREATE' ? 'book.sync.create' : 'book.sync.update',
        ipAddress: request.headers.get('x-forwarded-for'),
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
    const prismaResponse = prismaErrorResponse(error);

    if (prismaResponse) {
      return prismaResponse;
    }

    logger.error('Book sync failed', { error: error instanceof Error ? error.message : 'unknown error' });
    return jsonResponse({ success: false, message: 'Impossible de synchroniser le livre' }, 500);
  }
}

