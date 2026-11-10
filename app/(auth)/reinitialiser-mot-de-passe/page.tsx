import type { Metadata } from 'next';
import type { ReactElement } from 'react';
import Link from 'next/link';
import { AuthLayout } from '@/components/auth/AuthLayout';
import { AuthError } from '@/components/auth/AuthError';
import { Button } from '@/components/ui/Button';
import { ResetPasswordForm } from '@/components/auth/ResetPasswordForm';

export const metadata: Metadata = {
  title: 'Réinitialiser le mot de passe - Gest Biblio',
  description: 'Choisissez un nouveau mot de passe pour votre compte.',
};

interface ReinitialiserMotDePassePageProps {
  searchParams: Promise<{ token?: string; email?: string }>;
}

export default async function ReinitialiserMotDePassePage({
  searchParams,
}: ReinitialiserMotDePassePageProps): Promise<ReactElement> {
  const { token, email } = await searchParams;

  if (!token || !email) {
    return (
      <AuthLayout title="Réinitialiser le mot de passe">
        <div className="flex flex-col gap-5">
          <AuthError message="Ce lien de réinitialisation est incomplet ou invalide." />
          <Button href="/mot-de-passe-oublie" variant="primary" size="md" className="w-full">
            Demander un nouveau lien
          </Button>
          <Link href="/connexion" className="text-center text-sm font-medium text-primary hover:underline">
            Retour à la connexion
          </Link>
        </div>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout title="Réinitialiser le mot de passe" subtitle="Choisissez un nouveau mot de passe.">
      <ResetPasswordForm token={token} email={email} />
    </AuthLayout>
  );
}
