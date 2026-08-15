import type { ReactElement } from 'react';
import { Container } from '@/components/ui/Container';
import { SectionHeading } from '@/components/ui/SectionHeading';
import { Button } from '@/components/ui/Button';
import { SERVICES } from '@/lib/site-content';

export function ServicesSection(): ReactElement {
  return (
    <section className="bg-primary py-20 text-white">
      <Container>
        <SectionHeading
          eyebrow="Ce que nous offrons"
          title="Nos Services"
          className="[&_h2]:text-white [&_p]:text-slate-200"
          action={
            <Button href="/services" variant="secondary" size="sm">
              Voir tous les services
            </Button>
          }
        />

        <div className="mt-10 grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {SERVICES.map(({ icon: Icon, title, description }) => (
            <div
              key={title}
              className="rounded-xl border border-white/10 bg-white/5 p-6 transition-colors duration-300 hover:bg-white/10"
            >
              <span className="flex h-12 w-12 items-center justify-center rounded-lg bg-secondary/20 text-secondary">
                <Icon className="h-6 w-6" aria-hidden="true" />
              </span>
              <h3 className="mt-4 font-serif text-lg font-semibold text-white">{title}</h3>
              <p className="mt-2 line-clamp-2 text-sm text-slate-300">{description}</p>
            </div>
          ))}
        </div>
      </Container>
    </section>
  );
}
