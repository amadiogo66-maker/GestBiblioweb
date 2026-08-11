'use client';

import { useEffect } from 'react';
import type { ReactElement } from 'react';
import { logger } from '@/lib/logger';

interface ErrorProps {
  error: Error & { digest?: string };
  reset: () => void;
}

export default function Error({ error, reset }: ErrorProps): ReactElement {
  useEffect(() => {
    logger.error('Application error boundary triggered', { message: error.message, digest: error.digest });
  }, [error]);

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-accent px-6 text-center dark:bg-slate-950">
      <h2 className="text-2xl font-semibold text-danger">Une erreur est survenue</h2>
      <p className="mt-3 max-w-md text-slate-600 dark:text-slate-300">{error.message}</p>
      <button
        type="button"
        onClick={() => reset()}
        className="mt-6 rounded-lg bg-primary px-5 py-3 font-medium text-white transition hover:bg-primary/90"
      >
        Réessayer
      </button>
    </div>
  );
}
