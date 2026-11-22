import type { ApiResponse } from '@/types';

/**
 * Appel JSON depuis un composant client. Le navigateur ajoute l'en-tête Origin
 * (contrôlé côté serveur). Les erreurs réseau deviennent un message générique.
 */
export async function postJson<T>(url: string, body: unknown): Promise<{ ok: boolean; payload: ApiResponse<T> }> {
  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const payload = (await response.json().catch(() => ({ success: false }))) as ApiResponse<T>;

    return { ok: response.ok && payload.success, payload };
  } catch {
    return { ok: false, payload: { success: false, message: 'Une erreur réseau est survenue. Réessayez.' } };
  }
}
