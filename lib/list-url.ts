export type ListParams = Record<string, string | number | undefined | null>;

/**
 * Construit l'URL d'une liste pilotée par l'URL (filtres + pagination).
 * Les valeurs vides sont omises ; la page 1 n'apparaît pas.
 */
export function buildListHref(pathname: string, params: ListParams): string {
  const search = new URLSearchParams();

  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null || value === '') continue;
    if (key === 'page' && Number(value) <= 1) continue;
    search.set(key, String(value));
  }

  const query = search.toString();
  return query ? `${pathname}?${query}` : pathname;
}
