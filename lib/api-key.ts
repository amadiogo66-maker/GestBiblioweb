import { createHash, timingSafeEqual } from 'crypto';
import type { NextResponse } from 'next/server';
import { jsonResponse } from '@/lib/api';
import { logger } from '@/lib/logger';
import type { ApiResponse } from '@/types';

function digest(value: string): Buffer {
  return createHash('sha256').update(value).digest();
}

/**
 * Contrôle de l'en-tête x-api-key des routes appelées par le logiciel de gestion.
 * null si la clé est valide ; sinon 500 (clé non configurée) ou 401 (absente ou
 * invalide), avec les mêmes messages que les webhooks existants. La comparaison
 * porte sur des empreintes de même longueur, à temps constant.
 */
export function rejectInvalidApiKey(request: Request): NextResponse<ApiResponse<never>> | null {
  const expected = process.env.GEST_BIBLIO_API_KEY;

  if (!expected) {
    logger.error('Gest Biblio API key is not configured');
    return jsonResponse({ success: false, message: 'Synchronisation indisponible' }, 500);
  }

  const provided = request.headers.get('x-api-key');

  if (!provided || !timingSafeEqual(digest(provided), digest(expected))) {
    return jsonResponse({ success: false, message: 'Clé API invalide' }, 401);
  }

  return null;
}
