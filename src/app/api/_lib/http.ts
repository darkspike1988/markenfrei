import { MAX_NAMES, resolveSources, type CheckOptions } from "@/lib/engine/check";
import { effectiveSources } from "@/lib/engine/format";
import { normalizeName } from "@/lib/name";
import { createRateLimiter, guardRequestDetailed, limitedResponse, type GuardOutcome, type RateLimiter } from "@/lib/rate-limit";
import { DEFAULT_PUBLIC_URL } from "@/lib/site";

/**
 * Gemeinsame Bausteine der HTTP-Routen: Body-Grenze, Content-Type, Origin-Prüfung,
 * Kosten fürs Rate-Limit und ein zusätzliches Limit pro Prozess für Anfragen, die
 * ausgehende Abfragen auslösen. Der Ordner beginnt mit "_" und ist damit keine Route.
 */

export const NO_STORE = { "Cache-Control": "no-store" } as const;

export function jsonError(status: number, error: string, headers: Record<string, string> = {}): Response {
  return Response.json({ error }, { status, headers: { ...NO_STORE, ...headers } });
}

/** Liest den Body höchstens bis maxBytes (auch ohne Content-Length); null, wenn er größer ist. */
export async function readLimited(req: Request, maxBytes: number): Promise<string | null> {
  const declared = Number(req.headers.get("content-length"));
  if (Number.isFinite(declared) && declared > maxBytes) return null;
  if (!req.body) return "";
  const reader = req.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > maxBytes) {
      await reader.cancel().catch(() => undefined);
      return null;
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

/**
 * true bei Content-Type application/json (mit oder ohne Parameter wie charset).
 * Damit lösen fremde Seiten im Browser immer einen Preflight aus, den wir nicht
 * beantworten; ein "simple request" mit text/plain kommt nicht mehr durch.
 */
export function isJsonContentType(req: Request): boolean {
  const type = req.headers.get("content-type")?.split(";")[0]?.trim().toLowerCase();
  return type === "application/json";
}

function originOf(value: string): string | null {
  try {
    const u = new URL(value);
    return u.protocol === "http:" || u.protocol === "https:" ? u.origin : null;
  } catch {
    return null;
  }
}

const LOCAL_HOSTNAMES = new Set(["localhost", "127.0.0.1", "[::1]"]);

/**
 * Eigene Origins aus der Konfiguration, nie aus Request-Headern (Host und
 * X-Forwarded-Host setzt der Client selbst, bei DNS-Rebinding passen sie immer zum Origin):
 * MARKENFREI_PUBLIC_URL (Standard https://markenfrei.app) und MARKENFREI_ALLOWED_ORIGINS.
 */
export function configuredOrigins(): Set<string> {
  const entries = [
    process.env.MARKENFREI_PUBLIC_URL?.trim() || DEFAULT_PUBLIC_URL,
    ...(process.env.MARKENFREI_ALLOWED_ORIGINS ?? "").split(","),
  ];
  return new Set(entries.map((o) => originOf(o.trim())).filter((o): o is string => o !== null));
}

/** Origin aus der Konfiguration oder localhost, 127.0.0.1, [::1] (beliebiger Port). */
export function isConfiguredOrigin(origin: string): boolean {
  const normalized = originOf(origin);
  if (!normalized) return false;
  if (LOCAL_HOSTNAMES.has(new URL(normalized).hostname)) return true;
  return configuredOrigins().has(normalized);
}

/**
 * Für /api/mcp (MCP-Spezifikation, Schutz vor DNS-Rebinding): fehlender Origin ist erlaubt
 * (Kommandozeile, Server), sonst nur Origins aus der Konfiguration und localhost.
 */
export function isAllowedMcpOrigin(req: Request): boolean {
  const origin = req.headers.get("origin");
  return origin === null || isConfiguredOrigin(origin);
}

/**
 * Für die Routen der Oberfläche: wie bei /api/mcp, zusätzlich Aufrufe, die der Browser selbst
 * als same-origin kennzeichnet (Sec-Fetch-Site kann eine Seite nicht setzen). So funktioniert
 * die Oberfläche auch unter einer Domain, die nicht konfiguriert ist.
 */
export function isAllowedBrowserCall(req: Request): boolean {
  const origin = req.headers.get("origin");
  if (origin === null) return true;
  if (isConfiguredOrigin(origin)) return true;
  return req.headers.get("sec-fetch-site") === "same-origin";
}

let cachedDefaultCount: number | null = null;

/** Anzahl der Quellen bei der Standardauswahl (Standard-Endungen plus Standardquellen). */
export function defaultSourceCount(): number {
  cachedDefaultCount ??= Math.max(1, resolveSources().length);
  return cachedDefaultCount;
}

/**
 * Kosten fürs Rate-Limit: Namen × ceil(aufgelöste Quellen / Standardanzahl).
 * Eine größere Quellen- oder Endungsauswahl kostet also mehr. Wirft CheckInputError bei
 * unbekannten Werten (wie die Engine).
 */
export function checkCost(names: number, opts: Pick<CheckOptions, "namespaces" | "tlds" | "sources">): number {
  const sources = resolveSources(opts).length;
  const factor = Math.max(1, Math.ceil(sources / defaultSourceCount()));
  return Math.max(1, names) * factor;
}

/**
 * Anzahl verschiedener gültiger Namen nach der Normalisierung (so prüft auch die Engine),
 * höchstens MAX_NAMES, mindestens 1. Ein ungültiger Name lässt den ganzen Aufruf vor jeder
 * Netzabfrage scheitern und zählt deshalb nicht.
 */
export function distinctNameCount(names: readonly unknown[]): number {
  const distinct = new Set<string>();
  for (const raw of names.slice(0, MAX_NAMES)) {
    const n = normalizeName(raw);
    if (n.ok) distinct.add(n.name);
  }
  return Math.min(Math.max(distinct.size, 1), MAX_NAMES);
}

type ToolCall = { method?: unknown; params?: { name?: unknown; arguments?: unknown } };

const CHECK_TOOLS = new Set(["markenfrei_check_name", "markenfrei_check_names"]);
const OUTBOUND_TOOLS = new Set([...CHECK_TOOLS, "markenfrei_suggest_names"]);

/**
 * Kosten einer MCP-Nachricht fürs Rate-Limit. Prüf-Werkzeuge kosten wie /api/check
 * Namen × Quellenumfang, mit derselben Quellenauswahl wie das Werkzeug (social ohne sources
 * ergänzt die Social-Quellen; bei ungültiger Auswahl nur die Namen: das Werkzeug meldet dann
 * einen Fehler ohne Netzabfrage). Alles andere kostet 1.
 * outbound: ob der Aufruf ausgehende Abfragen auslöst und damit fürs Prozess-Limit zählt.
 */
export function mcpRequestCost(message: unknown): { cost: number; outbound: boolean } {
  if (!message || typeof message !== "object" || Array.isArray(message)) return { cost: 1, outbound: false };
  const m = message as ToolCall;
  const tool = m.method === "tools/call" && typeof m.params?.name === "string" ? m.params.name : "";
  if (!OUTBOUND_TOOLS.has(tool)) return { cost: 1, outbound: false };
  if (!CHECK_TOOLS.has(tool)) return { cost: 1, outbound: true };

  const raw = m.params?.arguments;
  const args = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const names = tool === "markenfrei_check_names" ? (Array.isArray(args.names) ? distinctNameCount(args.names) : 1) : 1;
  try {
    const opts = {
      namespaces: args.namespaces,
      tlds: args.tlds,
      sources: args.sources,
    } as Pick<CheckOptions, "namespaces" | "tlds" | "sources">;
    if (Array.isArray(opts.namespaces)) opts.sources = effectiveSources(opts.namespaces, opts.sources);
    return { cost: checkCost(names, opts), outbound: true };
  } catch {
    return { cost: names, outbound: true };
  }
}

const globalPerMinute = Number(process.env.MARKENFREI_GLOBAL_RATE_LIMIT);

/**
 * Prozessweites Limit für Anfragen mit ausgehenden Abfragen (Standard 600 Einheiten pro
 * Minute). Es greift auch dann, wenn jemand das Limit pro IP umgeht, und schützt die
 * Server-IP vor Sperren bei den abgefragten Diensten.
 */
export function createProcessGuard(limiter: RateLimiter): (cost: number) => Response | null {
  return (cost) => {
    const r = limiter.check("process", cost);
    return r.allowed ? null : limitedResponse(r.retryAfterSec);
  };
}

const processGuard = createProcessGuard(
  createRateLimiter({
    limit: Number.isFinite(globalPerMinute) && globalPerMinute > 0 ? globalPerMinute : 600,
    windowMs: 60_000,
  }),
);

/**
 * Rate-Limit pro Client (guardRequest) und, wenn outbound, zusätzlich pro Prozess.
 * Liefert eine 429-Antwort oder null.
 */
export function guard(req: Request, cost: number, outbound = true): Response | null {
  return guardDetailed(req, cost, outbound).response;
}

/**
 * Wie guard, liefert aber auch die RateLimit-Header des Clients (RateLimit-Limit, -Remaining, -Reset),
 * die bei Erfolg an die Antwort gehören. Das Prozesslimit bleibt intern; es meldet nur 429.
 */
export function guardDetailed(req: Request, cost: number, outbound = true): GuardOutcome {
  const client = guardRequestDetailed(req, cost);
  if (client.response) return client;
  const process = outbound ? processGuard(cost) : null;
  return process ? { response: process, headers: client.headers } : client;
}
