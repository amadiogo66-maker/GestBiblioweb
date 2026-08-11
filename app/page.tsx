import Link from 'next/link';
import type { ReactElement } from 'react';
import { APP_NAME } from '@/lib/constants';

export default function HomePage(): ReactElement {
  return (
    <main className="flex min-h-screen items-center justify-center bg-accent px-6 py-16 text-slate-900 dark:bg-slate-950 dark:text-slate-100">
      <section className="w-full max-w-2xl rounded-2xl border border-slate-200 bg-white/80 p-10 shadow-sm backdrop-blur dark:border-slate-800 dark:bg-slate-900/80">
        <p className="mb-3 text-sm font-semibold uppercase tracking-[0.3em] text-primary">Portail universitaire</p>
        <h1 className="text-4xl font-semibold tracking-tight text-primary sm:text-5xl">{APP_NAME}</h1>
        <p className="mt-4 text-lg text-slate-600 dark:text-slate-300">
          Backend en cours de développement pour la bibliothèque universitaire.
        </p>
        <div className="mt-8 flex flex-wrap gap-4">
          <Link href="/api/health" className="rounded-lg bg-primary px-5 py-3 font-medium text-white transition hover:bg-primary/90">
            Vérifier l’API
          </Link>
          <Link href="/connexion" className="rounded-lg border border-slate-300 px-5 py-3 font-medium text-slate-700 transition hover:border-primary hover:text-primary dark:border-slate-700 dark:text-slate-200">
            Se connecter
          </Link>
        </div>
      </section>
    </main>
  );
}
