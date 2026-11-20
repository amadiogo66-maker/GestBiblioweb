import type { PrismaClient } from '@prisma/client';

/**
 * Résolution d'un libellé de département (texte libre : catalogue, membres,
 * utilisateurs) vers un département officiel. Rien ici n'est encore utilisé
 * par l'affichage du site : les colonnes texte restent la source de lecture.
 */

/** Client minimal requis : un PrismaClient ou un client de transaction convient. */
export type DepartmentIndexSource = Pick<PrismaClient, 'department' | 'departmentAlias'>;

/** Index normalisé → identifiant de département. */
export type DepartmentIndex = ReadonlyMap<string, string>;

const DEPARTMENT_PREFIX = /^departement(?: (?:de|du|d))? /;

/**
 * Forme canonique d'un libellé : minuscules, sans accents, ponctuation et
 * espaces multiples ramenés à un seul espace, préfixe « Département de / du /
 * d' » retiré. Ex. « Département d'Informatique » → « informatique ».
 */
export function normalizeDepartmentName(value: string): string {
  const cleaned = value
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();

  return cleaned.replace(DEPARTMENT_PREFIX, '').trim();
}

/**
 * Charge l'index en DEUX requêtes au total (départements + alias), quel que
 * soit le nombre de libellés à résoudre ensuite. Clés : nom normalisé, slug
 * normalisé, alias.
 */
export async function loadDepartmentIndex(db: DepartmentIndexSource): Promise<DepartmentIndex> {
  const [departments, aliases] = await Promise.all([
    db.department.findMany({ select: { id: true, slug: true, name: true } }),
    db.departmentAlias.findMany({ select: { normalized: true, departmentId: true } }),
  ]);
  const index = new Map<string, string>();

  for (const department of departments) {
    index.set(normalizeDepartmentName(department.name), department.id);
    index.set(normalizeDepartmentName(department.slug), department.id);
  }

  for (const alias of aliases) {
    index.set(normalizeDepartmentName(alias.normalized), alias.departmentId);
  }

  return index;
}

/** Résolution pure sur un index déjà chargé. Inconnu ou vide : null, jamais d'erreur. */
export function lookupDepartmentId(index: DepartmentIndex, value: string | null | undefined): string | null {
  if (!value) {
    return null;
  }

  const key = normalizeDepartmentName(value);

  return key ? index.get(key) ?? null : null;
}

/**
 * Version par lot : l'index est chargé une seule fois pour toutes les valeurs.
 * Renvoie une table libellé brut → identifiant (ou null si inconnu).
 */
export async function resolveDepartmentIds(
  db: DepartmentIndexSource,
  values: ReadonlyArray<string | null | undefined>
): Promise<Map<string, string | null>> {
  const index = await loadDepartmentIndex(db);
  const resolved = new Map<string, string | null>();

  for (const value of values) {
    if (value && !resolved.has(value)) {
      resolved.set(value, lookupDepartmentId(index, value));
    }
  }

  return resolved;
}

/** Résolution d'un seul libellé. Pour plusieurs, utiliser resolveDepartmentIds. */
export async function resolveDepartmentId(
  db: DepartmentIndexSource,
  value: string | null | undefined
): Promise<string | null> {
  if (!value) {
    return null;
  }

  return (await resolveDepartmentIds(db, [value])).get(value) ?? null;
}
