import { describe, expect, it } from 'vitest';
import { assertLocalDatabaseUrl } from './helpers/database-guard';

describe('garde-fou base locale des tests', () => {
  it.each([
    'postgresql://u:p@localhost:5433/gestbiblio?schema=public',
    'postgresql://u:p@127.0.0.1:5432/gestbiblio',
  ])('accepte %s', (url) => {
    expect(() => assertLocalDatabaseUrl(url)).not.toThrow();
  });

  it('refuse un hôte distant (ex. Neon) sans afficher les identifiants', () => {
    const url = 'postgresql://user:motdepasse@ep-xxx-pooler.us-east-1.aws.neon.tech/neondb?sslmode=require';

    expect(() => assertLocalDatabaseUrl(url)).toThrow(/ep-xxx-pooler\.us-east-1\.aws\.neon\.tech/);
    expect(() => assertLocalDatabaseUrl(url)).not.toThrow(/motdepasse/);
  });

  it.each([
    ['un hôte qui imite localhost', 'postgresql://u:p@localhost.example.com:5432/db'],
    ['une IP non locale', 'postgresql://u:p@10.0.0.5:5432/db'],
    ['une URL illisible', 'pas-une-url'],
    ['une URL vide', ''],
    ['une URL absente', undefined],
  ])('refuse %s', (_label, url) => {
    expect(() => assertLocalDatabaseUrl(url)).toThrow(/Tests refusés/);
  });
});
