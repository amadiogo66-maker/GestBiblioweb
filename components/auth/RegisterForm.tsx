'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import type { FormEvent, ReactElement } from 'react';
import type { UserRole } from '@prisma/client';
import { registerSchema } from '@/schemas/auth';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { FormField } from '@/components/ui/FormField';
import { PasswordInput } from '@/components/auth/PasswordInput';
import { AuthError } from '@/components/auth/AuthError';
import { cn } from '@/lib/utils';
import type { ApiResponse } from '@/types';

interface RegisterFormProps {
  departments: string[];
}

interface RegisterFormValues {
  email: string;
  username: string;
  password: string;
  confirmPassword: string;
  firstName: string;
  lastName: string;
  role: UserRole;
  department: string;
}

type FieldErrors = Partial<Record<keyof RegisterFormValues, string>>;

const ROLE_OPTIONS: { value: UserRole; label: string }[] = [
  { value: 'STUDENT', label: 'Étudiant' },
  { value: 'TEACHER', label: 'Enseignant' },
  { value: 'VISITOR', label: 'Visiteur' },
];

const INITIAL_VALUES: RegisterFormValues = {
  email: '',
  username: '',
  password: '',
  confirmPassword: '',
  firstName: '',
  lastName: '',
  role: 'STUDENT',
  department: '',
};

export function RegisterForm({ departments }: RegisterFormProps): ReactElement {
  const router = useRouter();
  const [values, setValues] = useState<RegisterFormValues>(INITIAL_VALUES);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  function updateField<K extends keyof RegisterFormValues>(field: K, value: RegisterFormValues[K]): void {
    setValues((prev) => ({ ...prev, [field]: value }));
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setFormError(null);

    const parsed = registerSchema.safeParse({
      ...values,
      department: values.department || undefined,
    });

    if (!parsed.success) {
      const errors = parsed.error.flatten().fieldErrors;
      setFieldErrors({
        email: errors.email?.[0],
        username: errors.username?.[0],
        password: errors.password?.[0],
        confirmPassword: errors.confirmPassword?.[0],
        firstName: errors.firstName?.[0],
        lastName: errors.lastName?.[0],
        role: errors.role?.[0],
        department: errors.department?.[0],
      });
      return;
    }

    setFieldErrors({});
    setIsSubmitting(true);

    try {
      const response = await fetch('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(parsed.data),
      });
      const payload = (await response.json()) as ApiResponse<{ id: string }>;

      if (!response.ok || !payload.success) {
        if (payload.errors) {
          const apiErrors: FieldErrors = {};
          for (const [field, messages] of Object.entries(payload.errors)) {
            if (field in INITIAL_VALUES && messages[0]) {
              apiErrors[field as keyof RegisterFormValues] = messages[0];
            }
          }
          setFieldErrors(apiErrors);
        }
        setFormError(payload.message ?? 'Impossible de créer le compte.');
        return;
      }

      router.push('/connexion?registered=true');
    } catch {
      setFormError('Une erreur réseau est survenue. Réessayez.');
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-5">
      {formError ? <AuthError message={formError} /> : null}

      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
        <FormField label="Prénom" htmlFor="firstName" error={fieldErrors.firstName}>
          <Input
            id="firstName"
            name="firstName"
            placeholder="Prénom"
            autoComplete="given-name"
            value={values.firstName}
            onChange={(event) => updateField('firstName', event.target.value)}
            aria-invalid={Boolean(fieldErrors.firstName)}
            aria-describedby={fieldErrors.firstName ? 'firstName-error' : undefined}
          />
        </FormField>
        <FormField label="Nom" htmlFor="lastName" error={fieldErrors.lastName}>
          <Input
            id="lastName"
            name="lastName"
            placeholder="Nom"
            autoComplete="family-name"
            value={values.lastName}
            onChange={(event) => updateField('lastName', event.target.value)}
            aria-invalid={Boolean(fieldErrors.lastName)}
            aria-describedby={fieldErrors.lastName ? 'lastName-error' : undefined}
          />
        </FormField>
      </div>

      <FormField label="Email" htmlFor="email" error={fieldErrors.email}>
        <Input
          id="email"
          name="email"
          type="email"
          placeholder="votre@email.com"
          autoComplete="email"
          value={values.email}
          onChange={(event) => updateField('email', event.target.value)}
          aria-invalid={Boolean(fieldErrors.email)}
          aria-describedby={fieldErrors.email ? 'email-error' : undefined}
        />
      </FormField>

      <FormField label="Nom d'utilisateur" htmlFor="username" error={fieldErrors.username}>
        <Input
          id="username"
          name="username"
          placeholder="Nom d'utilisateur"
          autoComplete="username"
          value={values.username}
          onChange={(event) => updateField('username', event.target.value)}
          aria-invalid={Boolean(fieldErrors.username)}
          aria-describedby={fieldErrors.username ? 'username-error' : undefined}
        />
      </FormField>

      <PasswordInput
        id="password"
        name="password"
        label="Mot de passe"
        placeholder="Mot de passe"
        autoComplete="new-password"
        value={values.password}
        onChange={(event) => updateField('password', event.target.value)}
        error={fieldErrors.password}
        showStrength
      />

      <PasswordInput
        id="confirmPassword"
        name="confirmPassword"
        label="Confirmer le mot de passe"
        placeholder="Confirmer le mot de passe"
        autoComplete="new-password"
        value={values.confirmPassword}
        onChange={(event) => updateField('confirmPassword', event.target.value)}
        error={fieldErrors.confirmPassword}
      />

      <div className="flex flex-col gap-1.5">
        <span className="text-sm font-medium text-slate-700">Vous êtes</span>
        <div className="grid grid-cols-3 gap-2">
          {ROLE_OPTIONS.map((option) => (
            <label
              key={option.value}
              className={cn(
                'flex cursor-pointer items-center justify-center rounded-lg border px-3 py-2.5 text-center text-sm font-medium transition-colors',
                values.role === option.value
                  ? 'border-primary bg-primary/5 text-primary'
                  : 'border-slate-300 text-slate-600 hover:border-primary/40'
              )}
            >
              <input
                type="radio"
                name="role"
                value={option.value}
                checked={values.role === option.value}
                onChange={() => updateField('role', option.value)}
                className="sr-only"
              />
              {option.label}
            </label>
          ))}
        </div>
      </div>

      <FormField label="Département (optionnel)" htmlFor="department" error={fieldErrors.department}>
        <select
          id="department"
          name="department"
          value={values.department}
          onChange={(event) => updateField('department', event.target.value)}
          className="w-full rounded-lg border border-slate-300 bg-white px-4 py-3 text-base text-slate-900 focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
        >
          <option value="">Département</option>
          {departments.map((department) => (
            <option key={department} value={department}>
              {department}
            </option>
          ))}
        </select>
      </FormField>

      <Button type="submit" variant="primary" size="md" disabled={isSubmitting} className="w-full">
        {isSubmitting ? 'Création en cours...' : 'Créer mon compte'}
      </Button>

      <p className="text-center text-sm text-slate-500">
        Déjà un compte ?{' '}
        <Link href="/connexion" className="font-medium text-primary hover:underline">
          Se connecter
        </Link>
      </p>
    </form>
  );
}
