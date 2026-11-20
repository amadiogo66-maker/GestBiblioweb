import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import type { ReactElement, ReactNode } from 'react';
import { AccountStatusBadge } from '@/components/staff/AccountStatusBadge';
import { AuditTable } from '@/components/staff/AuditTable';
import { ModerationActions } from '@/components/staff/ModerationActions';
import { Badge } from '@/components/ui/Badge';
import { requireStaffPage } from '@/lib/staff-page';
import { getAccountStaffHistory, getStaffAccount } from '@/lib/staff-data';
import { evaluateModeration, isMemberRegistrationValid } from '@/lib/staff-moderation';
import { MODERATION_ACTION_LABELS, STAFF_ROLE_LABELS, USER_ROLE_LABELS, type ModerationAction } from '@/lib/staff-labels';
import { formatDateTime } from '@/lib/audit-format';
import { formatDate } from '@/lib/utils';

export const dynamic = 'force-dynamic';

interface AccountDetailPageProps {
  params: Promise<{ id: string }>;
}

const ACTIONS: ModerationAction[] = ['suspend', 'ban', 'reactivate'];

function Field({ label, children }: { label: string; children: ReactNode }): ReactElement {
  return (
    <div className="flex flex-col gap-0.5">
      <dt className="text-xs font-medium uppercase tracking-wide text-slate-500">{label}</dt>
      <dd className="break-words text-sm text-slate-800">{children}</dd>
    </div>
  );
}

function Card({ title, children }: { title: string; children: ReactNode }): ReactElement {
  return (
    <section className="flex flex-col gap-4 rounded-xl border border-slate-200 bg-white p-5">
      <h2 className="font-serif text-lg font-semibold text-primary">{title}</h2>
      {children}
    </section>
  );
}

export default async function StaffAccountDetailPage({ params }: AccountDetailPageProps): Promise<ReactElement> {
  const context = await requireStaffPage();
  const { id } = await params;
  const account = await getStaffAccount(id);

  if (!account) {
    notFound();
  }

  const history = await getAccountStaffHistory(account.id);
  const member = account.libraryMember;
  const memberValid = isMemberRegistrationValid(member);
  const decisions = ACTIONS.map((action) => ({
    action,
    decision: evaluateModeration(
      { id: context.user.id, roles: context.staffRoles },
      { id: account.id, status: account.status, hasActiveStaffRole: account.staffAssignments.length > 0, member },
      action
    ),
  }));
  const allowed = decisions.filter((item) => item.decision.allowed).map((item) => item.action);
  const unavailable = [
    ...new Set(decisions.flatMap((item) => (item.decision.allowed ? [] : [item.decision.message]))),
  ];
  const fullName = `${account.firstName} ${account.lastName}`;

  return (
    <>
      <div className="flex flex-col gap-2">
        <Link href="/personnel/comptes" className="inline-flex items-center gap-1 text-sm font-medium text-slate-500 hover:text-primary">
          <ArrowLeft className="h-4 w-4" aria-hidden="true" />
          Retour à la liste
        </Link>
        <h1 className="flex flex-wrap items-center gap-3 font-serif text-2xl font-semibold text-primary">
          {fullName}
          <AccountStatusBadge status={account.status} />
          {account.staffAssignments.map((assignment) => (
            <Badge key={assignment.role} variant="primary">
              {STAFF_ROLE_LABELS[assignment.role]}
            </Badge>
          ))}
        </h1>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Card title="Informations du compte">
          <dl className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field label="Email">{account.email}</Field>
            <Field label="Nom d'utilisateur">@{account.username}</Field>
            <Field label="Matricule">{account.matricule ?? '—'}</Field>
            <Field label="Rôle">{USER_ROLE_LABELS[account.role]}</Field>
            <Field label="Département">{account.officialDepartment?.name ?? account.department ?? '—'}</Field>
            <Field label="Carte de bibliothèque">{account.libraryCard ?? '—'}</Field>
            <Field label="Inscription sur le site">{formatDate(account.createdAt)}</Field>
            <Field label="Dernière modification">{formatDateTime(account.updatedAt)}</Field>
          </dl>
        </Card>

        <Card title="Inscription à la bibliothèque">
          {member ? (
            <dl className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Field label="Inscription">
                <Badge variant={memberValid ? 'success' : 'danger'}>{memberValid ? 'En règle' : 'Inactive ou expirée'}</Badge>
              </Field>
              <Field label="Active dans le logiciel">{member.inscriptionActive ? 'Oui' : 'Non'}</Field>
              <Field label="Expiration">{member.dateExpiration ? formatDate(member.dateExpiration) : 'Aucune'}</Field>
              <Field label="Dernière synchronisation">{formatDateTime(member.syncedAt)}</Field>
              <Field label="Département (logiciel)">{member.departement ?? '—'}</Field>
            </dl>
          ) : (
            <p className="text-sm text-slate-500">Aucun membre de la bibliothèque n&rsquo;est lié à ce compte.</p>
          )}
        </Card>
      </div>

      <Card title="Statut et modération">
        <dl className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Statut">
            <AccountStatusBadge status={account.status} />
          </Field>
          {account.status === 'SUSPENDED' ? (
            <Field label="Type de suspension">
              {account.autoSuspendedAt
                ? `Automatique (synchronisation, le ${formatDateTime(account.autoSuspendedAt)}) — levée à la régularisation de l'inscription`
                : 'Manuelle (personnel) — jamais levée par la synchronisation'}
            </Field>
          ) : null}
        </dl>

        <ModerationActions accountId={account.id} accountName={fullName} actions={allowed} />

        {unavailable.length > 0 ? (
          <ul className="list-disc space-y-1 pl-5 text-sm text-slate-500">
            {unavailable.map((message) => (
              <li key={message}>{message}</li>
            ))}
          </ul>
        ) : null}
        {allowed.length === 0 ? (
          <p className="text-sm text-slate-500">
            Aucune action disponible ({ACTIONS.map((action) => MODERATION_ACTION_LABELS[action].toLowerCase()).join(', ')}).
          </p>
        ) : null}
      </Card>

      <section className="flex flex-col gap-3">
        <h2 className="font-serif text-lg font-semibold text-primary">Historique des actions du personnel</h2>
        <AuditTable entries={history.entries} labels={history.labels} emptyMessage="Aucune action du personnel sur ce compte." />
      </section>
    </>
  );
}
