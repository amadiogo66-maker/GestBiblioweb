import Link from 'next/link';
import type { ReactElement } from 'react';
import { AccountsTable } from '@/components/staff/AccountsTable';
import { Pagination } from '@/components/shared/Pagination';
import { Button } from '@/components/ui/Button';
import { requireStaffPage } from '@/lib/staff-page';
import { getDepartmentOptions, listStaffAccounts } from '@/lib/staff-data';
import { buildListHref } from '@/lib/list-url';
import { ACCOUNT_STATUSES, ACCOUNT_STATUS_LABELS, USER_ROLES, USER_ROLE_LABELS } from '@/lib/staff-labels';
import { flattenSearchParams, staffAccountsQuerySchema } from '@/schemas/staff';

export const dynamic = 'force-dynamic';

interface AccountsPageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

const FIELD_CLASS =
  'w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20';

export default async function StaffAccountsPage({ searchParams }: AccountsPageProps): Promise<ReactElement> {
  await requireStaffPage();
  const query = staffAccountsQuerySchema.parse(flattenSearchParams(await searchParams));
  const [{ accounts, total, totalPages }, departments] = await Promise.all([listStaffAccounts(query), getDepartmentOptions()]);
  const filters = { q: query.q, status: query.status, role: query.role, departmentId: query.departmentId };

  return (
    <>
      <div>
        <h1 className="font-serif text-2xl font-semibold text-primary">Comptes</h1>
        <p className="mt-1 text-sm text-slate-500">
          {total} compte{total > 1 ? 's' : ''} trouvé{total > 1 ? 's' : ''}.
        </p>
      </div>

      {/* Formulaire GET : les filtres vivent dans l'URL (partageables, sans JavaScript). */}
      <form method="get" action="/personnel/comptes" className="grid grid-cols-1 gap-3 rounded-xl border border-slate-200 bg-white p-4 sm:grid-cols-2 lg:grid-cols-5">
        <label className="flex flex-col gap-1 text-sm font-medium text-slate-700 lg:col-span-2">
          Recherche
          <input
            type="search"
            name="q"
            defaultValue={query.q ?? ''}
            placeholder="Nom, email, identifiant, matricule"
            maxLength={100}
            className={FIELD_CLASS}
          />
        </label>
        <label className="flex flex-col gap-1 text-sm font-medium text-slate-700">
          Statut
          <select name="status" defaultValue={query.status ?? ''} className={FIELD_CLASS}>
            <option value="">Tous</option>
            {ACCOUNT_STATUSES.map((status) => (
              <option key={status} value={status}>
                {ACCOUNT_STATUS_LABELS[status]}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-sm font-medium text-slate-700">
          Rôle
          <select name="role" defaultValue={query.role ?? ''} className={FIELD_CLASS}>
            <option value="">Tous</option>
            {USER_ROLES.map((role) => (
              <option key={role} value={role}>
                {USER_ROLE_LABELS[role]}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-sm font-medium text-slate-700">
          Département
          <select name="departmentId" defaultValue={query.departmentId ?? ''} className={FIELD_CLASS}>
            <option value="">Tous</option>
            {departments.map((department) => (
              <option key={department.id} value={department.id}>
                {department.name}
              </option>
            ))}
          </select>
        </label>
        <div className="flex flex-wrap items-center gap-3 sm:col-span-2 lg:col-span-5">
          <Button type="submit" variant="primary" size="sm">
            Filtrer
          </Button>
          <Link href="/personnel/comptes" className="text-sm font-medium text-slate-500 hover:text-primary">
            Réinitialiser
          </Link>
        </div>
      </form>

      <AccountsTable accounts={accounts} emptyMessage="Aucun compte ne correspond à ces critères." />

      <Pagination
        page={Math.min(query.page, totalPages)}
        totalPages={totalPages}
        total={total}
        buildHref={(page) => buildListHref('/personnel/comptes', { ...filters, page })}
      />
    </>
  );
}
