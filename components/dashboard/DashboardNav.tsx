'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Bell, Bookmark, BookMarked, LayoutDashboard, UserCircle } from 'lucide-react';
import type { ReactElement } from 'react';
import { Container } from '@/components/ui/Container';
import { cn } from '@/lib/utils';

const NAV_ITEMS = [
  { href: '/tableau-de-bord', label: "Vue d'ensemble", icon: LayoutDashboard },
  { href: '/emprunts', label: 'Mes emprunts', icon: BookMarked },
  { href: '/reservations', label: 'Mes réservations', icon: Bookmark },
  { href: '/notifications', label: 'Notifications', icon: Bell },
  { href: '/profil', label: 'Mon profil', icon: UserCircle },
];

export function DashboardNav(): ReactElement {
  const pathname = usePathname();

  return (
    <nav className="border-b border-slate-200 bg-white" aria-label="Navigation de l'espace personnel">
      <Container>
        <div className="flex gap-1 overflow-x-auto">
          {NAV_ITEMS.map((item) => {
            const isActive = pathname === item.href;
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
