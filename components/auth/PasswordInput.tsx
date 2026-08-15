'use client';

import { Eye, EyeOff } from 'lucide-react';
import { useId, useState } from 'react';
import type { InputHTMLAttributes, ReactElement } from 'react';
import { cn } from '@/lib/utils';

interface PasswordInputProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'type' | 'id'> {
  label: string;
  id?: string;
  error?: string;
  showStrength?: boolean;
}

interface PasswordStrength {
  label: 'Faible' | 'Moyen' | 'Fort' | '';
  score: number;
}

function getPasswordStrength(password: string): PasswordStrength {
  if (password.length === 0) {
    return { label: '', score: 0 };
  }

  let score = 0;
  if (password.length >= 8) score += 1;
  if (/[a-z]/.test(password) && /[A-Z]/.test(password)) score += 1;
  if (/\d/.test(password)) score += 1;
  if (password.length >= 12) score += 1;

  if (score <= 1) return { label: 'Faible', score };
  if (score <= 2) return { label: 'Moyen', score };
  return { label: 'Fort', score };
}

const STRENGTH_COLORS: Record<string, string> = {
  Faible: 'bg-danger',
  Moyen: 'bg-warning',
  Fort: 'bg-success',
};

export function PasswordInput({
  label,
  id,
  error,
  showStrength,
  value,
  className,
  ...props
}: PasswordInputProps): ReactElement {
  const generatedId = useId();
  const inputId = id ?? generatedId;
  const [visible, setVisible] = useState(false);
  const strength = showStrength ? getPasswordStrength(String(value ?? '')) : null;

  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={inputId} className="text-sm font-medium text-slate-700">
        {label}
      </label>
      <div className="relative">
        <input
          id={inputId}
          type={visible ? 'text' : 'password'}
          value={value}
          aria-invalid={Boolean(error)}
          aria-describedby={error ? `${inputId}-error` : undefined}
          className={cn(
            'w-full rounded-lg border border-slate-300 bg-white px-4 py-3 pr-11 text-base text-slate-900 placeholder:text-slate-400 focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20',
            error && 'border-danger focus:border-danger focus:ring-danger/20',
            className
          )}
          {...props}
        />
        <button
          type="button"
          onClick={() => setVisible((prev) => !prev)}
          className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 transition-colors hover:text-slate-600"
          aria-label={visible ? 'Masquer le mot de passe' : 'Afficher le mot de passe'}
        >
          {visible ? <EyeOff className="h-5 w-5" aria-hidden="true" /> : <Eye className="h-5 w-5" aria-hidden="true" />}
        </button>
      </div>

      {showStrength && strength && strength.label ? (
        <div className="flex items-center gap-2">
          <div className="flex h-1.5 flex-1 gap-1">
            {[0, 1, 2, 3].map((index) => (
              <span
                key={index}
                className={cn(
                  'h-full flex-1 rounded-full bg-slate-200',
                  index < strength.score && STRENGTH_COLORS[strength.label]
                )}
              />
            ))}
          </div>
          <span className="text-xs font-medium text-slate-500">{strength.label}</span>
        </div>
      ) : null}

      {error ? (
        <p id={`${inputId}-error`} className="text-xs text-danger">
          {error}
        </p>
      ) : null}
    </div>
  );
}
