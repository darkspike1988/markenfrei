import type { HttpClient, HttpRequest, HttpResponse } from "@/lib/engine/types";

/**
 * HTTP-Client für Quellenabfragen.
 * - Semaphor pro Host (Standard 4 gleichzeitige Anfragen, prozessweit)
 * - Bündelt gleiche gleichzeitige Anfragen (gleiche Methode, URL, Lesemodus)
 * - Timeout pro Anfrage und eine gemeinsame Deadline pro Prüfung
 * - liest Antwortkörper nur bis maxBytes, sonst Abbruch
 */

const DEFAULT_TIMEOUT_MS = 5000;
const DEFAULT_MAX_BYTES = 512 * 1024;
const PER_HOST_LIMIT = 4;

type Waiter = () => void;
const hostSlots = new Map<string, { active: number; queue: Waiter[] }>();

async function acquire(host: string, limit: number): Promise<() => void> {
  let slot = hostSlots.get(host);
  if (!slot) {
    slot = { active: 0, queue: [] };
    hostSlots.set(host, slot);
  }
  const s = slot;
  if (s.active >= limit) {
    await new Promise<void>((resolve) => s.queue.push(resolve));
  }
  s.active++;
  let released = false;
  return () => {
    if (released) return;
    released = true;
    s.active--;
    const next = s.queue.shift();
    if (next) next();
    else if (s.active === 0) hostSlots.delete(host);
  };
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
}): HttpClient {
  const fetchImpl = opts.fetchImpl ?? fetch;
  const now = opts.now ?? Date.now;
  const perHostLimit = opts.perHostLimit ?? PER_HOST_LIMIT;

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

    const release = await acquire(host, perHostLimit);
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

  return {
    request(url, req = {}) {
      const key = `${req.method ?? "GET"} ${req.read ?? "none"} ${JSON.stringify(req.headers ?? {})} ${url}`;
      const existing = inflight.get(key);
      if (existing) return existing;
      const p = run(url, req).finally(() => inflight.delete(key));
      inflight.set(key, p);
      return p;
    },
  };
}
