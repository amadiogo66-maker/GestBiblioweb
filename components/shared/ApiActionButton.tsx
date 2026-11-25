'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import type { ReactElement, ReactNode } from 'react';
import { Button } from '@/components/ui/Button';
import { AuthError } from '@/components/auth/AuthError';
import { sendJson, type JsonMethod } from '@/lib/post-json';

interface ApiActionButtonProps {
  url: string;
  method: JsonMethod;
  body?: unknown;
  children: ReactNode;
  /** Question de confirmation (action destructrice). */
  confirm?: string;
  /** Page à ouvrir après succès ; sinon la page courante est rafraîchie. */
  redirectTo?: string;
  variant?: 'primary' | 'secondary' | 'outline' | 'ghost';
  size?: 'sm' | 'md';
  ariaLabel?: string;
  /** Action indisponible (l'API refuse aussi) ; l'explication est reliée par aria-describedby. */
  disabled?: boolean;
  describedBy?: string;
}

/**
 * Bouton qui appelle une route JSON de l'API puis rafraîchit la page (données
 * relues côté serveur). L'API revérifie toujours les droits : ce bouton n'est
 * qu'un raccourci d'interface.
 */
export function ApiActionButton({
  url,
  method,
  body,
  children,
  confirm,
  redirectTo,
  variant = 'outline',
  size = 'sm',
  ariaLabel,
  disabled = false,
  describedBy,
}: ApiActionButtonProps): ReactElement {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function run(): Promise<void> {
    if (confirm && !window.confirm(confirm)) return;

    setPending(true);
    setError(null);
    const { ok, payload } = await sendJson(method, url, body);
    setPending(false);

    if (!ok) {
      setError(payload.message ?? 'Action impossible. Réessayez.');
      return;
    }

    if (redirectTo) router.push(redirectTo);
    else router.refresh();
  }

  return (
    <div className="flex flex-col gap-2">
      <Button type="button" variant={variant} size={size} onClick={run} disabled={pending || disabled} aria-label={ariaLabel} aria-describedby={describedBy}>
        {pending ? 'Patientez…' : children}
      </Button>
      {error ? <AuthError message={error} /> : null}
    </div>
  );
}
