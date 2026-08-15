'use client';

import { useState } from 'react';
import type { FormEvent, ReactElement } from 'react';
import { Send } from 'lucide-react';
import { contactSchema } from '@/schemas/contact';
import { Input } from '@/components/ui/Input';
import { FormField } from '@/components/ui/FormField';
import { Button } from '@/components/ui/Button';
import { AuthError } from '@/components/auth/AuthError';
import type { ApiResponse } from '@/types';

interface ContactFormValues {
  name: string;
  email: string;
  subject: string;
  message: string;
}

interface FeedbackState {
  type: 'success' | 'error';
  message: string;
}

type FieldErrors = Partial<Record<keyof ContactFormValues, string>>;

const INITIAL_VALUES: ContactFormValues = { name: '', email: '', subject: '', message: '' };

export function ContactForm(): ReactElement {
  const [values, setValues] = useState<ContactFormValues>(INITIAL_VALUES);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [feedback, setFeedback] = useState<FeedbackState | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  function updateField<K extends keyof ContactFormValues>(field: K, value: ContactFormValues[K]): void {
    setValues((prev) => ({ ...prev, [field]: value }));
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setFeedback(null);

    const parsed = contactSchema.safeParse(values);

    if (!parsed.success) {
      const errors = parsed.error.flatten().fieldErrors;
      setFieldErrors({
        name: errors.name?.[0],
        email: errors.email?.[0],
        subject: errors.subject?.[0],
        message: errors.message?.[0],
      });
      return;
    }

    setFieldErrors({});
    setIsSubmitting(true);

    try {
      const response = await fetch('/api/contact', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(parsed.data),
      });
      const payload = (await response.json()) as ApiResponse<unknown>;

      if (!response.ok || !payload.success) {
        setFeedback({ type: 'error', message: payload.message ?? 'Impossible d’envoyer le message.' });
        return;
      }

      setValues(INITIAL_VALUES);
      setFeedback({ type: 'success', message: 'Message envoyé avec succès. Nous vous répondrons rapidement.' });
    } catch {
      setFeedback({ type: 'error', message: 'Une erreur réseau est survenue. Réessayez.' });
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <form
      onSubmit={handleSubmit}
      noValidate
      className="flex flex-col gap-5 rounded-xl border border-slate-200 bg-white p-6 sm:p-8"
    >
      {feedback ? (
        <AuthError variant={feedback.type === 'success' ? 'success' : 'error'} message={feedback.message} />
      ) : null}

      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
        <FormField label="Nom complet" htmlFor="name" error={fieldErrors.name}>
          <Input
            id="name"
            placeholder="Votre nom"
            value={values.name}
            onChange={(event) => updateField('name', event.target.value)}
            aria-invalid={Boolean(fieldErrors.name)}
          />
        </FormField>
        <FormField label="Email" htmlFor="email" error={fieldErrors.email}>
          <Input
            id="email"
            type="email"
            placeholder="votre@email.com"
            value={values.email}
            onChange={(event) => updateField('email', event.target.value)}
            aria-invalid={Boolean(fieldErrors.email)}
          />
        </FormField>
      </div>

      <FormField label="Sujet" htmlFor="subject" error={fieldErrors.subject}>
        <Input
          id="subject"
          placeholder="Objet de votre message"
          value={values.subject}
          onChange={(event) => updateField('subject', event.target.value)}
          aria-invalid={Boolean(fieldErrors.subject)}
        />
      </FormField>

      <FormField label="Message" htmlFor="message" error={fieldErrors.message}>
        <textarea
          id="message"
          rows={6}
          placeholder="Votre message..."
          value={values.message}
          onChange={(event) => updateField('message', event.target.value)}
          aria-invalid={Boolean(fieldErrors.message)}
          className="w-full rounded-lg border border-slate-300 bg-white px-4 py-3 text-base text-slate-900 placeholder:text-slate-400 focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
        />
      </FormField>

      <Button type="submit" variant="primary" size="md" disabled={isSubmitting} className="w-fit">
        <Send className="h-4 w-4" aria-hidden="true" />
        {isSubmitting ? 'Envoi en cours...' : 'Envoyer le message'}
      </Button>
    </form>
  );
}
