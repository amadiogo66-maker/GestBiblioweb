'use client';

import { useState } from 'react';
import type { FormEvent, ReactElement } from 'react';
import { resetPasswordSchema } from '@/schemas/auth';
import { Button } from '@/components/ui/Button';
import { PasswordInput } from '@/components/auth/PasswordInput';
import { AuthError } from '@/components/auth/AuthError';
import type { ApiResponse } from '@/types';

interface ResetPasswordFormProps {
  token: string;
  email: string;
}

interface FieldErrors {
  password?: string;
  confirmPassword?: string;
}

export function ResetPasswordForm({ token, email }: ResetPasswordFormProps): ReactElement {
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isTokenInvalid, setIsTokenInvalid] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setFormError(null);

    const parsed = resetPasswordSchema.safeParse({ email, token, password, confirmPassword });

    if (!parsed.success) {
      const errors = parsed.error.flatten().fieldErrors;
      setFieldErrors({ password: errors.password?.[0], confirmPassword: errors.confirmPassword?.[0] });
      return;
    }

    setFieldErrors({});
    setIsSubmitting(true);

    try {
      const response = await fetch('/api/auth/reset-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(parsed.data),
      });
      const payload = (await response.json()) as ApiResponse<never>;

      if (!response.ok || !payload.success) {
        if (payload.errors?.token) {
          setIsTokenInvalid(true);
          return;
        }

        if (payload.errors) {
          setFieldErrors({
            password: payload.errors.password?.[0],
            confirmPassword: payload.errors.confirmPassword?.[0],
          });
        }
        setFormError(payload.message ?? 'Impossible de réinitialiser le mot de passe.');
        return;
      }

      setIsSuccess(true);
    } catch {
      setFormError('Une erreur réseau est survenue. Réessayez.');
    } finally {
      setIsSubmitting(false);
    }
  }

  if (isTokenInvalid) {
    return (
      <div className="flex flex-col gap-5">
        <AuthError message="Ce lien de réinitialisation est invalide ou a expiré." />
        <Button href="/mot-de-passe-oublie" variant="primary" size="md" className="w-full">
          Demander un nouveau lien
        </Button>
      </div>
    );
  }

  if (isSuccess) {
    return (
      <div className="flex flex-col gap-5">
        <AuthError variant="success" message="Votre mot de passe a été réinitialisé avec succès." />
        <Button href="/connexion" variant="primary" size="md" className="w-full">
          Se connecter
        </Button>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-5">
      {formError ? <AuthError message={formError} /> : null}

      <PasswordInput
        id="password"
        name="password"
        label="Nouveau mot de passe"
        placeholder="Nouveau mot de passe"
        autoComplete="new-password"
        value={password}
        onChange={(event) => setPassword(event.target.value)}
        error={fieldErrors.password}
        showStrength
      />

      <PasswordInput
        id="confirmPassword"
        name="confirmPassword"
        label="Confirmer le mot de passe"
        placeholder="Confirmer le mot de passe"
        autoComplete="new-password"
        value={confirmPassword}
        onChange={(event) => setConfirmPassword(event.target.value)}
        error={fieldErrors.confirmPassword}
      />

      <Button type="submit" variant="primary" size="md" disabled={isSubmitting} className="w-full">
        {isSubmitting ? 'Réinitialisation en cours...' : 'Réinitialiser le mot de passe'}
      </Button>
    </form>
  );
}
