import type { ReactElement } from 'react';
import { Clock, Mail, MapPin, Phone } from 'lucide-react';
import { ContactForm } from '@/components/contact/ContactForm';
import { Container } from '@/components/ui/Container';
import { CONTACT_ADDRESS, CONTACT_EMAIL, CONTACT_PHONE } from '@/lib/constants';
import { OPENING_HOURS } from '@/lib/site-content';

export default function ContactPage(): ReactElement {
  return (
    <div className="bg-accent">
      <div className="border-b border-slate-200 bg-primary py-16 text-white">
        <Container>
          <p className="text-sm font-semibold uppercase tracking-[0.3em] text-secondary">Nous contacter</p>
          <h1 className="mt-2 font-serif text-4xl font-semibold">Contact</h1>
          <p className="mt-2 max-w-2xl text-slate-200">
            Une question, une suggestion ? Écrivez-nous, notre équipe vous répond rapidement.
          </p>
        </Container>
      </div>

      <Container className="grid grid-cols-1 gap-8 py-10 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <ContactForm />
        </div>

        <div className="flex flex-col gap-6">
          <div className="rounded-xl border border-slate-200 bg-white p-6">
            <h2 className="font-serif text-lg font-semibold text-primary">Coordonnées</h2>
            <ul className="mt-4 space-y-3 text-sm text-slate-600">
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

          <div className="rounded-xl border border-slate-200 bg-white p-6">
            <h2 className="flex items-center gap-2 font-serif text-lg font-semibold text-primary">
              <Clock className="h-4 w-4 text-secondary" aria-hidden="true" />
              Horaires d&rsquo;ouverture
            </h2>
            <ul className="mt-4 space-y-2 text-sm text-slate-600">
              {OPENING_HOURS.map((entry) => (
                <li key={entry.day} className="flex justify-between gap-4">
                  <span>{entry.day}</span>
                  <span className="font-medium text-primary">{entry.hours}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </Container>
    </div>
  );
}
