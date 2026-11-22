'use client';

/* eslint-disable @next/next/no-img-element -- QR en data URL généré par le serveur */
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import type { FormEvent, ReactElement } from 'react';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { FormField } from '@/components/ui/FormField';
import { AuthError } from '@/components/auth/AuthError';
import { RecoveryCodesList } from '@/components/staff/mfa/RecoveryCodesList';
import { postJson } from '@/lib/post-json';

type Step = 'code' | 'scan' | 'done';

export function EnrollmentForm(): ReactElement {
  const router = useRouter();
  const [step, setStep] = useState<Step>('code');
  const [activationCode, setActivationCode] = useState('');
  const [totp, setTotp] = useState('');
  const [qrCode, setQrCode] = useState<string | null>(null);
  const [secret, setSecret] = useState<string | null>(null);
  const [recoveryCodes, setRecoveryCodes] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function start(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setBusy(true);
    setError(null);
    const { ok, payload } = await postJson<{ qrCode: string; secret: string }>('/api/staff/mfa/enrollment', { activationCode });
    setBusy(false);

    if (!ok || !payload.data) {
      setError(payload.message ?? 'Code invalide ou expiré.');
      return;
    }

    setQrCode(payload.data.qrCode);
    setSecret(payload.data.secret);
    setStep('scan');
  }

  async function confirm(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setBusy(true);
    setError(null);
    const { ok, payload } = await postJson<{ recoveryCodes: string[] }>('/api/staff/mfa/activate', { activationCode, code: totp });
    setBusy(false);

    if (!ok || !payload.data) {
      setError(payload.message ?? 'Code invalide ou expiré.');
      return;
    }

    // Le secret n'est plus conservé côté client une fois l'activation faite.
    setSecret(null);
    setQrCode(null);
    setRecoveryCodes(payload.data.recoveryCodes);
    setStep('done');
  }

  if (step === 'done') {
    return (
      <div className="flex flex-col gap-4">
        <AuthError variant="success" message="Double authentification activée." />
        <RecoveryCodesList codes={recoveryCodes} />
        <Button
          type="button"
          variant="primary"
          size="md"
          className="w-fit"
          onClick={() => {
            router.push('/personnel');
            router.refresh();
          }}
        >
          J&rsquo;ai noté mes codes, continuer
        </Button>
      </div>
    );
  }

  if (step === 'scan') {
    return (
      <form onSubmit={confirm} className="flex flex-col gap-5">
        {error ? <AuthError message={error} /> : null}
        <ol className="list-decimal space-y-1 pl-5 text-sm text-slate-600">
          <li>Ouvrez votre application d&rsquo;authentification (Google Authenticator, Microsoft Authenticator, FreeOTP…).</li>
          <li>Scannez le QR code, ou saisissez la clé manuellement.</li>
          <li>Saisissez le code à 6 chiffres affiché par l&rsquo;application.</li>
        </ol>
        {qrCode ? (
          <img src={qrCode} alt="QR code à scanner avec l'application d'authentification" width={208} height={208} className="h-52 w-52 self-center rounded-lg border border-slate-200 bg-white p-2" />
        ) : null}
        {secret ? (
          <p className="break-all rounded-lg bg-slate-100 px-3 py-2 text-center font-mono text-sm tracking-wider text-slate-800">
            {secret.match(/.{1,4}/g)?.join(' ')}
          </p>
        ) : null}
        <FormField label="Code à 6 chiffres" htmlFor="mfa-totp">
          <Input
            id="mfa-totp"
            inputMode="numeric"
            autoComplete="one-time-code"
            pattern="\d{6}"
            maxLength={6}
            value={totp}
            onChange={(event) => setTotp(event.target.value.replace(/\D/g, ''))}
            required
          />
        </FormField>
        <Button type="submit" variant="primary" size="md" disabled={busy || totp.length !== 6} className="w-full sm:w-fit">
          {busy ? 'Vérification…' : 'Activer la double authentification'}
        </Button>
      </form>
    );
  }

  return (
    <form onSubmit={start} className="flex flex-col gap-5">
      {error ? <AuthError message={error} /> : null}
      <p className="text-sm text-slate-600">
        Saisissez le code d&rsquo;activation remis par l&rsquo;administrateur. Il est personnel, à usage unique et valable 24 heures.
      </p>
      <FormField label="Code d'activation" htmlFor="mfa-activation">
        <Input
          id="mfa-activation"
          autoComplete="off"
          spellCheck={false}
          placeholder="XXXXX-XXXXX-XXXXX-XXXXX"
          value={activationCode}
          onChange={(event) => setActivationCode(event.target.value)}
          required
        />
      </FormField>
      <Button type="submit" variant="primary" size="md" disabled={busy || activationCode.trim().length < 10} className="w-full sm:w-fit">
        {busy ? 'Vérification…' : 'Continuer'}
      </Button>
    </form>
  );
}
