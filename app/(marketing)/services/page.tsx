import type { ReactElement } from 'react';
import { Container } from '@/components/ui/Container';
import { Button } from '@/components/ui/Button';
import { SERVICES } from '@/lib/site-content';

export default function ServicesPage(): ReactElement {
  return (
    <div className="bg-white">
      <div className="border-b border-slate-200 bg-primary py-16 text-white">
        <Container>
          <p className="text-sm font-semibold uppercase tracking-[0.3em] text-secondary">Ce que nous offrons</p>
          <h1 className="mt-2 font-serif text-4xl font-semibold">Nos Services</h1>
          <p className="mt-2 max-w-2xl text-slate-200">
            Découvrez l&rsquo;ensemble des services proposés par la bibliothèque pour accompagner votre parcours
            universitaire.
          </p>
        </Container>
      </div>

      <Container className="flex flex-col gap-6 py-16">
        {SERVICES.map(({ icon: Icon, title, description, details }, index) => (
          <div
            key={title}
            className="flex flex-col gap-4 rounded-xl border border-slate-200 bg-white p-6 sm:flex-row sm:items-start sm:gap-6"
          >
            <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
              <Icon className="h-7 w-7" aria-hidden="true" />
            </span>
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-secondary">
                Service {String(index + 1).padStart(2, '0')}
              </p>
              <h2 className="mt-1 font-serif text-xl font-semibold text-primary">{title}</h2>
              <p className="mt-2 text-sm font-medium text-slate-600">{description}</p>
              <p className="mt-2 text-sm leading-relaxed text-slate-500">{details}</p>
            </div>
          </div>
        ))}

        <div className="mt-6 flex flex-col items-center gap-4 rounded-xl bg-accent px-6 py-10 text-center">
          <h2 className="font-serif text-2xl font-semibold text-primary">Prêt à commencer ?</h2>
          <p className="max-w-xl text-sm text-slate-600">
            Créez votre compte dès aujourd&rsquo;hui pour profiter de tous ces services et emprunter vos premiers
            ouvrages.
          </p>
          <div className="flex flex-wrap justify-center gap-3">
            <Button href="/inscription" variant="primary" size="md">
              Créer un compte
            </Button>
            <Button href="/catalogue" variant="outline" size="md">
              Consulter le catalogue
            </Button>
          </div>
        </div>
      </Container>
    </div>
  );
}
