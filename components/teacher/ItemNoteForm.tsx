'use client';

import { useRouter } from 'next/navigation';
import { useId, useState } from 'react';
import type { FormEvent, ReactElement } from 'react';
import { Button } from '@/components/ui/Button';
import { AuthError } from '@/components/auth/AuthError';
import { sendJson } from '@/lib/post-json';

interface ItemNoteFormProps {
  url: string;
  initialNote: string;
}

/** Note de l'enseignant sur un ouvrage de sa liste (500 caractères au plus). */
export function ItemNoteForm({ url, initialNote }: ItemNoteFormProps): ReactElement {
  const router = useRouter();
  const id = useId();
  const [note, setNote] = useState(initialNote);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setPending(true);
    setError(null);
    const { ok, payload } = await sendJson('PATCH', url, { note });
    setPending(false);

    if (!ok) {
      setError(payload.message ?? 'Enregistrement impossible.');
      return;
    }

    router.refresh();
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-2 sm:flex-row sm:items-end">
      <div className="flex flex-1 flex-col gap-1">
        <label htmlFor={id} className="text-xs font-medium text-slate-600">
          Note pour les étudiants
        </label>
        <input
          id={id}
          value={note}
          onChange={(event) => setNote(event.target.value)}
          maxLength={500}
          className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
        />
      </div>
      <Button type="submit" size="sm" variant="ghost" disabled={pending || note === initialNote}>
        {pending ? '…' : 'Enregistrer la note'}
      </Button>
      {error ? <AuthError message={error} /> : null}
    </form>
  );
}
