import type { ReactElement, ReactNode } from 'react';
import { requireStaffPage } from '@/lib/staff-page';

export const dynamic = 'force-dynamic';

/**
 * Toutes les pages de ce groupe exigent la double authentification vérifiée
 * (en plus de chaque page, qui revérifie via requireStaffPage). Une nouvelle
 * page ajoutée ici est donc protégée par défaut.
 */
export default async function StaffProtectedLayout({ children }: { children: ReactNode }): Promise<ReactElement> {
  await requireStaffPage();

  return <>{children}</>;
}
