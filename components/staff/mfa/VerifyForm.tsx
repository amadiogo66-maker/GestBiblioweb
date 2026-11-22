'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import type { FormEvent, ReactElement } from 'react';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { FormField } from '@/components/ui/FormField';
import { AuthError } from '@/components/auth/AuthError';
import { postJson } from '@/lib/post-json';

export function VerifyForm(): ReactElement {
  const router = useRouter();
  const [useRecovery, setUseRecovery] = useState(false);
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setBusy(true);
    setError(null);
    const { ok, payload } = await postJson('/api/staff/mfa/verify', { code });
    setBusy(false);

    if (!ok) {
      setError(payload.message ?? 'Code invalide ou expiré.');
      setCode('');
      return;
    }

    router.push('/personnel');
    router.refresh();
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-5">
      {error ? <AuthError message={error} /> : null}
      <FormField label={useRecovery ? 'Code de secours' : 'Code à 6 chiffres'} htmlFor="mfa-code">
        <Input
          id="mfa-code"
          inputMode={useRecovery ? 'text' : 'numeric'}
          autoComplete="one-time-code"
          spellCheck={false}
          maxLength={useRecovery ? 40 : 6}
          placeholder={useRecovery ? 'XXXXX-XXXXX' : '123456'}
          value={code}
          onChange={(event) => setCode(useRecovery ? event.target.value : event.target.value.replace(/\D/g, ''))}
          required
          autoFocus
        />
      </FormField>
      <Button type="submit" variant="primary" size="md" disabled={busy || code.trim().length < 6} className="w-full sm:w-fit">
        {busy ? 'Vérification…' : 'Vérifier'}
      </Button>
      <button
        type="button"
        className="w-fit text-sm font-medium text-primary hover:underline"
        onClick={() => {
          setUseRecovery((value) => !value);
          setCode('');
          setError(null);
        }}
      >
        {useRecovery ? 'Utiliser le code de l’application' : 'Utiliser un code de secours'}
      </button>
    </form>
  );
}
