/**
 * Vorhaben: fertige Auswahlen von Namensräumen, Quellen und Endungen für typische Projekte
 * (Web-App, Python-Paket, …). Reine Daten und eine reine Funktion, ohne React und ohne
 * Quellcode der Engine, damit Oberfläche und später der MCP-Server dieselben Vorhaben nutzen.
 */
import { NAMESPACES, type Namespace } from "@/lib/engine/types";

/** Was die Vorhaben von einer Quelle wissen müssen (so wie `CheckerConfig.sources`). */
export type ProfileSourceInfo = { id: string; namespace: Namespace; defaultEnabled: boolean };

export type CheckProfile = {
  /** Stabile, kleingeschriebene ID, z. B. "python" */
  id: string;
  label: string;
  namespaces: Namespace[];
  /** Endungen; nur gesetzt, wenn das Vorhaben Domains prüft */
  tlds?: string[];
  /** Alle Quellen-IDs außerhalb von Domains, genau das, was /api/check als `sources` bekäme */
  sources: string[];
};

/**
 * Die Vorhaben außer „Allgemein“. `sources` nennt die Quellen außerhalb von Domains und
 * Bekannten Namen; die Standardquellen der Bekannten Namen kommen bei jedem Vorhaben dazu.
 */
const SPECS: readonly { id: string; label: string; namespaces: Namespace[]; sources: string[]; tlds?: string[] }[] = [
  {
    id: "web-app",
    label: "Web-App",
    namespaces: ["domains", "packages"],
    sources: ["npm", "github"],
    tlds: ["com", "de", "app", "io", "dev", "net"],
  },
  {
    id: "mobile-app",
    label: "Mobile-App",
    namespaces: ["domains", "stores"],
    sources: ["appstore", "googleplay"],
    tlds: ["com", "de", "app"],
  },
  { id: "npm", label: "npm-Paket", namespaces: ["packages"], sources: ["npm", "jsr", "github"] },
  { id: "python", label: "Python-Paket", namespaces: ["packages"], sources: ["pypi", "conda", "github"] },
  { id: "rust", label: "Rust-Crate", namespaces: ["packages"], sources: ["crates", "github"] },
  { id: "dart", label: "Dart/Flutter-Paket", namespaces: ["packages"], sources: ["pub", "github"] },
  { id: "php", label: "PHP-Paket", namespaces: ["packages"], sources: ["packagist", "github"] },
  { id: "ruby", label: "Ruby-Gem", namespaces: ["packages"], sources: ["rubygems", "github"] },
  { id: "dotnet", label: ".NET-Paket", namespaces: ["packages"], sources: ["nuget", "github"] },
  { id: "java", label: "Java-Bibliothek", namespaces: ["packages"], sources: ["maven", "github"] },
  {
    id: "cli",
    label: "Kommandozeile",
    namespaces: ["packages"],
    sources: ["homebrew", "aur", "repology", "npm", "crates", "pypi", "github"],
  },
];

/**
 * Baut die Vorhaben aus der Quellenliste. Zuerst „Allgemein“: Domains mit den Standard-Endungen
 * und alle Namensräume mit Standardquellen, jeweils mit diesen (die Standardauswahl der
 * Startseite). Dann die Vorhaben aus SPECS, jeweils mit den Standardquellen der Bekannten Namen.
 * Quellen-IDs, die die Liste nicht kennt, fallen weg; ein Namensraum ohne verbleibende Quelle
 * ebenfalls (Domains bleiben, wenn das Vorhaben sie nennt).
 */
export function buildProfiles(
  sources: readonly ProfileSourceInfo[],
  defaultTlds: readonly string[],
): CheckProfile[] {
  const standard = sources.filter((s) => s.defaultEnabled);
  const byId = new Map(sources.map((s) => [s.id, s]));
  const knownNames = standard.filter((s) => s.namespace === "known_names").map((s) => s.id);

  const general: CheckProfile = {
    id: "allgemein",
    label: "Allgemein",
    namespaces: NAMESPACES.filter((ns) => ns === "domains" || standard.some((s) => s.namespace === ns)),
    tlds: [...defaultTlds],
    sources: standard.map((s) => s.id),
  };

  const specific = SPECS.map((spec): CheckProfile => {
    const picked = [...new Set([...spec.sources.filter((id) => byId.has(id)), ...knownNames])];
    const used = new Set(picked.map((id) => byId.get(id)!.namespace));
    const namespaces = NAMESPACES.filter((ns) => (ns === "domains" ? spec.namespaces.includes(ns) : used.has(ns)));
    const profile: CheckProfile = { id: spec.id, label: spec.label, namespaces, sources: picked };
    if (namespaces.includes("domains")) profile.tlds = [...(spec.tlds ?? defaultTlds)];
    return profile;
  });

  return [general, ...specific];
}
