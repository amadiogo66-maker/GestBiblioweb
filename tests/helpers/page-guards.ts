import { readFileSync, readdirSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import ts from 'typescript';

/** Dossiers de pages protégées, relatifs à la racine du projet. */
const PROTECTED_ROOTS: Array<{ directory: string; guard: string }> = [
  { directory: 'app/(dashboard)', guard: 'requireActiveDashboardUser' },
  { directory: 'app/(staff)', guard: 'requireStaffPage' },
];

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
  return PROTECTED_ROOTS.flatMap(({ directory, guard }) =>
    findPages(join(root, directory)).flatMap((path) => {
      const name = relative(root, path).split(sep).join('/');
      const problem = checkPageSource(name, readFileSync(path, 'utf8'), PAGE_GUARD_EXCEPTIONS[name] ?? guard);

      return problem ? [problem] : [];
    })
  );
}

export function listProtectedPages(root: string): string[] {
  return PROTECTED_ROOTS.flatMap(({ directory }) =>
    findPages(join(root, directory)).map((path) => relative(root, path).split(sep).join('/'))
  );
}
