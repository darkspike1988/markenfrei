/**
 * Daten, die die Server-Komponente zur Buildzeit an die Oberfläche übergibt, und der
 * Zustand im Link. Nur Typen und reine Funktionen: hier darf kein Server-Code landen.
 */
import type { Namespace } from "@/lib/engine/types";

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
  tlds: string[];
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
