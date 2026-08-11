import Link from 'next/link';
import type { ReactElement } from 'react';

export default function NotFound(): ReactElement {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-accent px-6 text-center dark:bg-slate-950">
      <h1 className="text-4xl font-semibold text-primary">404</h1>
      <p className="mt-3 text-lg text-slate-600 dark:text-slate-300">Page non trouvée</p>
      <Link href="/" className="mt-6 rounded-lg bg-primary px-5 py-3 font-medium text-white transition hover:bg-primary/90">
        Retour à l’accueil
      </Link>
    </main>
  );
}
