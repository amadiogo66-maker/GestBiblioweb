'use client';

import { useRouter } from 'next/navigation';
import { useId, useState } from 'react';
import type { ReactElement } from 'react';
import { Button } from '@/components/ui/Button';
import { AuthError } from '@/components/auth/AuthError';
import { sendJson, type JsonMethod } from '@/lib/post-json';

export interface ReasonAction {
  /** Valeur envoyée dans le champ "action" (absent si une seule action sans champ). */
  value?: string;
  label: string;
  /** Motif obligatoire (5 à 500 caractères), par exemple pour un refus. */
  reasonRequired: boolean;
  variant?: 'primary' | 'outline';
}

interface ReasonActionFormProps {
  url: string;
  method: JsonMethod;
  actions: ReasonAction[];
  /** Nom du champ texte envoyé : "note" (décisions) ou "reason" (modération). */
  textField: 'note' | 'reason';
  textLabel: string;
}

const MIN = 5;
const MAX = 500;

/**
 * Décision avec un texte (motif ou note) : un champ, un bouton par action.
 * Le contrôle du motif est refait côté serveur (Zod) ; ici il évite un aller-retour.
 */
export function ReasonActionForm({ url, method, actions, textField, textLabel }: ReasonActionFormProps): ReactElement {
  const router = useRouter();
  const fieldId = useId();
  const [text, setText] = useState('');
  const [pending, setPending] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  async function run(action: ReasonAction): Promise<void> {
    const trimmed = text.trim();

    if (action.reasonRequired && trimmed.length < MIN) {
      setError(`Le motif est obligatoire (au moins ${MIN} caractères).`);
      return;
    }

    setPending(action.label);
    setError(null);
    const body = { ...(action.value ? { action: action.value } : {}), ...(trimmed || action.reasonRequired ? { [textField]: trimmed } : {}) };
    const { ok, payload } = await sendJson(method, url, body);
    setPending(null);

    if (!ok) {
      setError(payload.message ?? 'Action impossible. Réessayez.');
      return;
    }

    setSuccess(payload.message ?? 'Enregistré.');
    setText('');
    router.refresh();
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-1.5">
        <label htmlFor={fieldId} className="text-sm font-medium text-slate-700">
          {textLabel}
        </label>
        <textarea
          id={fieldId}
          value={text}
          onChange={(event) => setText(event.target.value)}
          maxLength={MAX}
          rows={2}
          className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
        />
      </div>
      {error ? <AuthError message={error} /> : null}
      {success ? <AuthError variant="success" message={success} /> : null}
      <div className="flex flex-wrap gap-2">
        {actions.map((action) => (
          <Button
            key={action.label}
            type="button"
            size="sm"
            variant={action.variant ?? 'outline'}
            disabled={pending !== null}
            onClick={() => run(action)}
          >
            {pending === action.label ? 'Patientez…' : action.label}
          </Button>
        ))}
      </div>
    </div>
  );
}
