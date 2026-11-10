import { cachedLookup, createTtlCache, DEFAULT_CACHE_MAX, DEFAULT_CACHE_TTL_MS } from "@/lib/cache";
import { buildUserAgent, createHttpClient } from "@/lib/engine/http";
import { DEFAULT_DOMAIN_TLDS, domainSources, FEATURED_TLDS, isDomainTld } from "@/lib/engine/sources/domains";
import { KNOWN_NAME_SOURCES } from "@/lib/engine/sources/known-names";
import { PACKAGE_SOURCES } from "@/lib/engine/sources/packages";
import { wikidataBrands } from "@/lib/engine/sources/wikidata-brands";
import { REGISTRY_SOURCES } from "@/lib/engine/sources/registries";
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
import { safeHttpUrl } from "@/lib/engine/url";
import { normalizeName } from "@/lib/name";
import { registerConfigFromEnv, registerLink, type RegisterService } from "@/lib/register";

export const DEFAULT_NAMESPACES: readonly Namespace[] = ["domains", "packages", "stores", "known_names"];
export const MAX_TLDS = 8;
export const MAX_NAMES = 10;
const DEADLINE_MS = 8000;

/** Alle Quellen außer Domains (die entstehen je Endung). */
export const STATIC_SOURCES: readonly Source[] = [
  ...PACKAGE_SOURCES,
  ...REGISTRY_SOURCES,
  ...STORE_SOURCES,
  ...SOCIAL_SOURCES,
  ...KNOWN_NAME_SOURCES,
  wikidataBrands,
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
  /**
   * Registrierungsdienst des Betreibers (src/lib/register.ts); null schaltet den Link ab.
   * Ohne Angabe gilt MARKENFREI_REGISTER_URL/MARKENFREI_REGISTER_NAME aus der Umgebung.
   */
  register?: RegisterService | null;
  fetchImpl?: typeof fetch;
  now?: () => number;
  /** Nur für Tests: eigene Quellen statt der eingebauten */
  registry?: readonly Source[];
  /**
   * Intern: Besitzer für die Slot-Grenze je Host im HTTP-Client. checkNames setzt einen
   * gemeinsamen Besitzer für alle Namen, damit eine Shortlist andere Prüfungen nicht verdrängt.
   */
  httpOwner?: object;
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
    if (!isDomainTld(t)) {
      throw new CheckInputError(
        `Endung „${t.slice(0, 20)}“ wird nicht unterstützt. Die erlaubten Endungen stehen unter /api/sources.`,
      );
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

/**
 * Vorübergehende Gründe für "unknown", erkennbar am Beleg der Quelle: Abfragebudget, Zeitüberschreitung,
 * Ablauf der Gesamtzeit oder HTTP 429. Dauerhafte Fehler (Netzwerk, 5xx, unerwartetes Format) zählen nicht,
 * ebenso wenig ein Abfragebudget, das erst viel später wieder frei ist ("budget_long", siehe http.ts):
 * das Wort muss als Ganzes dastehen, "budget_long" passt deshalb nicht auf "budget".
 */
export function isTransient(evidence: string | undefined): boolean {
  return !!evidence && /(^|[\s,;])(budget|timeout|deadline|HTTP 429)(?!\w)/.test(evidence);
}

function failed(source: Source, name: string, note: string): SourceResult {
  return { sourceId: source.id, namespace: source.namespace, label: source.label, target: name, status: "unknown", note };
}

/**
 * Hängt den Registrierungs-Link an eine Domain-Zeile einer einzeln geprüften Endung mit
 * "not_found". Läuft nach dem Zwischenspeicher und kopiert die Zeile, damit eine gespeicherte
 * Zeile nie einen Link trägt und eine geänderte Einstellung sofort gilt.
 */
function withRegisterLink(r: SourceResult, service: RegisterService): SourceResult {
  if (r.namespace !== "domains" || r.status !== "not_found" || !r.sourceId.startsWith("rdap:")) return r;
  if (!FEATURED_TLDS.includes(r.sourceId.slice("rdap:".length))) return r;
  const register = registerLink(service, r.target);
  return register ? { ...r, register } : r;
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
    owner: opts.httpOwner,
  });
  const ctx = { http, contact };

  const cached = await Promise.all(
    sources.map((s) =>
      cachedLookup(
        resultCache,
        `${s.id}|${name}`,
        async () => {
          try {
            const r = await s.check(name, ctx);
            // Link aus Fremdantworten absichern; ungültige Links fallen weg
            const retryable = r.status === "unknown" && isTransient(r.evidence);
            return { ...r, url: safeHttpUrl(r.url), ...(retryable ? { retryable: true } : {}) };
          } catch {
            return failed(s, name, "Interner Fehler bei der Abfrage");
          }
        },
        (r) => DEFINITIVE.includes(r.status),
      ),
    ),
  );
  const service = opts.register === undefined ? registerConfigFromEnv(process.env) : opts.register;
  const results = service ? cached.map((r) => withRegisterLink(r, service)) : cached;

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
  // Erst alles prüfen, dann abfragen: Ein ungültiger Name darf keine Anfragen an Dritte
  // auslösen, deren Ergebnis niemand mehr bekommt. Doppelte gelten nach der Normalisierung
  // ("Foo" und "foo", "Müller" und "mueller"); die erste Eingabe bleibt.
  const unique: string[] = [];
  const seen = new Set<string>();
  for (const raw of inputs) {
    const i = String(raw ?? "");
    const n = normalizeName(i);
    if (!n.ok) throw new CheckInputError(n.error);
    if (seen.has(n.name)) continue;
    seen.add(n.name);
    unique.push(i);
  }
  resolveSources(opts);
  const shared: CheckOptions = { ...opts, httpOwner: opts.httpOwner ?? {} };
  const reports = await Promise.all(unique.map((i) => checkName(i, shared)));
  const ranking = rankReports(reports);
  return { ranking, reports };
}

/** Nur für Tests */
export function clearResultCache(): void {
  resultCache.clear();
}
