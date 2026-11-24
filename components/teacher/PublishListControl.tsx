'use client';

import { useState } from 'react';
import type { ReactElement } from 'react';
import { ApiActionButton } from '@/components/shared/ApiActionButton';

interface PublishListControlProps {
  url: string;
  /** Comptage agrégé côté serveur (destinataires approximatifs). */
  recipients: number;
  /** Les étudiants ont déjà été prévenus pour cette liste : la case n'est plus proposée. */
  alreadyNotified: boolean;
}

/**
 * Publication d'une liste, avec la notification FACULTATIVE des étudiants du
 * département (case décochée par défaut, confirmation avant l'envoi). Le
 * serveur revérifie tout : propriétaire, département, plafond, limitation.
 */
export function PublishListControl({ url, recipients, alreadyNotified }: PublishListControlProps): ReactElement {
  const [notify, setNotify] = useState(false);
  const plural = recipients > 1 ? 's' : '';

  return (
    <div className="flex flex-col gap-2">
      {alreadyNotified ? (
        <p className="text-xs text-slate-500">Les étudiants de votre département ont déjà été prévenus pour cette liste.</p>
      ) : (
        <label className="flex items-start gap-2 text-sm text-slate-700">
          <input
            type="checkbox"
            checked={notify}
            onChange={(event) => setNotify(event.target.checked)}
            className="mt-0.5 h-4 w-4 shrink-0 rounded border-slate-300 text-primary focus:ring-primary/20"
          />
          <span>
            Prévenir les étudiants de mon département (une seule fois par liste)
            <span className="block text-xs text-slate-500">
              Environ {recipients} étudiant{plural} ser{recipients > 1 ? 'ont' : 'a'} prévenu{plural}.
            </span>
          </span>
        </label>
      )}
      <ApiActionButton
        url={url}
        method="PATCH"
        body={notify && !alreadyNotified ? { status: 'PUBLISHED', notifyStudents: true } : { status: 'PUBLISHED' }}
        confirm={
          notify && !alreadyNotified
            ? `Publier la liste et prévenir environ ${recipients} étudiant${plural} ? Cette notification ne sera envoyée qu’une fois.`
            : undefined
        }
        variant="primary"
      >
        Publier la liste
      </ApiActionButton>
    </div>
  );
}
