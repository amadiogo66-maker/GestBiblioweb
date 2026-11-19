import { NextResponse } from 'next/server';
import { jsonResponse } from '@/lib/api';
import { requireActiveUser } from '@/lib/authz';
import { logger } from '@/lib/logger';
import { ensureLibraryCard } from '@/lib/library-card';

export const runtime = 'nodejs';

export async function GET(): Promise<NextResponse> {
  try {
    const authz = await requireActiveUser();

    if (!authz.ok) {
      return authz.response;
    }

    const { user } = authz;

    const card = await ensureLibraryCard(user.id);

    return jsonResponse({ success: true, data: card });
  } catch (error) {
    logger.error('Library card fetch failed', { error: error instanceof Error ? error.message : 'unknown error' });
    return jsonResponse({ success: false, message: 'Impossible de récupérer la carte de bibliothèque' }, 500);
  }
}
