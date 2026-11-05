import { APP_VERSION } from "@/lib/version";

/**
 * GET /api/health: Lebenszeichen für Monitoring. Billig: keine Abfragen bei Dritten, keine
 * Umgebungsvariablen, keine Geheimnisse, kein Rate-Limit. Sagt nur, dass der Serverprozess
 * antwortet. Der Zugriff auf req.headers hält die Route zur Laufzeit (sonst würde Next sie
 * beim Build einmalig vorrendern und ein Monitoring prüfte nur eine Datei).
 */
export function GET(req: Request): Response {
  void req.headers;
  return Response.json({ status: "ok", version: APP_VERSION }, { headers: { "Cache-Control": "no-store" } });
}
