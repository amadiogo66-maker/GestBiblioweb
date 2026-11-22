import { Info } from 'lucide-react';
import type { ReactElement } from 'react';

/** Bandeau affiché quand le logiciel de la bibliothèque ne répond plus. */
export function CirculationNotice(): ReactElement {
  return (
    <p role="status" className="flex items-start gap-2 rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600">
      <Info className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
      <span>
        Le traitement des réservations et des renouvellements est momentanément suspendu. Votre demande sera enregistrée
        et traitée dès le retour du service.
      </span>
    </p>
  );
}
