import { BookOpen, GraduationCap, Landmark, Library, Users } from 'lucide-react';
import type { ReactElement } from 'react';
import { AnimatedCounter } from '@/components/home/AnimatedCounter';
import { Container } from '@/components/ui/Container';
import type { HomeStats } from '@/lib/home-data';

interface StatsSectionProps {
  stats: HomeStats;
}

export function StatsSection({ stats }: StatsSectionProps): ReactElement {
  const items = [
    { icon: BookOpen, label: 'Ouvrages', value: stats.totalBooks },
    { icon: GraduationCap, label: 'Étudiants inscrits', value: stats.totalStudents },
    { icon: Users, label: 'Enseignants', value: stats.totalTeachers },
    { icon: Library, label: 'Emprunts', value: stats.totalLoans },
    { icon: Landmark, label: 'Départements', value: stats.totalDepartments },
  ];

  return (
    <section className="border-b border-slate-200 bg-white py-16">
      <Container>
        <dl className="grid grid-cols-1 gap-8 sm:grid-cols-3 lg:grid-cols-5">
          {items.map(({ icon: Icon, label, value }) => (
            <div key={label} className="flex flex-col items-center gap-3 text-center">
              <span className="flex h-14 w-14 items-center justify-center rounded-full bg-primary/10 text-primary">
                <Icon className="h-6 w-6" aria-hidden="true" />
              </span>
              <dd className="font-serif text-3xl font-semibold text-primary">
                <AnimatedCounter value={value} />
                <span className="sr-only">{value.toLocaleString('fr-FR')}</span>
              </dd>
              <dt className="text-sm font-medium text-slate-600">{label}</dt>
            </div>
          ))}
        </dl>
      </Container>
    </section>
  );
}
