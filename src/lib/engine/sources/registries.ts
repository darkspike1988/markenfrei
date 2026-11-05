import {
  base,
  basicProblem,
  byStatus,
  crashResult,
  invalidResult,
  unknownResult,
} from "@/lib/engine/sources/packages";
import type { CheckContext, Source, SourceResult } from "@/lib/engine/types";

/**
 * Weitere offene Datenquellen für Paketnamen (Namensraum "packages"), alle nur auf Wunsch.
 * Alle Abfragen sind schlüssellose Einzelabfragen an dokumentierte Schnittstellen. Jede Quelle liefert
 * genau ein SourceResult und wirft nie. "not_found" heißt nur: die Quelle kennt den Namen nicht,
 * nicht dass er registrierbar ist. Alles außer den dokumentierten Antworten (429, 5xx, Zeitüberschreitung,
 * kaputtes JSON) ist "unknown".
 */

const enc = encodeURIComponent;

function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

// ---------------------------------------------------------------------------
// AUR

/**
 * AUR (aurweb-RPC, dokumentiert im Arch Wiki "Aurweb RPC interface"): info liefert type "multiinfo" mit
 * resultcount. Fehlerantworten (z. B. Rate-Limit) tragen type "error" und resultcount 0 und dürfen nie
 * als "frei" gelten. Es gelten höchstens 4000 Anfragen pro Tag und IP (Budget in http.ts).
 */
const aur: Source = {
  id: "aur",
  namespace: "packages",
  label: "AUR",
  defaultEnabled: false,
  description: "Arch User Repository (aurweb-RPC): gibt es ein Paket mit diesem Namen?",
  endpoint: "https://aur.archlinux.org/rpc/v5/info?arg[]={name}",
  async check(name, ctx) {
    const b = base("aur", "AUR", name, `https://aur.archlinux.org/packages/${enc(name)}`);
    try {
      const problem = basicProblem(name);
      if (problem) return invalidResult(b, problem);
      const res = await ctx.http.request(`https://aur.archlinux.org/rpc/v5/info?arg[]=${enc(name)}`, {
        method: "GET",
        read: "json",
      });
      if (res.error || res.status !== 200) return unknownResult(b, res);
      const json = res.json;
      if (!isObject(json) || json.type !== "multiinfo" || typeof json.resultcount !== "number") {
        return unknownResult(b, res, "unerwartetes Antwortformat");
      }
      if (json.resultcount > 0) {
        return { ...b, status: "taken", note: "Paket vorhanden", evidence: `HTTP 200, resultcount ${json.resultcount}` };
      }
      return {
        ...b,
        status: "not_found",
        note: "kein Paket mit diesem Namen im AUR (Paketbasen und „provides“ werden nicht geprüft)",
        evidence: "HTTP 200, resultcount 0",
      };
    } catch (err) {
      return crashResult(b, err);
    }
  },
};

// ---------------------------------------------------------------------------
// Repology

/**
 * Repology fordert in seinen API-Regeln (repology.org/api) einen eigenen User-Agent mit Link zum
 * Quellcode samt Issue-Tracker. Er geht nur an repology.org.
 */
const REPOLOGY_USER_AGENT = "Markenfrei/2.0 (+https://github.com/darkspike1988/markenfrei)";

/** Mehr als so viele Bytes lesen wir nicht: Antworten für bekannte Projekte sind schnell über 1 MB groß. */
const REPOLOGY_MAX_BYTES = 64 * 1024;

/**
 * Repology fasst rund 300 Paketquellen zusammen (Debian, Ubuntu, Arch, Alpine, Nix, Fedora, Homebrew, winget,
 * Chocolatey …). Der Schlüssel ist der Repology-PROJEKTNAME, nicht jeder Paketname in jeder Distribution.
 * /api/v1/project/{name} liefert immer 200: eine Liste, leer heißt unbekannt. Dokumentiertes Limit:
 * höchstens 1 Anfrage pro Sekunde (Budget in http.ts).
 */
const repology: Source = {
  id: "repology",
  namespace: "packages",
  label: "Repology",
  defaultEnabled: false,
  description:
    "Repology: ist der Name ein Projekt in einer der rund 300 Paketquellen von Linux-Distributionen, Homebrew, winget, Chocolatey und weiteren (Projektname, nicht jeder Paketname)?",
  endpoint: "https://repology.org/api/v1/project/{name}",
  async check(name, ctx) {
    const b = base("repology", "Repology", name, `https://repology.org/project/${enc(name)}/versions`);
    try {
      const problem = basicProblem(name);
      if (problem) return invalidResult(b, problem);
      const res = await ctx.http.request(`https://repology.org/api/v1/project/${enc(name)}`, {
        method: "GET",
        read: "json",
        maxBytes: REPOLOGY_MAX_BYTES,
        headers: { "User-Agent": REPOLOGY_USER_AGENT },
      });
      if (res.status === 200 && res.error === "too_large") {
        // Die leere Liste ist 2 Bytes groß: eine so große Antwort ist nie "nicht gefunden"
        return {
          ...b,
          status: "taken",
          note: "Projekt in sehr vielen Paketquellen (Repology-Projektname, nicht jeder Paketname)",
          evidence: `HTTP 200, Antwort > ${REPOLOGY_MAX_BYTES / 1024} KB`,
        };
      }
      if (res.error || res.status !== 200) return unknownResult(b, res);
      if (!Array.isArray(res.json)) return unknownResult(b, res, "unerwartetes Antwortformat");
      if (res.json.length === 0) {
        return {
          ...b,
          status: "not_found",
          note: "kein Repology-Projekt mit diesem Namen (Projektname, nicht jeder Paketname)",
          evidence: "HTTP 200, Liste leer",
        };
      }
      const repos: string[] = [];
      for (const entry of res.json) {
        const repo = isObject(entry) ? entry.repo : undefined;
        if (typeof repo === "string" && !repos.includes(repo)) repos.push(repo);
      }
      const where = repos.length ? `, z. B. ${repos.slice(0, 3).join(", ")}` : "";
      const count = repos.length ? `${repos.length} Paketquelle${repos.length === 1 ? "" : "n"}` : `${res.json.length} Einträge`;
      return {
        ...b,
        status: "taken",
        note: `Projekt in ${count}${where} (Repology-Projektname, nicht jeder Paketname)`,
        evidence: `HTTP 200, ${count}`,
      };
    } catch (err) {
      return crashResult(b, err);
    }
  },
};

// ---------------------------------------------------------------------------
// ecosyste.ms Packages

const ECOSYSTEMS_NOTE = "Daten aus dem Index von ecosyste.ms, nicht live aus dem Register";

/**
 * Pakete aus ecosyste.ms (packages.ecosyste.ms, offene API, CC-BY-SA-4.0):
 * GET /api/v1/registries/{registry}/packages/{name} ist 200 oder 404 mit {"error":"not found"}.
 * Die Daten stammen aus dem Index des Dienstes, nicht live aus dem Register: sehr neue Pakete können
 * fehlen, "nicht gefunden" ist deshalb schwächer als die Antwort eines Registers. Jede Quelle trägt das
 * im Hinweis. Mit einer E-Mail-Adresse im User-Agent (MARKENFREI_CONTACT) gehört die Anwendung zum
 * Pool für bekannte Nutzer (Budget in http.ts).
 *
 * Nur Register, deren Namen ohne Rücksicht auf Groß- und Kleinschreibung gefunden werden (Docker, conda-forge,
 * Clojars) oder ohnehin klein sind. Register mit Schreibweisen (CocoaPods, CPAN, Julia) fehlen bewusst: Ein
 * Name wie "swiftyjson" ergäbe dort ein falsches "nicht gefunden", weil die Abfrage die Schreibweise kennen muss.
 */
function ecosystemsSource(def: {
  id: string;
  label: string;
  /** Registry-ID bei ecosyste.ms, z. B. "conda-forge.org" */
  registry: string;
  description: string;
  humanUrl: (name: string) => string;
  /** Was ein 404 ausschließt und was nicht (steht im Hinweis) */
  scope: string;
  /** Anzeige bei "vergeben" */
  taken: string;
}): Source {
  return {
    id: def.id,
    namespace: "packages",
    label: def.label,
    defaultEnabled: false,
    description: `${def.description} ${ECOSYSTEMS_NOTE}.`,
    endpoint: `https://packages.ecosyste.ms/api/v1/registries/${def.registry}/packages/{name}`,
    async check(name: string, ctx: CheckContext): Promise<SourceResult> {
      const b = base(def.id, def.label, name, def.humanUrl(name));
      try {
        const problem = basicProblem(name);
        if (problem) return invalidResult(b, problem);
        const res = await ctx.http.request(
          `https://packages.ecosyste.ms/api/v1/registries/${def.registry}/packages/${enc(name)}`,
          { method: "GET", read: "none" },
        );
        return byStatus(b, res, {
          taken: `${def.taken} (ecosyste.ms-Index)`,
          notFound: `${def.scope}. ${ECOSYSTEMS_NOTE}, sehr neue Pakete können fehlen`,
        });
      } catch (err) {
        return crashResult(b, err);
      }
    },
  };
}

const docker = ecosystemsSource({
  id: "docker",
  label: "Docker Hub",
  registry: "hub.docker.com",
  description: "Docker Hub: gibt es ein offizielles Image (library/Name) mit diesem Namen?",
  humanUrl: (n) => `https://hub.docker.com/_/${enc(n)}`,
  taken: "offizielles Image",
  scope: "kein offizielles Image mit diesem Namen (Images unter Nutzer- und Organisationsnamen werden nicht geprüft)",
});

const conda = ecosystemsSource({
  id: "conda",
  label: "conda-forge",
  registry: "conda-forge.org",
  description: "conda-forge: gibt es ein Paket mit diesem Namen (nur dieser Kanal)?",
  humanUrl: (n) => `https://anaconda.org/conda-forge/${enc(n)}`,
  taken: "Paket im Kanal conda-forge",
  scope: "kein Paket mit diesem Namen im Kanal conda-forge (andere Kanäle werden nicht geprüft)",
});

const clojars = ecosystemsSource({
  id: "clojars",
  label: "Clojars",
  registry: "clojars.org",
  description: "Clojars (Clojure): gibt es ein Paket mit diesem Namen?",
  humanUrl: (n) => `https://clojars.org/${enc(n)}`,
  taken: "Paket vorhanden",
  scope: "kein Paket mit diesem Namen",
});

export const REGISTRY_SOURCES: Source[] = [aur, repology, docker, conda, clojars];
