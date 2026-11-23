'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import type { FormEvent, ReactElement } from 'react';
import { Button } from '@/components/ui/Button';
import { FormField } from '@/components/ui/FormField';
import { Input } from '@/components/ui/Input';
import { AuthError } from '@/components/auth/AuthError';
import { sendJson } from '@/lib/post-json';
import { DUPLICATE_WARNING_CODE } from '@/lib/constants';

interface Warnings {
  catalogBook: { id: string; title: string } | null;
  pendingInDepartment: boolean;
}

const fieldClass =
  'w-full rounded-lg border border-slate-300 bg-white px-4 py-3 text-base text-slate-900 focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20';

/**
 * Nouvelle proposition d'acquisition. Si le serveur signale un doublon possible
 * (ISBN au catalogue, ou déjà proposé dans le département), l'avertissement est
 * affiché et l'enseignant peut confirmer.
 */
export function AcquisitionRequestForm({ initialTitle = '' }: { initialTitle?: string }): ReactElement {
  const router = useRouter();
  const [values, setValues] = useState({ title: initialTitle, author: '', isbn: '', publisher: '', year: '', justification: '' });
  const [errors, setErrors] = useState<Record<string, string[]>>({});
  const [message, setMessage] = useState<{ text: string; ok: boolean } | null>(null);
  const [warnings, setWarnings] = useState<Warnings | null>(null);
  const [pending, setPending] = useState(false);
  const set = (field: keyof typeof values) => (value: string) => {
    setValues((current) => ({ ...current, [field]: value }));
    setWarnings(null);
  };

  async function send(acknowledgeDuplicates: boolean): Promise<void> {
    setPending(true);
    setErrors({});
    setMessage(null);
    const year = values.year.trim() ? Number(values.year) : null;
    const { ok, status, payload } = await sendJson<Warnings>('POST', '/api/teacher/acquisitions', {
      ...values,
      year: Number.isFinite(year) ? year : null,
      acknowledgeDuplicates,
    });
    setPending(false);

    if (!ok && status === 409 && payload.code === DUPLICATE_WARNING_CODE && payload.data) {
      setWarnings(payload.data);
      return;
    }

    if (!ok) {
      setErrors(payload.errors ?? {});
      setMessage({ text: payload.message ?? 'Envoi impossible.', ok: false });
      return;
    }

    setValues({ title: '', author: '', isbn: '', publisher: '', year: '', justification: '' });
    setWarnings(null);
    setMessage({ text: payload.message ?? 'Proposition envoyée.', ok: true });
    router.refresh();
  }

  function submit(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    void send(false);
  }

  const error = (field: string) => errors[field]?.[0];

  return (
    <form onSubmit={submit} className="flex flex-col gap-4" noValidate>
      {message ? <AuthError message={message.text} variant={message.ok ? 'success' : 'error'} /> : null}
      <FormField label="Titre de l'ouvrage" htmlFor="aq-title" error={error('title')}>
        <Input id="aq-title" value={values.title} onChange={(e) => set('title')(e.target.value)} maxLength={200} required />
      </FormField>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <FormField label="Auteur" htmlFor="aq-author" error={error('author')}>
          <Input id="aq-author" value={values.author} onChange={(e) => set('author')(e.target.value)} maxLength={150} required />
        </FormField>
        <FormField label="ISBN (facultatif)" htmlFor="aq-isbn" error={error('isbn')}>
          <Input id="aq-isbn" value={values.isbn} onChange={(e) => set('isbn')(e.target.value)} maxLength={20} inputMode="numeric" />
        </FormField>
        <FormField label="Éditeur (facultatif)" htmlFor="aq-publisher" error={error('publisher')}>
          <Input id="aq-publisher" value={values.publisher} onChange={(e) => set('publisher')(e.target.value)} maxLength={150} />
        </FormField>
        <FormField label="Année (facultatif)" htmlFor="aq-year" error={error('year')}>
          <Input id="aq-year" value={values.year} onChange={(e) => set('year')(e.target.value)} inputMode="numeric" maxLength={4} />
        </FormField>
      </div>
      <FormField label="Justification pédagogique (10 à 1000 caractères)" htmlFor="aq-justification" error={error('justification')}>
        <textarea
          id="aq-justification"
          value={values.justification}
          onChange={(e) => set('justification')(e.target.value)}
          maxLength={1000}
          rows={4}
          className={fieldClass}
        />
      </FormField>

      {warnings ? (
        <div role="alert" className="flex flex-col gap-2 rounded-lg border border-secondary/40 bg-secondary/10 px-4 py-3 text-sm text-slate-700">
          <p className="font-semibold">Doublon possible</p>
          {warnings.catalogBook ? (
            <p>
              Un ouvrage du catalogue a déjà cet ISBN :{' '}
              <Link href={`/ouvrage/${warnings.catalogBook.id}`} className="font-medium text-primary underline">
                {warnings.catalogBook.title}
              </Link>
              .
            </p>
          ) : null}
          {warnings.pendingInDepartment ? <p>Une proposition de cet ISBN est déjà en cours dans votre département.</p> : null}
          <div>
            <Button type="button" size="sm" variant="outline" onClick={() => void send(true)} disabled={pending}>
              Proposer quand même
            </Button>
          </div>
        </div>
      ) : null}

      <div>
        <Button type="submit" disabled={pending}>
          {pending ? 'Envoi…' : 'Envoyer la proposition'}
        </Button>
      </div>
    </form>
  );
}
