import { CreditCard } from 'lucide-react';
import type { ReactElement } from 'react';
import type { LibraryCardData } from '@/lib/library-card';
import { formatDate } from '@/lib/utils';

const ROLE_LABELS: Record<string, string> = {
  STUDENT: 'Étudiant',
  TEACHER: 'Enseignant',
  VISITOR: 'Visiteur',
};

export function LibraryCard({ card }: { card: LibraryCardData }): ReactElement {
  return (
    <div className="flex flex-col gap-4 rounded-xl border border-slate-200 bg-white p-6">
      <div className="flex items-center gap-2 text-primary">
        <CreditCard className="h-5 w-5" aria-hidden="true" />
        <h2 className="font-serif text-lg font-semibold">Carte de bibliothèque</h2>
      </div>

      <div className="flex flex-col items-center gap-3 rounded-xl bg-primary p-6 text-center text-white">
        <p className="text-xs uppercase tracking-[0.25em] text-secondary">Gest Biblio</p>
        <p className="font-serif text-lg font-semibold">{card.fullName}</p>
        <p className="text-sm text-slate-200">
          {ROLE_LABELS[card.role] ?? card.role}
          {card.department ? ` · ${card.department}` : ''}
        </p>

        {card.qrCode ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={card.qrCode} alt="QR code de la carte de bibliothèque" className="h-32 w-32 rounded-lg bg-white p-2" />
        ) : null}

        <p className="font-mono text-sm tracking-wider">{card.libraryCard}</p>
        <p className="text-xs text-slate-300">Valable jusqu&rsquo;au {formatDate(card.expiresAt)}</p>
      </div>
    </div>
  );
}
