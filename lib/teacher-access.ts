import { notFound } from 'next/navigation';
import { requireActiveDashboardUser, type DashboardUser } from '@/lib/dashboard-access';

/**
 * Garde des pages de l'espace enseignant : compte actif (requireActiveDashboardUser),
 * puis rôle TEACHER relu en base. Un autre rôle reçoit notFound() : l'espace
 * n'est pas révélé. Un enseignant sans département passe le garde ; la page
 * affiche alors un message et n'offre aucune création.
 */
export async function requireTeacherPage(): Promise<DashboardUser> {
  const user = await requireActiveDashboardUser();

  if (user.role !== 'TEACHER') {
    notFound();
  }

  return user;
}
