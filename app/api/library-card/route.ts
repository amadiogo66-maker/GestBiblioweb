import { UserStatus } from '@prisma/client';
import { NextResponse } from 'next/server';
import { getAuthenticatedUser, jsonResponse } from '@/lib/api';
import { logger } from '@/lib/logger';
import { ensureLibraryCard } from '@/lib/library-card';

export const runtime = 'nodejs';

export async function GET(): Promise<NextResponse> {
  try {
    const user = await getAuthenticatedUser();

    if (!user || user.status !== UserStatus.ACTIVE) {
      return jsonResponse({ success: false, message: 'Non authentifié' }, 401);
    }

    const card = await ensureLibraryCard(user.id);

    return jsonResponse({ success: true, data: card });
  } catch (error) {
    logger.error('Library card fetch failed', { error: error instanceof Error ? error.message : 'unknown error' });
    return jsonResponse({ success: false, message: 'Impossible de récupérer la carte de bibliothèque' }, 500);
  }
}
