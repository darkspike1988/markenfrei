import { buildUserAgent } from "@/lib/engine/http";
import type { CheckContext, HttpResponse, Source, SourceResult } from "@/lib/engine/types";

/**
 * Paket- und Entwickler-Quellen (Namensraum "packages").
 * Jede Quelle liefert genau ein SourceResult und wirft nie.
 * "not_found" heißt nur: die Registry kennt den Namen nicht. Es heißt nicht "registrierbar".
 */

type Base = Pick<SourceResult, "sourceId" | "namespace" | "label" | "target" | "url">;

const enc = encodeURIComponent;

export function base(sourceId: string, label: string, target: string, url: string): Base {
  return { sourceId, namespace: "packages", label, target, url };
}

function evidenceOf(res: HttpResponse): string {
  if (res.error) return res.status ? `HTTP ${res.status}, ${res.error}` : res.error;
  return `HTTP ${res.status}`;
}

const ERROR_NOTE: Record<NonNullable<HttpResponse["error"]>, string> = {
  timeout: "Zeitüberschreitung, später erneut prüfen",
  deadline: "Gesamtzeit der Prüfung überschritten",
  network: "Netzwerkfehler, Quelle nicht erreichbar",
  too_large: "Antwort größer als erwartet",
  parse: "Antwort nicht lesbar",
  budget: "Abfragelimit des Dienstes erreicht, später erneut prüfen",
};

export function unknownResult(b: Base, res: HttpResponse, note?: string): SourceResult {
  let n = note;
  if (!n) {
    if (res.error) n = ERROR_NOTE[res.error];
    else if (res.status === 429) n = "Rate-Limit erreicht, später erneut prüfen";
    else if (res.status >= 500) n = "Dienst gerade nicht verfügbar";
    else n = "unerwartete Antwort";
  }
  return { ...b, status: "unknown", note: n, evidence: evidenceOf(res) };
}

export function invalidResult(b: Base, note: string): SourceResult {
  return { ...b, status: "invalid", note, evidence: "Syntaxprüfung, keine Abfrage" };
}

export function crashResult(b: Base, err: unknown): SourceResult {
  const msg = err instanceof Error ? err.message : String(err);
  return { ...b, status: "unknown", note: "interner Fehler bei der Abfrage", evidence: msg.slice(0, 120) };
}

/** 200 => taken, 404 => not_found, sonst unknown. */
export function byStatus(
  b: Base,
  res: HttpResponse,
  notes: { taken?: string; notFound: string },
): SourceResult {
  if (res.error) return unknownResult(b, res);
  if (res.status === 200) {
    return { ...b, status: "taken", evidence: evidenceOf(res), ...(notes.taken ? { note: notes.taken } : {}) };
  }
  if (res.status === 404) return { ...b, status: "not_found", note: notes.notFound, evidence: evidenceOf(res) };
  return unknownResult(b, res);
}

/** Hilfsquelle: eine GET-Anfrage, nur der Status zählt. */
function statusSource(def: {
  id: string;
  label: string;
  defaultEnabled: boolean;
  description: string;
  endpoint: string;
  apiUrl: (name: string) => string;
  humanUrl: (name: string) => string;
  target?: (name: string) => string;
  /** Rückgabe eines Hinweises => invalid */
  validate?: (name: string) => string | null;
  headers?: () => Record<string, string>;
  notFound: string;
  taken?: string;
}): Source {
  return {
    id: def.id,
    namespace: "packages",
    label: def.label,
    defaultEnabled: def.defaultEnabled,
    description: def.description,
    endpoint: def.endpoint,
    async check(name: string, ctx: CheckContext): Promise<SourceResult> {
      const b = base(def.id, def.label, def.target ? def.target(name) : name, def.humanUrl(name));
      try {
        const problem = def.validate?.(name);
        if (problem) return invalidResult(b, problem);
        const res = await ctx.http.request(def.apiUrl(name), {
          method: "GET",
          read: "none",
          ...(def.headers ? { headers: def.headers() } : {}),
        });
        return byStatus(b, res, { notFound: def.notFound, taken: def.taken });
      } catch (err) {
        return crashResult(b, err);
      }
    },
  };
}

// ---------------------------------------------------------------------------
// Syntaxregeln (Name kommt normalisiert: a-z, 0-9, "-", 2–63 Zeichen)

const NORMALIZED = /^[a-z0-9-]+$/;

export function basicProblem(name: string): string | null {
  if (!NORMALIZED.test(name)) return "nur a-z, 0-9 und Bindestrich erlaubt";
  return null;
}

/** npm: höchstens 214 Zeichen, keine Großbuchstaben, nicht mit . oder _ beginnen, URL-sicher. */
export function npmProblem(name: string): string | null {
  if (name.length === 0 || name.length > 214) return "npm erlaubt 1 bis 214 Zeichen";
  if (name !== name.toLowerCase()) return "npm erlaubt keine Großbuchstaben";
  if (name.startsWith(".") || name.startsWith("_")) return "npm-Namen dürfen nicht mit . oder _ beginnen";
  if (name.trim() !== name) return "npm-Namen dürfen keine Leerzeichen enthalten";
  if (encodeURIComponent(name) !== name) return "npm-Namen müssen URL-sicher sein";
  if (name === "node_modules" || name === "favicon.ico") return "von npm gesperrter Name";
  return null;
}

/** PEP 503: Kleinbuchstaben, Folgen aus -, _ und . werden zu einem "-". */
export function pep503(name: string): string {
  return name.toLowerCase().replace(/[-_.]+/g, "-");
}

/** PyPI: muss mit Buchstabe oder Ziffer beginnen und enden. */
export function pypiProblem(name: string): string | null {
  if (!/^([a-z0-9]|[a-z0-9][a-z0-9._-]*[a-z0-9])$/i.test(name)) {
    return "PyPI-Namen müssen mit Buchstabe oder Ziffer beginnen und enden";
  }
  return null;
}

/** GitHub: höchstens 39 Zeichen, kein doppelter Bindestrich, nicht mit Bindestrich beginnen oder enden. */
export function githubProblem(name: string): string | null {
  const b = basicProblem(name);
  if (b) return b;
  if (name.length > 39) return "GitHub erlaubt höchstens 39 Zeichen";
  if (name.includes("--")) return "GitHub erlaubt keinen doppelten Bindestrich";
  if (name.startsWith("-") || name.endsWith("-")) return "GitHub-Namen dürfen nicht mit Bindestrich beginnen oder enden";
  return null;
}

/** crates.io: höchstens 64 Zeichen, a-z0-9 - _, muss mit Buchstabe beginnen. */
export function cratesProblem(name: string): string | null {
  const b = basicProblem(name);
  if (b) return b;
  if (name.length > 64) return "crates.io erlaubt höchstens 64 Zeichen";
  if (!/^[a-z]/.test(name)) return "crates.io-Namen müssen mit einem Buchstaben beginnen";
  return null;
}

/** NuGet: höchstens 100 Zeichen, Segmente aus Wortzeichen getrennt durch . oder -. */
export function nugetProblem(name: string): string | null {
  const b = basicProblem(name);
  if (b) return b;
  if (name.length > 100) return "NuGet erlaubt höchstens 100 Zeichen";
  if (!/^\w+([.-]\w+)*$/.test(name)) {
    return "NuGet-IDs dürfen nicht mit Bindestrich beginnen oder enden und keinen doppelten enthalten";
  }
  return null;
}

/** RubyGems: Buchstaben, Ziffern, - _ ., mindestens ein Buchstabe, beginnt mit Buchstabe oder Ziffer. */
export function rubygemsProblem(name: string): string | null {
  const b = basicProblem(name);
  if (b) return b;
  if (!/[a-z]/.test(name)) return "RubyGems verlangt mindestens einen Buchstaben";
  if (!/^[a-z0-9]/.test(name)) return "Gem-Namen müssen mit Buchstabe oder Ziffer beginnen";
  return null;
}

/** Composer-Vendor: ^[a-z0-9]([_.-]?[a-z0-9]+)*$ */
export function packagistProblem(name: string): string | null {
  const b = basicProblem(name);
  if (b) return b;
  if (!/^[a-z0-9]([_.-]?[a-z0-9]+)*$/.test(name)) {
    return "Composer-Vendor darf nicht mit Bindestrich beginnen oder enden und keinen doppelten enthalten";
  }
  return null;
}

/**
 * Nur die echten reservierten Wörter von Dart, die pub als Paketnamen ablehnt.
 * Built-in-Identifier und kontextuelle Schlüsselwörter (async, get, show, type …) sind als Paketname erlaubt.
 */
const DART_RESERVED = new Set([
  "assert", "break", "case", "catch", "class", "const", "continue", "default", "do", "else", "enum",
  "extends", "false", "final", "finally", "for", "if", "in", "is", "new", "null", "rethrow", "return",
  "super", "switch", "this", "throw", "true", "try", "var", "void", "while", "with",
]);

/** pub.dev: gültiger Dart-Bezeichner aus a-z, 0-9, _; beginnt mit Buchstabe; kein reserviertes Wort. */
export function pubProblem(name: string): string | null {
  if (name.includes("-")) {
    return `pub.dev erlaubt keinen Bindestrich (Variante: ${name.replace(/-/g, "_")})`;
  }
  if (!/^[a-z_][a-z0-9_]*$/.test(name)) return "pub.dev-Namen müssen mit einem Buchstaben beginnen";
  if (DART_RESERVED.has(name)) return "reserviertes Dart-Wort";
  if (name.length > 64) return "pub.dev erlaubt höchstens 64 Zeichen";
  return null;
}

/** JSR-Scope: 2–20 Zeichen, a-z0-9 und Bindestrich, nicht mit Bindestrich beginnen. */
export function jsrProblem(name: string): string | null {
  const b = basicProblem(name);
  if (b) return b;
  if (name.length < 2 || name.length > 20) return "JSR-Scopes haben 2 bis 20 Zeichen";
  if (name.startsWith("-")) return "JSR-Scopes dürfen nicht mit Bindestrich beginnen";
  return null;
}

/** Hex.pm: ^[a-z][a-z0-9_]*$ */
export function hexProblem(name: string): string | null {
  if (name.includes("-")) return `Hex.pm erlaubt keinen Bindestrich (Variante: ${name.replace(/-/g, "_")})`;
  if (!/^[a-z][a-z0-9_]*$/.test(name)) return "Hex.pm-Namen müssen mit einem Buchstaben beginnen";
  return null;
}

/** CRAN: Buchstaben, Ziffern und Punkt, beginnt mit Buchstabe, endet nicht mit Punkt, mindestens 2 Zeichen. */
export function cranProblem(name: string): string | null {
  if (name.includes("-")) return `CRAN erlaubt keinen Bindestrich (Variante: ${name.replace(/-/g, ".")})`;
  if (!/^[a-zA-Z][a-zA-Z0-9.]*[a-zA-Z0-9]$/.test(name)) {
    return "CRAN-Namen müssen mit einem Buchstaben beginnen und mindestens 2 Zeichen haben";
  }
  return null;
}

/** Open VSX-Namespace: Wortzeichen und Bindestrich. */
export function openvsxProblem(name: string): string | null {
  const b = basicProblem(name);
  if (b) return b;
  if (name.startsWith("-")) return "Open-VSX-Namespaces dürfen nicht mit Bindestrich beginnen";
  return null;
}

// ---------------------------------------------------------------------------
// npm

const npm = statusSource({
  id: "npm",
  label: "npm",
  defaultEnabled: true,
  description: "npm-Registry: existiert ein Paket mit genau diesem Namen?",
  endpoint: "https://registry.npmjs.org/{name}",
  apiUrl: (n) => `https://registry.npmjs.org/${enc(n)}`,
  humanUrl: (n) => `https://www.npmjs.com/package/${enc(n)}`,
  validate: npmProblem,
  headers: () => ({ Accept: "application/vnd.npm.install-v1+json" }),
  notFound: "kein Paket mit diesem Namen; npm kann ähnliche Namen trotzdem ablehnen",
});

// ---------------------------------------------------------------------------
// PyPI

const pypi: Source = (() => {
  const inner = statusSource({
    id: "pypi",
    label: "PyPI",
    defaultEnabled: true,
    description: "Python Package Index: existiert ein Projekt mit diesem Namen (PEP-503-normalisiert)?",
    endpoint: "https://pypi.org/pypi/{name}/json",
    apiUrl: (n) => `https://pypi.org/pypi/${enc(n)}/json`,
    humanUrl: (n) => `https://pypi.org/project/${enc(n)}/`,
    validate: pypiProblem,
    notFound: "kein Projekt mit diesem Namen; PyPI kann gesperrte oder ähnliche Namen trotzdem ablehnen",
  });
  return { ...inner, check: (name, ctx) => inner.check(pep503(name), ctx) };
})();

// ---------------------------------------------------------------------------
// GitHub (Nutzer oder Organisation) mit modulweiter Sperre nach Rate-Limit

let githubBlockedUntil = 0;
const GITHUB_FALLBACK_BLOCK_MS = 60_000;

/** Hebt die modulweite GitHub-Sperre auf (für Tests). */
export function resetGithubRateLimit(): void {
  githubBlockedUntil = 0;
}

/** Zeitpunkt (ms), bis zu dem keine GitHub-Anfrage gestellt wird; 0 wenn keine Sperre. */
export function githubBlockedUntilMs(): number {
  return githubBlockedUntil;
}

function clock(ms: number): string {
  try {
    return new Intl.DateTimeFormat("de-DE", {
      hour: "2-digit",
      minute: "2-digit",
      timeZone: "Europe/Berlin",
    }).format(new Date(ms));
  } catch {
    return new Date(ms).toISOString();
  }
}

const github: Source = {
  id: "github",
  namespace: "packages",
  label: "GitHub",
  defaultEnabled: true,
  description: "GitHub: gibt es einen Nutzer oder eine Organisation mit diesem Namen?",
  endpoint: "https://api.github.com/users/{name}",
  async check(name, ctx) {
    const b = base("github", "GitHub", name, `https://github.com/${enc(name)}`);
    try {
      const problem = githubProblem(name);
      if (problem) return invalidResult(b, problem);

      const now = Date.now();
      if (githubBlockedUntil > now) {
        return {
          ...b,
          status: "unknown",
          note: `GitHub-Rate-Limit erreicht, keine Anfrage bis ${clock(githubBlockedUntil)} Uhr`,
          evidence: `gesperrt bis ${new Date(githubBlockedUntil).toISOString()}`,
        };
      }

      const headers: Record<string, string> = {
        Accept: "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
      };
      const token = process.env.GITHUB_TOKEN;
      if (token) headers.Authorization = `Bearer ${token}`;

      const res = await ctx.http.request(`https://api.github.com/users/${enc(name)}`, {
        method: "GET",
        read: "none",
        headers,
      });

      if (!res.error && (res.status === 403 || res.status === 429)) {
        const remaining = res.headers.get("x-ratelimit-remaining");
        const retryAfter = Number(res.headers.get("retry-after"));
        let until = 0;
        if (remaining === "0") {
          const reset = Number(res.headers.get("x-ratelimit-reset"));
          const fallback = Date.now() + GITHUB_FALLBACK_BLOCK_MS;
          // reset in der Vergangenheit (Uhrabweichung, späte Antwort) => Ausweichsperre
          until = Number.isFinite(reset) && reset > 0 ? Math.max(reset * 1000, fallback) : fallback;
        } else if (Number.isFinite(retryAfter) && retryAfter > 0) {
          until = Date.now() + retryAfter * 1000;
        }
        if (until > 0) {
          githubBlockedUntil = Math.max(githubBlockedUntil, until);
          // Beleg ohne "HTTP 429/403": GitHub sperrt bis zu eine Stunde, eine kurze Wiederholung (retryable)
          // würde nichts bringen
          return {
            ...unknownResult(b, res, `GitHub-Rate-Limit erreicht, keine Anfrage bis ${clock(githubBlockedUntil)} Uhr`),
            evidence: `Rate-Limit, gesperrt bis ${new Date(githubBlockedUntil).toISOString()}`,
          };
        }
      }

      return byStatus(b, res, {
        notFound: "kein Nutzer und keine Organisation; reservierte oder gesperrte Namen möglich",
      });
    } catch (err) {
      return crashResult(b, err);
    }
  },
};

// ---------------------------------------------------------------------------
// crates.io

const cratesApi = statusSource({
  id: "crates",
  label: "crates.io",
  defaultEnabled: true,
  description: "crates.io (Rust): existiert ein Crate mit diesem Namen?",
  endpoint: "https://crates.io/api/v1/crates/{name}",
  apiUrl: (n) => `https://crates.io/api/v1/crates/${enc(n)}`,
  humanUrl: (n) => `https://crates.io/crates/${enc(n)}`,
  validate: cratesProblem,
  notFound: "kein Crate mit diesem Namen; crates.io behandelt - und _ gleich und sperrt manche Namen",
});

/** Pfad einer Datei im Sparse-Index von crates.io (https://doc.rust-lang.org/cargo/reference/registry-index.html). */
export function cratesIndexPath(name: string): string {
  const n = name.toLowerCase();
  if (n.length === 1) return `1/${n}`;
  if (n.length === 2) return `2/${n}`;
  if (n.length === 3) return `3/${n[0]}/${n}`;
  return `${n.slice(0, 2)}/${n.slice(2, 4)}/${n}`;
}

/** Vorübergehend gescheitert (gleiche Regel wie isTransient in check.ts, dort nicht importierbar: Zyklus). */
function transientReply(r: HttpResponse): boolean {
  return r.error === "timeout" || r.error === "budget" || r.error === "deadline" || r.status === 429;
}

/** Höchstens so viele Trennzeichen, damit alle Schreibweisen (2^k) einzeln abgefragt werden. */
const CRATES_MAX_SEPARATORS = 2;

const CRATES_NOT_FOUND = "kein Crate mit diesem Namen (auch nicht mit _ statt -); crates.io sperrt manche Namen trotzdem";

/**
 * Alle Schreibweisen, die crates.io als denselben Namen behandelt (- und _ gleich), oder null, wenn
 * es zu viele wären. Der Index kennt nur die Schreibweise, mit der das Crate veröffentlicht wurde.
 */
export function cratesVariants(name: string): string[] | null {
  const parts = name.split("-");
  const k = parts.length - 1;
  if (k > CRATES_MAX_SEPARATORS) return null;
  const out: string[] = [];
  for (let mask = 0; mask < 1 << k; mask++) {
    out.push(parts.reduce((acc, part, i) => acc + (i === 0 ? "" : mask & (1 << (i - 1)) ? "_" : "-") + part, ""));
  }
  return out;
}

/**
 * crates.io über den Sparse-Index (index.crates.io). Beleg: crates.io Data Access Policy
 * (https://crates.io/data-access, Stand 7. November 2026): "No rate limits are required to use data from
 * the sparse crate index." Die API dagegen: höchstens 1 Anfrage pro Sekunde und ein User-Agent, der die
 * Anwendung identifiziert; das wäre für Shortlists zu knapp. Hat der Name zu viele Trennzeichen für alle
 * Schreibweisen, fragt die Quelle die API ab. Weiterleitungen (3xx) werden nicht verfolgt und ergeben unknown.
 */
const crates: Source = {
  ...cratesApi,
  endpoint:
    "https://index.crates.io/{Pfad}/{name} (Pfad: 1/, 2/, 3/{erstes Zeichen}/ oder {ab}/{cd}/; - und _ einzeln; bei mehr als zwei Bindestrichen https://crates.io/api/v1/crates/{name})",
  description: "crates.io (Rust): existiert ein Crate mit diesem Namen (Sparse-Index, - und _ gleich)?",
  async check(name: string, ctx: CheckContext): Promise<SourceResult> {
    const b = base("crates", "crates.io", name, `https://crates.io/crates/${enc(name)}`);
    try {
      const problem = cratesProblem(name);
      if (problem) return invalidResult(b, problem);
      const variants = cratesVariants(name);
      if (!variants) return cratesApi.check(name, ctx);
      const replies = await Promise.all(
        variants.map((v) => ctx.http.request(`https://index.crates.io/${cratesIndexPath(v)}`, { method: "GET", read: "none", redirect: "manual" })),
      );
      const hit = replies.findIndex((r) => r.status === 200 && !r.error);
      if (hit >= 0) {
        const found = variants[hit];
        return {
          ...b,
          url: `https://crates.io/crates/${enc(found)}`,
          status: "taken",
          evidence: "Index HTTP 200",
          ...(found !== name ? { note: `Crate „${found}“; crates.io behandelt - und _ gleich` } : {}),
        };
      }
      if (replies.every((r) => r.status === 404 && !r.error)) {
        return { ...b, status: "not_found", note: CRATES_NOT_FOUND, evidence: "Index HTTP 404" };
      }
      // Unter den fehlerhaften Antworten eine vorübergehende bevorzugen, damit retryable gesetzt wird
      const bads = replies.filter((r) => r.error || r.status !== 404);
      const bad =
        bads.find(transientReply) ?? bads.find((r) => r.status >= 500) ?? bads[0] ?? replies[0];
      return unknownResult(b, bad);
    } catch (err) {
      return crashResult(b, err);
    }
  },
};

// ---------------------------------------------------------------------------
// Homebrew (Formula UND Cask)

const HOMEBREW_SEARCH = "https://formulae.brew.sh/";

const homebrew: Source = {
  id: "homebrew",
  namespace: "packages",
  label: "Homebrew",
  defaultEnabled: true,
  description: "Homebrew: gibt es eine Formula oder einen Cask mit diesem Namen?",
  endpoint: "https://formulae.brew.sh/api/formula/{name}.json, https://formulae.brew.sh/api/cask/{name}.json",
  async check(name, ctx) {
    const formulaPage = `https://formulae.brew.sh/formula/${enc(name)}`;
    const caskPage = `https://formulae.brew.sh/cask/${enc(name)}`;
    const b = base("homebrew", "Homebrew", name, formulaPage);
    try {
      const problem = basicProblem(name);
      if (problem) return invalidResult(b, problem);

      const [formula, cask] = await Promise.all([
        ctx.http.request(`https://formulae.brew.sh/api/formula/${enc(name)}.json`, { method: "GET", read: "none" }),
        ctx.http.request(`https://formulae.brew.sh/api/cask/${enc(name)}.json`, { method: "GET", read: "none" }),
      ]);
      const evidence = `Formula ${evidenceOf(formula)}, Cask ${evidenceOf(cask)}`;
      const fTaken = !formula.error && formula.status === 200;
      const cTaken = !cask.error && cask.status === 200;
      if (fTaken || cTaken) {
        const what = fTaken && cTaken ? "Formula und Cask" : fTaken ? "Formula" : "Cask";
        return { ...b, url: fTaken ? formulaPage : caskPage, status: "taken", note: `${what} vorhanden`, evidence };
      }
      const fGone = !formula.error && formula.status === 404;
      const cGone = !cask.error && cask.status === 404;
      if (fGone && cGone) {
        return {
          ...b,
          // Die Formula-Seite wäre hier eine 404-Seite, daher die Startseite mit Suche
          url: HOMEBREW_SEARCH,
          status: "not_found",
          note: "weder Formula noch Cask mit diesem Namen (nur Haupt-Taps; Aliase und umbenannte Formulae nicht geprüft)",
          evidence,
        };
      }
      const bad = fGone ? cask : formula;
      return { ...unknownResult(b, bad), evidence };
    } catch (err) {
      return crashResult(b, err);
    }
  },
};

// ---------------------------------------------------------------------------
// Optionale Registries

const nuget = statusSource({
  id: "nuget",
  label: "NuGet",
  defaultEnabled: false,
  description: "NuGet (.NET): existiert ein Paket mit dieser ID?",
  endpoint: "https://api.nuget.org/v3-flatcontainer/{name}/index.json",
  apiUrl: (n) => `https://api.nuget.org/v3-flatcontainer/${enc(n.toLowerCase())}/index.json`,
  humanUrl: (n) => `https://www.nuget.org/packages/${enc(n)}`,
  validate: nugetProblem,
  notFound: "kein Paket mit dieser ID; reservierte Präfixe möglich",
});

const RUBYGEMS_SEARCH_MAX_BYTES = 192 * 1024;

/**
 * RubyGems: /api/v1/gems/{name}.json findet nur die exakte Schreibweise.
 * Bei 404 folgt eine Suche, deren Treffer ohne Rücksicht auf Groß- und Kleinschreibung
 * verglichen werden (z. B. "redcloth" => "RedCloth").
 */
const rubygems: Source = {
  id: "rubygems",
  namespace: "packages",
  label: "RubyGems",
  defaultEnabled: false,
  description: "RubyGems.org: existiert ein Gem mit diesem Namen (auch in anderer Groß- und Kleinschreibung)?",
  endpoint: "https://rubygems.org/api/v1/gems/{name}.json, https://rubygems.org/api/v1/search.json?query={name}",
  async check(name, ctx) {
    const b = base("rubygems", "RubyGems", name, `https://rubygems.org/gems/${enc(name)}`);
    try {
      const problem = rubygemsProblem(name);
      if (problem) return invalidResult(b, problem);

      const exact = await ctx.http.request(`https://rubygems.org/api/v1/gems/${enc(name)}.json`, {
        method: "GET",
        read: "none",
      });
      if (exact.error || exact.status !== 404) return byStatus(b, exact, { notFound: "" });

      const search = await ctx.http.request(`https://rubygems.org/api/v1/search.json?query=${enc(name)}`, {
        method: "GET",
        read: "json",
        maxBytes: RUBYGEMS_SEARCH_MAX_BYTES,
      });
      const evidence = `HTTP 404, Suche ${evidenceOf(search)}`;
      if (search.error || search.status !== 200 || !Array.isArray(search.json)) {
        return { ...unknownResult(b, search, "Schreibweisen konnten nicht geprüft werden"), evidence };
      }
      const hit = (search.json as Array<{ name?: unknown }>)
        .map((g) => g?.name)
        .find((n): n is string => typeof n === "string" && n.toLowerCase() === name);
      if (hit) {
        return {
          ...b,
          url: `https://rubygems.org/gems/${enc(hit)}`,
          status: "taken",
          note: `als „${hit}“ vorhanden (andere Schreibweise)`,
          evidence: `${evidence}, Treffer ${hit}`,
        };
      }
      return {
        ...b,
        status: "not_found",
        note: "kein Gem mit diesem Namen, auch nicht in anderer Schreibweise (erste Suchseite); RubyGems kann zu ähnliche Namen ablehnen",
        evidence,
      };
    } catch (err) {
      return crashResult(b, err);
    }
  },
};

const maven: Source = {
  id: "maven",
  namespace: "packages",
  label: "Maven Central",
  defaultEnabled: false,
  description: "Maven Central: gibt es Artefakte mit dieser artifactId (nur zusammen mit groupId eindeutig)?",
  endpoint: 'https://search.maven.org/solrsearch/select?q=a:"{name}"&rows=1&wt=json',
  async check(name, ctx) {
    const b = base("maven", "Maven Central", name, `https://central.sonatype.com/search?q=${enc(name)}`);
    try {
      const problem = basicProblem(name);
      if (problem) return invalidResult(b, problem);
      const q = enc(`a:"${name}"`);
      const res = await ctx.http.request(`https://search.maven.org/solrsearch/select?q=${q}&rows=1&wt=json`, {
        method: "GET",
        read: "json",
        maxBytes: 32 * 1024,
      });
      if (res.error || res.status !== 200) return unknownResult(b, res);
      const response = (res.json as { response?: { numFound?: unknown; docs?: unknown } } | null)?.response;
      const numFound = response?.numFound;
      if (typeof numFound !== "number" || !Number.isFinite(numFound)) {
        return unknownResult(b, res, "unerwartetes Antwortformat");
      }
      if (numFound === 0) {
        return { ...b, status: "not_found", note: "keine artifactId mit diesem Namen", evidence: "HTTP 200, numFound 0" };
      }
      const docs = Array.isArray(response?.docs) ? (response.docs as Array<{ id?: unknown }>) : [];
      const example = typeof docs[0]?.id === "string" ? `, z. B. ${docs[0].id}` : "";
      return {
        ...b,
        status: "similar",
        note: "artifactId vorhanden, aber nicht global eindeutig (nur groupId:artifactId)",
        evidence: `HTTP 200, numFound ${numFound}${example}`,
      };
    } catch (err) {
      return crashResult(b, err);
    }
  },
};

/** Kontakt als mailto-Angabe für den User-Agent, null wenn keine E-Mail-Adresse enthalten ist. */
export function mailtoContact(contact: string): string | null {
  const c = contact.trim();
  if (!c) return null;
  if (/mailto:[^\s@;)]+@[^\s@;)]+/i.test(c)) return c;
  if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(c)) return `mailto:${c}`;
  return null;
}

const PACKAGIST_MAX_BYTES = 256 * 1024;

const packagist: Source = {
  id: "packagist",
  namespace: "packages",
  label: "Packagist",
  defaultEnabled: false,
  description: "Packagist (PHP/Composer): hat dieser Vendor-Namespace Pakete? Nur mit Kontakt im User-Agent.",
  endpoint: "https://packagist.org/packages/list.json?vendor={name}",
  async check(name, ctx) {
    const b = base("packagist", "Packagist", `${name}/*`, `https://packagist.org/packages/${enc(name)}/`);
    try {
      const problem = packagistProblem(name);
      if (problem) return invalidResult(b, problem);
      const mail = mailtoContact(ctx.contact ?? "");
      if (!mail) {
        return {
          ...b,
          status: "unknown",
          note: ctx.contact?.trim()
            ? "deaktiviert: Kontakt ohne E-Mail-Adresse (Packagist verlangt mailto im User-Agent)"
            : "deaktiviert: Kontakt fehlt",
          evidence: "keine Abfrage",
        };
      }
      const res = await ctx.http.request(`https://packagist.org/packages/list.json?vendor=${enc(name)}`, {
        method: "GET",
        read: "json",
        maxBytes: PACKAGIST_MAX_BYTES,
        headers: { "User-Agent": buildUserAgent(mail) },
      });
      if (res.status === 200 && res.error === "too_large") {
        return { ...b, status: "taken", note: "Vendor hat sehr viele Pakete", evidence: "HTTP 200, Liste > 256 KB" };
      }
      if (res.error || res.status !== 200) return unknownResult(b, res);
      const names = (res.json as { packageNames?: unknown } | null)?.packageNames;
      if (!Array.isArray(names)) return unknownResult(b, res, "unerwartetes Antwortformat");
      if (names.length === 0) {
        return {
          ...b,
          status: "not_found",
          note: "keine Pakete unter diesem Vendor; der Vendor kann trotzdem belegt sein",
          evidence: "HTTP 200, packageNames leer",
        };
      }
      const example = typeof names[0] === "string" ? `, z. B. ${names[0]}` : "";
      return {
        ...b,
        status: "taken",
        note: `Vendor mit ${names.length} Paket${names.length === 1 ? "" : "en"}`,
        evidence: `HTTP 200, ${names.length} Pakete${example}`,
      };
    } catch (err) {
      return crashResult(b, err);
    }
  },
};

const pub = statusSource({
  id: "pub",
  label: "pub.dev",
  defaultEnabled: false,
  description: "pub.dev (Dart/Flutter): existiert ein Paket mit diesem Namen?",
  endpoint: "https://pub.dev/api/packages/{name}/score",
  apiUrl: (n) => `https://pub.dev/api/packages/${enc(n)}/score`,
  humanUrl: (n) => `https://pub.dev/packages/${enc(n)}`,
  validate: pubProblem,
  notFound: "kein Paket mit diesem Namen",
});

const jsr = statusSource({
  id: "jsr",
  label: "JSR",
  defaultEnabled: false,
  description: "JSR (JavaScript Registry): ist der Scope @name vergeben?",
  endpoint: "https://api.jsr.io/scopes/{name}",
  apiUrl: (n) => `https://api.jsr.io/scopes/${enc(n)}`,
  humanUrl: (n) => `https://jsr.io/@${enc(n)}`,
  target: (n) => `@${n}`,
  validate: jsrProblem,
  notFound: "kein Scope mit diesem Namen; JSR kann Scopes reservieren",
});

const hex = statusSource({
  id: "hex",
  label: "Hex.pm",
  defaultEnabled: false,
  description: "Hex.pm (Elixir/Erlang): existiert ein Paket mit diesem Namen?",
  endpoint: "https://hex.pm/api/packages/{name}",
  apiUrl: (n) => `https://hex.pm/api/packages/${enc(n)}`,
  humanUrl: (n) => `https://hex.pm/packages/${enc(n)}`,
  validate: hexProblem,
  notFound: "kein Paket mit diesem Namen",
});

/** Schreibweisen, die CRAN geprüft wird: klein, Anfangsbuchstabe groß, ganz groß (ohne Doppelte). */
export function cranSpellings(name: string): string[] {
  const capitalized = name.charAt(0).toUpperCase() + name.slice(1);
  return [...new Set([name, capitalized, name.toUpperCase()])];
}

/**
 * CRAN über crandb: crandb sucht mit exakter Schreibweise, der Name kommt aber kleingeschrieben an.
 * CRAN lehnt neue Pakete ab, deren Name sich nur in Groß- und Kleinschreibung von einem
 * bestehenden unterscheidet. Deshalb werden bei 404 weitere Schreibweisen abgefragt.
 */
const cran: Source = {
  id: "cran",
  namespace: "packages",
  label: "CRAN",
  defaultEnabled: false,
  description:
    "CRAN (R) über den crandb-Spiegel von R-hub: existiert ein Paket mit diesem Namen (klein, Groß-Anfang, ganz groß)?",
  endpoint: "https://crandb.r-pkg.org/{name}",
  async check(name, ctx) {
    const pageOf = (n: string) => `https://cran.r-project.org/package=${enc(n)}`;
    const b = base("cran", "CRAN", name, pageOf(name));
    try {
      const problem = cranProblem(name);
      if (problem) return invalidResult(b, problem);

      const [first, ...variants] = cranSpellings(name);
      const ask = (n: string) => ctx.http.request(`https://crandb.r-pkg.org/${enc(n)}`, { method: "GET", read: "none" });

      const res = await ask(first);
      if (res.error || res.status !== 404) return byStatus(b, res, { notFound: "" });

      const others = await Promise.all(variants.map(ask));
      const all = [{ n: first, res }, ...variants.map((n, i) => ({ n, res: others[i] }))];
      const evidence = all.map((x) => `${x.n} ${evidenceOf(x.res)}`).join(", ");

      const hit = all.find((x) => !x.res.error && x.res.status === 200);
      if (hit) {
        return {
          ...b,
          url: pageOf(hit.n),
          status: "taken",
          note: `als „${hit.n}“ vorhanden; CRAN lehnt Namen ab, die sich nur in Groß- und Kleinschreibung unterscheiden`,
          evidence,
        };
      }
      const bad = all.find((x) => x.res.error || x.res.status !== 404);
      if (bad) return { ...unknownResult(b, bad.res), evidence };
      return {
        ...b,
        status: "not_found",
        note: `nur Schreibweisen ${all.map((x) => x.n).join("/")} geprüft; CRAN lehnt Namen ab, die sich nur in Groß- und Kleinschreibung unterscheiden`,
        evidence,
      };
    } catch (err) {
      return crashResult(b, err);
    }
  },
};

const openvsx = statusSource({
  id: "openvsx",
  label: "Open VSX",
  defaultEnabled: false,
  description: "Open VSX (Editor-Erweiterungen): ist der Namespace vergeben?",
  endpoint: "https://open-vsx.org/api/{name}",
  apiUrl: (n) => `https://open-vsx.org/api/${enc(n)}`,
  humanUrl: (n) => `https://open-vsx.org/namespace/${enc(n)}`,
  validate: openvsxProblem,
  notFound: "kein Namespace mit diesem Namen",
});

// ---------------------------------------------------------------------------
// Weitere Registries mit mehreren Abfragen (alle nur auf Wunsch, defaultEnabled false)

/**
 * Fragt mehrere Adressen gleichzeitig. Ein 200 reicht für "taken". "not_found" gibt es nur, wenn
 * alle Antworten 404 sind; jede andere Mischung (Fehler, 429, 5xx) ist "unknown", nie "frei".
 */
async function anyTaken(
  b: Base,
  ctx: CheckContext,
  probes: { url: string; headers?: Record<string, string>; what: string }[],
  notFound: string,
): Promise<SourceResult> {
  const replies = await Promise.all(
    // retry: ein kurzer 429 oder Timeout bei gleichzeitigen Abfragen wird einmal wiederholt
    probes.map((p) => ctx.http.request(p.url, { method: "GET", read: "none", retry: true, ...(p.headers ? { headers: p.headers } : {}) })),
  );
  const hit = replies.findIndex((r) => !r.error && r.status === 200);
  if (hit >= 0) {
    return { ...b, status: "taken", note: `${probes[hit].what} vorhanden`, evidence: evidenceOf(replies[hit]) };
  }
  const bad = replies.find((r) => r.error || r.status !== 404);
  if (bad) return unknownResult(b, bad);
  return { ...b, status: "not_found", note: notFound, evidence: replies.map(evidenceOf).join(", ") };
}

/**
 * Hugging Face: Nutzer und Organisationen teilen sich einen Namensraum (auch für Modelle und
 * Datasets), haben aber getrennte Endpunkte. Beide prüfen, sonst wäre z. B. "google" (nur als
 * Organisation vorhanden) fälschlich frei.
 */
const huggingface: Source = {
  id: "huggingface",
  namespace: "packages",
  label: "Hugging Face",
  defaultEnabled: false,
  description: "Hugging Face Hub: gibt es eine Organisation oder einen Nutzer mit diesem Namen (Namensraum für Modelle und Datasets)?",
  endpoint: "https://huggingface.co/api/organizations/{name}/overview und https://huggingface.co/api/users/{name}/overview",
  async check(name, ctx) {
    const b = base("huggingface", "Hugging Face", name, `https://huggingface.co/${enc(name)}`);
    try {
      // Optionales Lese-Token (HF_TOKEN): Hugging Face hebt das Limit für angemeldete Konten an
      // (anonym 500, Free-Konto 1.000 API-Abfragen je 5 Minuten). Es geht nur an huggingface.co.
      const token = (process.env.HF_TOKEN ?? "").trim();
      const headers = token ? { Authorization: `Bearer ${token}` } : undefined;
      return await anyTaken(
        b,
        ctx,
        [
          { url: `https://huggingface.co/api/organizations/${enc(name)}/overview`, what: "Organisation", headers },
          { url: `https://huggingface.co/api/users/${enc(name)}/overview`, what: "Nutzer", headers },
        ],
        "weder Organisation noch Nutzer mit diesem Namen",
      );
    } catch (err) {
      return crashResult(b, err);
    }
  },
};

/**
 * DEV (dev.to): Nutzer und Organisationen haben getrennte Endpunkte, aber einen gemeinsamen
 * Benutzernamen-Raum. Beide prüfen.
 */
const devto: Source = {
  id: "devto",
  namespace: "packages",
  label: "DEV (dev.to)",
  defaultEnabled: false,
  description: "DEV Community (dev.to): gibt es einen Nutzer oder eine Organisation mit diesem Benutzernamen?",
  endpoint: "https://dev.to/api/users/by_username?url={name} und https://dev.to/api/organizations/{name}",
  async check(name, ctx) {
    const b = base("devto", "DEV (dev.to)", name, `https://dev.to/${enc(name)}`);
    try {
      return await anyTaken(
        b,
        ctx,
        [
          { url: `https://dev.to/api/users/by_username?url=${enc(name)}`, what: "Nutzer" },
          { url: `https://dev.to/api/organizations/${enc(name)}`, what: "Organisation" },
        ],
        "kein Nutzer und keine Organisation mit diesem Benutzernamen (gesperrte oder ungültige Namen möglich)",
      );
    } catch (err) {
      return crashResult(b, err);
    }
  },
};

/**
 * Terraform Registry: ein Namespace ist sichtbar, sobald er mindestens ein Modul oder einen
 * Provider veröffentlicht hat. Beide Listen prüfen. Namespaces ohne Veröffentlichung sind nicht
 * sichtbar, daher der Hinweis bei "nicht gefunden".
 */
const terraform: Source = {
  id: "terraform",
  namespace: "packages",
  label: "Terraform Registry",
  defaultEnabled: false,
  description: "Terraform Registry: gibt es einen Namespace mit veröffentlichten Modulen oder Providern?",
  endpoint: "https://registry.terraform.io/v1/modules/{name} und https://registry.terraform.io/v1/providers/{name}",
  async check(name, ctx) {
    const b = base("terraform", "Terraform Registry", name, `https://registry.terraform.io/namespaces/${enc(name)}`);
    try {
      return await anyTaken(
        b,
        ctx,
        [
          { url: `https://registry.terraform.io/v1/modules/${enc(name)}`, what: "Namespace mit Modulen" },
          { url: `https://registry.terraform.io/v1/providers/${enc(name)}`, what: "Namespace mit Providern" },
        ],
        "kein Namespace mit veröffentlichten Modulen oder Providern (leere Namespaces sind nicht sichtbar)",
      );
    } catch (err) {
      return crashResult(b, err);
    }
  },
};

/** Hackage: Treffer der Paketsuche, dessen Name sich nur in der Schreibweise unterscheidet. */
export function hackageExactMatch(json: unknown, name: string): string | undefined {
  if (!Array.isArray(json)) return undefined;
  const want = name.toLowerCase();
  for (const x of json) {
    const n = x && typeof x === "object" ? (x as { name?: unknown }).name : undefined;
    if (typeof n === "string" && n.toLowerCase() === want) return n;
  }
  return undefined;
}

/**
 * Hackage unterscheidet in der Adresse Groß- und Kleinschreibung: /package/quickcheck ergibt 404,
 * obwohl "QuickCheck" existiert. Deshalb bei 404 die dokumentierte Suche /packages/search
 * (JSON) abfragen und ohne Rücksicht auf die Schreibweise vergleichen. Der exakte Treffer stand
 * in allen Stichproben an erster Stelle.
 */
const hackage: Source = {
  id: "hackage",
  namespace: "packages",
  label: "Hackage",
  defaultEnabled: false,
  description: "Hackage (Haskell): existiert ein Paket mit diesem Namen (auch bei anderer Groß-/Kleinschreibung)?",
  endpoint: "https://hackage.haskell.org/package/{name}, bei 404 https://hackage.haskell.org/packages/search?terms={name}",
  async check(name, ctx) {
    const pageOf = (n: string) => `https://hackage.haskell.org/package/${enc(n)}`;
    const b = base("hackage", "Hackage", name, pageOf(name));
    try {
      const direct = await ctx.http.request(pageOf(name), { method: "GET", read: "none", retry: true, headers: { Accept: "application/json" } });
      if (direct.error || direct.status !== 404) return byStatus(b, direct, { notFound: "" });

      const search = await ctx.http.request(
        `https://hackage.haskell.org/packages/search?terms=${enc(name)}`,
        { method: "GET", read: "json", maxBytes: 256 * 1024, retry: true, headers: { Accept: "application/json" } },
      );
      if (search.error || search.status !== 200 || !Array.isArray(search.json)) {
        return unknownResult(b, search, "Schreibweisen konnten nicht geprüft werden");
      }
      const match = hackageExactMatch(search.json, name);
      if (match) {
        return {
          ...b,
          url: pageOf(match),
          status: "taken",
          note: match === name ? "Paket vorhanden" : `Paket vorhanden, Schreibweise „${match}“`,
          evidence: `HTTP 404 für ${name}, Suche: ${match}`,
        };
      }
      return {
        ...b,
        status: "not_found",
        note: "kein Paket mit diesem Namen, auch nicht mit anderer Schreibweise",
        evidence: `HTTP ${direct.status}, Suche ohne exakten Treffer`,
      };
    } catch (err) {
      return crashResult(b, err);
    }
  },
};

// ---------------------------------------------------------------------------
// NuGet-v2-Feeds: Chocolatey und PowerShell Gallery

/**
 * NuGet-v2-Feed (OData): FindPackagesById() antwortet mit 200 und je Version einem <entry>-Element,
 * wenn das Paket existiert, und mit 200 ohne <entry>, wenn nicht (live gegengeprüft 9. November 2026
 * mit „git“/„pester“ und „zzqxkvjwabc“). Zu große Antworten bedeuten viele Versionen, das Paket
 * existiert also. Der Feed ist in der robots.txt für alle offengelegt.
 */
function nugetV2Source(def: {
  id: string;
  label: string;
  description: string;
  host: string;
  humanUrl: (n: string) => string;
  notFound: string;
}): Source {
  return {
    id: def.id,
    namespace: "packages",
    label: def.label,
    defaultEnabled: false,
    description: def.description,
    endpoint: `https://${def.host}/api/v2/FindPackagesById()?id='{name}'`,
    async check(name: string, ctx: CheckContext): Promise<SourceResult> {
      const b = base(def.id, def.label, name, def.humanUrl(name));
      try {
        const problem = nugetProblem(name);
        if (problem) return invalidResult(b, problem);
        const res = await ctx.http.request(`https://${def.host}/api/v2/FindPackagesById()?id='${enc(name)}'`, {
          method: "GET",
          read: "text",
          retry: true,
          headers: { Accept: "application/atom+xml" },
        });
        if (res.error === "too_large") {
          return { ...b, status: "taken", note: "Paket mit sehr vielen Versionen", evidence: "Antwort größer als erwartet" };
        }
        if (res.error || res.status !== 200) return unknownResult(b, res);
        if (res.text?.includes("<entry")) return { ...b, status: "taken", evidence: evidenceOf(res) };
        return { ...b, status: "not_found", note: def.notFound, evidence: evidenceOf(res) };
      } catch (err) {
        return crashResult(b, err);
      }
    },
  };
}

const chocolatey = nugetV2Source({
  id: "chocolatey",
  label: "Chocolatey",
  description: "Chocolatey Community Repository (Windows): existiert ein Paket mit dieser ID?",
  host: "community.chocolatey.org",
  humanUrl: (n) => `https://community.chocolatey.org/packages/${enc(n)}`,
  notFound: "kein Paket mit dieser ID; Chocolatey kann ähnliche IDs trotzdem ablehnen",
});

const psgallery = nugetV2Source({
  id: "psgallery",
  label: "PowerShell Gallery",
  description: "PowerShell Gallery (Microsoft): existiert ein Paket mit dieser ID?",
  host: "www.powershellgallery.com",
  humanUrl: (n) => `https://www.powershellgallery.com/packages/${enc(n)}`,
  notFound: "kein Paket mit dieser ID; die Gallery kann gesperrte oder ähnliche IDs ablehnen",
});

// ---------------------------------------------------------------------------
// Launchpad

/**
 * Launchpad (Ubuntu): Projekte (ohne ~) und Nutzer (~name) haben getrennte Adressen, aber
 * gemeinsam erscheint der Name in launchpad.net-Links. Beide prüfen, sonst wäre „ubuntu“ nur
 * als Projekt vorhanden. Live gegengeprüft 9. November 2026 mit „ubuntu“/„launchpad“ und
 * „zzqxkvjwabc“ (200/404). api.launchpad.net hat keine robots.txt-Einschränkung.
 */
const launchpad: Source = {
  id: "launchpad",
  namespace: "packages",
  label: "Launchpad",
  defaultEnabled: false,
  description: "Launchpad (Ubuntu): gibt es ein Projekt oder einen Nutzer mit diesem Namen?",
  endpoint: "https://api.launchpad.net/1.0/{name} und https://api.launchpad.net/1.0/~{name}",
  async check(name, ctx) {
    const b = base("launchpad", "Launchpad", name, `https://launchpad.net/${enc(name)}`);
    try {
      const problem = basicProblem(name);
      if (problem) return invalidResult(b, problem);
      return await anyTaken(
        b,
        ctx,
        [
          { url: `https://api.launchpad.net/1.0/${enc(name)}`, what: "Projekt" },
          { url: `https://api.launchpad.net/1.0/~${enc(name)}`, what: "Nutzer" },
        ],
        "kein Projekt und kein Nutzer mit diesem Namen",
      );
    } catch (err) {
      return crashResult(b, err);
    }
  },
};

export const PACKAGE_SOURCES: Source[] = [
  npm,
  pypi,
  github,
  crates,
  homebrew,
  nuget,
  rubygems,
  maven,
  packagist,
  pub,
  jsr,
  hex,
  cran,
  openvsx,
  huggingface,
  hackage,
  terraform,
  devto,
  chocolatey,
  psgallery,
  launchpad,
];
