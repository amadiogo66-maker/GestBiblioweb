import Link from 'next/link';
import type { ReactElement } from 'react';
import { auditActionLabel, auditActorId, auditTargetId, formatDateTime, isCliAction, summarizeAuditDetails } from '@/lib/audit-format';

export interface AuditRow {
  id: string;
  action: string;
  userId: string | null;
  details: unknown;
  createdAt: Date;
  ipAddress?: string | null;
}

interface AuditTableProps {
  entries: AuditRow[];
  labels: Map<string, { name: string; email: string }>;
  /** L'adresse IP n'est affichée que dans le journal (administrateurs). */
  showIp?: boolean;
  emptyMessage: string;
}

function UserCell({ id, labels }: { id: string | null; labels: AuditTableProps['labels'] }): ReactElement {
  if (!id) return <span className="text-slate-400">—</span>;

  const label = labels.get(id);

  return (
    <Link href={`/personnel/comptes/${id}`} className="text-primary hover:underline">
      {label?.name ?? 'Compte supprimé'}
      {label ? <span className="block text-xs text-slate-500">{label.email}</span> : null}
    </Link>
  );
}

/** Journal en LECTURE SEULE : aucune action d'édition ni de suppression. */
export function AuditTable({ entries, labels, showIp = false, emptyMessage }: AuditTableProps): ReactElement {
  if (entries.length === 0) {
    return <p className="rounded-xl border border-dashed border-slate-300 bg-white p-6 text-sm text-slate-500">{emptyMessage}</p>;
  }

  return (
    <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
      <table className="w-full min-w-[640px] text-left text-sm">
        <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
          <tr>
            <th scope="col" className="px-4 py-3">Date</th>
            <th scope="col" className="px-4 py-3">Acteur</th>
            <th scope="col" className="px-4 py-3">Action</th>
            <th scope="col" className="px-4 py-3">Cible</th>
            <th scope="col" className="px-4 py-3">Résumé</th>
            {showIp ? <th scope="col" className="px-4 py-3">Adresse IP</th> : null}
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {entries.map((entry) => {
            const summary = summarizeAuditDetails(entry.details);

            return (
              <tr key={entry.id} className="align-top">
                <td className="whitespace-nowrap px-4 py-3 text-slate-600">{formatDateTime(entry.createdAt)}</td>
                <td className="px-4 py-3">
                  {isCliAction(entry.action) ? (
                    <span className="text-slate-600">Script d&rsquo;administration</span>
                  ) : (
                    <UserCell id={auditActorId(entry)} labels={labels} />
                  )}
                </td>
                <td className="px-4 py-3">
                  <span className="font-medium text-slate-800">{auditActionLabel(entry.action)}</span>
                  <span className="block font-mono text-xs text-slate-400">{entry.action}</span>
                </td>
                <td className="px-4 py-3">
                  <UserCell id={auditTargetId(entry)} labels={labels} />
                </td>
                <td className="px-4 py-3 text-slate-600">
                  {summary.length === 0 ? (
                    '—'
                  ) : (
                    <dl className="space-y-0.5">
                      {summary.map((item) => (
                        <div key={item.label} className="flex flex-wrap gap-1">
                          <dt className="text-slate-500">{item.label} :</dt>
                          <dd className="break-words">{item.value}</dd>
                        </div>
                      ))}
                    </dl>
                  )}
                </td>
                {showIp ? <td className="whitespace-nowrap px-4 py-3 font-mono text-xs text-slate-500">{entry.ipAddress ?? '—'}</td> : null}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
