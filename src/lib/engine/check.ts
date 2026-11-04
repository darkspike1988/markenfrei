import { cachedLookup, createTtlCache, DEFAULT_CACHE_MAX, DEFAULT_CACHE_TTL_MS } from "@/lib/cache";
import { buildUserAgent, createHttpClient } from "@/lib/engine/http";
import { DEFAULT_DOMAIN_TLDS, DOMAIN_TLDS, domainSources } from "@/lib/engine/sources/domains";
import { KNOWN_NAME_SOURCES } from "@/lib/engine/sources/known-names";
import { PACKAGE_SOURCES } from "@/lib/engine/sources/packages";
import { manualSocialLinks, SOCIAL_SOURCES, STORE_SOURCES } from "@/lib/engine/sources/stores-social";
import { trademarkPrep, type TrademarkPrep } from "@/lib/engine/trademark-prep";
import type { Namespace, Source, SourceResult, Status } from "@/lib/engine/types";
import { NAMESPACES } from "@/lib/engine/types";
import {
  computeVerdict,
  countStatuses,
  rankReports,
  VERDICT_LABEL,
  type ShortlistEntry,
  type Verdict,
} from "@/lib/engine/verdict";

export type { ShortlistEntry };
import { normalizeName } from "@/lib/name";

export const DEFAULT_NAMESPACES: readonly Namespace[] = ["domains", "packages", "stores", "known_names"];
export const MAX_TLDS = 8;
export const MAX_NAMES = 10;
const DEADLINE_MS = 8000;

/** Alle Quellen außer Domains (die entstehen je Endung). */
export const STATIC_SOURCES: readonly Source[] = [
  ...PACKAGE_SOURCES,
  ...STORE_SOURCES,
  ...SOCIAL_SOURCES,
  ...KNOWN_NAME_SOURCES,
];

export class CheckInputError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CheckInputError";
  }
}

export type CheckOptions = {
  /** Namensräume; Standard DEFAULT_NAMESPACES. Wirkt nur auf Quellen mit defaultEnabled. */
  namespaces?: Namespace[];
  /** Endungen für den Namensraum domains; Standard DEFAULT_DOMAIN_TLDS, höchstens MAX_TLDS */
  tlds?: string[];
  /** Ausdrückliche Quellen-IDs (z. B. "npm", "nuget"). Überschreibt die Standardauswahl außerhalb von domains. */
  sources?: string[];
  contact?: string;
  fetchImpl?: typeof fetch;
  now?: () => number;
  /** Nur für Tests: eigene Quellen statt der eingebauten */
  registry?: readonly Source[];
};

export type NameReport = {
  schemaVersion: 2;
  input: string;
  name: string;
  checkedAt: string;
  verdict: Verdict;
  verdictLabel: string;
  counts: Record<Status, number>;
  /** Quellen ohne verwertbare Antwort. Dort heißt "nichts gefunden" nicht "frei". */
  incomplete: string[];
  results: SourceResult[];
  trademark: TrademarkPrep;
  manualLinks: { label: string; url: string }[];
};

function parseNamespaces(input: unknown): Namespace[] {
  if (input === undefined || input === null) return [...DEFAULT_NAMESPACES];
  if (!Array.isArray(input)) throw new CheckInputError("namespaces muss eine Liste sein.");
  const out = new Set<Namespace>();
  for (const n of input) {
    if (!(NAMESPACES as readonly string[]).includes(String(n))) {
      throw new CheckInputError(`Unbekannter Namensraum „${String(n).slice(0, 20)}“. Erlaubt: ${NAMESPACES.join(", ")}.`);
    }
    out.add(n as Namespace);
  }
  return out.size ? [...out] : [...DEFAULT_NAMESPACES];
}

function parseTldList(input: unknown): string[] {
  if (input === undefined || input === null) return [...DEFAULT_DOMAIN_TLDS];
  if (!Array.isArray(input)) throw new CheckInputError("tlds muss eine Liste sein.");
  const out = new Set<string>();
  for (const raw of input) {
    const t = String(raw ?? "").trim().toLowerCase().replace(/^\./, "");
    if (!DOMAIN_TLDS.includes(t)) {
      throw new CheckInputError(`Endung „${t.slice(0, 20)}“ wird nicht unterstützt. Erlaubt: ${DOMAIN_TLDS.join(", ")}.`);
    }
    out.add(t);
  }
  if (out.size > MAX_TLDS) throw new CheckInputError(`Höchstens ${MAX_TLDS} Endungen pro Anfrage.`);
  return out.size ? [...out] : [...DEFAULT_DOMAIN_TLDS];
}

/** Welche Quellen eine Anfrage abfragt (auch für UI und MCP-Beschreibung). */
export function resolveSources(opts: Pick<CheckOptions, "namespaces" | "tlds" | "sources" | "registry"> = {}): Source[] {
  const namespaces = parseNamespaces(opts.namespaces);
  const registry = opts.registry ?? STATIC_SOURCES;
  const byId = new Map(registry.map((s) => [s.id, s]));

  let picked: Source[];
  if (opts.sources !== undefined && opts.sources !== null) {
    if (!Array.isArray(opts.sources)) throw new CheckInputError("sources muss eine Liste sein.");
    picked = [];
    for (const id of opts.sources) {
      const s = byId.get(String(id));
      if (!s) throw new CheckInputError(`Unbekannte Quelle „${String(id).slice(0, 30)}“.`);
      if (!picked.includes(s)) picked.push(s);
    }
  } else {
    picked = registry.filter((s) => s.defaultEnabled && namespaces.includes(s.namespace));
  }

  const wantsDomains = namespaces.includes("domains") || opts.tlds !== undefined;
  const domains = wantsDomains && !opts.registry ? domainSources(parseTldList(opts.tlds)) : [];
  return [...domains, ...picked];
}

const resultCache = createTtlCache<SourceResult>({ ttlMs: DEFAULT_CACHE_TTL_MS, max: DEFAULT_CACHE_MAX * 4 });
const DEFINITIVE: Status[] = ["taken", "not_found", "similar", "invalid"];

function failed(source: Source, name: string, note: string): SourceResult {
  return { sourceId: source.id, namespace: source.namespace, label: source.label, target: name, status: "unknown", note };
}

export async function checkName(input: unknown, opts: CheckOptions = {}): Promise<NameReport> {
  const n = normalizeName(input);
  if (!n.ok) throw new CheckInputError(n.error);
  const name = n.name;

  const sources = resolveSources(opts);
  const now = opts.now ?? Date.now;
  const contact = opts.contact ?? process.env.MARKENFREI_CONTACT ?? "";
  const http = createHttpClient({
    deadlineAt: now() + DEADLINE_MS,
    userAgent: buildUserAgent(contact),
    fetchImpl: opts.fetchImpl,
    now,
  });
  const ctx = { http, contact };

  const results = await Promise.all(
    sources.map((s) =>
      cachedLookup(
        resultCache,
        `${s.id}|${name}`,
        async () => {
          try {
            return await s.check(name, ctx);
          } catch {
            return failed(s, name, "Interner Fehler bei der Abfrage");
          }
        },
        (r) => DEFINITIVE.includes(r.status),
      ),
    ),
  );

  const verdict = computeVerdict(results);
  return {
    schemaVersion: 2,
    input: String(input ?? ""),
    name,
    checkedAt: new Date(now()).toISOString(),
    verdict,
    verdictLabel: VERDICT_LABEL[verdict],
    counts: countStatuses(results),
    incomplete: results.filter((r) => r.status === "unknown").map((r) => r.label),
    results,
    trademark: trademarkPrep(name),
    manualLinks: manualSocialLinks(name),
  };
}

/** Prüft bis zu MAX_NAMES Namen und sortiert: frei zuerst, dann wenige Treffer, dann wenige Lücken. */
export async function checkNames(
  inputs: unknown,
  opts: CheckOptions = {},
): Promise<{ ranking: ShortlistEntry[]; reports: NameReport[] }> {
  if (!Array.isArray(inputs) || inputs.length === 0) throw new CheckInputError("Bitte mindestens einen Namen angeben.");
  if (inputs.length > MAX_NAMES) throw new CheckInputError(`Höchstens ${MAX_NAMES} Namen pro Anfrage.`);
  const unique = [...new Set(inputs.map((i) => String(i ?? "")))];
  const reports = await Promise.all(unique.map((i) => checkName(i, opts)));
  const ranking = rankReports(reports);
  return { ranking, reports };
}

/** Nur für Tests */
export function clearResultCache(): void {
  resultCache.clear();
}
