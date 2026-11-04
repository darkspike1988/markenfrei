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

    const release = await acquireSlot(host, owner, {
      deadlineAt: opts.deadlineAt,
      now,
      limit: perHostLimit,
      ownerLimit: perOwnerLimit,
    });
    if (!release) return { status: 0, headers: empty, error: "deadline" };
    try {
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
