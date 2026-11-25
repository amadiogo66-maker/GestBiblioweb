'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import type { ReactElement } from 'react';
import { Button } from '@/components/ui/Button';
import { FormField } from '@/components/ui/FormField';
import { Input } from '@/components/ui/Input';
import { AuthError } from '@/components/auth/AuthError';
import { sendJson } from '@/lib/post-json';

export interface NewsFormValues {
  title: string;
  category: string;
  content: string;
}

interface NewsFormProps {
  /** Absent : création ; présent : modification de cette actualité (du site). */
  newsId?: string;
  initial?: NewsFormValues;
  categories: Array<{ value: string; label: string }>;
}

const fieldClass =
  'w-full rounded-lg border border-slate-300 bg-white px-4 py-3 text-base text-slate-900 focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20';

/**
 * Formulaire d'actualité, en TEXTE BRUT : aucune mise en forme n'est
 * interprétée ; les sauts de ligne sont conservés à l'affichage. Le serveur
 * valide tout (longueurs, catégorie, droits, origine).
 */
export function NewsForm({ newsId, initial, categories }: NewsFormProps): ReactElement {
  const router = useRouter();
  const [values, setValues] = useState<NewsFormValues>(initial ?? { title: '', category: categories[0]?.value ?? '', content: '' });
  const [errors, setErrors] = useState<Record<string, string[]>>({});
  const [message, setMessage] = useState<{ text: string; ok: boolean } | null>(null);
  const [pending, setPending] = useState(false);
  const set = (field: keyof NewsFormValues) => (value: string) => setValues((current) => ({ ...current, [field]: value }));

  async function save(publish: boolean): Promise<void> {
    setPending(true);
    setErrors({});
    setMessage(null);

    const { ok, payload } = newsId
      ? await sendJson('PATCH', `/api/staff/news/${encodeURIComponent(newsId)}`, values)
      : await sendJson<{ id: string }>('POST', '/api/staff/news', { ...values, isPublished: publish });
    setPending(false);

    if (!ok) {
      setErrors(payload.errors ?? {});
      setMessage({ text: payload.message ?? 'Enregistrement impossible.', ok: false });
      return;
    }

    if (!newsId && payload.data && typeof payload.data === 'object' && 'id' in payload.data) {
      router.push(`/personnel/actualites/${(payload.data as { id: string }).id}`);
      return;
    }

    setMessage({ text: payload.message ?? 'Enregistré.', ok: true });
    router.refresh();
  }

  const error = (field: string) => errors[field]?.[0];

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        void save(false);
      }}
      className="flex flex-col gap-4"
      noValidate
    >
      {message ? <AuthError message={message.text} variant={message.ok ? 'success' : 'error'} /> : null}
      <FormField label="Titre (3 à 150 caractères)" htmlFor="news-title" error={error('title')}>
        <Input id="news-title" value={values.title} onChange={(e) => set('title')(e.target.value)} maxLength={150} required />
      </FormField>
      <FormField label="Catégorie" htmlFor="news-category" error={error('category')}>
        <select id="news-category" value={values.category} onChange={(e) => set('category')(e.target.value)} className={fieldClass}>
          {categories.map((category) => (
            <option key={category.value} value={category.value}>
              {category.label}
            </option>
          ))}
        </select>
      </FormField>
      <FormField label="Contenu (texte brut, 10 à 10 000 caractères)" htmlFor="news-content" error={error('content')}>
        <textarea
          id="news-content"
          value={values.content}
          onChange={(e) => set('content')(e.target.value)}
          maxLength={10_000}
          rows={12}
          aria-describedby="news-content-help"
          className={fieldClass}
        />
      </FormField>
      <p id="news-content-help" className="-mt-2 text-xs text-slate-500">
        Texte brut : les sauts de ligne sont conservés, aucune balise ni mise en forme n&rsquo;est interprétée. {values.content.length} / 10 000
      </p>
      <div className="flex flex-wrap gap-2">
        <Button type="submit" variant={newsId ? 'primary' : 'outline'} disabled={pending}>
          {pending ? 'Enregistrement…' : newsId ? 'Enregistrer' : 'Enregistrer le brouillon'}
        </Button>
        {newsId ? null : (
          <Button type="button" disabled={pending} onClick={() => void save(true)}>
            Publier
          </Button>
        )}
      </div>
    </form>
  );
}
