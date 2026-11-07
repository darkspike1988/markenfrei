import { z } from "zod";
import { DEFAULT_NAMESPACES, MAX_NAMES, MAX_TLDS, STATIC_SOURCES } from "@/lib/engine/check";
import { DEFAULT_DOMAIN_TLDS, DOMAIN_TLDS } from "@/lib/engine/sources/domains";
import { NAMESPACE_LABEL, NAMESPACES } from "@/lib/engine/types";

/**
 * Maschinenlesbarer Quellenkatalog (GET /api/sources): dieselben Daten wie die Seite /quellen, damit
 * Clients die gültigen Werte für `sources`, `namespaces` und `tlds` nicht aus dem Text lesen müssen.
 * Reine Daten aus dem Code, keine Abfrage bei Dritten.
 */

export const SourcesCatalogSchema = z.object({
  schemaVersion: z.literal(2),
  namespaces: z
    .array(z.object({ id: z.enum(NAMESPACES), label: z.string(), default: z.boolean() }))
    .describe("Namensräume; `default` markiert die ohne Angabe geprüften."),
  tlds: z
    .array(z.object({ tld: z.string(), default: z.boolean() }))
    .describe("Endungen für den Namensraum domains."),
  sources: z
    .array(
      z.object({
        id: z.string().describe("ID für das Feld `sources` von /api/check"),
        namespace: z.enum(NAMESPACES),
        label: z.string(),
        default: z.boolean().describe("Teil der Standardprüfung"),
        description: z.string(),
        endpoint: z.string().describe("Abgefragter Endpunkt (Vorlage mit {name})"),
      }),
    )
    .describe("Alle Quellen außer Domains; Domains entstehen je Endung aus `tlds`."),
  limits: z.object({ maxNames: z.number().int(), maxTlds: z.number().int() }),
});

export type SourcesCatalog = z.infer<typeof SourcesCatalogSchema>;

export function buildSourcesCatalog(): SourcesCatalog {
  return {
    schemaVersion: 2,
    namespaces: NAMESPACES.map((id) => ({
      id,
      label: NAMESPACE_LABEL[id],
      default: (DEFAULT_NAMESPACES as readonly string[]).includes(id),
    })),
    tlds: DOMAIN_TLDS.map((tld) => ({ tld, default: DEFAULT_DOMAIN_TLDS.includes(tld) })),
    sources: STATIC_SOURCES.map((s) => ({
      id: s.id,
      namespace: s.namespace,
      label: s.label,
      default: s.defaultEnabled,
      description: s.description,
      endpoint: s.endpoint,
    })),
    limits: { maxNames: MAX_NAMES, maxTlds: MAX_TLDS },
  };
}

/** Cache-Dauer in Sekunden: Die Liste ändert sich nur mit einer neuen Version. */
export const SOURCES_MAX_AGE_SECONDS = 3600;
