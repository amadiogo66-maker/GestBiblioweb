import type { Metadata } from 'next';
import type { ReactElement, ReactNode } from 'react';
import { Container } from '@/components/ui/Container';
import { StaffHeader } from '@/components/staff/StaffHeader';
import { StaffNav } from '@/components/staff/StaffNav';
import { loadStaffPageContext, requireStaffPageIdentity } from '@/lib/staff-page';

// Toujours rendu à la demande : l'accès dépend de la base à chaque requête.
export const dynamic = 'force-dynamic';

const ROBOTS: Metadata['robots'] = { index: false, follow: false, nocache: true, googleBot: { index: false, follow: false } };

/**
 * Les métadonnées sont résolues même quand le layout répond notFound() : le
 * titre ne nomme l'espace que pour le personnel (même lecture mémoïsée).
 */
export async function generateMetadata(): Promise<Metadata> {
  const context = await loadStaffPageContext();

  return { title: context ? 'Espace du personnel - Gest Biblio' : 'Page introuvable - Gest Biblio', robots: ROBOTS };
}

/**
 * Espace du personnel. Accès décidé en relisant la base (affectation ACTIVE) ;
 * sinon notFound() : l'existence de l'espace n'est pas révélée.
 * Ce layout n'exige PAS la double authentification (il enveloppe aussi les
 * pages /personnel/securite) : le groupe (protected) l'exige pour le reste.
 */
export default async function StaffLayout({ children }: { children: ReactNode }): Promise<ReactElement> {
  const context = await requireStaffPageIdentity();

  return (
    <div className="min-h-screen bg-accent">
      <StaffHeader fullName={`${context.user.firstName} ${context.user.lastName}`} roles={context.staffRoles} />
      <StaffNav isAdmin={context.isAdmin} isLibraryStaff={context.isLibraryStaff} verified={context.mfaState === 'verified'} />
      <main className="py-8">
        <Container className="flex flex-col gap-8">{children}</Container>
      </main>
    </div>
  );
}
