'use client';

import { useRouter } from 'next/navigation';
import { Search } from 'lucide-react';
import { useState } from 'react';
import type { FormEvent, ReactElement } from 'react';
import { Button } from '@/components/ui/Button';
import { Container } from '@/components/ui/Container';
import { UNIVERSITY_NAME } from '@/lib/constants';

interface HeroSectionProps {
  totalBooks: number;
}

export function HeroSection({ totalBooks }: HeroSectionProps): ReactElement {
  const router = useRouter();
  const [query, setQuery] = useState('');

  function handleSubmit(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    const trimmed = query.trim();
    router.push(trimmed ? `/catalogue?query=${encodeURIComponent(trimmed)}` : '/catalogue');
  }

  return (
    <section className="relative overflow-hidden bg-primary">
      <div className="pointer-events-none absolute inset-0" aria-hidden="true">
        <div className="absolute -left-24 -top-24 h-96 w-96 rounded-full bg-secondary/20 blur-3xl" />
        <div className="absolute -bottom-32 right-0 h-[28rem] w-[28rem] rounded-full bg-white/10 blur-3xl" />
        <div
          className="absolute inset-0 opacity-[0.07]"
          style={{
            backgroundImage:
              'linear-gradient(rgba(255,255,255,0.6) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.6) 1px, transparent 1px)',
            backgroundSize: '48px 48px',
          }}
        />
      </div>

      <Container className="relative flex flex-col items-center py-24 text-center sm:py-32">
        <p className="mb-4 text-sm font-semibold uppercase tracking-[0.35em] text-secondary">Portail universitaire</p>
        <h1 className="max-w-3xl font-serif text-4xl font-semibold leading-tight text-white sm:text-5xl lg:text-6xl">
          Bienvenue à la Bibliothèque de {UNIVERSITY_NAME}
        </h1>
        <p className="mt-6 max-w-2xl text-lg text-slate-200">
          Découvrez notre collection de{' '}
          <span className="font-semibold text-secondary">{totalBooks.toLocaleString('fr-FR')} ouvrages</span> et
          accédez à vos emprunts, réservations et actualités en un clic.
        </p>

        <form
          onSubmit={handleSubmit}
          role="search"
          className="mt-10 flex w-full max-w-2xl flex-col gap-3 rounded-xl bg-white p-3 shadow-lg sm:flex-row"
        >
          <label htmlFor="hero-search" className="sr-only">
            Rechercher un livre, un auteur, un ISBN
          </label>
          <div className="relative flex-1">
            <Search
              className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-400"
              aria-hidden="true"
            />
            <input
              id="hero-search"
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Rechercher un livre, un auteur, un ISBN..."
              className="w-full rounded-lg border-0 py-3 pl-11 pr-4 text-base text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-primary/30"
            />
          </div>
          <Button type="submit" variant="primary" size="md" className="shrink-0">
            Rechercher
          </Button>
        </form>

        <Button href="/catalogue" variant="secondary" size="lg" className="mt-8">
          Consulter le catalogue
        </Button>
      </Container>
    </section>
  );
}
