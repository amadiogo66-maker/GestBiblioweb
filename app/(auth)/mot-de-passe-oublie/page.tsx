import type { Metadata } from 'next';
import type { ReactElement } from 'react';
import { AuthLayout } from '@/components/auth/AuthLayout';
import { ForgotPasswordForm } from '@/components/auth/ForgotPasswordForm';

export const metadata: Metadata = {
  title: 'Mot de passe oublié - Gest Biblio',
  description: 'Demandez un lien de réinitialisation pour retrouver l’accès à votre compte.',
};

export default function MotDePasseOubliePage(): ReactElement {
  return (
    <AuthLayout title="Mot de passe oublié" subtitle="Réinitialisez l’accès à votre compte.">
      <ForgotPasswordForm />
    </AuthLayout>
  );
}
