import type { ReactElement } from 'react';
import { requireActiveDashboardUser } from '@/lib/dashboard-access';
import { prisma } from '@/lib/prisma';
import { ensureLibraryCard } from '@/lib/library-card';
import { ProfileForm } from '@/components/dashboard/ProfileForm';
import { ChangePasswordForm } from '@/components/dashboard/ChangePasswordForm';
import { LibraryCard } from '@/components/dashboard/LibraryCard';

export const dynamic = 'force-dynamic';

export default async function ProfilPage(): Promise<ReactElement> {
  // Avant toute lecture : le layout s'exécute en parallèle et ne protège pas seul.
  const user = await requireActiveDashboardUser();

  const [profile, card] = await Promise.all([
    prisma.user.findUniqueOrThrow({
      where: { id: user.id },
      select: {
        email: true,
        username: true,
        firstName: true,
        lastName: true,
        role: true,
        department: true,
        photo: true,
      },
    }),
    ensureLibraryCard(user.id),
  ]);

  return (
    <div className="flex flex-col gap-8">
      <div>
        <h1 className="font-serif text-2xl font-semibold text-primary">Mon profil</h1>
        <p className="mt-1 text-sm text-slate-500">Gérez vos informations personnelles et votre sécurité.</p>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="flex flex-col gap-6 lg:col-span-2">
          <ProfileForm profile={profile} />
          <ChangePasswordForm />
        </div>
        <LibraryCard card={card} />
      </div>
    </div>
  );
}
