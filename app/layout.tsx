import type { Metadata, Viewport } from 'next';
import type { ReactElement, ReactNode } from 'react';
import { Providers } from '@/app/providers';
import '@/app/globals.css';

export const metadata: Metadata = {
  title: 'Gest Biblio - Université de Labé',
  description: 'Portail de la bibliothèque universitaire Gest Biblio',
};

export const viewport: Viewport = {
  themeColor: '#1e3a5f',
};

interface RootLayoutProps {
  children: ReactNode;
}

export default function RootLayout({ children }: RootLayoutProps): ReactElement {
  return (
    <html lang="fr" suppressHydrationWarning>
      <body className="min-h-screen bg-accent text-slate-900 antialiased transition-colors dark:bg-slate-950 dark:text-slate-100">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
