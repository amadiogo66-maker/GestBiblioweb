import Link from 'next/link';
import type { ReactElement } from 'react';
import { AccountStatusBadge } from '@/components/staff/AccountStatusBadge';
import { USER_ROLE_LABELS } from '@/lib/staff-labels';
import { formatDate } from '@/lib/utils';
import type { AccountListItem } from '@/lib/staff-data';

interface AccountsTableProps {
  accounts: AccountListItem[];
  emptyMessage: string;
}

/** Département affiché : nom officiel si rattaché, sinon texte reçu de la bibliothèque. */
function departmentLabel(account: AccountListItem): string {
  return account.officialDepartment?.name ?? account.department ?? '—';
}

export function AccountsTable({ accounts, emptyMessage }: AccountsTableProps): ReactElement {
  if (accounts.length === 0) {
    return <p className="rounded-xl border border-dashed border-slate-300 bg-white p-6 text-sm text-slate-500">{emptyMessage}</p>;
  }

  return (
    <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
      <table className="w-full min-w-[640px] text-left text-sm">
        <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
          <tr>
            <th scope="col" className="px-4 py-3">Nom</th>
            <th scope="col" className="px-4 py-3">Email</th>
            <th scope="col" className="px-4 py-3">Matricule</th>
            <th scope="col" className="px-4 py-3">Rôle</th>
            <th scope="col" className="px-4 py-3">Statut</th>
            <th scope="col" className="px-4 py-3">Département</th>
            <th scope="col" className="px-4 py-3">Inscription</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {accounts.map((account) => (
            <tr key={account.id} className="align-top">
              <td className="px-4 py-3 font-medium">
                <Link href={`/personnel/comptes/${account.id}`} className="text-primary hover:underline">
                  {account.lastName} {account.firstName}
                </Link>
                <span className="block text-xs text-slate-500">@{account.username}</span>
              </td>
              <td className="break-all px-4 py-3 text-slate-600">{account.email}</td>
              <td className="px-4 py-3 text-slate-600">{account.matricule ?? '—'}</td>
              <td className="px-4 py-3 text-slate-600">{USER_ROLE_LABELS[account.role]}</td>
              <td className="px-4 py-3">
                <AccountStatusBadge status={account.status} />
              </td>
              <td className="px-4 py-3 text-slate-600">{departmentLabel(account)}</td>
              <td className="whitespace-nowrap px-4 py-3 text-slate-600">{formatDate(account.createdAt)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
