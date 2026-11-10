/**
 * Kanariennamen der Live-Probe (scripts/live-probe.ts): je Quelle ein Name, der dort seit Jahren
 * vergeben ist, und der Status, den die Quelle dafür liefern darf. Die Tabellen liegen hier, damit
 * ein Test (ohne Netz) prüft, dass jede Quelle aus STATIC_SOURCES entweder einen Kanariennamen oder
 * eine begründete Ausnahme hat. Wer eine Quelle hinzufügt, muss sie hier eintragen, sonst schlägt
 * die Probe fehl. Kein Netz, keine Nebenwirkungen beim Import.
 */
import type { Status } from "@/lib/engine/types";

/** "gate": Abweichung lässt die Probe scheitern. "advisory": nur eine Warnung. */
export type ProbeLevel = "gate" | "advisory";

/** Status, die ein Kanarienname haben darf. "unknown" und "not_found" nie: sie wären genau der Fehler, den die Probe sucht. */
export type CanaryStatus = Extract<Status, "taken" | "similar">;

export type Canary = {
  name: string;
  level: ProbeLevel;
  /** Erlaubte Status; Standard ["taken"]. Suchartige Quellen dürfen auch "similar" liefern. */
  accept?: readonly CanaryStatus[];
};

export const DEFAULT_ACCEPT: readonly CanaryStatus[] = ["taken"];

/** Endungen, die mit dem Label "google" geprüft werden (je eine Quelle "rdap:<Endung>"). */
const DOMAIN_CANARY = "google";

/**
 * Kanariennamen je Quellen-ID. Die Domain-Quellen gibt es erst je Endung (id "rdap:<tld>"); die Probe
 * fragt drei Registries ab (DENIC, Verisign, Identity Digital), nicht alle Endungen.
 */
export const CANARIES: Readonly<Record<string, Canary>> = {
  // Domains (RDAP der Registry, 200 = registriert)
  "rdap:de": { name: DOMAIN_CANARY, level: "advisory" },
  "rdap:com": { name: DOMAIN_CANARY, level: "advisory" },
  "rdap:io": { name: DOMAIN_CANARY, level: "advisory" },

  // Pakete und Entwicklerkonten
  npm: { name: "react", level: "gate" },
  pypi: { name: "requests", level: "gate" },
  crates: { name: "serde", level: "gate" },
  github: { name: "torvalds", level: "advisory" },
  homebrew: { name: "wget", level: "advisory" },
  // NuGet-IDs enthalten Punkte (Newtonsoft.Json); mit Bindestrich gibt es 404. Darum ein Name ohne Trennzeichen.
  nuget: { name: "serilog", level: "advisory" },
  rubygems: { name: "rails", level: "advisory" },
  // Packagist antwortet nur mit E-Mail-Adresse in MARKENFREI_CONTACT; ohne sie "unknown" und damit eine Warnung.
  packagist: { name: "symfony", level: "advisory" },
  hex: { name: "phoenix", level: "advisory" },
  cran: { name: "ggplot2", level: "advisory" },
  hackage: { name: "aeson", level: "advisory" },
  // Maven kennt nur artifactId plus groupId; die Quelle meldet vorhandene artifactIds als "similar".
  maven: { name: "guava", level: "advisory", accept: ["taken", "similar"] },
  pub: { name: "http", level: "advisory" },
  // JSR-Scope @std (Deno-Standardbibliothek)
  jsr: { name: "std", level: "advisory" },
  // Open VSX-Namespace redhat
  openvsx: { name: "redhat", level: "advisory" },
  // Hugging Face: "google" gibt es nur als Organisation, die Quelle prüft Organisation und Nutzer
  huggingface: { name: "google", level: "advisory" },
  // Terraform-Namespace hashicorp (Module und Provider)
  terraform: { name: "hashicorp", level: "advisory" },
  // dev.to-Nutzer ben (Ben Halpern, Konto Nr. 1)
  devto: { name: "ben", level: "advisory" },
  aur: { name: "yay", level: "advisory" },
  // Repology-Projektname; die Antwort ist sehr groß (too_large) und zählt dann als "taken"
  repology: { name: "nginx", level: "advisory" },
  // ecosyste.ms-Index: Docker-Offizial-Image library/nginx, conda-forge numpy, Clojars ring
  docker: { name: "nginx", level: "advisory" },
  conda: { name: "numpy", level: "advisory" },
  clojars: { name: "ring", level: "advisory" },

  // Stores
  // Die Suche im App Store liefert für einen bekannten Namen den Titel mit dem Namen am Anfang ("Spotify Musik und Podcasts"): "similar".
  appstore: { name: "spotify", level: "advisory", accept: ["taken", "similar"] },
  // Zusatzländer: gleiche Quelle, andere Storefront; Spotify ist überall im Store, der Titel beginnt mit dem Namen ("similar" möglich)
  appstore_at: { name: "spotify", level: "advisory", accept: ["taken", "similar"] },
  appstore_ch: { name: "spotify", level: "advisory", accept: ["taken", "similar"] },
  appstore_us: { name: "spotify", level: "advisory", accept: ["taken", "similar"] },
  // Google Play prüft com.{name}.app und de.{name}.app; FlixBus nutzt de.flixbus.app
  googleplay: { name: "flixbus", level: "advisory" },
  fdroid: { name: "newpipe", level: "advisory" },
  // Firefox-Add-on "uBlock Origin" (Suchnamen mit Bindestrich passen auf Titel mit Leerzeichen)
  firefox: { name: "ublock-origin", level: "advisory" },

  // Soziale Netze
  bluesky: { name: "jay", level: "advisory" },
  mastodon: { name: "gargron", level: "advisory" },
  hackernews: { name: "pg", level: "advisory" },

  // Bekannte Namen
  wikidata: { name: "microsoft", level: "advisory" },
  gleif: { name: "siemens", level: "advisory" },
  // Wikipedia darf auch eine Begriffsklärung liefern ("similar")
  wikipedia: { name: "microsoft", level: "advisory", accept: ["taken", "similar"] },
  hn_show: { name: "supabase", level: "advisory" },
};

/**
 * Quellen ohne Kanariennamen, mit Grund. Nur Quellen ohne Netz oder ohne stabilen Kanariennamen
 * gehören hierher; jede Ausnahme muss begründet sein.
 */
export const PROBE_EXCLUSIONS: Readonly<Record<string, string>> = {
  known_brands: "arbeitet ohne Netz gegen eine feste Liste im Code, die Tests decken sie ab; die Probe würde nichts über Dritte aussagen",
  wikidata_brands: "arbeitet ohne Netz gegen einen Schnappschuss im Repository, die Tests decken ihn ab; kein Dienst Dritter, der sich ändern könnte",
};

/**
 * Prüft, dass jede Quelle genau einen Eintrag hat (Kanarienname oder Ausnahme) und dass keine
 * Tabelle eine Quelle nennt, die es nicht gibt. `sourceIds` sind die IDs aus STATIC_SOURCES.
 * IDs der Domain-Quellen ("rdap:<tld>") stehen nicht in STATIC_SOURCES und sind nur als Kanariennamen erlaubt.
 * Gibt die Probleme als Text zurück, leer heißt vollständig.
 */
export function coverageProblems(
  sourceIds: readonly string[],
  canaries: Readonly<Record<string, Canary>> = CANARIES,
  exclusions: Readonly<Record<string, string>> = PROBE_EXCLUSIONS,
): string[] {
  const problems: string[] = [];
  const known = new Set(sourceIds);
  for (const id of sourceIds) {
    const hasCanary = Object.hasOwn(canaries, id);
    const excluded = Object.hasOwn(exclusions, id);
    if (!hasCanary && !excluded) problems.push(`Quelle „${id}“ hat weder einen Kanariennamen noch eine Ausnahme in src/lib/probe-canaries.ts`);
    if (hasCanary && excluded) problems.push(`Quelle „${id}“ steht als Kanariennamen und als Ausnahme, es darf nur eines sein`);
  }
  for (const id of Object.keys(canaries)) {
    if (!known.has(id) && !id.startsWith("rdap:")) problems.push(`Kanariennamen für „${id}“, aber die Quelle gibt es nicht (mehr)`);
  }
  for (const [id, reason] of Object.entries(exclusions)) {
    if (!known.has(id)) problems.push(`Ausnahme für „${id}“, aber die Quelle gibt es nicht (mehr)`);
    if (!reason.trim()) problems.push(`Ausnahme für „${id}“ braucht eine Begründung`);
  }
  return problems;
}
