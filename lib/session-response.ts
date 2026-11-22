import { prisma } from '@/lib/prisma';

/**
 * En-têtes de la réponse d'Auth.js pour une session anonyme (GET /session).
 */
const ANONYMOUS_SESSION_HEADERS = {
  'Content-Type': 'application/json',
  'Cache-Control': 'private, no-cache, no-store',
  Expires: '0',
  Pragma: 'no-cache',
} as const;

/** Corps et en-têtes identiques à ceux d'Auth.js sans session ; aucun cookie renouvelé. */
export function anonymousSessionResponse(): Response {
  return new Response('null', { status: 200, headers: ANONYMOUS_SESSION_HEADERS });
}

async function readSessionUserId(response: Response): Promise<string | null> {
  try {
    const body: unknown = await response.clone().json();
    const id = (body as { user?: { id?: unknown } } | null)?.user?.id;

    return typeof id === 'string' && id.length > 0 ? id : null;
  } catch {
    return null;
  }
}

/**
 * Réponse de GET /api/auth/session filtrée par le statut EN BASE : le JWT
 * peut dater d'avant une suspension, un bannissement ou une suppression.
 * Une seule lecture indexée (clé primaire), faite seulement s'il y a un
 * utilisateur dans la réponse. Volontairement hors du callback session
 * d'Auth.js, qui s'exécute aussi dans le middleware à chaque requête.
 */
export async function withoutInactiveSession(response: Response): Promise<Response> {
  if (!response.ok) {
    return response;
  }

  const userId = await readSessionUserId(response);

  if (!userId) {
    return response;
  }

  const account = await prisma.user.findUnique({ where: { id: userId }, select: { id: true, status: true } });

  return account?.status === 'ACTIVE' ? response : anonymousSessionResponse();
}
