import { buildSourcesCatalog, SOURCES_MAX_AGE_SECONDS } from "@/lib/sources-catalog";

/**
 * GET /api/sources: Quellen, Namensräume und Endungen als JSON (gültige Werte für /api/check).
 * Keine Abfragen bei Dritten, kein Rate-Limit nötig. Der Zugriff auf req.headers hält die Route
 * zur Laufzeit, wie bei /api/health und /api/openapi.json.
 */
export function GET(req: Request): Response {
  void req.headers;
  return Response.json(buildSourcesCatalog(), {
    headers: { "Cache-Control": `public, max-age=${SOURCES_MAX_AGE_SECONDS}` },
  });
}
