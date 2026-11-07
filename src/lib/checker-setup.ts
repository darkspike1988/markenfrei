import type { CheckerConfig } from "@/components/checker-config";
import { DEFAULT_NAMESPACES, MAX_NAMES, MAX_TLDS, STATIC_SOURCES } from "@/lib/engine/check";
import { DEFAULT_DOMAIN_TLDS, DOMAIN_TLDS, FEATURED_TLDS } from "@/lib/engine/sources/domains";
import { NAMESPACE_LABEL, NAMESPACES, type Namespace } from "@/lib/engine/types";

/**
 * Daten für die Oberfläche des Prüfers. Läuft in Server-Komponenten zur Buildzeit und macht
 * die Quellenliste zu reinen Daten, damit der Engine-Code nicht im Client-Bundle landet.
 * `defaultNamespaces` bestimmt, welche Namensräume ohne `?ns=` vorausgewählt sind
 * (Startseite: alle Standard-Namensräume, Anleitungen: der Namensraum der Seite).
 */
export function buildCheckerConfig(defaultNamespaces: readonly Namespace[] = DEFAULT_NAMESPACES): CheckerConfig {
  const withDefaults = new Set(STATIC_SOURCES.filter((s) => s.defaultEnabled).map((s) => s.namespace));
  return {
    namespaces: NAMESPACES.filter((ns) => ns === "domains" || withDefaults.has(ns)).map((id) => ({
      id,
      label: NAMESPACE_LABEL[id],
    })),
    defaultNamespaces: [...defaultNamespaces],
    tlds: [...DOMAIN_TLDS],
    featuredTlds: [...FEATURED_TLDS],
    defaultTlds: [...DEFAULT_DOMAIN_TLDS],
    maxTlds: MAX_TLDS,
    maxNames: MAX_NAMES,
    sources: STATIC_SOURCES.map((s) => ({
      id: s.id,
      label: s.label,
      namespace: s.namespace,
      description: s.description,
      defaultEnabled: s.defaultEnabled,
    })),
  };
}
