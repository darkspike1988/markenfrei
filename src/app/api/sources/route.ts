import { buildSourcesCatalog, SOURCES_MAX_AGE_SECONDS } from "@/lib/sources-catalog";

/**
 * GET /api/sources: Quellen, Namensräume, Endungen und Profile als JSON (gültige Werte für /api/check),
 * dazu ob ein Registrierungs-Link eingestellt ist (nur ja/nein und Name, nie die Vorlage).
 * Keine Abfragen bei Dritten, kein Rate-Limit nötig. Der Zugriff auf req.headers hält die Route
 * zur Laufzeit, wie bei /api/health und /api/openapi.json.
 */
export function GET(req: Request): Response {
  void req.headers;
  return Response.json(buildSourcesCatalog(), {
    headers: { "Cache-Control": `public, max-age=${SOURCES_MAX_AGE_SECONDS}` },
  });
}
