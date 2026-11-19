import Link from 'next/link';
import { ShieldAlert } from 'lucide-react';
import type { Metadata } from 'next';
import type { ReactElement } from 'react';
import { AuthLayout } from '@/components/auth/AuthLayout';
import { SignOutButton } from '@/components/auth/SignOutButton';
import { CONTACT_EMAIL, CONTACT_PHONE } from '@/lib/constants';

// Page publique, accessible avec ou sans session. Volontairement absente des
// pages d'authentification et des routes protégées du middleware : elle ne
// redirige jamais, ce qui casse toute boucle de redirection. Aucun motif détaillé.
export const metadata: Metadata = {
  title: 'Accès au compte impossible - Gest Biblio',
  robots: { index: false, follow: false },
};

export default function CompteBloquePage(): ReactElement {
  return (
    <AuthLayout title="Accès au compte impossible" subtitle="Votre compte ne permet pas d'accéder à l'espace personnel.">
      <div className="flex flex-col items-center gap-5 text-center">
        <span className="flex h-14 w-14 items-center justify-center rounded-full bg-danger/10 text-danger">
          <ShieldAlert className="h-7 w-7" aria-hidden="true" />
        </span>

        <p className="text-sm leading-relaxed text-slate-600">
          Votre compte est actuellement bloqué. Pour en connaître la raison ou demander sa réactivation, contactez la
          bibliothèque.
        </p>

        <div className="w-full rounded-lg bg-accent px-4 py-3 text-left text-sm text-slate-600">
          <p>
            Email :{' '}
            <a href={`mailto:${CONTACT_EMAIL}`} className="font-medium text-primary hover:underline">
              {CONTACT_EMAIL}
            </a>
          </p>
          <p className="mt-1">Téléphone : {CONTACT_PHONE}</p>
          <p className="mt-1">
            Ou via le{' '}
            <Link href="/contact" className="font-medium text-primary hover:underline">
              formulaire de contact
            </Link>
            .
          </p>
        </div>

        <SignOutButton />
      </div>
    </AuthLayout>
  );
}
