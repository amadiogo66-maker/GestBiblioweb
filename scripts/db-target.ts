/**
 * Utilitaires communs aux scripts d'administration de la base.
 * Prisma charge .env à l'import de @prisma/client (sans écraser une variable
 * déjà définie dans la session) : DATABASE_URL est donc lisible ici avant
 * toute connexion.
 */

/** Hôte, port et base visés — jamais l'utilisateur ni le mot de passe. */
export function describeDatabaseTarget(rawUrl = process.env.DATABASE_URL): string {
  if (!rawUrl) return 'inconnue (DATABASE_URL non définie)';

  try {
    const url = new URL(rawUrl);
    return `${url.hostname}${url.port ? `:${url.port}` : ''}${url.pathname}`;
  } catch {
    return 'illisible (DATABASE_URL invalide)';
  }
}

export function hasFlag(argv: readonly string[], flag: string): boolean {
  return argv.includes(flag);
}
