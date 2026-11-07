import { z } from "zod";
import { MAX_NAMES } from "@/lib/engine/check";

/**
 * Eingabe und feste Meldungen von POST /api/check. Eigenes Modul, weil Route-Dateien in Next
 * nur Handler exportieren dürfen; die Route und die OpenAPI-Beschreibung (src/lib/openapi.ts)
 * lesen von hier, damit beide nicht auseinanderlaufen.
 */

/** Größte erlaubte Anfrage in Bytes. */
export const CHECK_MAX_BODY_BYTES = 16 * 1024;

export const CHECK_LIMITS = {
  nameMaxLength: 200,
  tldMaxLength: 30,
  tldsMaxItems: 50,
  namespaceMaxLength: 30,
  namespacesMaxItems: 20,
  sourceMaxLength: 60,
  sourcesMaxItems: 100,
} as const;

export const checkBodySchema = z.object({
  names: z.array(z.string().max(CHECK_LIMITS.nameMaxLength)).min(1).max(MAX_NAMES),
  tlds: z.array(z.string().max(CHECK_LIMITS.tldMaxLength)).max(CHECK_LIMITS.tldsMaxItems).optional(),
  namespaces: z.array(z.string().max(CHECK_LIMITS.namespaceMaxLength)).max(CHECK_LIMITS.namespacesMaxItems).optional(),
  sources: z.array(z.string().max(CHECK_LIMITS.sourceMaxLength)).max(CHECK_LIMITS.sourcesMaxItems).optional(),
});

/** Feste Fehlermeldungen (jeweils als { error } ausgeliefert). */
export const CHECK_ERRORS = {
  forbidden: "Aufrufe von fremden Seiten sind nicht erlaubt.",
  contentType: "Bitte als JSON senden (Content-Type: application/json).",
  unreadable: "Die Anfrage konnte nicht gelesen werden.",
  tooLarge: `Die Anfrage ist zu groß (höchstens ${CHECK_MAX_BODY_BYTES / 1024} KB).`,
  invalidJson: "Die Anfrage ist kein gültiges JSON.",
  failed: "Die Prüfung ist fehlgeschlagen. Bitte später erneut versuchen.",
  /** Kosten der Anfrage übersteigen das Limit pro Fenster: Wiederholen hilft nie. */
  exceedsLimit: (limit: number) =>
    `Die Anfrage ist größer als das Limit von ${limit} Einheiten; wähle weniger Namen oder Quellen.`,
} as const;
