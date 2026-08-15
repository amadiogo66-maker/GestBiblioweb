import type { ReactElement } from 'react';
import { AuthLayout } from '@/components/auth/AuthLayout';
import { RegisterForm } from '@/components/auth/RegisterForm';
import { getCatalogueMetadata } from '@/lib/catalogue-data';

export const dynamic = 'force-dynamic';

export default async function InscriptionPage(): Promise<ReactElement> {
  const metadata = await getCatalogueMetadata();

  return (
    <AuthLayout title="Créer un compte" subtitle="Rejoignez la bibliothèque universitaire en quelques minutes.">
      <RegisterForm departments={metadata.departments} />
    </AuthLayout>
  );
}
