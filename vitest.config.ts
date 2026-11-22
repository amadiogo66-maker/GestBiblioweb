import { randomBytes } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./', import.meta.url)),
    },
  },
  // Runtime JSX automatique (comme Next.js) : permet de rendre les Server Components dans les tests.
  esbuild: { jsx: 'automatic' },
  test: {
    environment: 'node',
    globals: false,
    // Les tests d'intégration partagent la base locale : exécution séquentielle des fichiers.
    fileParallelism: false,
    // Clé aléatoire propre à chaque exécution, uniquement dans l'environnement du processus de test.
    env: { STAFF_MFA_KEY: randomBytes(32).toString('base64') },
  },
});
