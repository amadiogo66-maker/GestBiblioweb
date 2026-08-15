import type { ReactElement } from 'react';
import { AuthLayout } from '@/components/auth/AuthLayout';
import { AuthError } from '@/components/auth/AuthError';
import { LoginForm } from '@/components/auth/LoginForm';

interface ConnexionPageProps {
  searchParams: Promise<{ registered?: string; callbackUrl?: string }>;
}

const DEFAULT_CALLBACK_URL = '/tableau-de-bord';

function resolveCallbackUrl(rawCallbackUrl: string | undefined): string {
  if (!rawCallbackUrl) {
    return DEFAULT_CALLBACK_URL;
  }

  try {
    // Le second argument sert uniquement de base pour parser les chemins relatifs ;
    // seuls pathname + search sont conservés, ce qui neutralise tout callbackUrl externe (open redirect).
    const url = new URL(rawCallbackUrl, 'http://localhost');
    return url.pathname.startsWith('/') ? `${url.pathname}${url.search}` : DEFAULT_CALLBACK_URL;
  } catch {
    return DEFAULT_CALLBACK_URL;
  }
}

export default async function ConnexionPage({ searchParams }: ConnexionPageProps): Promise<ReactElement> {
  const { registered, callbackUrl } = await searchParams;

  return (
    <AuthLayout title="Connexion" subtitle="Accédez à votre espace lecteur.">
      {registered === 'true' ? (
        <div className="mb-5">
          <AuthError variant="success" message="Compte créé ! Vous pouvez maintenant vous connecter." />
        </div>
      ) : null}
      <LoginForm callbackUrl={resolveCallbackUrl(callbackUrl)} />
    </AuthLayout>
  );
}
