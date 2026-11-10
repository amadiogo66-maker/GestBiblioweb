import type { ReactElement } from 'react';
import { AuthLayout } from '@/components/auth/AuthLayout';
import { RegisterForm } from '@/components/auth/RegisterForm';

export default function InscriptionPage(): ReactElement {
  return (
    <AuthLayout title="Créer un compte" subtitle="Rejoignez la bibliothèque universitaire en quelques minutes.">
      <RegisterForm />
    </AuthLayout>
  );
}
