import type { ReactElement } from 'react';
import { BookOpen, Clock, GraduationCap, Heart, Lightbulb, ShieldCheck, Users } from 'lucide-react';
import { getHomeStats } from '@/lib/home-data';
import { OPENING_HOURS } from '@/lib/site-content';
import { Container } from '@/components/ui/Container';
import { Button } from '@/components/ui/Button';
import { UNIVERSITY_NAME } from '@/lib/constants';

export const dynamic = 'force-dynamic';

const VALUES = [
  {
    icon: BookOpen,
    title: 'Accès au savoir',
    description: "Offrir à chaque étudiant, enseignant et visiteur un accès simple et équitable à la connaissance.",
  },
  {
    icon: Lightbulb,
    title: 'Innovation',
    description: 'Moderniser continuellement nos services grâce au numérique, sans jamais perdre le contact humain.',
  },
  {
    icon: ShieldCheck,
    title: 'Rigueur',
    description: 'Garantir la fiabilité de notre catalogue et la sécurité des données de chaque utilisateur.',
  },
  {
    icon: Heart,
    title: 'Proximité',
    description: "Accompagner chaque lecteur avec attention, de l'inscription jusqu'à la restitution des ouvrages.",
  },
];

export default async function AProposPage(): Promise<ReactElement> {
  const stats = await getHomeStats();

  return (
    <div className="bg-white">
      <div className="border-b border-slate-200 bg-primary py-16 text-white">
        <Container>
          <p className="text-sm font-semibold uppercase tracking-[0.3em] text-secondary">Notre mission</p>
          <h1 className="mt-2 font-serif text-4xl font-semibold">À propos de la bibliothèque</h1>
          <p className="mt-2 max-w-2xl text-slate-200">
            Le portail numérique de la bibliothèque de {UNIVERSITY_NAME}, au service de la réussite de sa communauté
            universitaire.
          </p>
        </Container>
      </div>

      <Container className="flex flex-col gap-16 py-16">
        <section className="grid grid-cols-1 gap-10 lg:grid-cols-2 lg:items-center">
          <div className="flex flex-col gap-4">
            <p className="text-sm font-semibold uppercase tracking-[0.25em] text-secondary">Notre histoire</p>
            <h2 className="font-serif text-3xl font-semibold text-primary">
              Un centre de ressources au cœur de {UNIVERSITY_NAME}
            </h2>
            <p className="text-base leading-relaxed text-slate-600">
              La bibliothèque universitaire accompagne depuis sa création les étudiants, enseignants et chercheurs
              dans leurs travaux académiques. Elle rassemble une collection couvrant l&rsquo;ensemble des
              départements de l&rsquo;université, régulièrement enrichie de nouveaux ouvrages et ressources.
            </p>
            <p className="text-base leading-relaxed text-slate-600">
              Avec Gest Biblio, la bibliothèque franchit une nouvelle étape : consulter le catalogue, réserver un
              ouvrage ou suivre ses emprunts est désormais possible en ligne, à tout moment, depuis n&rsquo;importe
              quel appareil.
            </p>
          </div>

          <dl className="grid grid-cols-2 gap-4">
            {[
              { icon: BookOpen, label: 'Ouvrages', value: stats.totalBooks },
              { icon: GraduationCap, label: 'Étudiants inscrits', value: stats.totalStudents },
              { icon: Users, label: 'Enseignants', value: stats.totalTeachers },
              { icon: BookOpen, label: 'Départements', value: stats.totalDepartments },
            ].map(({ icon: Icon, label, value }) => (
              <div key={label} className="flex flex-col gap-2 rounded-xl border border-slate-200 bg-accent p-5">
                <Icon className="h-6 w-6 text-primary" aria-hidden="true" />
                <p className="font-serif text-2xl font-semibold text-primary">{value.toLocaleString('fr-FR')}</p>
                <p className="text-sm text-slate-600">{label}</p>
              </div>
            ))}
          </dl>
        </section>

        <section>
          <p className="text-sm font-semibold uppercase tracking-[0.25em] text-secondary">Nos valeurs</p>
          <h2 className="mt-2 font-serif text-3xl font-semibold text-primary">Ce qui nous anime</h2>
          <div className="mt-8 grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-4">
            {VALUES.map(({ icon: Icon, title, description }) => (
              <div key={title} className="rounded-xl border border-slate-200 bg-white p-6">
                <span className="flex h-12 w-12 items-center justify-center rounded-lg bg-primary/10 text-primary">
                  <Icon className="h-6 w-6" aria-hidden="true" />
                </span>
                <h3 className="mt-4 font-serif text-lg font-semibold text-primary">{title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-slate-600">{description}</p>
              </div>
            ))}
          </div>
        </section>

        <section className="flex flex-col gap-6 rounded-xl border border-slate-200 bg-accent p-8 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="flex items-center gap-2 font-serif text-xl font-semibold text-primary">
              <Clock className="h-5 w-5 text-secondary" aria-hidden="true" />
              Horaires d&rsquo;ouverture
            </h2>
            <ul className="mt-4 space-y-1 text-sm text-slate-600">
              {OPENING_HOURS.map((entry) => (
                <li key={entry.day} className="flex gap-2">
                  <span className="font-medium text-primary">{entry.day} :</span>
                  <span>{entry.hours}</span>
                </li>
              ))}
            </ul>
          </div>
          <div className="flex flex-wrap gap-3">
            <Button href="/inscription" variant="primary" size="md">
              Créer un compte
            </Button>
            <Button href="/contact" variant="outline" size="md">
              Nous contacter
            </Button>
          </div>
        </section>
      </Container>
    </div>
  );
}
