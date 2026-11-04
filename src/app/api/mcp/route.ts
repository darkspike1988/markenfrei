import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { guardRequest } from "@/lib/rate-limit";
import { createMarkenfreiMcpServer } from "@/mcp/server";

/**
 * MCP über HTTP (Streamable HTTP, zustandslos). Derselbe Server wie bei stdio
 * (`src/mcp/server.ts`), damit es nur eine Implementierung gibt.
 */
export async function POST(req: Request) {
  const limited = guardRequest(req);
  if (limited) return limited;

  // Die Spezifikation verlangt beide Typen im Accept-Header. Wir antworten immer als
  // JSON und akzeptieren deshalb auch Clients, die nur application/json senden.
  // Die Anfrage wird aus URL und Body neu gebaut: In Next ist req ein NextRequest, und
  // new Request(req, ...) bricht dort mit ERR_INVALID_URL ab.
  const headers = new Headers(req.headers);
  headers.set("accept", "application/json, text/event-stream");
  const request = new Request(req.url, {
    method: "POST",
    headers,
    body: await req.text(),
  });

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
