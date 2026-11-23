'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import type { FormEvent, ReactElement } from 'react';
import { Button } from '@/components/ui/Button';
import { FormField } from '@/components/ui/FormField';
import { Input } from '@/components/ui/Input';
import { AuthError } from '@/components/auth/AuthError';
import { sendJson } from '@/lib/post-json';

export interface ReadingListFormValues {
  title: string;
  courseCode: string;
  academicYear: string;
  description: string;
  programId: string;
}

interface ReadingListFormProps {
  /** Absent : création ; présent : modification de cette liste. */
  listId?: string;
  initial?: ReadingListFormValues;
  programs: Array<{ id: string; name: string }>;
}

const EMPTY: ReadingListFormValues = { title: '', courseCode: '', academicYear: '', description: '', programId: '' };
const textareaClass =
  'w-full rounded-lg border border-slate-300 bg-white px-4 py-3 text-base text-slate-900 focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20';

/** Création ou modification d'une liste (texte brut ; le serveur valide tout). */
export function ReadingListForm({ listId, initial = EMPTY, programs }: ReadingListFormProps): ReactElement {
  const router = useRouter();
  const [values, setValues] = useState(initial);
  const [errors, setErrors] = useState<Record<string, string[]>>({});
  const [message, setMessage] = useState<{ text: string; ok: boolean } | null>(null);
  const [pending, setPending] = useState(false);
  const set = (field: keyof ReadingListFormValues) => (value: string) => setValues((current) => ({ ...current, [field]: value }));

  async function submit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setPending(true);
    setErrors({});
    setMessage(null);

    const body = { ...values, programId: values.programId || null };
    const { ok, payload } = listId
      ? await sendJson('PATCH', `/api/teacher/reading-lists/${encodeURIComponent(listId)}`, body)
      : await sendJson<{ id: string }>('POST', '/api/teacher/reading-lists', body);
    setPending(false);

    if (!ok) {
      setErrors(payload.errors ?? {});
      setMessage({ text: payload.message ?? 'Enregistrement impossible.', ok: false });
      return;
    }

    if (!listId && payload.data && typeof payload.data === 'object' && 'id' in payload.data) {
      router.push(`/enseignant/listes/${(payload.data as { id: string }).id}`);
      return;
    }

    setMessage({ text: payload.message ?? 'Enregistré.', ok: true });
    router.refresh();
  }

  const error = (field: string) => errors[field]?.[0];

  return (
    <form onSubmit={submit} className="flex flex-col gap-4" noValidate>
      {message ? <AuthError message={message.text} variant={message.ok ? 'success' : 'error'} /> : null}
      <FormField label="Titre de la liste" htmlFor="rl-title" error={error('title')}>
        <Input id="rl-title" value={values.title} onChange={(e) => set('title')(e.target.value)} maxLength={150} required />
      </FormField>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <FormField label="Code du cours (facultatif)" htmlFor="rl-course" error={error('courseCode')}>
          <Input id="rl-course" value={values.courseCode} onChange={(e) => set('courseCode')(e.target.value)} maxLength={40} />
        </FormField>
        <FormField label="Année universitaire (ex. 2026-2027)" htmlFor="rl-year" error={error('academicYear')}>
          <Input id="rl-year" value={values.academicYear} onChange={(e) => set('academicYear')(e.target.value)} maxLength={9} placeholder="2026-2027" />
        </FormField>
      </div>
      <FormField label="Programme (facultatif)" htmlFor="rl-program" error={error('programId')}>
        <select id="rl-program" value={values.programId} onChange={(e) => set('programId')(e.target.value)} className={textareaClass}>
          <option value="">Tous les programmes du département</option>
          {programs.map((program) => (
            <option key={program.id} value={program.id}>
              {program.name}
            </option>
          ))}
        </select>
      </FormField>
      <FormField label="Description (facultatif)" htmlFor="rl-description" error={error('description')}>
        <textarea
          id="rl-description"
          value={values.description}
          onChange={(e) => set('description')(e.target.value)}
          maxLength={1000}
          rows={4}
          className={textareaClass}
        />
      </FormField>
      <div>
        <Button type="submit" disabled={pending}>
          {pending ? 'Enregistrement…' : listId ? 'Enregistrer' : 'Créer la liste'}
        </Button>
      </div>
    </form>
  );
}
