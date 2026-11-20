import { describe, expect, it, vi } from 'vitest';
import {
  loadDepartmentIndex,
  lookupDepartmentId,
  normalizeDepartmentName,
  resolveDepartmentId,
  resolveDepartmentIds,
  type DepartmentIndexSource,
} from '@/lib/departments';
import { UL_DEPARTMENT_ALIASES, UL_STRUCTURE, UL_STRUCTURE_COUNTS } from '@/prisma/data/ul-structure';

const departments = UL_STRUCTURE.flatMap((faculty) => faculty.departments);
const programs = departments.flatMap((department) => department.programs);

/** Base simulée à partir du fichier officiel : id = "id-" + slug. */
function fakeDb(): DepartmentIndexSource & { calls: () => number[] } {
  const departmentFindMany = vi.fn(async () =>
    departments.map((department) => ({ id: `id-${department.slug}`, slug: department.slug, name: department.name }))
  );
  const aliasFindMany = vi.fn(async () =>
    UL_DEPARTMENT_ALIASES.map((alias) => ({ normalized: alias.normalized, departmentId: `id-${alias.departmentSlug}` }))
  );

  return {
    department: { findMany: departmentFindMany },
    departmentAlias: { findMany: aliasFindMany },
    calls: () => [departmentFindMany.mock.calls.length, aliasFindMany.mock.calls.length],
  } as unknown as DepartmentIndexSource & { calls: () => number[] };
}

describe('normalizeDepartmentName', () => {
  it.each([
    ['Mathématiques', 'mathematiques'],
    ['MATHÉMATIQUES', 'mathematiques'],
    ['  mathématiques   ', 'mathematiques'],
    ['Département de Mathématiques', 'mathematiques'],
    ['département du Droit', 'droit'],
    ["Département d'Informatique", 'informatique'],
    ['Département d’Informatique', 'informatique'],
    ['Département Informatique', 'informatique'],
    ['Physique-Chimie', 'physique chimie'],
    ['Sciences   pour l’Ingénieur', 'sciences pour l ingenieur'],
    ['Économie Sociale  et Solidaire', 'economie sociale et solidaire'],
  ])('%s → %s', (input, expected) => {
    expect(normalizeDepartmentName(input)).toBe(expected);
  });
});

describe('résolveur de départements', () => {
  it('résout accents, casse, espaces, préfixe, slug et alias', async () => {
    const index = await loadDepartmentIndex(fakeDb());

    expect(lookupDepartmentId(index, 'mathematiques')).toBe('id-mathematiques');
    expect(lookupDepartmentId(index, '  ÉCONOMIE ')).toBe('id-economie');
    expect(lookupDepartmentId(index, 'Département de Mathématiques')).toBe('id-mathematiques');
    expect(lookupDepartmentId(index, 'physique-chimie')).toBe('id-physique-chimie');
    expect(lookupDepartmentId(index, 'sciences-pour-l-ingenieur')).toBe('id-sciences-pour-l-ingenieur');
    expect(lookupDepartmentId(index, 'Physique')).toBe('id-physique-chimie');
    expect(lookupDepartmentId(index, 'Chimie')).toBe('id-physique-chimie');
    expect(lookupDepartmentId(index, 'Maths')).toBe('id-mathematiques');
    expect(lookupDepartmentId(index, 'math')).toBe('id-mathematiques');
  });

  it('inconnu, vide ou absent : null, sans erreur (aucun alias non validé)', async () => {
    const index = await loadDepartmentIndex(fakeDb());

    for (const value of ['Lettres', 'Médecine', 'Département de', '---', '', null, undefined]) {
      expect(lookupDepartmentId(index, value)).toBeNull();
    }
    await expect(resolveDepartmentId(fakeDb(), 'Astronomie')).resolves.toBeNull();
  });

  it('par lot : index chargé une seule fois, quel que soit le nombre de valeurs', async () => {
    const db = fakeDb();
    const values = Array.from({ length: 200 }, (_, index) => (index % 2 ? 'Informatique' : `Inconnu ${index}`));
    const resolved = await resolveDepartmentIds(db, values);

    expect(db.calls()).toEqual([1, 1]);
    expect(resolved.get('Informatique')).toBe('id-informatique');
    expect(resolved.get('Inconnu 0')).toBeNull();
  });
});

describe('fichier officiel ul-structure', () => {
  it('contient 4 facultés, 18 départements, 64 programmes', () => {
    expect(UL_STRUCTURE).toHaveLength(4);
    expect(departments).toHaveLength(18);
    expect(programs).toHaveLength(64);
    expect(UL_STRUCTURE_COUNTS).toEqual({ faculties: 4, departments: 18, programs: 64 });
  });

  it('slugs figés : format sûr et uniques (faculté, département, programme par département)', () => {
    const slugPattern = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
    const all = [...UL_STRUCTURE.map((f) => f.slug), ...departments.map((d) => d.slug)];

    for (const slug of [...all, ...programs.map((p) => p.slug)]) expect(slug).toMatch(slugPattern);
    expect(new Set(UL_STRUCTURE.map((f) => f.slug)).size).toBe(4);
    expect(new Set(departments.map((d) => d.slug)).size).toBe(18);
    for (const department of departments) {
      expect(new Set(department.programs.map((p) => p.slug)).size).toBe(department.programs.length);
    }
  });

  it('noms de départements courts et niveau cohérent avec le libellé', () => {
    for (const department of departments) expect(department.name).not.toMatch(/^D[ée]partement\b/i);
    for (const program of programs) {
      const expected = program.name.startsWith('Licence Fondamentale en ')
        ? 'LICENCE_FONDAMENTALE'
        : program.name.startsWith('DUT en ')
          ? 'DUT'
          : 'LICENCE';
      expect(program.level, program.name).toBe(expected);
    }
  });

  it('alias : exactement les 4 validés, déjà normalisés, sans collision avec un département', () => {
    expect(UL_DEPARTMENT_ALIASES.map((a) => `${a.normalized}→${a.departmentSlug}`)).toEqual([
      'physique→physique-chimie',
      'chimie→physique-chimie',
      'maths→mathematiques',
      'math→mathematiques',
    ]);
    const departmentKeys = new Set(departments.flatMap((d) => [normalizeDepartmentName(d.name), normalizeDepartmentName(d.slug)]));
    for (const alias of UL_DEPARTMENT_ALIASES) {
      expect(normalizeDepartmentName(alias.normalized)).toBe(alias.normalized);
      expect(departmentKeys.has(alias.normalized)).toBe(false);
    }
    // Deux départements ne doivent jamais partager une même clé normalisée.
    expect(new Set(departments.map((d) => normalizeDepartmentName(d.name))).size).toBe(18);
  });
});
