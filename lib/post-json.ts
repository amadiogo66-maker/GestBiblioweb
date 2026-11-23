import type { ApiResponse } from '@/types';

export type JsonMethod = 'POST' | 'PATCH' | 'DELETE';

/**
 * Appel JSON depuis un composant client. Le navigateur ajoute l'en-tête Origin
 * (contrôlé côté serveur). Les erreurs réseau deviennent un message générique.
 */
export async function sendJson<T>(method: JsonMethod, url: string, body?: unknown): Promise<{ ok: boolean; status: number; payload: ApiResponse<T> }> {
  try {
    const response = await fetch(url, {
      method,
      headers: { 'Content-Type': 'application/json' },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    const payload = (await response.json().catch(() => ({ success: false }))) as ApiResponse<T>;

    return { ok: response.ok && payload.success, status: response.status, payload };
  } catch {
    return { ok: false, status: 0, payload: { success: false, message: 'Une erreur réseau est survenue. Réessayez.' } };
  }
}

export async function postJson<T>(url: string, body: unknown): Promise<{ ok: boolean; payload: ApiResponse<T> }> {
  const { ok, payload } = await sendJson<T>('POST', url, body);

  return { ok, payload };
}
