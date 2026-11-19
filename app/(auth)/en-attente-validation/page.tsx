import { redirect } from 'next/navigation';
import { Clock } from 'lucide-react';
import type { Metadata } from 'next';
import type { ReactElement } from 'react';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { AuthLayout } from '@/components/auth/AuthLayout';
import { SignOutButton } from '@/components/auth/SignOutButton';
import { Button } from '@/components/ui/Button';
import { BLOCKED_ACCOUNT_ROUTE } from '@/lib/constants';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Compte en attente de validation - Gest Biblio',
  description: "Votre compte a bien été créé. Un bibliothécaire doit le valider avant l'accès à votre espace personnel.",
};

export default async function EnAttenteValidationPage(): Promise<ReactElement> {
  const session = await auth();

  if (!session?.user?.id) {
    redirect('/connexion');
  }

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { email: true, username: true, status: true },
  });

  if (!user) redirect(BLOCKED_ACCOUNT_ROUTE);
  if (user.status === 'ACTIVE') redirect('/tableau-de-bord');
  if (user.status === 'SUSPENDED' || user.status === 'BANNED') redirect(BLOCKED_ACCOUNT_ROUTE);

  return (
    <AuthLayout
      title="Compte en attente de validation"
      subtitle="Votre inscription a bien été enregistrée."
    >
      <div className="flex flex-col items-center gap-5 text-center">
        <span className="flex h-14 w-14 items-center justify-center rounded-full bg-secondary/15 text-secondary">
          <Clock className="h-7 w-7" aria-hidden="true" />
        </span>

        <p className="text-sm leading-relaxed text-slate-600">
          Pour des raisons de sécurité, chaque nouvelle inscription doit être validée par un bibliothécaire avant de
          donner accès à l&rsquo;espace personnel (emprunts, réservations, profil). Cette vérification est
          généralement rapide.
        </p>

        <div className="w-full rounded-lg bg-accent px-4 py-3 text-left text-sm text-slate-600">
          <p>
            <span className="font-medium text-primary">Email :</span> {user.email}
          </p>
          <p className="mt-1">
            <span className="font-medium text-primary">Nom d&rsquo;utilisateur :</span> {user.username}
          </p>
        </div>

        <p className="text-sm text-slate-500">
          En attendant la validation, vous pouvez librement consulter notre catalogue en ligne.
        </p>

        <div className="flex w-full flex-col gap-3 sm:flex-row">
          <Button href="/catalogue" variant="primary" size="md" className="flex-1">
            Consulter le catalogue
          </Button>
          <Button href="/contact" variant="outline" size="md" className="flex-1">
            Nous contacter
          </Button>
        </div>

        <SignOutButton />
      </div>
    </AuthLayout>
  );
}
