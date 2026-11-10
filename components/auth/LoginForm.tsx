'use client';

import Link from 'next/link';
import { signIn } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import type { FormEvent, ReactElement } from 'react';
import { loginSchema } from '@/schemas/auth';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { FormField } from '@/components/ui/FormField';
import { PasswordInput } from '@/components/auth/PasswordInput';
import { AuthError } from '@/components/auth/AuthError';

interface LoginFormProps {
  callbackUrl: string;
}

interface FieldErrors {
  username?: string;
  password?: string;
}

const ERROR_MESSAGES: Record<string, string> = {
  CredentialsSignin: "Nom d'utilisateur ou mot de passe incorrect.",
  account_blocked: 'Votre compte est suspendu ou bloqué. Contactez la bibliothèque.',
};

export function LoginForm({ callbackUrl }: LoginFormProps): ReactElement {
  const router = useRouter();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setFormError(null);

    const parsed = loginSchema.safeParse({ username, password });

    if (!parsed.success) {
      const errors = parsed.error.flatten().fieldErrors;
      setFieldErrors({ username: errors.username?.[0], password: errors.password?.[0] });
      return;
    }

    setFieldErrors({});
    setIsSubmitting(true);

    try {
      const result = await signIn('credentials', {
        username: parsed.data.username,
        password: parsed.data.password,
        redirect: false,
      });

      if (!result || result.error) {
        const message =
          (result?.code && ERROR_MESSAGES[result.code]) ||
          (result?.error && ERROR_MESSAGES[result.error]) ||
          'Une erreur est survenue. Réessayez.';
        setFormError(message);
        return;
      }

      router.push(callbackUrl);
      router.refresh();
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-5">
      {formError ? <AuthError message={formError} /> : null}

      <FormField label="Nom d'utilisateur" htmlFor="username" error={fieldErrors.username}>
        <Input
          id="username"
          name="username"
          type="text"
          autoComplete="username"
          placeholder="Nom d'utilisateur"
          value={username}
          onChange={(event) => setUsername(event.target.value)}
          aria-invalid={Boolean(fieldErrors.username)}
          aria-describedby={fieldErrors.username ? 'username-error' : undefined}
        />
      </FormField>

      <PasswordInput
        id="password"
        name="password"
        label="Mot de passe"
        placeholder="Mot de passe"
        autoComplete="current-password"
        value={password}
        onChange={(event) => setPassword(event.target.value)}
        error={fieldErrors.password}
      />

      <div className="flex justify-end">
        <Link href="/mot-de-passe-oublie" className="text-sm font-medium text-primary hover:underline">
          Mot de passe oublié ?
        </Link>
      </div>

      <Button type="submit" variant="primary" size="md" disabled={isSubmitting} className="w-full">
        {isSubmitting ? 'Connexion en cours...' : 'Se connecter'}
      </Button>

      <p className="text-center text-sm text-slate-500">
        Pas encore de compte ?{' '}
        <Link href="/inscription" className="font-medium text-primary hover:underline">
          Créer un compte
        </Link>
      </p>
    </form>
  );
}
