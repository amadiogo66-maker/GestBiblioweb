import type { ReactElement } from 'react';
import { SELF_DECISION_MESSAGE } from '@/lib/acquisitions';

/** Remplace les boutons de décision sur une proposition dont l'utilisateur est le demandeur. */
export function SelfDecisionNotice(): ReactElement {
  return <p className="rounded-lg bg-slate-50 px-3 py-2 text-sm text-slate-600">{SELF_DECISION_MESSAGE}.</p>;
}
