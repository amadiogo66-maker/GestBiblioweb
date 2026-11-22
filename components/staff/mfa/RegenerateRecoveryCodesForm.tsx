'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import type { FormEvent, ReactElement } from 'react';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { FormField } from '@/components/ui/FormField';
import { AuthError } from '@/components/auth/AuthError';
import { RecoveryCodesList } from '@/components/staff/mfa/RecoveryCodesList';
import { postJson } from '@/lib/post-json';

export function RegenerateRecoveryCodesForm(): ReactElement {
  const router = useRouter();
  const [code, setCode] = useState('');
  const [codes, setCodes] = useState<string[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setBusy(true);
    setError(null);
    const { ok, payload } = await postJson<{ recoveryCodes: string[] }>('/api/staff/mfa/recovery-codes', { code });
    setBusy(false);
    setCode('');

    if (!ok || !payload.data) {
      setError(payload.message ?? 'Code invalide ou expiré.');
      return;
    }

    setCodes(payload.data.recoveryCodes);
    router.refresh();
  }

  if (codes) {
    return <RecoveryCodesList codes={codes} />;
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-4">
      {error ? <AuthError message={error} /> : null}
      <p className="text-sm text-slate-600">Les anciens codes de secours cesseront de fonctionner.</p>
      <FormField label="Code à 6 chiffres de l'application" htmlFor="mfa-regenerate">
        <Input
          id="mfa-regenerate"
          inputMode="numeric"
          autoComplete="one-time-code"
          maxLength={6}
          value={code}
          onChange={(event) => setCode(event.target.value.replace(/\D/g, ''))}
          required
        />
      </FormField>
      <Button type="submit" variant="outline" size="sm" disabled={busy || code.length !== 6} className="w-fit">
        {busy ? 'Génération…' : 'Régénérer les codes de secours'}
      </Button>
    </form>
  );
}
