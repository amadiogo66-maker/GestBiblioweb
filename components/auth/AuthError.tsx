import { AlertCircle, CheckCircle2 } from 'lucide-react';
import type { ReactElement } from 'react';
import { cn } from '@/lib/utils';

interface AuthErrorProps {
  message: string;
  variant?: 'error' | 'success';
}

export function AuthError({ message, variant = 'error' }: AuthErrorProps): ReactElement {
  const isSuccess = variant === 'success';

  return (
    <div
      role={isSuccess ? 'status' : 'alert'}
      className={cn(
        'flex items-start gap-2 rounded-lg px-4 py-3 text-sm',
        isSuccess ? 'bg-success/10 text-success' : 'bg-danger/10 text-danger'
      )}
    >
      {isSuccess ? (
        <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
      ) : (
        <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
      )}
      <span>{message}</span>
    </div>
  );
}
