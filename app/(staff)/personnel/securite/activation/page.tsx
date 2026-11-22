import { redirect } from 'next/navigation';
import type { ReactElement } from 'react';
import { EnrollmentForm } from '@/components/staff/mfa/EnrollmentForm';
import { MFA_ROUTES } from '@/lib/staff-mfa-session';
import { requireStaffPageIdentity } from '@/lib/staff-page';

export const dynamic = 'force-dynamic';

export default async function StaffMfaActivationPage(): Promise<ReactElement> {
  const context = await requireStaffPageIdentity();

  if (context.mfaState !== 'not_enrolled') {
    redirect(MFA_ROUTES.security);
  }

  return (
    <section className="mx-auto flex w-full max-w-lg flex-col gap-5 rounded-xl border border-slate-200 bg-white p-5 sm:p-6">
      <h1 className="font-serif text-2xl font-semibold text-primary">Activer la double authentification</h1>
      <EnrollmentForm />
    </section>
  );
}
