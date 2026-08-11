import type { ReactElement } from 'react';

export default function Loading(): ReactElement {
  return (
    <div className="flex min-h-screen items-center justify-center bg-accent dark:bg-slate-950">
      <div className="flex items-center gap-3 rounded-full border border-slate-200 bg-white/80 px-6 py-3 shadow-sm dark:border-slate-800 dark:bg-slate-900/80">
        <div className="h-5 w-5 animate-spin rounded-full border-2 border-primary border-t-transparent" />
        <span className="text-sm font-medium text-slate-700 dark:text-slate-200">Chargement...</span>
      </div>
    </div>
  );
}
