import { readFileSync, readdirSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import ts from 'typescript';

/**
 * Dossiers de pages protégées, relatifs à la racine du projet. Une page reçoit
 * le garde du dossier le PLUS PRÉCIS qui la contient (espace enseignant,
 * espace département), sinon celui de son groupe.
 */
export const PROTECTED_ROOTS: Array<{ directory: string; guard: string }> = [
  { directory: 'app/(dashboard)', guard: 'requireActiveDashboardUser' },
  { directory: 'app/(dashboard)/enseignant', guard: 'requireTeacherPage' },
  { directory: 'app/(staff)', guard: 'requireStaffPage' },
  { directory: 'app/(staff)/personnel/(protected)/departement', guard: 'requireDepartmentManagerPage' },
];

/** Les deux groupes parcourus ; les sous-dossiers ne font que préciser le garde. */
const GROUP_ROOTS = ['app/(dashboard)', 'app/(staff)'];

/** Garde attendu pour une page (chemin relatif en /), dossier le plus précis d'abord. */
export function expectedGuard(name: string): string {
  if (PAGE_GUARD_EXCEPTIONS[name]) return PAGE_GUARD_EXCEPTIONS[name];

  const root = PROTECTED_ROOTS.filter(({ directory }) => name.startsWith(`${directory}/`)).sort((a, b) => b.directory.length - a.directory.length)[0];

  return root?.guard ?? '';
}

/**
 * Exceptions, volontairement courtes : pages qui ont un autre garde.
 * Les pages publiques (dont /compte-bloque) sont hors des dossiers contrôlés.
 */
export const PAGE_GUARD_EXCEPTIONS: Record<string, string> = {
  // Pages MFA : elles doivent rester accessibles AVANT la vérification MFA,
  // mais exigent un compte actif ayant une affectation du personnel.
  'app/(staff)/personnel/securite/page.tsx': 'requireStaffPageIdentity',
  'app/(staff)/personnel/securite/activation/page.tsx': 'requireStaffPageIdentity',
  'app/(staff)/personnel/securite/verification/page.tsx': 'requireStaffPageIdentity',
};

function findPages(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);

    if (entry.isDirectory()) return findPages(path);
    return entry.name === 'page.tsx' ? [path] : [];
  });
}

function defaultExportedFunction(source: ts.SourceFile): ts.FunctionDeclaration | undefined {
  return source.statements.find(
    (statement): statement is ts.FunctionDeclaration =>
      ts.isFunctionDeclaration(statement) &&
      Boolean(statement.modifiers?.some((modifier) => modifier.kind === ts.SyntaxKind.DefaultKeyword))
  );
}

/** L'instruction est-elle exactement `await guard(...)`, seule ou affectée à une variable ? */
function awaitsGuard(statement: ts.Statement, guard: string): boolean {
  let expression: ts.Expression | undefined;

  if (ts.isExpressionStatement(statement)) {
    expression = statement.expression;
  } else if (ts.isVariableStatement(statement) && statement.declarationList.declarations.length === 1) {
    expression = statement.declarationList.declarations[0].initializer;
  }

  return Boolean(
    expression &&
      ts.isAwaitExpression(expression) &&
      ts.isCallExpression(expression.expression) &&
      ts.isIdentifier(expression.expression.expression) &&
      expression.expression.expression.text === guard
  );
}

/** Vérifie que la PREMIÈRE instruction de la page attend le garde. Renvoie le problème, ou null. */
export function checkPageSource(fileName: string, content: string, guard: string): string | null {
  const source = ts.createSourceFile(fileName, content, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const page = defaultExportedFunction(source);

  if (!page?.body) {
    return `${fileName} : aucune fonction exportée par défaut`;
  }

  const first = page.body.statements[0];

  return first && awaitsGuard(first, guard) ? null : `${fileName} : la première instruction doit être « await ${guard}() »`;
}

/** Parcourt les pages protégées sous `root` et renvoie la liste des violations. */
export function findPageGuardViolations(root: string): string[] {
  return listProtectedPages(root).flatMap((name) => {
    const problem = checkPageSource(name, readFileSync(join(root, name), 'utf8'), expectedGuard(name));

    return problem ? [problem] : [];
  });
}

export function listProtectedPages(root: string): string[] {
  return GROUP_ROOTS.flatMap((directory) => findPages(join(root, directory)).map((path) => relative(root, path).split(sep).join('/')));
}
