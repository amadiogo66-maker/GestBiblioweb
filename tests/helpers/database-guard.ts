const LOCAL_HOSTS = ['localhost', '127.0.0.1'];

/**
 * Lève une erreur si l'URL ne désigne pas une base locale (hôte exactement
 * localhost ou 127.0.0.1). Fonction pure, sans effet de bord : testable seule.
 * Une URL absente ou illisible est refusée aussi.
 */
export function assertLocalDatabaseUrl(rawUrl: string | undefined): void {
  if (!rawUrl) {
    throw new Error('Tests refusés : DATABASE_URL non définie (base locale requise).');
  }

  let hostname: string;

  try {
    hostname = new URL(rawUrl).hostname;
  } catch {
    throw new Error('Tests refusés : DATABASE_URL illisible (base locale requise).');
  }

  if (!LOCAL_HOSTS.includes(hostname)) {
    // Seul l'hôte est affiché, jamais l'URL complète (identifiants).
    throw new Error(`Tests refusés : la base visée (${hostname}) n'est ni localhost ni 127.0.0.1.`);
  }
}
