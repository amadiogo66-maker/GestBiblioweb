/**
 * Simulateur du logiciel de gestion : client de référence du contrat de
 * circulation. Il n'utilise que l'API HTTP (aucun accès à la base).
 *
 *   GEST_BIBLIO_API_KEY=<clé> npm run simulate:library -- --base-url http://localhost:3002 --once --yes
 *
 * Options : --base-url <url> (obligatoire), --once ou --interval <secondes> (défaut 10),
 * --yes pour agir, --allow-remote pour une URL non locale, --state <fichier>.
 * Sans --yes : aucune requête n'est envoyée, car même une lecture d'événements
 * mettrait à jour le « dernier contact » du logiciel sur le site.
 *
 * Règle de livraison illustrée : appliquer, enregistrer le seq, PUIS acquitter.
 * Après une panne, un événement déjà enregistré est ignoré et acquitté.
 */
import { existsSync, readFileSync, renameSync, writeFileSync } from 'node:fs';

interface Options {
  baseUrl: string;
  once: boolean;
  intervalSeconds: number;
  confirmed: boolean;
  statePath: string;
}

interface SiteEvent {
  seq: number;
  type: string;
  payload: Record<string, unknown>;
}

interface RenewalPayload {
  loanExternalId: string;
  matricule: string;
  bookExternalId: string;
  currentDueDate: string;
  borrowDate: string;
  renewalCount: number;
  fineAmount: number | null;
}

interface SyncResult {
  data?: { rejectedDetails?: Array<{ reason: string }> };
}

const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]']);
const DAY_MS = 24 * 60 * 60 * 1000;
const MAX_REMEMBERED_SEQS = 5000;

function fail(message: string): never {
  console.error(`Erreur : ${message}`);
  process.exit(1);
}

function optionValue(argv: string[], name: string): string | undefined {
  const index = argv.indexOf(name);
  return index === -1 ? undefined : argv[index + 1];
}

function parseOptions(argv: string[]): Options {
  const rawUrl = optionValue(argv, '--base-url');

  if (!rawUrl) fail('--base-url est obligatoire (par exemple http://localhost:3002).');

  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    fail('--base-url est invalide.');
  }

  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) {
    fail('--base-url doit être une URL http(s), sans identifiants.');
  }

  console.log(`URL visée : ${url.origin}`);

  if (!LOCAL_HOSTS.has(url.hostname) && !argv.includes('--allow-remote')) {
    fail('URL non locale refusée. Ajoutez --allow-remote pour la viser explicitement.');
  }

  const rawInterval = optionValue(argv, '--interval');
  const intervalSeconds = rawInterval === undefined ? 10 : Number(rawInterval);

  if (!Number.isInteger(intervalSeconds) || intervalSeconds < 1) fail('--interval attend un entier positif.');

  return {
    baseUrl: url.origin,
    once: argv.includes('--once'),
    intervalSeconds,
    confirmed: argv.includes('--yes'),
    statePath: optionValue(argv, '--state') ?? '.simulator-state.json',
  };
}

// --- Déduplication : seq déjà appliqués -------------------------------------

function loadProcessed(path: string): Set<number> {
  if (!existsSync(path)) return new Set();

  const state = JSON.parse(readFileSync(path, 'utf8')) as { processedSeqs?: number[] };
  return new Set(state.processedSeqs ?? []);
}

function saveProcessed(path: string, processed: Set<number>): void {
  const processedSeqs = [...processed].slice(-MAX_REMEMBERED_SEQS);
  const temporary = `${path}.tmp`;

  writeFileSync(temporary, JSON.stringify({ processedSeqs }));
  renameSync(temporary, path);
}

// --- Appels HTTP ------------------------------------------------------------

function createClient(baseUrl: string, apiKey: string) {
  return async function call<T>(path: string, body?: unknown): Promise<T> {
    const response = await fetch(`${baseUrl}${path}`, {
      method: body === undefined ? 'GET' : 'POST',
      headers: { 'x-api-key': apiKey, ...(body === undefined ? {} : { 'content-type': 'application/json' }) },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });

    if (!response.ok) {
      throw new Error(`${path} a répondu ${response.status}`);
    }

    return (await response.json()) as T;
  };
}

type Call = ReturnType<typeof createClient>;

function reportRejections(seq: number, result: SyncResult): void {
  for (const rejected of result.data?.rejectedDetails ?? []) {
    console.warn(`  seq ${seq} : élément rejeté (${rejected.reason})`);
  }
}

// --- Traitement des événements ----------------------------------------------

async function handleReservationCreated(call: Call, event: SiteEvent): Promise<void> {
  const expiryDate = new Date(Date.now() + 3 * DAY_MS).toISOString();
  const result = await call<SyncResult>('/api/reservations/sync', {
    updates: [{ reservationId: event.payload.reservationId, status: 'READY', expiryDate }],
  });

  reportRejections(event.seq, result);
  console.log(`  seq ${event.seq} : réservation prête`);
}

async function handleRenewalRequested(call: Call, event: SiteEvent): Promise<void> {
  const payload = event.payload as unknown as RenewalPayload;
  const base = {
    externalId: payload.loanExternalId,
    matricule: payload.matricule,
    bookExternalId: payload.bookExternalId,
    borrowDate: payload.borrowDate,
    fineAmount: payload.fineAmount,
    status: 'ACTIVE',
  };
  const refused = payload.loanExternalId.endsWith('-refuse');
  // Calculé depuis l'événement : rejouer cet événement donne exactement le même résultat.
  const loan = refused
    ? { ...base, dueDate: payload.currentDueDate, renewalCount: payload.renewalCount, renewalDecision: 'REFUSED' }
    : {
        ...base,
        dueDate: new Date(new Date(payload.currentDueDate).getTime() + 7 * DAY_MS).toISOString(),
        renewalCount: payload.renewalCount + 1,
      };
  const result = await call<SyncResult>('/api/loans/sync', { loans: [loan] });

  reportRejections(event.seq, result);
  console.log(`  seq ${event.seq} : renouvellement ${refused ? 'refusé' : 'accepté'}`);
}

async function handleEvent(call: Call, event: SiteEvent): Promise<void> {
  switch (event.type) {
    case 'reservation.created':
      return handleReservationCreated(call, event);
    case 'loan.renewal_requested':
      return handleRenewalRequested(call, event);
    case 'reservation.cancelled':
      console.log(`  seq ${event.seq} : annulation notée, rien à faire`);
      return;
    default:
      console.warn(`  seq ${event.seq} : type inconnu (${event.type}), ignoré`);
  }
}

async function tick(call: Call, options: Options, processed: Set<number>): Promise<void> {
  for (;;) {
    const { data } = await call<{ data: { events: SiteEvent[] } }>('/api/events?after=0&limit=100');

    if (data.events.length === 0) return;

    for (const event of data.events) {
      if (processed.has(event.seq)) {
        console.log(`  seq ${event.seq} : déjà traité, ignoré`);
        continue;
      }

      await handleEvent(call, event);
      processed.add(event.seq);
      saveProcessed(options.statePath, processed);
    }

    await call('/api/events/ack', { seqs: data.events.map((event) => event.seq) });
  }
}

async function main(): Promise<void> {
  const options = parseOptions(process.argv.slice(2));

  if (!options.confirmed) {
    console.log('Simulation : aucune requête envoyée. Avec --yes, le simulateur :');
    console.log('  - lit GET /api/events ;');
    console.log('  - passe chaque réservation à READY (expiration à +3 jours) ;');
    console.log('  - accepte chaque renouvellement (+7 jours), sauf un prêt dont l’identifiant finit par "-refuse" ;');
    console.log('  - enregistre les seq traités, puis acquitte.');
    return;
  }

  const apiKey = process.env.GEST_BIBLIO_API_KEY;

  if (!apiKey) fail('la variable GEST_BIBLIO_API_KEY de ce processus est absente.');

  const call = createClient(options.baseUrl, apiKey);
  const processed = loadProcessed(options.statePath);

  if (options.once) {
    await tick(call, options, processed);
    return;
  }

  for (;;) {
    try {
      await tick(call, options, processed);
    } catch (error) {
      console.error(`Échec, nouvel essai au prochain passage : ${error instanceof Error ? error.message : 'erreur inconnue'}`);
    }

    await new Promise((resolve) => setTimeout(resolve, options.intervalSeconds * 1000));
  }
}

main().catch((error: unknown) => {
  console.error(`Échec : ${error instanceof Error ? error.message : 'erreur inconnue'}`);
  process.exitCode = 1;
});
