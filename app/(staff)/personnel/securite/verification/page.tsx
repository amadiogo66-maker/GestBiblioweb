import { redirect } from 'next/navigation';
import type { ReactElement } from 'react';
import { VerifyForm } from '@/components/staff/mfa/VerifyForm';
import { MFA_ROUTES } from '@/lib/staff-mfa-session';
import { requireStaffPageIdentity } from '@/lib/staff-page';

export const dynamic = 'force-dynamic';

export default async function StaffMfaVerificationPage(): Promise<ReactElement> {
  const context = await requireStaffPageIdentity();

  if (context.mfaState === 'not_enrolled') {
    redirect(MFA_ROUTES.activation);
  }

  if (context.mfaState === 'verified') {
    redirect('/personnel');
  }

  return (
    <section className="mx-auto flex w-full max-w-lg flex-col gap-5 rounded-xl border border-slate-200 bg-white p-5 sm:p-6">
      <div>
        <h1 className="font-serif text-2xl font-semibold text-primary">Vérification</h1>
        <p className="mt-1 text-sm text-slate-500">Saisissez le code de votre application d&rsquo;authentification.</p>
      </div>
      <VerifyForm />
    </section>
  );
}
