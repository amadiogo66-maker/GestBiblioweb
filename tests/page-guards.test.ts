import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { PAGE_GUARD_EXCEPTIONS, checkPageSource, findPageGuardViolations, listProtectedPages } from './helpers/page-guards';

const GUARD = 'requireActiveDashboardUser';
const page = (body: string) => `export default async function Page() {\n${body}\nreturn null;\n}\n`;

describe('garde des pages protégées (projet réel)', () => {
  it('chaque page de (dashboard) et (staff) attend son garde en première instruction', () => {
    expect(findPageGuardViolations(process.cwd())).toEqual([]);
  });

  it('le parcours voit bien toutes les pages attendues', () => {
    const pages = listProtectedPages(process.cwd());

    for (const expected of [
      'app/(dashboard)/tableau-de-bord/page.tsx',
      'app/(dashboard)/emprunts/page.tsx',
      'app/(dashboard)/reservations/page.tsx',
      'app/(dashboard)/profil/page.tsx',
      'app/(dashboard)/notifications/page.tsx',
      'app/(staff)/personnel/(protected)/page.tsx',
      'app/(staff)/personnel/(protected)/comptes/page.tsx',
      'app/(staff)/personnel/(protected)/comptes/[id]/page.tsx',
      'app/(staff)/personnel/(protected)/journal/page.tsx',
      'app/(staff)/personnel/securite/page.tsx',
    ]) {
      expect(pages).toContain(expected);
    }
    expect(pages).toHaveLength(12);
  });

  it('la liste d’exceptions est courte et ne contient aucune page disparue', () => {
    expect(Object.keys(PAGE_GUARD_EXCEPTIONS)).toHaveLength(3);
    for (const file of Object.keys(PAGE_GUARD_EXCEPTIONS)) expect(existsSync(join(process.cwd(), file)), file).toBe(true);
  });
});

describe('le contrôle détecte un oubli', () => {
  const roots: string[] = [];

  afterEach(() => {
    for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
  });

  function fakeProject(files: Record<string, string>): string {
    const root = mkdtempSync(join(tmpdir(), 'page-guards-'));
    roots.push(root);
    mkdirSync(join(root, 'app/(dashboard)'), { recursive: true });
    mkdirSync(join(root, 'app/(staff)'), { recursive: true });
    for (const [file, content] of Object.entries(files)) {
      mkdirSync(dirname(join(root, file)), { recursive: true });
      writeFileSync(join(root, file), content);
    }
    return root;
  }

  it('fichier de page factice sans garde : violation signalée', () => {
    const root = fakeProject({
      'app/(dashboard)/factice/page.tsx': page(`const rows = await prisma.loan.findMany();`),
      'app/(dashboard)/correcte/page.tsx': page(`const user = await ${GUARD}();`),
    });
    const violations = findPageGuardViolations(root);

    expect(violations).toHaveLength(1);
    expect(violations[0]).toContain('app/(dashboard)/factice/page.tsx');
  });

  it('page du personnel factice sans garde : violation signalée', () => {
    const root = fakeProject({ 'app/(staff)/personnel/factice/page.tsx': page(`const rows = await listStaffAccounts();`) });

    expect(findPageGuardViolations(root)).toHaveLength(1);
  });

  it('une page MFA non déclarée ne bénéficie pas de l’exception', () => {
    const root = fakeProject({ 'app/(staff)/personnel/securite/nouvelle/page.tsx': page(`await requireStaffPageIdentity();`) });

    expect(findPageGuardViolations(root)).toHaveLength(1);
  });

  it.each([
    ['lecture avant le garde', `const rows = await prisma.loan.findMany();\nawait ${GUARD}();`],
    ['garde non attendu', `${GUARD}();\nconst rows = await prisma.loan.findMany();`],
    ['garde dans un Promise.all', `const [user, rows] = await Promise.all([${GUARD}(), prisma.loan.findMany()]);`],
    ['garde seulement dans une condition', `if (flag) { await ${GUARD}(); }`],
    ['garde absent', `const value = 1;`],
  ])('%s : refusé', (_label, body) => {
    expect(checkPageSource('page.tsx', page(body), GUARD)).toContain('première instruction');
  });

  it.each([
    ['affecté', `const user = await ${GUARD}();`],
    ['sans affectation', `await ${GUARD}();`],
  ])('garde en première instruction, %s : accepté', (_label, body) => {
    expect(checkPageSource('page.tsx', page(body), GUARD)).toBeNull();
  });
});
