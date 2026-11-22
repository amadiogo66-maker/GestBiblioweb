import Link from 'next/link';
import { History, KeyRound, LayoutDashboard, Users } from 'lucide-react';
import type { ReactElement } from 'react';
import { Container } from '@/components/ui/Container';

interface StaffNavProps {
  /** Le journal n'est proposé qu'aux administrateurs (la page le vérifie aussi en base). */
  isAdmin: boolean;
  /** Double authentification vérifiée : sinon seul le lien « Sécurité » est utile. */
  verified: boolean;
}

export function StaffNav({ isAdmin, verified }: StaffNavProps): ReactElement {
  const items = [
    ...(verified
      ? [
          { href: '/personnel', label: 'Tableau de bord', icon: LayoutDashboard },
          { href: '/personnel/comptes', label: 'Comptes', icon: Users },
          ...(isAdmin ? [{ href: '/personnel/journal', label: 'Journal', icon: History }] : []),
        ]
      : []),
    { href: '/personnel/securite', label: 'Sécurité', icon: KeyRound },
  ];

  return (
    <nav className="border-b border-slate-200 bg-white" aria-label="Navigation de l'espace du personnel">
      <Container>
        <div className="flex gap-1 overflow-x-auto">
          {items.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="flex items-center gap-2 whitespace-nowrap border-b-2 border-transparent px-4 py-3 text-sm font-medium text-slate-600 transition-colors hover:border-primary hover:text-primary"
            >
              <item.icon className="h-4 w-4" aria-hidden="true" />
              {item.label}
            </Link>
          ))}
        </div>
      </Container>
    </nav>
  );
}
