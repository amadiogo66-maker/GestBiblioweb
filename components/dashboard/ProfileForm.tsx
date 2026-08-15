'use client';

import { useState } from 'react';
import type { FormEvent, ReactElement } from 'react';
import { updateProfileSchema } from '@/schemas/user';
import { Input } from '@/components/ui/Input';
import { FormField } from '@/components/ui/FormField';
import { Button } from '@/components/ui/Button';
import { AuthError } from '@/components/auth/AuthError';
import type { ApiResponse } from '@/types';

interface ProfileData {
  email: string;
  username: string;
  firstName: string;
  lastName: string;
  department: string | null;
  photo: string | null;
  role: string;
}

interface ProfileFormProps {
  profile: ProfileData;
  departments: string[];
}

interface FeedbackState {
  type: 'success' | 'error';
  message: string;
}

type FieldErrors = Partial<Record<'firstName' | 'lastName' | 'photo' | 'department', string>>;

const ROLE_LABELS: Record<string, string> = {
  STUDENT: 'Étudiant',
  TEACHER: 'Enseignant',
  VISITOR: 'Visiteur',
};

export function ProfileForm({ profile, departments }: ProfileFormProps): ReactElement {
  const [firstName, setFirstName] = useState(profile.firstName);
  const [lastName, setLastName] = useState(profile.lastName);
  const [photo, setPhoto] = useState(profile.photo ?? '');
  const [department, setDepartment] = useState(profile.department ?? '');
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [feedback, setFeedback] = useState<FeedbackState | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setFeedback(null);

    const parsed = updateProfileSchema.safeParse({
      firstName,
      lastName,
      photo,
      department: department || undefined,
    });

    if (!parsed.success) {
      const errors = parsed.error.flatten().fieldErrors;
      setFieldErrors({
        firstName: errors.firstName?.[0],
        lastName: errors.lastName?.[0],
        photo: errors.photo?.[0],
        department: errors.department?.[0],
      });
      return;
    }

    setFieldErrors({});
    setIsSubmitting(true);

    try {
      const response = await fetch('/api/profile', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(parsed.data),
      });
      const payload = (await response.json()) as ApiResponse<{ id: string }>;

      if (!response.ok || !payload.success) {
        setFeedback({ type: 'error', message: payload.message ?? 'Impossible de mettre à jour le profil.' });
        return;
      }

      setFeedback({ type: 'success', message: 'Profil mis à jour avec succès.' });
    } catch {
      setFeedback({ type: 'error', message: 'Une erreur réseau est survenue. Réessayez.' });
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-5 rounded-xl border border-slate-200 bg-white p-6">
      <div>
        <h2 className="font-serif text-lg font-semibold text-primary">Informations personnelles</h2>
        <p className="mt-1 text-sm text-slate-500">
          {profile.email} · @{profile.username} · {ROLE_LABELS[profile.role] ?? profile.role}
        </p>
      </div>

      {feedback ? <AuthError variant={feedback.type === 'success' ? 'success' : 'error'} message={feedback.message} /> : null}

      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
        <FormField label="Prénom" htmlFor="firstName" error={fieldErrors.firstName}>
          <Input
            id="firstName"
            value={firstName}
            onChange={(event) => setFirstName(event.target.value)}
            aria-invalid={Boolean(fieldErrors.firstName)}
          />
        </FormField>
        <FormField label="Nom" htmlFor="lastName" error={fieldErrors.lastName}>
          <Input
            id="lastName"
            value={lastName}
            onChange={(event) => setLastName(event.target.value)}
            aria-invalid={Boolean(fieldErrors.lastName)}
          />
        </FormField>
      </div>

      <FormField label="Département" htmlFor="department" error={fieldErrors.department}>
        <select
          id="department"
          value={department}
          onChange={(event) => setDepartment(event.target.value)}
          className="w-full rounded-lg border border-slate-300 bg-white px-4 py-3 text-base text-slate-900 focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
        >
          <option value="">Non renseigné</option>
          {departments.map((item) => (
            <option key={item} value={item}>
              {item}
            </option>
          ))}
        </select>
      </FormField>

      <FormField label="Photo (URL)" htmlFor="photo" error={fieldErrors.photo}>
        <Input
          id="photo"
          type="url"
          placeholder="https://..."
          value={photo}
          onChange={(event) => setPhoto(event.target.value)}
          aria-invalid={Boolean(fieldErrors.photo)}
        />
      </FormField>

      <Button type="submit" variant="primary" size="md" disabled={isSubmitting} className="w-fit">
        {isSubmitting ? 'Enregistrement...' : 'Enregistrer les modifications'}
      </Button>
    </form>
  );
}
