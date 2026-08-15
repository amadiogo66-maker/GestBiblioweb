export interface CatalogueFilterValues {
  query?: string;
  department?: string;
  category?: string;
  year?: number;
  availability?: 'all' | 'available' | 'unavailable';
  page?: number;
}

export function buildCatalogueHref(current: CatalogueFilterValues, changes: Partial<CatalogueFilterValues>): string {
  const merged: CatalogueFilterValues = { ...current, ...changes };

  if (!('page' in changes)) {
    merged.page = undefined;
  }

  const params = new URLSearchParams();

  if (merged.query) {
    params.set('query', merged.query);
  }
  if (merged.department) {
    params.set('department', merged.department);
  }
  if (merged.category) {
    params.set('category', merged.category);
  }
  if (merged.year) {
    params.set('year', String(merged.year));
  }
  if (merged.availability && merged.availability !== 'all') {
    params.set('availability', merged.availability);
  }
  if (merged.page && merged.page > 1) {
    params.set('page', String(merged.page));
  }

  const queryString = params.toString();
  return queryString ? `/catalogue?${queryString}` : '/catalogue';
}
