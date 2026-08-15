import { redirect } from 'next/navigation';
import type { ReactElement } from 'react';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { ensureLibraryCard } from '@/lib/library-card';
import { getCatalogueMetadata } from '@/lib/catalogue-data';
import { ProfileForm } from '@/components/dashboard/ProfileForm';
import { ChangePasswordForm } from '@/components/dashboard/ChangePasswordForm';
import { LibraryCard } from '@/components/dashboard/LibraryCard';

export const dynamic = 'force-dynamic';

export default async function ProfilPage(): Promise<ReactElement> {
  const session = await auth();

  if (!session?.user) {
    redirect('/connexion');
  }

  const [profile, card, metadata] = await Promise.all([
    prisma.user.findUniqueOrThrow({
      where: { id: session.user.id },
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
    ensureLibraryCard(session.user.id),
    getCatalogueMetadata(),
  ]);

  return (
    <div className="flex flex-col gap-8">
      <div>
        <h1 className="font-serif text-2xl font-semibold text-primary">Mon profil</h1>
        <p className="mt-1 text-sm text-slate-500">Gérez vos informations personnelles et votre sécurité.</p>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="flex flex-col gap-6 lg:col-span-2">
          <ProfileForm profile={profile} departments={metadata.departments} />
          <ChangePasswordForm />
        </div>
        <LibraryCard card={card} />
      </div>
    </div>
  );
}
