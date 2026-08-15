import Image from 'next/image';
import Link from 'next/link';
import { Clock, Facebook, Instagram, Linkedin, Mail, MapPin, Phone } from 'lucide-react';
import type { ReactElement } from 'react';
import { Container } from '@/components/ui/Container';
import { APP_NAME, CONTACT_ADDRESS, CONTACT_EMAIL, CONTACT_PHONE, UNIVERSITY_NAME } from '@/lib/constants';
import { OPENING_HOURS } from '@/lib/site-content';

const QUICK_LINKS = [
  { href: '/catalogue', label: 'Catalogue' },
  { href: '/nouveautes', label: 'Nouveautés' },
  { href: '/populaires', label: 'Populaires' },
  { href: '/services', label: 'Services' },
  { href: '/actualites', label: 'Actualités' },
  { href: '/a-propos', label: 'À propos' },
];

const ACCOUNT_LINKS = [
  { href: '/connexion', label: 'Connexion' },
  { href: '/inscription', label: 'Créer un compte' },
  { href: '/contact', label: 'Nous contacter' },
];

const SOCIAL_LINKS = [
  { href: '#', label: 'Facebook', icon: Facebook },
  { href: '#', label: 'Instagram', icon: Instagram },
  { href: '#', label: 'LinkedIn', icon: Linkedin },
];

export function Footer(): ReactElement {
  const year = new Date().getFullYear();

  return (
    <footer className="border-t border-slate-200 bg-primary text-slate-200">
      <Container className="grid gap-10 py-16 sm:grid-cols-2 lg:grid-cols-4">
        <div>
          <div className="flex items-center gap-3">
            <span className="flex items-center justify-center rounded-lg bg-white px-2 py-1.5">
              <Image
                src="/images/logo-universite.png"
                alt={`Logo ${UNIVERSITY_NAME}`}
                width={132}
                height={52}
                className="h-8 w-auto"
              />
            </span>
            <span className="font-serif text-lg font-semibold text-white">{APP_NAME}</span>
          </div>
          <p className="mt-4 text-sm leading-relaxed text-slate-300">
            Le portail numérique de la bibliothèque de {UNIVERSITY_NAME}, au service des étudiants, enseignants et
            chercheurs.
          </p>
          <ul className="mt-4 flex gap-3">
            {SOCIAL_LINKS.map(({ href, label, icon: Icon }) => (
              <li key={label}>
                <a
                  href={href}
                  aria-label={label}
                  className="flex h-9 w-9 items-center justify-center rounded-full bg-white/10 text-white transition-colors hover:bg-secondary hover:text-primary"
                >
                  <Icon className="h-4 w-4" aria-hidden="true" />
                </a>
              </li>
            ))}
          </ul>
        </div>

        <div>
          <h3 className="font-serif text-sm font-semibold uppercase tracking-wider text-secondary">Liens rapides</h3>
          <ul className="mt-4 space-y-2 text-sm">
            {QUICK_LINKS.map((link) => (
              <li key={link.href}>
                <Link href={link.href} className="text-slate-300 transition-colors hover:text-white">
                  {link.label}
                </Link>
              </li>
            ))}
          </ul>
        </div>

        <div>
          <h3 className="font-serif text-sm font-semibold uppercase tracking-wider text-secondary">Mon compte</h3>
          <ul className="mt-4 space-y-2 text-sm">
            {ACCOUNT_LINKS.map((link) => (
              <li key={link.href}>
                <Link href={link.href} className="text-slate-300 transition-colors hover:text-white">
                  {link.label}
                </Link>
              </li>
            ))}
          </ul>

          <h3 className="mt-6 flex items-center gap-2 font-serif text-sm font-semibold uppercase tracking-wider text-secondary">
            <Clock className="h-4 w-4" aria-hidden="true" />
            Horaires
          </h3>
          <ul className="mt-3 space-y-1 text-sm text-slate-300">
            {OPENING_HOURS.map((entry) => (
              <li key={entry.day} className="flex justify-between gap-4">
                <span>{entry.day}</span>
                <span>{entry.hours}</span>
              </li>
            ))}
          </ul>
        </div>

        <div>
          <h3 className="font-serif text-sm font-semibold uppercase tracking-wider text-secondary">Contact</h3>
          <ul className="mt-4 space-y-3 text-sm text-slate-300">
            <li className="flex items-start gap-3">
              <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-secondary" aria-hidden="true" />
              <span>{CONTACT_ADDRESS}</span>
            </li>
            <li className="flex items-center gap-3">
              <Phone className="h-4 w-4 shrink-0 text-secondary" aria-hidden="true" />
              <span>{CONTACT_PHONE}</span>
            </li>
            <li className="flex items-center gap-3">
              <Mail className="h-4 w-4 shrink-0 text-secondary" aria-hidden="true" />
              <span>{CONTACT_EMAIL}</span>
            </li>
          </ul>
        </div>
      </Container>

      <div className="border-t border-white/10">
        <Container className="flex flex-col gap-2 py-6 text-xs text-slate-400 sm:flex-row sm:items-center sm:justify-between">
          <p>
            © {year} {UNIVERSITY_NAME} — {APP_NAME}. Tous droits réservés.
          </p>
          <div className="flex gap-4">
            <Link href="/mentions-legales" className="transition-colors hover:text-white">
              Mentions légales
            </Link>
            <Link href="/confidentialite" className="transition-colors hover:text-white">
              Confidentialité
            </Link>
          </div>
        </Container>
      </div>
    </footer>
  );
}
