import { prisma } from '@/lib/prisma';
import { assertLocalDatabaseUrl } from './database-guard';

/**
 * Garde-fou des tests d'intégration. Prisma charge .env à l'import mais ne se
 * connecte qu'à la première requête : ce contrôle s'exécute au chargement du
 * module, donc AVANT toute connexion ou écriture. Si l'hôte n'est pas
 * localhost/127.0.0.1, l'import échoue et le fichier de test échoue
 * explicitement (aucun test n'est silencieusement ignoré).
 */
assertLocalDatabaseUrl(process.env.DATABASE_URL);

export { prisma };
