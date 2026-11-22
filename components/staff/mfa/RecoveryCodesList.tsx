import type { ReactElement } from 'react';

/** Codes de secours affichés UNE seule fois (ils ne sont stockés que hachés). */
export function RecoveryCodesList({ codes }: { codes: string[] }): ReactElement {
  return (
    <div className="flex flex-col gap-3 rounded-lg border border-secondary/60 bg-secondary/5 p-4">
      <p className="text-sm font-medium text-primary">
        Codes de secours — notez-les maintenant, ils ne seront plus jamais affichés.
      </p>
      <ul className="grid grid-cols-1 gap-2 font-mono text-base sm:grid-cols-2" aria-label="Codes de secours">
        {codes.map((code) => (
          <li key={code} className="rounded bg-white px-3 py-1.5 text-center tracking-wider text-slate-800">
            {code}
          </li>
        ))}
      </ul>
      <p className="text-xs text-slate-500">
        Chaque code ne fonctionne qu&rsquo;une fois. Conservez-les hors de cet ordinateur (papier, coffre-fort).
      </p>
    </div>
  );
}
