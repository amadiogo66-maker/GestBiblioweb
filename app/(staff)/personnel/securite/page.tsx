import type { ReactElement } from 'react';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { RegenerateRecoveryCodesForm } from '@/components/staff/mfa/RegenerateRecoveryCodesForm';
import { prisma } from '@/lib/prisma';
import { formatDateTime } from '@/lib/audit-format';
import { MFA_ROUTES } from '@/lib/staff-mfa-session';
import { countRemainingRecoveryCodes } from '@/lib/staff-mfa-store';
import { requireStaffPageIdentity } from '@/lib/staff-page';

export const dynamic = 'force-dynamic';

/** État de la double authentification. Le secret n'est jamais réaffiché. */
export default async function StaffSecurityPage(): Promise<ReactElement> {
  const context = await requireStaffPageIdentity();
  const remaining = context.mfaState === 'verified' ? await countRemainingRecoveryCodes(prisma, context.user.id) : 0;

  return (
    <>
      <div>
        <h1 className="font-serif text-2xl font-semibold text-primary">Sécurité</h1>
        <p className="mt-1 text-sm text-slate-500">La double authentification est obligatoire pour l&rsquo;espace du personnel.</p>
      </div>

      <section className="flex flex-col gap-4 rounded-xl border border-slate-200 bg-white p-5">
        <h2 className="font-serif text-lg font-semibold text-primary">Double authentification</h2>

        {context.mfaState === 'not_enrolled' ? (
          <>
            <Badge variant="danger" className="w-fit">Non activée</Badge>
            <p className="text-sm text-slate-600">Vous avez besoin du code d&rsquo;activation remis par l&rsquo;administrateur.</p>
            <Button href={MFA_ROUTES.activation} variant="primary" size="sm" className="w-fit">Activer</Button>
          </>
        ) : null}

        {context.mfaState === 'not_verified' ? (
          <>
            <Badge variant="new" className="w-fit">Vérification requise</Badge>
            <Button href={MFA_ROUTES.verification} variant="primary" size="sm" className="w-fit">Vérifier mon identité</Button>
          </>
        ) : null}

        {context.mfaState === 'verified' ? (
          <>
            <Badge variant="success" className="w-fit">Activée</Badge>
            <dl className="grid grid-cols-1 gap-3 text-sm sm:grid-cols-2">
              <div>
                <dt className="text-slate-500">Activée le</dt>
                <dd className="font-medium text-slate-800">{context.mfaEnabledAt ? formatDateTime(context.mfaEnabledAt) : '—'}</dd>
              </div>
              <div>
                <dt className="text-slate-500">Codes de secours restants</dt>
                <dd className="font-medium text-slate-800">{remaining}</dd>
              </div>
            </dl>
            <RegenerateRecoveryCodesForm />
          </>
        ) : null}
      </section>
    </>
  );
}
