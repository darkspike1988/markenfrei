import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { guard, isAllowedMcpOrigin, mcpRequestCost, readLimited } from "@/app/api/_lib/http";
import { createMarkenfreiMcpServer } from "@/mcp/server";

/**
 * MCP über HTTP (Streamable HTTP, zustandslos). Derselbe Server wie bei stdio
 * (`src/mcp/server.ts`), damit es nur eine Implementierung gibt.
 *
 * Schutz vor dem Transport (docs/v2-spec.md, "MCP"): Origin gegen die Konfiguration prüfen
 * (nie gegen Host oder X-Forwarded-Host, Schutz vor DNS-Rebinding), Body höchstens 64 KB,
 * keine Batch-Anfragen, Rate-Limit nach Namen und Quellenumfang (src/app/api/_lib/http.ts).
 */

const MAX_BODY_BYTES = 64 * 1024;

function rpcError(status: number, code: number, message: string, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify({ jsonrpc: "2.0", error: { code, message }, id: null }), {
    status,
    headers: { "Content-Type": "application/json", ...headers },
  });
}

export async function POST(req: Request) {
  if (!isAllowedMcpOrigin(req)) {
    return rpcError(403, -32000, "Origin nicht erlaubt.");
  }

  let body: string | null;
  try {
    body = await readLimited(req, MAX_BODY_BYTES);
  } catch {
    return rpcError(400, -32600, "Die Anfrage konnte nicht gelesen werden.");
  }
  if (body === null) {
    return rpcError(413, -32600, `Anfrage zu groß (höchstens ${MAX_BODY_BYTES / 1024} KB).`);
  }

  // Kaputtes JSON beantwortet der Transport selbst mit -32700.
  let parsed: unknown;
  try {
    parsed = JSON.parse(body);
  } catch {
    parsed = undefined;
  }

  const { cost, outbound } = mcpRequestCost(parsed);
  const limited = guard(req, cost, outbound);
  if (limited) return limited;

  if (Array.isArray(parsed)) {
    return rpcError(400, -32600, "Batch-Anfragen werden nicht unterstützt.");
  }

  // Die Spezifikation verlangt beide Typen im Accept-Header. Wir antworten immer als
  // JSON und akzeptieren deshalb auch Clients, die nur application/json senden.
  // Die Anfrage wird aus URL und Body neu gebaut: In Next ist req ein NextRequest, und
  // new Request(req, ...) bricht dort mit ERR_INVALID_URL ab.
  const headers = new Headers(req.headers);
  headers.set("accept", "application/json, text/event-stream");
  headers.delete("content-length");
  const request = new Request(req.url, { method: "POST", headers, body });

  const server = createMarkenfreiMcpServer();
  const transport = new WebStandardStreamableHTTPServerTransport({
    sessionIdGenerator: undefined,
    enableJsonResponse: true,
  });

  try {
    await server.connect(transport);
    return await transport.handleRequest(request);
  } finally {
    // Pro Anfrage ein Server: nach der Antwort aufräumen
    await transport.close().catch(() => undefined);
    await server.close().catch(() => undefined);
  }
}

/** Zustandslos: kein Server-Push-Stream und keine Sitzungen. */
export function GET() {
  return new Response(JSON.stringify({ error: "Nur POST wird unterstützt." }), {
    status: 405,
    headers: { "Content-Type": "application/json", Allow: "POST" },
  });
}
