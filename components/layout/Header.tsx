'use client';

import Image from 'next/image';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useSession } from 'next-auth/react';
import { Menu, X } from 'lucide-react';
import { useState } from 'react';
import type { ReactElement } from 'react';
import { Button } from '@/components/ui/Button';
import { Container } from '@/components/ui/Container';
import { APP_NAME, UNIVERSITY_NAME } from '@/lib/constants';
import { cn } from '@/lib/utils';

const NAV_LINKS = [
  { href: '/', label: 'Accueil' },
  { href: '/catalogue', label: 'Catalogue' },
  { href: '/nouveautes', label: 'Nouveautés' },
  { href: '/populaires', label: 'Populaires' },
  { href: '/services', label: 'Services' },
  { href: '/actualites', label: 'Actualités' },
  { href: '/a-propos', label: 'À propos' },
  { href: '/contact', label: 'Contact' },
];

export function Header(): ReactElement {
  const pathname = usePathname();
  const { data: session, status } = useSession();
  const [isMenuOpen, setIsMenuOpen] = useState(false);

  const isAuthenticated = status === 'authenticated' && Boolean(session?.user);

  return (
    <header className="sticky top-0 z-50 border-b border-slate-200 bg-white/80 backdrop-blur">
      <Container className="flex h-20 items-center justify-between">
        <Link href="/" className="flex items-center gap-3" onClick={() => setIsMenuOpen(false)}>
          <Image
            src="/images/logo-universite.png"
            alt={`Logo ${UNIVERSITY_NAME}`}
            width={132}
            height={52}
            priority
            className="h-9 w-auto sm:h-10"
          />
          <span className="hidden h-8 w-px bg-slate-200 sm:block" aria-hidden="true" />
          <span className="hidden font-serif text-lg font-semibold text-primary sm:block">{APP_NAME}</span>
        </Link>

        <nav className="hidden items-center gap-1 lg:flex" aria-label="Navigation principale">
          {NAV_LINKS.map((link) => {
            const isActive = link.href === '/' ? pathname === '/' : pathname.startsWith(link.href);
            return (
              <Link
                key={link.href}
                href={link.href}
                aria-current={isActive ? 'page' : undefined}
                className={cn(
                  'rounded-lg px-3 py-2 text-sm font-medium text-slate-600 transition-colors hover:bg-primary/5 hover:text-primary',
                  isActive && 'bg-primary/10 text-primary'
                )}
              >
                {link.label}
              </Link>
            );
          })}
        </nav>

        <div className="hidden items-center gap-3 lg:flex">
          {isAuthenticated ? (
            <Button href="/tableau-de-bord" variant="primary" size="sm">
              {session?.user?.firstName ?? 'Mon espace'}
            </Button>
          ) : (
            <>
              <Button href="/connexion" variant="outline" size="sm">
                Connexion
              </Button>
              <Button href="/inscription" variant="primary" size="sm">
                Créer un compte
              </Button>
            </>
          )}
        </div>

        <button
          type="button"
          className="inline-flex items-center justify-center rounded-lg p-2 text-primary lg:hidden"
          aria-label={isMenuOpen ? 'Fermer le menu' : 'Ouvrir le menu'}
          aria-expanded={isMenuOpen}
          onClick={() => setIsMenuOpen((open) => !open)}
        >
          {isMenuOpen ? <X className="h-6 w-6" aria-hidden="true" /> : <Menu className="h-6 w-6" aria-hidden="true" />}
        </button>
      </Container>

      {isMenuOpen ? (
        <div className="border-t border-slate-200 bg-white lg:hidden">
          <Container className="flex flex-col gap-1 py-4">
            {NAV_LINKS.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className="rounded-lg px-3 py-2 text-sm font-medium text-slate-600 hover:bg-primary/5 hover:text-primary"
                onClick={() => setIsMenuOpen(false)}
              >
                {link.label}
              </Link>
            ))}
            <div className="mt-3 flex flex-col gap-2 border-t border-slate-200 pt-3">
              {isAuthenticated ? (
                <Button href="/tableau-de-bord" variant="primary" size="sm" onClick={() => setIsMenuOpen(false)}>
                  Mon espace
                </Button>
              ) : (
                <>
                  <Button href="/connexion" variant="outline" size="sm" onClick={() => setIsMenuOpen(false)}>
                    Connexion
                  </Button>
                  <Button href="/inscription" variant="primary" size="sm" onClick={() => setIsMenuOpen(false)}>
                    Créer un compte
                  </Button>
                </>
              )}
            </div>
          </Container>
        </div>
      ) : null}
    </header>
  );
}
