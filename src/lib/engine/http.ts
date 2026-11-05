import type { HttpClient, HttpRequest, HttpResponse } from "@/lib/engine/types";

/**
 * HTTP-Client für Quellenabfragen.
 * - Semaphor pro Host (Standard 4 gleichzeitige Anfragen, prozessweit)
 * - Fairness: Eine Prüfung (Besitzer, z. B. ein checkNames-Aufruf) belegt höchstens
 *   PER_OWNER_LIMIT Slots je Host. Freie Slots gehen an den Wartenden, dessen Besitzer
 *   gerade die wenigsten Slots auf dem Host hält (bei Gleichstand der älteste).
 * - Wartende geben auf, sobald ihre Deadline abläuft (error "deadline")
 * - Bündelt gleiche gleichzeitige Anfragen (gleiche Methode, URL, Lesemodus)
 * - Timeout pro Anfrage und eine gemeinsame Deadline pro Prüfung
 * - liest Antwortkörper nur bis maxBytes, sonst Abbruch
 */

const DEFAULT_TIMEOUT_MS = 5000;
const DEFAULT_MAX_BYTES = 512 * 1024;
const PER_HOST_LIMIT = 4;

/**
 * Abfragebudget je Zieldienst, prozessweit. Es gilt zusätzlich zur Zahl gleichzeitiger Anfragen
 * und hält dokumentierte Grenzen der Anbieter ein. Ist es erschöpft, wartet die Anfrage kurz oder
 * gibt auf (error "budget"), statt den Dienst zu überlasten oder die Server-IP sperren zu lassen.
 * Gilt pro Prozess: Bei mehreren Instanzen teilt sich das Budget nicht, dort entsprechend senken.
 *
 * Belege (Stand 4. November 2026):
 * - itunes.apple.com: Apple nennt "approximately 20 calls per minute" (iTunes Search API) und empfiehlt
 *   Caching. Wir nehmen 18 pro Minute.
 * - crates.io: Crawler-Richtlinie, höchstens 1 Anfrage pro Sekunde.
 * - hex.pm: 100 Anfragen pro Minute ohne Anmeldung. Wir nehmen 90.
 * - mastodon.social: 300 Anfragen je 5 Minuten und IP. Wir nehmen 250.
 * - huggingface.co: API-Abfragen je 5 Minuten anonym 500, mit Free-Konto 1.000 (offizielle Tabelle,
 *   Stand September 2025, ändert sich laut Seite). Wir nehmen 450 bzw. 900 (mit HF_TOKEN).
 * - api.gleif.org: 60 Anfragen pro Minute. Diese Zahl stammt aus der Anleitung eines Drittanbieter-Pakets
 *   und ist nicht offiziell bestätigt; wir bleiben mit 50 darunter.
 * - api.github.com: ohne Token 60 Anfragen pro Stunde und IP, mit Token 5.000 (GitHub-Dokumentation,
 *   REST API rate limits). Wir nehmen 50 bzw. 4.500 je Stunde.
 * - query.wikidata.org: Wikimedia begrenzt die Rechenzeit je Client, nicht die Zahl der Anfragen. Unsere
 *   Abfragen sind klein; 30 pro Minute ist eine vorsichtige eigene Grenze, keine Angabe des Dienstes.
 * - repology.org: höchstens 1 Anfrage pro Sekunde, Massenabfragen (mehr als 1000 pro Tag) unerwünscht und nur
 *   mit eigenem User-Agent samt Link zum Quellcode (repology.org/api). Wir nehmen 1 pro Sekunde.
 * - packages.ecosyste.ms: 5.000 Anfragen pro Stunde ohne und 15.000 mit E-Mail-Adresse im User-Agent (Betreiber,
 *   "Building Ecosyste.ms Polite API Rate Limits", 11. Dezember 2025; der Antwortkopf X-RateLimit-Limit nannte am
 *   5. November 2026 5000 für Anonyme). Wir nehmen 4.500 je Stunde, also unter dem Wert ohne Adresse.
 * - aur.archlinux.org: höchstens 4000 Anfragen pro Tag und IP für die RPC-Schnittstelle (Arch Wiki,
 *   Aurweb RPC interface). Wir nehmen 3600 je 24 Stunden.
 */
export type HostBudget = { max: number; windowMs: number };

/** Hugging Face: 5-Minuten-Fenster, mit Token das Limit des Free-Kontos, sonst das anonyme. */
export function huggingfaceBudget(token: string | undefined): HostBudget {
  return { max: token && token.trim() ? 900 : 450, windowMs: 300_000 };
}

/** GitHub: 1-Stunden-Fenster, mit Token das Limit für authentifizierte Anfragen, sonst das anonyme. */
export function githubBudget(token: string | undefined): HostBudget {
  return { max: token && token.trim() ? 4500 : 50, windowMs: 3_600_000 };
}

export const HOST_BUDGETS: Record<string, HostBudget> = {
  "huggingface.co": huggingfaceBudget(process.env.HF_TOKEN),
  "api.github.com": githubBudget(process.env.GITHUB_TOKEN),
  "query.wikidata.org": { max: 30, windowMs: 60_000 },
  "api.gleif.org": { max: 50, windowMs: 60_000 },
  "itunes.apple.com": { max: 18, windowMs: 60_000 },
  "crates.io": { max: 1, windowMs: 1_000 },
  "hex.pm": { max: 90, windowMs: 60_000 },
  "mastodon.social": { max: 250, windowMs: 300_000 },
  "repology.org": { max: 1, windowMs: 1_000 },
  "packages.ecosyste.ms": { max: 4500, windowMs: 3_600_000 },
  "aur.archlinux.org": { max: 3600, windowMs: 86_400_000 },
};
/** Längste Wartezeit auf ein freies Budget, danach error "budget" */
const MAX_BUDGET_WAIT_MS = 1500;

const budgetLog = new Map<string, number[]>();

/**
 * Reserviert ein Budget und gibt die Wartezeit bis dahin zurück (0 = sofort frei).
 * Ist das Budget erschöpft und der nächste freie Platz höchstens `maxWaitMs` entfernt, wird dieser
 * künftige Zeitpunkt reserviert und die Wartezeit zurückgegeben: Mehrere Wartende reihen sich so
 * hintereinander ein, statt alle zum selben Zeitpunkt aufzuwachen und um einen Platz zu konkurrieren.
 * Liegt der Platz weiter weg (Rückgabe > maxWaitMs), wird nichts verbraucht.
 */
export function takeBudget(host: string, budget: HostBudget, nowMs: number, maxWaitMs = 0): number {
  const log = budgetLog.get(host) ?? [];
  // Reservierte Zeitpunkte liegen ggf. in der Zukunft; sie bleiben, bis ihr Fenster vorbei ist
  const recent = log.filter((t) => nowMs - t < budget.windowMs);
  const freeAt =
    recent.length < budget.max ? nowMs : Math.max(nowMs + 1, recent[recent.length - budget.max] + budget.windowMs);
  const wait = freeAt - nowMs;
  if (wait <= maxWaitMs) {
    recent.push(freeAt);
    recent.sort((a, b) => a - b);
  }
  budgetLog.set(host, recent);
  return wait;
}

/** Nur für Tests */
export function resetHostBudgets(): void {
  budgetLog.clear();
}
/** Höchstens so viele Slots je Host für eine Prüfung, damit andere nicht verhungern */
const PER_OWNER_LIMIT = 3;

type Owner = object;
type Waiter = { owner: Owner; seq: number; grant: () => void };
type HostSlots = {
  active: number;
  byOwner: Map<Owner, number>;
  queue: Waiter[];
  limit: number;
  ownerLimit: number;
};
const hostSlots = new Map<string, HostSlots>();
let waiterSeq = 0;

function ownerActive(s: HostSlots, owner: Owner): number {
  return s.byOwner.get(owner) ?? 0;
}

function canStart(s: HostSlots, owner: Owner): boolean {
  return s.active < s.limit && ownerActive(s, owner) < s.ownerLimit;
}

function take(s: HostSlots, owner: Owner): void {
  s.active++;
  s.byOwner.set(owner, ownerActive(s, owner) + 1);
}

/** Vergibt freie Slots: wenigste aktive Slots des Besitzers zuerst, dann FIFO. */
function dispatch(s: HostSlots): void {
  while (s.active < s.limit && s.queue.length > 0) {
    let best = -1;
    for (let i = 0; i < s.queue.length; i++) {
      const w = s.queue[i];
      if (ownerActive(s, w.owner) >= s.ownerLimit) continue;
      if (best === -1) {
        best = i;
        continue;
      }
      const b = s.queue[best];
      const diff = ownerActive(s, w.owner) - ownerActive(s, b.owner);
      if (diff < 0 || (diff === 0 && w.seq < b.seq)) best = i;
    }
    if (best === -1) return;
    const [w] = s.queue.splice(best, 1);
    take(s, w.owner);
    w.grant();
  }
}

/**
 * Wartet auf einen Slot für `host`. Gibt eine Freigabefunktion zurück oder null, wenn
 * die Deadline vorher abläuft (dann wird der Wartende aus der Schlange entfernt).
 */
export async function acquireSlot(
  host: string,
  owner: Owner,
  opts: { deadlineAt: number; now?: () => number; limit?: number; ownerLimit?: number },
): Promise<(() => void) | null> {
  const now = opts.now ?? Date.now;
  let slot = hostSlots.get(host);
  if (!slot) {
    slot = {
      active: 0,
      byOwner: new Map(),
      queue: [],
      limit: opts.limit ?? PER_HOST_LIMIT,
      ownerLimit: opts.ownerLimit ?? PER_OWNER_LIMIT,
    };
    hostSlots.set(host, slot);
  }
  const s = slot;

  const release = () => {
    let released = false;
    return () => {
      if (released) return;
      released = true;
      s.active--;
      const left = ownerActive(s, owner) - 1;
      if (left > 0) s.byOwner.set(owner, left);
      else s.byOwner.delete(owner);
      dispatch(s);
      if (s.active === 0 && s.queue.length === 0 && hostSlots.get(host) === s) hostSlots.delete(host);
    };
  };

  if (s.queue.length === 0 && canStart(s, owner)) {
    take(s, owner);
    return release();
  }

  const remaining = opts.deadlineAt - now();
  if (remaining <= 0) return null;

  return new Promise((resolve) => {
    const waiter: Waiter = {
      owner,
      seq: waiterSeq++,
      grant: () => {
        clearTimeout(timer);
        resolve(release());
      },
    };
    s.queue.push(waiter);
    const timer = setTimeout(() => {
      const i = s.queue.indexOf(waiter);
      if (i === -1) return;
      s.queue.splice(i, 1);
      if (s.active === 0 && s.queue.length === 0 && hostSlots.get(host) === s) hostSlots.delete(host);
      resolve(null);
    }, remaining);
    timer.unref?.();
    // Ein Slot kann frei sein, obwohl andere warten (deren Besitzer am Limit sind)
    dispatch(s);
  });
}

/** Nur für Tests: Anzahl der Wartenden je Host */
export function queuedForHost(host: string): number {
  return hostSlots.get(host)?.queue.length ?? 0;
}

const inflight = new Map<string, Promise<HttpResponse>>();

async function readBody(res: Response, maxBytes: number): Promise<string | "too_large"> {
  if (!res.body) return "";
  const reader = res.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > maxBytes) {
      await reader.cancel().catch(() => undefined);
      return "too_large";
    }
    chunks.push(value);
  }
  const all = new Uint8Array(size);
  let offset = 0;
  for (const c of chunks) {
    all.set(c, offset);
    offset += c.byteLength;
  }
  return new TextDecoder().decode(all);
}

export function buildUserAgent(contact: string): string {
  return `Markenfrei/2.0 (+https://markenfrei.app${contact ? `; ${contact}` : ""})`;
}

export function createHttpClient(opts: {
  /** Zeitpunkt (ms seit Epoch), ab dem keine Anfrage mehr startet oder läuft */
  deadlineAt: number;
  userAgent: string;
  fetchImpl?: typeof fetch;
  now?: () => number;
  perHostLimit?: number;
  /** Höchstens so viele Slots je Host für diesen Besitzer, Standard 3 */
  perOwnerLimit?: number;
  /** Abfragebudgets je Host, Standard HOST_BUDGETS (für Tests überschreibbar) */
  hostBudgets?: Record<string, HostBudget>;
  /**
   * Wem die Anfragen zugerechnet werden. Mehrere Clients mit demselben Besitzer teilen
   * sich dessen Slot-Grenze (z. B. alle Namen eines checkNames-Aufrufs). Standard: eigener.
   */
  owner?: object;
}): HttpClient {
  const fetchImpl = opts.fetchImpl ?? fetch;
  const now = opts.now ?? Date.now;
  const perHostLimit = opts.perHostLimit ?? PER_HOST_LIMIT;
  const perOwnerLimit = opts.perOwnerLimit ?? PER_OWNER_LIMIT;
  const owner = opts.owner ?? {};

  async function run(url: string, req: HttpRequest): Promise<HttpResponse> {
    const empty = new Headers();
    const remaining = opts.deadlineAt - now();
    if (remaining <= 0) return { status: 0, headers: empty, error: "deadline" };

    let host: string;
    try {
      host = new URL(url).host;
    } catch {
      return { status: 0, headers: empty, error: "network" };
    }

    const budget = (opts.hostBudgets ?? HOST_BUDGETS)[host];

    const release = await acquireSlot(host, owner, {
      deadlineAt: opts.deadlineAt,
      now,
      limit: perHostLimit,
      ownerLimit: perOwnerLimit,
    });
    if (!release) return { status: 0, headers: empty, error: "deadline" };
    try {
      if (budget) {
        // Das Budget wird erst mit gehaltenem Slot genommen: Wer vorher an der Deadline scheitert,
        // verbraucht keins. Ist es erschöpft, wird der nächste freie Zeitpunkt reserviert (siehe takeBudget);
        // Warten nur, wenn es sich lohnt: kurz genug und mit Luft bis zur Deadline.
        const maxWait = Math.min(MAX_BUDGET_WAIT_MS, opts.deadlineAt - now() - 1000);
        const wait = takeBudget(host, budget, now(), maxWait);
        if (wait > maxWait) return { status: 0, headers: empty, error: "budget" };
        if (wait > 0) await new Promise((r) => setTimeout(r, wait));
      }
      const left = opts.deadlineAt - now();
      if (left <= 0) return { status: 0, headers: empty, error: "deadline" };
      const timeout = Math.min(req.timeoutMs ?? DEFAULT_TIMEOUT_MS, left);
      const byDeadline = timeout === left;

      let res: Response;
      try {
        res = await fetchImpl(url, {
          method: req.method ?? "GET",
          headers: { "User-Agent": opts.userAgent, ...req.headers },
          redirect: "follow",
          signal: AbortSignal.timeout(timeout),
        });
      } catch (err) {
        const name = err instanceof Error ? err.name : "";
        if (name === "TimeoutError" || name === "AbortError") {
          return { status: 0, headers: empty, error: byDeadline ? "deadline" : "timeout" };
        }
        return { status: 0, headers: empty, error: "network" };
      }

      const read = req.read ?? "none";
      if (read === "none" || req.method === "HEAD") {
        await res.body?.cancel().catch(() => undefined);
        return { status: res.status, headers: res.headers };
      }

      let body: string | "too_large";
      try {
        body = await readBody(res, req.maxBytes ?? DEFAULT_MAX_BYTES);
      } catch {
        return { status: res.status, headers: res.headers, error: "network" };
      }
      if (body === "too_large") return { status: res.status, headers: res.headers, error: "too_large" };
      if (read === "text") return { status: res.status, headers: res.headers, text: body };
      if (body === "") return { status: res.status, headers: res.headers, json: null };
      try {
        return { status: res.status, headers: res.headers, json: JSON.parse(body), text: body };
      } catch {
        return { status: res.status, headers: res.headers, text: body, error: "parse" };
      }
    } finally {
      release();
    }
  }

  const retryable = (r: HttpResponse) =>
    r.error === "timeout" || r.error === "network" || [429, 502, 503, 504].includes(r.status);

  /** Eine Wiederholung, wenn die Deadline noch Luft lässt (kurze Pause, höchstens 1 s Retry-After). */
  async function runWithRetry(url: string, req: HttpRequest): Promise<HttpResponse> {
    const first = await run(url, req);
    if (!req.retry || !retryable(first) || first.error === "deadline") return first;
    const after = Number(first.headers.get("retry-after"));
    const pause = Number.isFinite(after) && after > 0 ? Math.min(after * 1000, 1000) : 300;
    if (opts.deadlineAt - now() < pause + 1000) return first;
    await new Promise((r) => setTimeout(r, pause));
    return run(url, req);
  }

  return {
    request(url, req = {}) {
      const key = `${req.method ?? "GET"} ${req.read ?? "none"} ${JSON.stringify(req.headers ?? {})} ${url}`;
      const existing = inflight.get(key);
      if (existing) return existing;
      const p = runWithRetry(url, req).finally(() => inflight.delete(key));
      inflight.set(key, p);
      return p;
    },
  };
}
