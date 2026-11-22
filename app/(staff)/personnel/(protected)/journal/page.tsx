import Link from 'next/link';
import type { ReactElement } from 'react';
import { AuditTable } from '@/components/staff/AuditTable';
import { Pagination } from '@/components/shared/Pagination';
import { Button } from '@/components/ui/Button';
import { requireStaffPage } from '@/lib/staff-page';
import { listAuditLog } from '@/lib/staff-data';
import { buildListHref } from '@/lib/list-url';
import { auditLogQuerySchema, flattenSearchParams } from '@/schemas/staff';

export const dynamic = 'force-dynamic';

interface JournalPageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

const FIELD_CLASS =
  'w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20';

/** Journal d'audit, LECTURE SEULE, réservé aux administrateurs (vérifié en base). */
export default async function StaffJournalPage({ searchParams }: JournalPageProps): Promise<ReactElement> {
  await requireStaffPage('ADMIN');
  const query = auditLogQuerySchema.parse(flattenSearchParams(await searchParams));
  const { entries, labels, total, totalPages } = await listAuditLog(query);
  const filters = { action: query.action, actor: query.actor, from: query.from, to: query.to };

  return (
    <>
      <div>
        <h1 className="font-serif text-2xl font-semibold text-primary">Journal d&rsquo;audit</h1>
        <p className="mt-1 text-sm text-slate-500">
          Lecture seule — {total} entrée{total > 1 ? 's' : ''}. Dates à l&rsquo;heure de Conakry (UTC).
        </p>
      </div>

      <form method="get" action="/personnel/journal" className="grid grid-cols-1 gap-3 rounded-xl border border-slate-200 bg-white p-4 sm:grid-cols-2 lg:grid-cols-4">
        <label className="flex flex-col gap-1 text-sm font-medium text-slate-700">
          Action (préfixe)
          <input name="action" defaultValue={query.action ?? ''} placeholder="ex. staff.account" maxLength={60} className={FIELD_CLASS} />
        </label>
        <label className="flex flex-col gap-1 text-sm font-medium text-slate-700">
          Acteur (email ou identifiant)
          <input name="actor" defaultValue={query.actor ?? ''} maxLength={100} className={FIELD_CLASS} />
        </label>
        <label className="flex flex-col gap-1 text-sm font-medium text-slate-700">
          Du
          <input type="date" name="from" defaultValue={query.from ?? ''} className={FIELD_CLASS} />
        </label>
        <label className="flex flex-col gap-1 text-sm font-medium text-slate-700">
          Au
          <input type="date" name="to" defaultValue={query.to ?? ''} className={FIELD_CLASS} />
        </label>
        <div className="flex flex-wrap items-center gap-3 sm:col-span-2 lg:col-span-4">
          <Button type="submit" variant="primary" size="sm">
            Filtrer
          </Button>
          <Link href="/personnel/journal" className="text-sm font-medium text-slate-500 hover:text-primary">
            Réinitialiser
          </Link>
        </div>
      </form>

      <AuditTable entries={entries} labels={labels} showIp emptyMessage="Aucune entrée ne correspond à ces critères." />

      <Pagination
        page={Math.min(query.page, totalPages)}
        totalPages={totalPages}
        total={total}
        buildHref={(page) => buildListHref('/personnel/journal', { ...filters, page })}
      />
    </>
  );
}
