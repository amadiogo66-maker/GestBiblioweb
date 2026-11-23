'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Bell, Bookmark, BookMarked, GraduationCap, LayoutDashboard, ListChecks, UserCircle } from 'lucide-react';
import type { ReactElement } from 'react';
import { Container } from '@/components/ui/Container';
import { cn } from '@/lib/utils';

const NAV_ITEMS = [
  { href: '/tableau-de-bord', label: "Vue d'ensemble", icon: LayoutDashboard },
  { href: '/emprunts', label: 'Mes emprunts', icon: BookMarked },
  { href: '/reservations', label: 'Mes réservations', icon: Bookmark },
  { href: '/listes-de-lecture', label: 'Listes de lectures', icon: ListChecks },
  { href: '/notifications', label: 'Notifications', icon: Bell },
  { href: '/profil', label: 'Mon profil', icon: UserCircle },
];

const TEACHER_ITEM = { href: '/enseignant/listes', label: 'Espace enseignant', icon: GraduationCap };

interface DashboardNavProps {
  /** Calculé côté serveur (rôle TEACHER relu en base) : jamais à partir du JWT. */
  showTeacherLink: boolean;
}

export function DashboardNav({ showTeacherLink }: DashboardNavProps): ReactElement {
  const pathname = usePathname();
  const items = showTeacherLink ? [...NAV_ITEMS, TEACHER_ITEM] : NAV_ITEMS;

  return (
    <nav className="border-b border-slate-200 bg-white" aria-label="Navigation de l'espace personnel">
      <Container>
        <div className="flex gap-1 overflow-x-auto">
          {items.map((item) => {
            const isActive =
              pathname === item.href ||
              pathname.startsWith(`${item.href}/`) ||
              (item.href === TEACHER_ITEM.href && pathname.startsWith('/enseignant/'));
            return (
              <Link
                key={item.href}
                href={item.href}
                aria-current={isActive ? 'page' : undefined}
                className={cn(
                  'flex items-center gap-2 whitespace-nowrap border-b-2 px-4 py-3 text-sm font-medium transition-colors',
                  isActive ? 'border-primary text-primary' : 'border-transparent text-slate-500 hover:text-primary'
                )}
              >
                <item.icon className="h-4 w-4" aria-hidden="true" />
                {item.label}
              </Link>
            );
          })}
        </div>
      </Container>
    </nav>
  );
}
