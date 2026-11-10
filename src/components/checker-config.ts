/**
 * Daten, die die Server-Komponente zur Buildzeit an die Oberfläche übergibt, und der
 * Zustand im Link. Nur Typen und reine Funktionen: hier darf kein Server-Code landen.
 */
import { NAMESPACES, type Namespace } from "@/lib/engine/types";
import { normalizeName } from "@/lib/name";

export type SourceInfo = {
  id: string;
  label: string;
  namespace: Namespace;
  description: string;
  defaultEnabled: boolean;
};

export type CheckerConfig = {
  /** Namensräume, die sich umschalten lassen (mit mindestens einer Standardquelle) */
  namespaces: { id: Namespace; label: string }[];
  defaultNamespaces: Namespace[];
  /** Alle wählbaren Endungen (für Suchfeld und ?tld=) */
  tlds: string[];
  /** Die kuratierten Endungen, die als Chips erscheinen */
  featuredTlds: string[];
  defaultTlds: string[];
  maxTlds: number;
  maxNames: number;
  /** Alle Quellen außer Domains */
  sources: SourceInfo[];
};

export type Selection = {
  names: string[];
  namespaces: Namespace[];
  tlds: string[];
  /** Zusätzliche, nicht standardmäßige Quellen */
  extra: string[];
};

/** Trennt die Eingabe an Komma und Zeilenumbruch, ohne Leereinträge und Dubletten. */
export function splitNames(text: string): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const part of text.split(/[,;\n\r]+/)) {
    const t = part.trim();
    const key = t.toLowerCase();
    if (!t || seen.has(key)) continue;
    seen.add(key);
    out.push(t);
  }
  return out;
}

function list(value: string | null): string[] {
  return (value ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

function sameSet(a: readonly string[], b: readonly string[]): boolean {
  return a.length === b.length && a.every((x) => b.includes(x));
}

/** Liest ?q=a,b&tld=de,com&ns=domains,packages&src=nuget. Unbekanntes wird ignoriert. */
export function parseSelection(params: URLSearchParams, config: CheckerConfig): Selection {
  const names = splitNames(list(params.get("q")).join(","));
  const nsAllowed = config.namespaces.map((n) => n.id);
  const ns = params.has("ns")
    ? list(params.get("ns")).filter((n): n is Namespace => (nsAllowed as string[]).includes(n))
    : [...config.defaultNamespaces];
  const tlds = params.has("tld")
    ? [...new Set(list(params.get("tld")).map((t) => t.toLowerCase().replace(/^\./, "")))]
        .filter((t) => config.tlds.includes(t))
        .slice(0, config.maxTlds)
    : [...config.defaultTlds];
  const optional = new Set(config.sources.filter((s) => !s.defaultEnabled).map((s) => s.id));
  const extra = [...new Set(list(params.get("src")))].filter((id) => optional.has(id));
  return { names, namespaces: ns, tlds: tlds.length ? tlds : [...config.defaultTlds], extra };
}

/** Baut den Query-String; Standardwerte werden weggelassen, damit Links kurz bleiben. */
export function buildQuery(sel: Selection, config: CheckerConfig): string {
  const p = new URLSearchParams();
  if (sel.names.length) p.set("q", sel.names.join(","));
  if (!sameSet(sel.namespaces, config.defaultNamespaces)) p.set("ns", sel.namespaces.join(","));
  if (!sameSet(sel.tlds, config.defaultTlds)) p.set("tld", sel.tlds.join(","));
  if (sel.extra.length) p.set("src", sel.extra.join(","));
  // Kommas lesbar lassen
  return p.toString().replace(/%2C/gi, ",");
}

/**
 * Anfragekörper für /api/check. Die Engine ersetzt mit `sources` die Standardauswahl
 * außerhalb von Domains, daher gehen bei zusätzlichen Quellen die Standardquellen der
 * gewählten Namensräume mit.
 */
export function buildRequestBody(
  name: string,
  sel: Pick<Selection, "namespaces" | "tlds" | "extra">,
  config: CheckerConfig,
): { names: string[]; namespaces?: Namespace[]; tlds?: string[]; sources?: string[] } {
  const wantsDomains = sel.namespaces.includes("domains");
  const extraNs = config.sources.filter((s) => sel.extra.includes(s.id)).map((s) => s.namespace);
  const namespaces = sel.namespaces.length ? sel.namespaces : [...new Set(extraNs)];
  const body: { names: string[]; namespaces?: Namespace[]; tlds?: string[]; sources?: string[] } = {
    names: [name],
    namespaces,
  };
  if (wantsDomains) body.tlds = sel.tlds;
  if (sel.extra.length) {
    const defaults = config.sources
      .filter((s) => s.defaultEnabled && sel.namespaces.includes(s.namespace))
      .map((s) => s.id);
    body.sources = [...defaults, ...sel.extra.filter((id) => !defaults.includes(id))];
  }
  return body;
}

/** Prüft, ob die Auswahl überhaupt eine Quelle ergibt. */
export function hasAnySource(sel: Pick<Selection, "namespaces" | "extra">): boolean {
  return sel.namespaces.length > 0 || sel.extra.length > 0;
}

/**
 * Eine ruhige Zeile für die aktuelle Auswahl, z. B. „Domains, Pakete · .de .com · +2 weitere Quellen“.
 * Dient auch Screenreadern als Zusammenfassung hinter dem Schalter „Anpassen“.
 */
export function selectionSummary(
  sel: Pick<Selection, "namespaces" | "tlds" | "extra">,
  config: Pick<CheckerConfig, "namespaces">,
): string {
  const labels = config.namespaces.filter((n) => sel.namespaces.includes(n.id)).map((n) => n.label);
  const parts: string[] = [];
  if (labels.length) parts.push(labels.join(", "));
  if (sel.namespaces.includes("domains") && sel.tlds.length) parts.push(sel.tlds.map((t) => `.${t}`).join(" "));
  if (sel.extra.length) parts.push(`+${sel.extra.length} ${sel.extra.length === 1 ? "weitere Quelle" : "weitere Quellen"}`);
  return parts.join(" · ") || "Keine Quelle gewählt";
}

const COUNTRY_TLDS = ["de", "ch", "li", "at", "eu", "fr", "uk", "nl", "pl", "cz", "ca", "io", "ai", "tv"];
const GENERIC_TLDS = ["com", "net", "org", "info", "biz", "pro"];

/** Kuratierte Endungen für die Chips: Länder, Allgemein, Neue Endungen (alles Übrige). */
export function groupFeaturedTlds(featured: readonly string[]): { label: string; tlds: string[] }[] {
  const groups = [
    { label: "Länder", tlds: featured.filter((t) => COUNTRY_TLDS.includes(t)) },
    { label: "Allgemein", tlds: featured.filter((t) => GENERIC_TLDS.includes(t)) },
    {
      label: "Neue Endungen",
      tlds: featured.filter((t) => !COUNTRY_TLDS.includes(t) && !GENERIC_TLDS.includes(t)),
    },
  ];
  return groups.filter((g) => g.tlds.length > 0);
}

/**
 * Normalisiert die Eingabe im Suchfeld („.Shop “ → „shop“) und liefert die Endung,
 * wenn sie wählbar ist, sonst undefined.
 */
export function findTld(input: string, all: readonly string[]): string | undefined {
  const t = input.trim().toLowerCase().replace(/^\./, "");
  return t && all.includes(t) ? t : undefined;
}

/** Wählbare Zusatzquellen nach Namensraum gruppiert, in der Reihenfolge der Namensräume. */
export function groupOptional(sources: SourceInfo[]): { ns: Namespace; list: SourceInfo[] }[] {
  const m = new Map<Namespace, SourceInfo[]>();
  for (const s of sources) {
    if (s.defaultEnabled) continue;
    m.set(s.namespace, [...(m.get(s.namespace) ?? []), s]);
  }
  return NAMESPACES.filter((ns) => m.has(ns)).map((ns) => ({ ns, list: m.get(ns)! }));
}

export type NamePreview = {
  /** Eingabe wie getippt (ohne Leerraum am Rand) */
  input: string;
  /** Name, wie er geprüft wird; null, wenn die Eingabe kein gültiger Name ist */
  name: string | null;
  /** Grund, warum die Eingabe kein gültiger Name ist */
  error?: string;
  /** Die Eingabe ergibt denselben Namen wie eine frühere und erscheint im Ergebnis nur einmal */
  duplicate?: boolean;
};

/**
 * Vorschau während der Eingabe: je Eintrag der Name, wie ihn die Prüfung normalisiert
 * („Wach Werk“ → „wachwerk“, „müller.de“ → „mueller“), oder der Grund für die Ablehnung.
 * Dieselbe Normalisierung wie auf dem Server, ohne Anfrage.
 */
export function previewNames(text: string): NamePreview[] {
  const seen = new Set<string>();
  return splitNames(text).map((input) => {
    const result = normalizeName(input);
    if (!result.ok) return { input, name: null, error: result.error };
    const duplicate = seen.has(result.name);
    seen.add(result.name);
    return duplicate ? { input, name: result.name, duplicate } : { input, name: result.name };
  });
}
