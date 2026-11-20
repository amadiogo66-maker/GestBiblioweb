import { execFileSync } from 'node:child_process';
import { join } from 'node:path';

/**
 * Exécute un script TypeScript du projet (comme `npm run …`) dans un processus
 * séparé, avec l'environnement courant. À n'appeler qu'APRÈS le garde-fou
 * local-db : DATABASE_URL a alors été vérifiée (localhost).
 */
export function runTsScript(relativePath: string, args: string[] = []): string {
  const tsxCli = join(process.cwd(), 'node_modules', 'tsx', 'dist', 'cli.mjs');

  return execFileSync(process.execPath, [tsxCli, relativePath, ...args], {
    cwd: process.cwd(),
    env: process.env,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });
}
