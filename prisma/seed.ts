import { PrismaClient } from '@prisma/client';
import { logger } from '../lib/logger';

const prisma = new PrismaClient();

async function main(): Promise<void> {
  await prisma.siteSetting.upsert({
    where: { key: 'app_name' },
    update: { value: 'Gest Biblio' },
    create: { key: 'app_name', value: 'Gest Biblio' },
  });

  await prisma.siteSetting.upsert({
    where: { key: 'university_name' },
    update: { value: 'Université de Labé' },
    create: { key: 'university_name', value: 'Université de Labé' },
  });
}

main()
  .catch((error: unknown) => {
    logger.error('Seed failed', { error: error instanceof Error ? error.message : 'unknown error' });
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
