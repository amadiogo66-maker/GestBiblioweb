import type { AcquisitionStatus, Prisma } from '@prisma/client';
import { buildActivityLogData } from '@/lib/activity-log';
import { canAccessDepartment, isLibraryStaff, isSubstituteDecision, type DepartmentActor } from '@/lib/department-access';
import { createNotification, notificationTexts } from '@/lib/notifications';
import { OPEN_ACQUISITION_STATUSES } from '@/lib/constants';
import type { AcquisitionDecisionAction } from '@/schemas/acquisition';

/**
 * Circuit d'une proposition d'acquisition :
 *   SUBMITTED ─(responsable)→ DEPT_APPROVED | DEPT_REJECTED
 *   DEPT_APPROVED ─(bibliothèque)→ LIBRARY_ACCEPTED | LIBRARY_REJECTED
 *   LIBRARY_ACCEPTED ─(bibliothèque)→ ACQUIRED
 * Toute autre transition est refusée (409). Fonction pure : testable sans base.
 */

type Stage = 'department' | 'library' | 'acquired';

const TRANSITIONS: Record<AcquisitionDecisionAction, { from: AcquisitionStatus; to: DecidedStatus; stage: Stage }> = {
  approve: { from: 'SUBMITTED', to: 'DEPT_APPROVED', stage: 'department' },
  reject: { from: 'SUBMITTED', to: 'DEPT_REJECTED', stage: 'department' },
  accept: { from: 'DEPT_APPROVED', to: 'LIBRARY_ACCEPTED', stage: 'library' },
  refuse: { from: 'DEPT_APPROVED', to: 'LIBRARY_REJECTED', stage: 'library' },
  acquired: { from: 'LIBRARY_ACCEPTED', to: 'ACQUIRED', stage: 'acquired' },
};

export type DecidedStatus = 'DEPT_APPROVED' | 'DEPT_REJECTED' | 'LIBRARY_ACCEPTED' | 'LIBRARY_REJECTED' | 'ACQUIRED';

export type AcquisitionDecision =
  | { allowed: true; from: AcquisitionStatus; to: DecidedStatus; stage: Stage; substitute: boolean }
  | { allowed: false; httpStatus: 403 | 404 | 409; message: string };

export const ACQUISITION_NOT_FOUND = 'Proposition introuvable';

export function evaluateAcquisitionDecision(
  actor: DepartmentActor,
  request: { departmentId: string; status: AcquisitionStatus },
  action: AcquisitionDecisionAction
): AcquisitionDecision {
  // Un autre département se comporte comme une proposition inexistante.
  if (!canAccessDepartment(actor, request.departmentId)) {
    return { allowed: false, httpStatus: 404, message: ACQUISITION_NOT_FOUND };
  }

  const transition = TRANSITIONS[action];

  if (transition.stage !== 'department' && !isLibraryStaff(actor.roles)) {
    return { allowed: false, httpStatus: 403, message: 'Décision réservée à la bibliothèque' };
  }

  if (request.status !== transition.from) {
    return { allowed: false, httpStatus: 409, message: 'Cette proposition n’est plus à cette étape' };
  }

  return {
    allowed: true,
    from: transition.from,
    to: transition.to,
    stage: transition.stage,
    substitute: transition.stage === 'department' && isSubstituteDecision(actor, request.departmentId),
  };
}

export class AcquisitionConflictError extends Error {}

/**
 * Applique une décision autorisée, dans UNE transaction : changement de statut
 * conditionné à l'étape attendue (deux décisions concurrentes : une seule
 * passe), journal d'activité et notification à l'enseignant (sans doublon).
 */
export async function applyAcquisitionDecision(
  db: Prisma.TransactionClient,
  input: {
    request: { id: string; requesterId: string; title: string; departmentId: string };
    decision: Extract<AcquisitionDecision, { allowed: true }>;
    actorId: string;
    note: string | null;
    headers: Headers;
  }
): Promise<void> {
  const { request, decision, actorId, note, headers } = input;
  const now = new Date();
  const data: Prisma.AcquisitionRequestUncheckedUpdateManyInput =
    decision.stage === 'department'
      ? { status: decision.to, departmentDecidedById: actorId, departmentDecidedAt: now, departmentNote: note }
      : decision.stage === 'library'
        ? { status: decision.to, libraryDecidedById: actorId, libraryDecidedAt: now, libraryNote: note }
        : { status: decision.to, acquiredAt: now };

  const { count } = await db.acquisitionRequest.updateMany({ where: { id: request.id, status: decision.from }, data });

  if (count !== 1) {
    throw new AcquisitionConflictError();
  }

  await db.activityLog.create({
    data: buildActivityLogData({
      action: `acquisition.${decision.to.toLowerCase()}`,
      userId: actorId,
      headers,
      details: {
        requestId: request.id,
        departmentId: request.departmentId,
        from: decision.from,
        to: decision.to,
        ...(decision.substitute ? { substitute: true } : {}),
        ...(note ? { note } : {}),
      },
    }),
  });

  await createNotification(db, {
    userId: request.requesterId,
    ...notificationTexts.acquisitionUpdate(decision.to, request.title),
    dedupeKey: `acquisition:${request.id}:${decision.to}`,
    source: 'site',
  });
}

export interface AcquisitionWarnings {
  /** Ouvrage du catalogue ayant le même ISBN. */
  catalogBook: { id: string; title: string } | null;
  /** Une proposition SUBMITTED ou DEPT_APPROVED du même ISBN existe déjà dans le département. */
  pendingInDepartment: boolean;
}

/** Doublons possibles d'une nouvelle proposition (ISBN normalisé). Deux requêtes, sans boucle. */
export async function findAcquisitionWarnings(
  db: Pick<Prisma.TransactionClient, '$queryRaw' | 'acquisitionRequest'>,
  input: { departmentId: string; isbn: string | null }
): Promise<AcquisitionWarnings> {
  if (!input.isbn) {
    return { catalogBook: null, pendingInDepartment: false };
  }

  const isbn = input.isbn;
  const [catalogBook, pending] = await Promise.all([
    // Le catalogue garde l'ISBN tel que fourni par le logiciel (tirets, espaces) : comparaison normalisée.
    db.$queryRaw<Array<{ id: string; title: string }>>`
      SELECT "id", "title" FROM "Book"
      WHERE upper(replace(replace("isbn", '-', ''), ' ', '')) = ${isbn}
      LIMIT 1`,
    db.acquisitionRequest.count({
      where: { departmentId: input.departmentId, isbn, status: { in: ['SUBMITTED', 'DEPT_APPROVED'] } },
    }),
  ]);

  return { catalogBook: catalogBook[0] ?? null, pendingInDepartment: pending > 0 };
}

export const OPEN_STATUSES: AcquisitionStatus[] = [...OPEN_ACQUISITION_STATUSES];
