'use client';

import { useState } from 'react';
import type { FormEvent, ReactElement } from 'react';
import { changePasswordSchema } from '@/schemas/user';
import { PasswordInput } from '@/components/auth/PasswordInput';
import { Button } from '@/components/ui/Button';
import { AuthError } from '@/components/auth/AuthError';
import type { ApiResponse } from '@/types';

interface FeedbackState {
  type: 'success' | 'error';
  message: string;
}

type FieldErrors = Partial<Record<'currentPassword' | 'newPassword' | 'confirmPassword', string>>;

export function ChangePasswordForm(): ReactElement {
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [feedback, setFeedback] = useState<FeedbackState | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setFeedback(null);

    const parsed = changePasswordSchema.safeParse({ currentPassword, newPassword, confirmPassword });

    if (!parsed.success) {
      const errors = parsed.error.flatten().fieldErrors;
      setFieldErrors({
        currentPassword: errors.currentPassword?.[0],
        newPassword: errors.newPassword?.[0],
        confirmPassword: errors.confirmPassword?.[0],
      });
      return;
    }

    setFieldErrors({});
    setIsSubmitting(true);

    try {
      const response = await fetch('/api/auth/change-password', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(parsed.data),
      });
      const payload = (await response.json()) as ApiResponse<unknown>;

      if (!response.ok || !payload.success) {
        if (payload.errors?.currentPassword?.[0]) {
          setFieldErrors((prev) => ({ ...prev, currentPassword: payload.errors?.currentPassword?.[0] }));
        }
        setFeedback({ type: 'error', message: payload.message ?? 'Impossible de modifier le mot de passe.' });
        return;
      }

      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      setFeedback({ type: 'success', message: 'Mot de passe mis à jour avec succès.' });
    } catch {
      setFeedback({ type: 'error', message: 'Une erreur réseau est survenue. Réessayez.' });
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-5 rounded-xl border border-slate-200 bg-white p-6">
      <div>
        <h2 className="font-serif text-lg font-semibold text-primary">Sécurité</h2>
        <p className="mt-1 text-sm text-slate-500">Modifiez votre mot de passe régulièrement pour sécuriser votre compte.</p>
      </div>

      {feedback ? <AuthError variant={feedback.type === 'success' ? 'success' : 'error'} message={feedback.message} /> : null}

      <PasswordInput
        id="currentPassword"
        label="Mot de passe actuel"
        placeholder="Mot de passe actuel"
        autoComplete="current-password"
        value={currentPassword}
        onChange={(event) => setCurrentPassword(event.target.value)}
        error={fieldErrors.currentPassword}
      />
      <PasswordInput
        id="newPassword"
        label="Nouveau mot de passe"
        placeholder="Nouveau mot de passe"
        autoComplete="new-password"
        value={newPassword}
        onChange={(event) => setNewPassword(event.target.value)}
        error={fieldErrors.newPassword}
        showStrength
      />
      <PasswordInput
        id="confirmPassword"
        label="Confirmer le nouveau mot de passe"
        placeholder="Confirmer le nouveau mot de passe"
        autoComplete="new-password"
        value={confirmPassword}
        onChange={(event) => setConfirmPassword(event.target.value)}
        error={fieldErrors.confirmPassword}
      />

      <Button type="submit" variant="primary" size="md" disabled={isSubmitting} className="w-fit">
        {isSubmitting ? 'Modification...' : 'Modifier le mot de passe'}
      </Button>
    </form>
  );
}
