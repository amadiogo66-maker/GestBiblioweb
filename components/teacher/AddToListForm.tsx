'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import type { FormEvent, ReactElement } from 'react';
import { Button } from '@/components/ui/Button';
import { AuthError } from '@/components/auth/AuthError';
import { sendJson } from '@/lib/post-json';

interface AddToListFormProps {
  bookId: string;
  /** Listes de l'enseignant ; `hasBook` : l'ouvrage y est déjà (option désactivée). */
  lists: Array<{ id: string; title: string; hasBook: boolean; full: boolean }>;
}

/**
 * Fiche d'un ouvrage : « Ajouter à une de mes listes ». Le serveur revérifie
 * tout (propriétaire, doublon, quota) via la route d'ajout existante.
 */
export function AddToListForm({ bookId, lists }: AddToListFormProps): ReactElement {
  const router = useRouter();
  const available = lists.filter((list) => !list.hasBook && !list.full);
  const [listId, setListId] = useState(available[0]?.id ?? '');
  const [message, setMessage] = useState<{ text: string; ok: boolean } | null>(null);
  const [pending, setPending] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    if (!listId) return;
    setPending(true);
    setMessage(null);
    const { ok, payload } = await sendJson('POST', `/api/teacher/reading-lists/${encodeURIComponent(listId)}/items`, { bookId });
    setPending(false);
    setMessage({ text: ok ? 'Ouvrage ajouté à la liste.' : (payload.message ?? 'Ajout impossible.'), ok });
    if (ok) router.refresh();
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-2">
      {message ? <AuthError message={message.text} variant={message.ok ? 'success' : 'error'} /> : null}
      <label htmlFor="add-to-list" className="text-sm font-medium text-slate-700">
        Ajouter à une de mes listes
      </label>
      <div className="flex flex-col gap-2 sm:flex-row">
        <select
          id="add-to-list"
          value={listId}
          onChange={(event) => setListId(event.target.value)}
          className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
        >
          {available.length === 0 ? <option value="">Aucune liste disponible</option> : null}
          {lists.map((list) => (
            <option key={list.id} value={list.id} disabled={list.hasBook || list.full}>
              {list.title}
              {list.hasBook ? ' (déjà dans la liste)' : list.full ? ' (complète)' : ''}
            </option>
          ))}
        </select>
        <Button type="submit" size="sm" disabled={pending || !listId}>
          {pending ? 'Ajout…' : 'Ajouter'}
        </Button>
      </div>
    </form>
  );
}
