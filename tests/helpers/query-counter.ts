import { vi } from 'vitest';
import { Prisma } from '@prisma/client';
import { prisma } from './local-db';

const METHODS = ['findUnique', 'findUniqueOrThrow', 'findFirst', 'findFirstOrThrow', 'findMany', 'count', 'aggregate', 'groupBy', 'create', 'createMany', 'update', 'updateMany', 'upsert', 'delete', 'deleteMany'] as const;

type Spy = { mock: { calls: unknown[] }; mockRestore: () => void };

/** Compte TOUTES les requêtes Prisma (chaque modèle, chaque méthode, SQL brut) jusqu'à restore(). */
export function countQueries() {
  const spies: Spy[] = [];
  const byName = new Map<string, Spy>();
  const client = prisma as unknown as Record<string, Record<string, unknown>>;

  for (const model of Prisma.dmmf.datamodel.models) {
    const name = model.name[0].toLowerCase() + model.name.slice(1);
    const delegate = client[name];
    for (const method of METHODS) {
      if (typeof delegate?.[method] !== 'function') continue;
      const spy = vi.spyOn(delegate as never, method as never) as unknown as Spy;
      spies.push(spy);
      byName.set(`${name}.${method}`, spy);
    }
  }
  for (const method of ['$executeRaw', '$queryRaw', '$executeRawUnsafe', '$queryRawUnsafe']) spies.push(vi.spyOn(client as never, method as never) as unknown as Spy);

  return {
    total: () => spies.reduce((sum, spy) => sum + spy.mock.calls.length, 0),
    calls: (name: string) => byName.get(name)?.mock.calls.length ?? 0,
    restore: () => spies.forEach((spy) => spy.mockRestore()),
  };
}
