import { buildOpenApiDocument, OPENAPI_MAX_AGE_SECONDS } from "@/lib/openapi";
import { publicUrl } from "@/lib/site";

/**
 * GET /api/openapi.json: OpenAPI-3.1-Beschreibung der öffentlichen Schnittstelle.
 * Aufgebaut in src/lib/openapi.ts aus denselben Konstanten und Schemas wie die Routen.
 * Die Server-Adresse kommt aus MARKENFREI_PUBLIC_URL und wird zur Laufzeit gelesen,
 * nicht beim Build (der Zugriff auf req.headers hält die Route dynamisch).
 */
export function GET(req: Request): Response {
  void req.headers;
  return Response.json(buildOpenApiDocument(publicUrl().origin), {
    headers: { "Cache-Control": `public, max-age=${OPENAPI_MAX_AGE_SECONDS}` },
  });
}
