import { z } from "zod";
import { DEFAULT_NAMESPACES, MAX_NAMES, MAX_TLDS, STATIC_SOURCES } from "@/lib/engine/check";
import { CHECK_PROFILES } from "@/lib/engine/format";
import { DEFAULT_DOMAIN_TLDS, DOMAIN_TLDS, FEATURED_TLDS } from "@/lib/engine/sources/domains";
import { NAMESPACE_LABEL, NAMESPACES } from "@/lib/engine/types";
import { registerConfigFromEnv, type RegisterService } from "@/lib/register";

/**
 * Maschinenlesbarer Quellenkatalog (GET /api/sources): dieselben Daten wie die Seite /quellen, damit
 * Clients die gültigen Werte für `sources`, `namespaces`, `tlds` und `profile` nicht aus dem Text lesen
 * müssen. Reine Daten aus dem Code und der Einstellung des Betreibers, keine Abfrage bei Dritten.
 */

export const SourcesCatalogSchema = z.object({
  schemaVersion: z.literal(2),
  namespaces: z
    .array(z.object({ id: z.enum(NAMESPACES), label: z.string(), default: z.boolean() }))
    .describe("Namensräume; `default` markiert die ohne Angabe geprüften."),
  tlds: z
    .array(
      z.object({
        tld: z.string(),
        default: z.boolean(),
        checked: z
          .boolean()
          .describe(
            "Einzeln geprüft (200 und 404 belegt). Bei false ergibt RDAP-404 nie „nicht gefunden“, sondern „unknown“.",
          ),
      }),
    )
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
  profiles: z
    .array(
      z.object({
        id: z.string().describe("Wert für das Feld `profile` von /api/check und den MCP-Werkzeugen"),
        label: z.string(),
        namespaces: z.array(z.enum(NAMESPACES)),
        tlds: z.array(z.string()).optional().describe("Endungen; nur bei Profilen mit Domains"),
        sources: z.array(z.string()).describe("Quellen außerhalb von Domains"),
      }),
    )
    .describe(
      "Profile: fertige Auswahl von Namensräumen, Quellen und Endungen. Ausdrücklich angegebene `namespaces`, `tlds` oder `sources` ersetzen den jeweiligen Teil.",
    ),
  register: z
    .object({
      configured: z.boolean().describe("Ob der Betreiber einen Registrierungsdienst eingestellt hat"),
      name: z.string().optional().describe("Anzeigename des Dienstes, nur wenn eingestellt"),
    })
    .describe(
      "Registrierungs-Link des Betreibers: Ist er eingestellt, tragen Domain-Zeilen einzeln geprüfter Endungen mit not_found das Feld `register` (eigenes, möglicherweise vergütetes Angebot).",
    ),
  limits: z.object({ maxNames: z.number().int(), maxTlds: z.number().int() }),
});

export type SourcesCatalog = z.infer<typeof SourcesCatalogSchema>;

/** `register`: eingestellter Dienst, Standard aus der Umgebung; die Link-Vorlage wird nie ausgegeben. */
export function buildSourcesCatalog(register: RegisterService | null = registerConfigFromEnv(process.env)): SourcesCatalog {
  return {
    schemaVersion: 2,
    namespaces: NAMESPACES.map((id) => ({
      id,
      label: NAMESPACE_LABEL[id],
      default: (DEFAULT_NAMESPACES as readonly string[]).includes(id),
    })),
    tlds: DOMAIN_TLDS.map((tld) => ({
      tld,
      default: DEFAULT_DOMAIN_TLDS.includes(tld),
      checked: FEATURED_TLDS.includes(tld),
    })),
    sources: STATIC_SOURCES.map((s) => ({
      id: s.id,
      namespace: s.namespace,
      label: s.label,
      default: s.defaultEnabled,
      description: s.description,
      endpoint: s.endpoint,
    })),
    profiles: CHECK_PROFILES.map((p) => ({
      id: p.id,
      label: p.label,
      namespaces: [...p.namespaces],
      ...(p.tlds ? { tlds: [...p.tlds] } : {}),
      sources: [...p.sources],
    })),
    register: register ? { configured: true, name: register.name } : { configured: false },
    limits: { maxNames: MAX_NAMES, maxTlds: MAX_TLDS },
  };
}

/** Cache-Dauer in Sekunden: Die Liste ändert sich nur mit einer neuen Version. */
export const SOURCES_MAX_AGE_SECONDS = 3600;
