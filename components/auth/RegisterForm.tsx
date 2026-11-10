'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import type { FormEvent, ReactElement } from 'react';
import type { UserRole } from '@prisma/client';
import { ArrowLeft } from 'lucide-react';
import { registerSchema, verifyMemberSchema } from '@/schemas/auth';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { FormField } from '@/components/ui/FormField';
import { PasswordInput } from '@/components/auth/PasswordInput';
import { AuthError } from '@/components/auth/AuthError';
import type { ApiResponse } from '@/types';

interface MemberProfile {
  nom: string;
  prenom: string;
  role: UserRole;
  departement: string | null;
}

interface VerifyMemberData extends MemberProfile {
  verificationToken: string;
}

interface CreateAccountValues {
  email: string;
  username: string;
  password: string;
  confirmPassword: string;
}

type CreateFieldErrors = Partial<Record<keyof CreateAccountValues, string>>;

const ROLE_LABELS: Record<UserRole, string> = {
  STUDENT: 'Étudiant',
  TEACHER: 'Enseignant',
  VISITOR: 'Visiteur',
};

const INITIAL_CREATE_VALUES: CreateAccountValues = {
  email: '',
  username: '',
  password: '',
  confirmPassword: '',
};

export function RegisterForm(): ReactElement {
  const router = useRouter();

  const [step, setStep] = useState<'verify' | 'create'>('verify');
  const [matricule, setMatricule] = useState('');
  const [dateNaissance, setDateNaissance] = useState('');
  const [verifyError, setVerifyError] = useState<string | null>(null);
  const [isVerifying, setIsVerifying] = useState(false);

  const [verificationToken, setVerificationToken] = useState<string | null>(null);
  const [profile, setProfile] = useState<MemberProfile | null>(null);

  const [values, setValues] = useState<CreateAccountValues>(INITIAL_CREATE_VALUES);
  const [fieldErrors, setFieldErrors] = useState<CreateFieldErrors>({});
  const [createError, setCreateError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  function updateField<K extends keyof CreateAccountValues>(field: K, value: CreateAccountValues[K]): void {
    setValues((prev) => ({ ...prev, [field]: value }));
  }

  async function handleVerify(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setVerifyError(null);

    const parsed = verifyMemberSchema.safeParse({ matricule, dateNaissance });

    if (!parsed.success) {
      setVerifyError(parsed.error.issues[0]?.message ?? 'Informations invalides.');
      return;
    }

    setIsVerifying(true);

    try {
      const response = await fetch('/api/auth/verify-member', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ matricule, dateNaissance }),
      });
      const payload = (await response.json()) as ApiResponse<VerifyMemberData>;

      if (!response.ok || !payload.success || !payload.data) {
        setVerifyError(payload.message ?? 'Une erreur est survenue. Réessayez.');
        return;
      }

      setVerificationToken(payload.data.verificationToken);
      setProfile({
        nom: payload.data.nom,
        prenom: payload.data.prenom,
        role: payload.data.role,
        departement: payload.data.departement,
      });
      setStep('create');
    } catch {
      setVerifyError('Une erreur réseau est survenue. Réessayez.');
    } finally {
      setIsVerifying(false);
    }
  }

  function handleBack(): void {
    setStep('verify');
    setCreateError(null);
    setFieldErrors({});
  }

  async function handleCreate(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setCreateError(null);

    if (!verificationToken) {
      setStep('verify');
      return;
    }

    const parsed = registerSchema.safeParse({ matricule, verificationToken, ...values });

    if (!parsed.success) {
      const errors = parsed.error.flatten().fieldErrors;
      setFieldErrors({
        email: errors.email?.[0],
        username: errors.username?.[0],
        password: errors.password?.[0],
        confirmPassword: errors.confirmPassword?.[0],
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
          const apiErrors: CreateFieldErrors = {};
          for (const [field, messages] of Object.entries(payload.errors)) {
            if (field in INITIAL_CREATE_VALUES && messages[0]) {
              apiErrors[field as keyof CreateAccountValues] = messages[0];
            }
          }
          setFieldErrors(apiErrors);
        }
        setCreateError(payload.message ?? 'Impossible de créer le compte.');
        return;
      }

      router.push('/connexion?registered=true');
    } catch {
      setCreateError('Une erreur réseau est survenue. Réessayez.');
    } finally {
      setIsSubmitting(false);
    }
  }

  if (step === 'verify') {
    return (
      <form onSubmit={handleVerify} noValidate className="flex flex-col gap-5">
        {verifyError ? <AuthError message={verifyError} /> : null}

        <p className="text-sm text-slate-500">
          L&rsquo;inscription est réservée aux personnes déjà inscrites à la bibliothèque. Renseignez votre matricule
          et votre date de naissance pour vérifier votre éligibilité.
        </p>

        <FormField label="Matricule" htmlFor="matricule">
          <Input
            id="matricule"
            name="matricule"
            placeholder="Votre matricule"
            autoComplete="off"
            value={matricule}
            onChange={(event) => setMatricule(event.target.value)}
          />
        </FormField>

        <FormField label="Date de naissance" htmlFor="dateNaissance">
          <Input
            id="dateNaissance"
            name="dateNaissance"
            type="date"
            value={dateNaissance}
            onChange={(event) => setDateNaissance(event.target.value)}
          />
        </FormField>

        <Button type="submit" variant="primary" size="md" disabled={isVerifying} className="w-full">
          {isVerifying ? 'Vérification en cours...' : 'Vérifier mon inscription'}
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

  return (
    <form onSubmit={handleCreate} noValidate className="flex flex-col gap-5">
      <button
        type="button"
        onClick={handleBack}
        className="flex items-center gap-2 self-start text-sm font-medium text-slate-500 transition-colors hover:text-primary"
      >
        <ArrowLeft className="h-4 w-4" aria-hidden="true" />
        Retour
      </button>

      {createError ? <AuthError message={createError} /> : null}

      {profile ? (
        <div className="grid grid-cols-1 gap-4 rounded-lg bg-accent p-4 sm:grid-cols-2">
          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Prénom</p>
            <p className="text-sm font-medium text-primary">{profile.prenom}</p>
          </div>
          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Nom</p>
            <p className="text-sm font-medium text-primary">{profile.nom}</p>
          </div>
          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Statut</p>
            <p className="text-sm font-medium text-primary">{ROLE_LABELS[profile.role]}</p>
          </div>
          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Département</p>
            <p className="text-sm font-medium text-primary">{profile.departement ?? '—'}</p>
          </div>
        </div>
      ) : null}

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

      <Button type="submit" variant="primary" size="md" disabled={isSubmitting} className="w-full">
        {isSubmitting ? 'Création en cours...' : 'Créer mon compte'}
      </Button>
    </form>
  );
}
