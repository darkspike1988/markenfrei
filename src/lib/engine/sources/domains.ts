import type { HttpClient, HttpResponse, Source, SourceResult } from "@/lib/engine/types";

/**
 * Domain-Quellen: eine Quelle pro Endung (id "rdap:<tld>").
 *
 * Signal: nur der HTTP-Status des autoritativen RDAP-Servers der Registry zählt
 * (200 = registriert, 404 = dort nicht registriert). Der Server kommt aus dem
 * IANA-Bootstrap (RFC 9224) oder aus festen Overrides für Endungen, die dort fehlen.
 * DNS über HTTPS dient nur zur Bestätigung von „vergeben“ (NS-Einträge vorhanden),
 * nie als Beleg für „frei“.
 *
 * Live geprüft am 4. November 2026 mit google.<tld> (200) und zzqxkvjwabc.<tld> (404)
 * für alle RDAP-Endungen unten; `cloud`, `online`, `site`, `store`, `blog`, `design`,
 * `space`, `biz`, `pro`, `ca`, `tv` und `berlin` am 5. November 2026 gegen den Server
 * aus dem IANA-Bootstrap. .de und .io fehlen im IANA-Bootstrap und kommen deshalb
 * aus den Overrides.
 */

const BOOTSTRAP_URL = "https://data.iana.org/rdap/dns.json";
const BOOTSTRAP_TTL_MS = 24 * 60 * 60 * 1000;
/** Nach einem Ausfall den Bootstrap so lange nicht erneut laden (nur Overrides). */
const BOOTSTRAP_RETRY_MS = 5 * 60 * 1000;
const BOOTSTRAP_MAX_BYTES = 512 * 1024;

/** Feste RDAP-Server für Endungen ohne Eintrag im IANA-Bootstrap (Basis inkl. "domain/"). */
const RDAP_OVERRIDES: Readonly<Record<string, string>> = {
  de: "https://rdap.denic.de/domain/",
  io: "https://rdap.identitydigital.services/rdap/domain/",
  ch: "https://rdap.nic.ch/domain/",
  li: "https://rdap.nic.ch/domain/",
};

/** Endungen ohne verlässliches öffentliches RDAP: nur DNS, Ergebnis höchstens „vergeben“. */
const DOH_ONLY: readonly string[] = ["at", "eu"];

/** Endungen mit RDAP (Bootstrap oder Override), jeweils mit 200/404 live geprüft. */
const RDAP_TLDS: readonly string[] = [
  "de",
  "com",
  "net",
  "org",
  "dev",
  "app",
  "io",
  "ai",
  "ch",
  "li",
  "fr",
  "uk",
  "nl",
  "pl",
  "cz",
  "xyz",
  "shop",
  "tech",
  "info",
  "cloud",
  "online",
  "site",
  "store",
  "blog",
  "design",
  "space",
  "biz",
  "pro",
  "ca",
  "tv",
  "berlin",
];

export const DOMAIN_TLDS: readonly string[] = [...RDAP_TLDS, ...DOH_ONLY];

export const DEFAULT_DOMAIN_TLDS: readonly string[] = ["de", "com", "dev", "app", "io"];

/** Endungen, die nur per DNS geprüft werden (kein „nicht gefunden“ möglich). */
export const DOH_ONLY_TLDS: readonly string[] = DOH_ONLY;

// --- IANA-Bootstrap -------------------------------------------------------

let bootstrapCache: { map: Map<string, string>; expiresAt: number } | undefined;
let bootstrapPending: Promise<Map<string, string>> | undefined;

function overridesOnly(): Map<string, string> {
  return new Map(Object.entries(RDAP_OVERRIDES));
}

function parseBootstrap(json: unknown): Map<string, string> | undefined {
  if (!json || typeof json !== "object") return undefined;
  const services = (json as { services?: unknown }).services;
  if (!Array.isArray(services) || services.length === 0) return undefined;
  const map = new Map<string, string>();
  for (const entry of services) {
    if (!Array.isArray(entry) || entry.length < 2) continue;
    const [tlds, urls] = entry as [unknown, unknown];
    if (!Array.isArray(tlds) || !Array.isArray(urls)) continue;
    const https = urls.find((u): u is string => typeof u === "string" && u.startsWith("https://"));
    if (!https) continue;
    const base = `${https.endsWith("/") ? https : `${https}/`}domain/`;
    for (const t of tlds) {
      if (typeof t === "string" && t) map.set(t.toLowerCase(), base);
    }
  }
  return map.size > 0 ? map : undefined;
}

/**
 * Lädt den IANA-RDAP-Bootstrap (Prozess-Cache 24 h) und ergänzt die festen Overrides.
 * Einträge aus dem Bootstrap haben Vorrang, Overrides füllen nur Lücken.
 * Bei Ausfall oder unerwartetem Format: nur die Overrides (5 Minuten, dann neuer Versuch).
 * Werte sind Basis-URLs inklusive "domain/", z. B. "https://rdap.verisign.com/com/v1/domain/".
 */
export async function loadRdapBootstrap(
  http: HttpClient,
  now: () => number = Date.now,
): Promise<Map<string, string>> {
  if (bootstrapCache && bootstrapCache.expiresAt > now()) return bootstrapCache.map;
  if (bootstrapPending) return bootstrapPending;

  bootstrapPending = (async () => {
    let parsed: Map<string, string> | undefined;
    try {
      const res = await http.request(BOOTSTRAP_URL, {
        headers: { Accept: "application/json" },
        read: "json",
        maxBytes: BOOTSTRAP_MAX_BYTES,
      });
      if (res.status === 200 && !res.error) parsed = parseBootstrap(res.json);
    } catch {
      parsed = undefined;
    }
    const map = overridesOnly();
    if (parsed) {
      for (const [tld, base] of parsed) map.set(tld, base);
      bootstrapCache = { map, expiresAt: now() + BOOTSTRAP_TTL_MS };
    } else {
      bootstrapCache = { map, expiresAt: now() + BOOTSTRAP_RETRY_MS };
    }
    return map;
  })().finally(() => {
    bootstrapPending = undefined;
  });
  return bootstrapPending;
}

/** Nur für Tests: Prozess-Cache des Bootstraps leeren. */
export function resetRdapBootstrapCache(): void {
  bootstrapCache = undefined;
  bootstrapPending = undefined;
}

// --- Syntax ---------------------------------------------------------------

/**
 * Regeln für ein Domain-Label (RFC 1035/5891, so auch DENIC, SWITCH, Verisign):
 * 1–63 Zeichen a-z, 0-9, Bindestrich; kein Bindestrich am Anfang oder Ende;
 * kein Bindestrich an Stelle 3 und 4 (reserviert für IDN-Kodierung "xn--").
 * .eu verlangt mindestens 2 Zeichen (der Name kommt ohnehin mit mindestens 2 an).
 */
export function domainLabelError(name: string): string | undefined {
  if (name.length < 2 || name.length > 63) return "Länge muss 2 bis 63 Zeichen sein.";
  if (!/^[a-z0-9-]+$/.test(name)) return "Nur a-z, 0-9 und Bindestrich erlaubt.";
  if (name.startsWith("-") || name.endsWith("-")) {
    return "Kein Bindestrich am Anfang oder Ende.";
  }
  if (name.slice(2, 4) === "--") {
    return "Bindestrich an Stelle 3 und 4 ist für IDN-Kodierung (xn--) reserviert.";
  }
  return undefined;
}

// --- Links zum Nachprüfen ---------------------------------------------------

/** Registrar-neutrale Seite zum manuellen Nachprüfen (per curl geprüft). */
export function domainLookupUrl(domain: string, tld: string): string {
  const enc = encodeURIComponent(domain);
  switch (tld) {
    case "de":
      return `https://webwhois.denic.de/?lang=de&query=${enc}`;
    case "ch":
      return "https://www.nic.ch/de/whois/";
    case "li":
      return "https://www.nic.li/whois/";
    case "at":
      return "https://www.nic.at/de";
    case "eu":
      return `https://whois.eurid.eu/de/search/?domain=${enc}`;
    default:
      return `https://lookup.icann.org/en/lookup?name=${enc}`;
  }
}

// --- DNS über HTTPS -------------------------------------------------------

const DOH_PROVIDERS = [
  (d: string) => `https://dns.google/resolve?name=${encodeURIComponent(d)}&type=NS`,
  // IP-Adresse statt cloudflare-dns.com: funktioniert auch, wenn lokale Resolver DoH-Hostnamen sperren
  (d: string) => `https://1.1.1.1/dns-query?name=${encodeURIComponent(d)}&type=NS`,
];

type DohOutcome = { kind: "ns" | "no_ns" | "unknown"; evidence: string };

function stripDot(s: string): string {
  return s.endsWith(".") ? s.slice(0, -1) : s;
}

/**
 * NS-Abfrage über DoH (Google, dann Cloudflare), über ctx.http.
 * "ns" heißt: Delegation in der Zone der Endung vorhanden, also registriert.
 * "no_ns" (NXDOMAIN oder keine NS) beweist nichts über die Registrierbarkeit.
 */
async function dohNs(http: HttpClient, domain: string): Promise<DohOutcome> {
  let last = "DNS: keine Antwort";
  for (const build of DOH_PROVIDERS) {
    let res: HttpResponse;
    try {
      res = await http.request(build(domain), {
        headers: { Accept: "application/dns-json" },
        read: "json",
        maxBytes: 16 * 1024,
        timeoutMs: 3000,
      });
    } catch {
      continue;
    }
    if (res.error || res.status !== 200 || !res.json || typeof res.json !== "object") {
      last = `DNS: ${res.error ?? `HTTP ${res.status}`}`;
      continue;
    }
    const data = res.json as { Status?: unknown; Answer?: unknown };
    if (data.Status === 0) {
      const answers = Array.isArray(data.Answer) ? data.Answer : [];
      const hasNs = answers.some(
        (a) =>
          !!a &&
          typeof a === "object" &&
          (a as { type?: unknown }).type === 2 &&
          typeof (a as { name?: unknown }).name === "string" &&
          stripDot((a as { name: string }).name).toLowerCase() === domain,
      );
      return hasNs
        ? { kind: "ns", evidence: "DNS: NS vorhanden" }
        : { kind: "no_ns", evidence: "DNS: keine NS" };
    }
    if (data.Status === 3) return { kind: "no_ns", evidence: "DNS: NXDOMAIN" };
    last = `DNS: Status ${String(data.Status)}`;
  }
  return { kind: "unknown", evidence: last };
}

// --- Quellen --------------------------------------------------------------

function describe(res: HttpResponse): string {
  return res.error ? `RDAP: ${res.error}` : `RDAP HTTP ${res.status}`;
}

function makeSource(tld: string): Source {
  const label = `.${tld}`;
  const dohOnly = DOH_ONLY.includes(tld);
  const override = RDAP_OVERRIDES[tld];

  const description = dohOnly
    ? `${label}: kein öffentliches RDAP, nur DNS-Abfrage (NS). Ergebnis höchstens „vergeben“, sonst offen.`
    : `${label}: RDAP der Registry (200 = registriert, 404 = dort nicht registriert, nicht gleich registrierbar). DNS nur zur Bestätigung von „vergeben“.`;
  const endpoint = dohOnly
    ? `https://dns.google/resolve?name={name}.${tld}&type=NS`
    : override
      ? `${override}{name}.${tld}`
      : `${BOOTSTRAP_URL} → {rdap}domain/{name}.${tld}`;

  return {
    id: `rdap:${tld}`,
    namespace: "domains",
    label,
    defaultEnabled: DEFAULT_DOMAIN_TLDS.includes(tld),
    description,
    endpoint,
    async check(name, ctx): Promise<SourceResult> {
      const domain = `${name}.${tld}`;
      const base: SourceResult = {
        sourceId: `rdap:${tld}`,
        namespace: "domains",
        label,
        target: domain,
        status: "unknown",
        url: domainLookupUrl(domain, tld),
      };

      try {
        const syntax = domainLabelError(name);
        if (syntax) return { ...base, status: "invalid", note: syntax, evidence: "Syntaxprüfung" };

        if (dohOnly) {
          const dns = await dohNs(ctx.http, domain);
          if (dns.kind === "ns") {
            return { ...base, status: "taken", note: "Per DNS bestätigt (NS-Einträge vorhanden).", evidence: dns.evidence };
          }
          return {
            ...base,
            note: `Für ${label} gibt es keine öffentliche RDAP-Auskunft. Ohne DNS-Eintrag bleibt offen, ob die Domain registriert ist; bitte bei der Registry nachsehen.`,
            evidence: dns.evidence,
          };
        }

        const servers = await loadRdapBootstrap(ctx.http);
        const server = servers.get(tld);
        let rdapEvidence: string;
        let rdapNote: string;
        if (!server) {
          rdapEvidence = "RDAP: kein Server (IANA-Bootstrap nicht verfügbar)";
          rdapNote = "RDAP-Server der Registry nicht ermittelbar.";
        } else {
          const res = await ctx.http.request(`${server}${encodeURIComponent(domain)}`, {
            headers: { Accept: "application/rdap+json" },
            read: "none",
          });
          if (!res.error && res.status === 200) {
            return { ...base, status: "taken", note: "Bei der Registry registriert.", evidence: "RDAP HTTP 200" };
          }
          if (!res.error && res.status === 404) {
            return {
              ...base,
              status: "not_found",
              note: "Bei der Registry nicht registriert. Das heißt nicht sicher registrierbar (reservierte oder gesperrte Namen möglich).",
              evidence: "RDAP HTTP 404",
            };
          }
          rdapEvidence = describe(res);
          rdapNote =
            res.status === 429
              ? "Registry drosselt Anfragen (HTTP 429)."
              : "Keine verwertbare Antwort der Registry.";
        }

        const dns = await dohNs(ctx.http, domain);
        if (dns.kind === "ns") {
          return {
            ...base,
            status: "taken",
            note: "Per DNS bestätigt (NS-Einträge vorhanden), RDAP ohne Antwort.",
            evidence: `${rdapEvidence}; ${dns.evidence}`,
          };
        }
        return {
          ...base,
          note: `${rdapNote} Status offen, nicht als frei werten.`,
          evidence: `${rdapEvidence}; ${dns.evidence}`,
        };
      } catch {
        return { ...base, note: "Interner Fehler bei der Abfrage. Status offen.", evidence: "Ausnahme" };
      }
    },
  };
}

/**
 * Eine Quelle pro Endung. Unbekannte Endungen werden übergangen, Doppelte zusammengefasst,
 * führender Punkt und Großschreibung toleriert.
 */
export function domainSources(tlds: string[]): Source[] {
  const seen = new Set<string>();
  const out: Source[] = [];
  for (const raw of tlds) {
    const tld = String(raw ?? "").trim().toLowerCase().replace(/^\./, "");
    if (!DOMAIN_TLDS.includes(tld) || seen.has(tld)) continue;
    seen.add(tld);
    out.push(makeSource(tld));
  }
  return out;
}
