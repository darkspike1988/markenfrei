import { securityTxtFromEnv } from "@/lib/security-txt";

/**
 * GET /.well-known/security.txt (RFC 9116). Adresse und Ablaufdatum werden zur Laufzeit aus der
 * Umgebung gebaut; der Zugriff auf req.headers hält die Route dynamisch. Ohne gültige
 * MARKENFREI_OPERATOR_EMAIL gibt es 404.
 */
export function GET(req: Request): Response {
  void req.headers;
  const headers = { "Content-Type": "text/plain; charset=utf-8" };
  const body = securityTxtFromEnv();
  if (body === null) return new Response("Not Found\n", { status: 404, headers });
  return new Response(body, { headers });
}
