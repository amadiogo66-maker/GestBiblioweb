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

/** Affiche le code d'activation : seule apparition en clair (il est stocké haché). */
export function printActivationCode(code: string): void {
  console.log('');
  console.log("Code d'activation de la double authentification (valable 24 h, affiché UNE seule fois) :");
  console.log(`  ${code}`);
  console.log('À remettre à la personne par un canal distinct de son mot de passe.');
}
