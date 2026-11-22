import { CIRCULATION_CONTACT_KEY } from '@/lib/circulation-status';
import { prisma } from './local-db';

interface ContactSnapshot {
  value: unknown;
  updatedAt: Date;
}

/** Mémorise le « dernier contact » local pour le rétablir après les tests. */
export async function snapshotCirculationContact(): Promise<ContactSnapshot | null> {
  return prisma.siteSetting.findUnique({ where: { key: CIRCULATION_CONTACT_KEY }, select: { value: true, updatedAt: true } });
}

export async function restoreCirculationContact(snapshot: ContactSnapshot | null): Promise<void> {
  await prisma.siteSetting.deleteMany({ where: { key: CIRCULATION_CONTACT_KEY } });

  if (snapshot) {
    await prisma.$executeRaw`
      INSERT INTO "SiteSetting" ("id", "key", "value", "updatedAt")
      VALUES (${`restored-${Date.now()}`}, ${CIRCULATION_CONTACT_KEY}, ${JSON.stringify(snapshot.value)}::jsonb, ${snapshot.updatedAt})
    `;
  }
}
