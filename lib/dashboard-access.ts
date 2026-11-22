import { redirect } from 'next/navigation';
import { BLOCKED_ACCOUNT_ROUTE } from '@/lib/constants';
import { prisma } from '@/lib/prisma';

/**
 * À appeler dans une page de l'espace personnel AVANT de lire ses données.
 * Le layout et la page s'exécutent en parallèle : la redirection du layout seule
 * n'empêche pas le contenu de la page de partir dans le flux de réponse.
 */
export async function requireActiveDashboardUser(userId: string): Promise<void> {
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { status: true } });

  if (user?.status !== 'ACTIVE') {
    redirect(user?.status === 'PENDING' ? '/en-attente-validation' : BLOCKED_ACCOUNT_ROUTE);
  }
}
