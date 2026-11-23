import type { NextResponse } from 'next/server';
import { jsonResponse } from '@/lib/api';
import { PAYLOAD_TOO_LARGE_MESSAGE } from '@/lib/constants';
import type { ApiResponse } from '@/types';

/** Corps plus grand que le plafond : la lecture s'arrête dès qu'il est franchi. */
export class PayloadTooLargeError extends Error {
  constructor(readonly limitBytes: number) {
    super(`Corps de requête supérieur à ${limitBytes} octets`);
    this.name = 'PayloadTooLargeError';
  }
}

/**
 * Lit le corps en comptant les octets réellement reçus dans le flux, sans se
 * fier à Content-Length (absent, ou faux, en transfert par morceaux). Au-delà
 * du plafond, le flux est annulé et PayloadTooLargeError est levée.
 */
export async function readBodyText(request: Request, limitBytes: number): Promise<string> {
  if (!request.body) {
    return '';
  }

  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;

  for (;;) {
    const { done, value } = await reader.read();

    if (done) {
      break;
    }

    total += value.byteLength;

    if (total > limitBytes) {
      // Sans await : sur une copie (request.clone()), l'annulation ne se
      // termine qu'une fois l'autre branche du flux annulée elle aussi.
      void reader.cancel().catch(() => undefined);
      throw new PayloadTooLargeError(limitBytes);
    }

    chunks.push(value);
  }

  return new TextDecoder().decode(Buffer.concat(chunks));
}

/**
 * Équivalent de request.json() avec un plafond : même résultat, et une
 * SyntaxError pour un corps vide ou invalide, comme request.json().
 */
export async function readJsonBody(request: Request, limitBytes: number): Promise<unknown> {
  return JSON.parse(await readBodyText(request, limitBytes)) as unknown;
}

/**
 * Équivalent de request.json().catch(() => null) : null pour un corps vide ou
 * invalide, mais un corps trop grand reste une erreur (réponse 413).
 */
export async function readJsonBodyOrNull(request: Request, limitBytes: number): Promise<unknown> {
  try {
    return await readJsonBody(request, limitBytes);
  } catch (error) {
    if (error instanceof PayloadTooLargeError) {
      throw error;
    }

    return null;
  }
}

/** Réponse 413 au format JSON habituel si l'erreur est un dépassement, sinon null. */
export function payloadTooLargeResponse(error: unknown): NextResponse<ApiResponse<never>> | null {
  return error instanceof PayloadTooLargeError ? jsonResponse({ success: false, message: PAYLOAD_TOO_LARGE_MESSAGE }, 413) : null;
}
