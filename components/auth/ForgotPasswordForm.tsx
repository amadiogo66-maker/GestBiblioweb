'use client';

import Link from 'next/link';
import { useState } from 'react';
import type { FormEvent, ReactElement } from 'react';
import { forgotPasswordSchema } from '@/schemas/auth';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { FormField } from '@/components/ui/FormField';
import { AuthError } from '@/components/auth/AuthError';
import type { ApiResponse } from '@/types';

const GENERIC_MESSAGE = 'Si un compte existe avec cet email, un lien de réinitialisation a été généré.';

interface ForgotPasswordSuccessData {
  resetToken?: string;
  expires?: string;
}

export function ForgotPasswordForm(): ReactElement {
  const [email, setEmail] = useState('');
  const [fieldError, setFieldError] = useState<string | undefined>(undefined);
  const [formError, setFormError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSubmitted, setIsSubmitted] = useState(false);
  const [devResetUrl, setDevResetUrl] = useState<string | null>(null);

  async function handleSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setFormError(null);

    const parsed = forgotPasswordSchema.safeParse({ email });

    if (!parsed.success) {
      setFieldError(parsed.error.flatten().fieldErrors.email?.[0]);
      return;
    }

    setFieldError(undefined);
    setIsSubmitting(true);

    try {
      const response = await fetch('/api/auth/forgot-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(parsed.data),
      });
      const payload = (await response.json()) as ApiResponse<ForgotPasswordSuccessData>;

      if (!response.ok || !payload.success) {
        setFormError(payload.message ?? 'Une erreur est survenue. Réessayez.');
        return;
      }

      if (payload.data?.resetToken) {
        const url = new URL('/reinitialiser-mot-de-passe', window.location.origin);
        url.searchParams.set('token', payload.data.resetToken);
        url.searchParams.set('email', parsed.data.email);
        setDevResetUrl(url.pathname + url.search);
      }

      setIsSubmitted(true);
    } catch {
      setFormError('Une erreur réseau est survenue. Réessayez.');
    } finally {
      setIsSubmitting(false);
    }
  }

  if (isSubmitted) {
    return (
      <div className="flex flex-col gap-5">
        <AuthError variant="success" message={GENERIC_MESSAGE} />

        {devResetUrl ? (
          <div className="rounded-lg border border-dashed border-secondary/60 bg-secondary/5 px-4 py-3 text-sm text-slate-600">
            <p className="font-medium text-primary">Mode développement</p>
            <p className="mt-1">Aucun email n&rsquo;est envoyé en local. Lien de réinitialisation :</p>
            <Link href={devResetUrl} className="mt-1 block break-all font-medium text-primary hover:underline">
              {devResetUrl}
            </Link>
          </div>
        ) : null}

        <Link href="/connexion" className="text-center text-sm font-medium text-primary hover:underline">
          Retour à la connexion
        </Link>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-5">
      {formError ? <AuthError message={formError} /> : null}

      <p className="text-sm text-slate-500">
        Indiquez l&rsquo;adresse email associée à votre compte, nous vous enverrons un lien pour réinitialiser votre
        mot de passe.
      </p>

      <FormField label="Email" htmlFor="email" error={fieldError}>
        <Input
          id="email"
          name="email"
          type="email"
          placeholder="votre@email.com"
          autoComplete="email"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          aria-invalid={Boolean(fieldError)}
          aria-describedby={fieldError ? 'email-error' : undefined}
        />
      </FormField>

      <Button type="submit" variant="primary" size="md" disabled={isSubmitting} className="w-full">
        {isSubmitting ? 'Envoi en cours...' : 'Envoyer le lien de réinitialisation'}
      </Button>

      <p className="text-center text-sm text-slate-500">
        <Link href="/connexion" className="font-medium text-primary hover:underline">
          Retour à la connexion
        </Link>
      </p>
    </form>
  );
}
