import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { MAX_NAMES } from "@/lib/engine/check";
import { guardRequest } from "@/lib/rate-limit";
import { createMarkenfreiMcpServer } from "@/mcp/server";

/**
 * MCP über HTTP (Streamable HTTP, zustandslos). Derselbe Server wie bei stdio
 * (`src/mcp/server.ts`), damit es nur eine Implementierung gibt.
 *
 * Schutz vor dem Transport (docs/v2-spec.md, "MCP"): Origin prüfen, Body höchstens 64 KB,
 * keine Batch-Anfragen, Rate-Limit mit Kosten je geprüftem Namen.
 */

const MAX_BODY_BYTES = 64 * 1024;

function rpcError(status: number, code: number, message: string, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify({ jsonrpc: "2.0", error: { code, message }, id: null }), {
    status,
    headers: { "Content-Type": "application/json", ...headers },
  });
}

function originOf(value: string): string | null {
  try {
    const u = new URL(value);
    return u.protocol === "http:" || u.protocol === "https:" ? u.origin : null;
  } catch {
    return null;
  }
}

/** Fehlender Origin ist erlaubt (Kommandozeile, Server). Sonst nur eigener Host, localhost und die Liste. */
function isAllowedOrigin(origin: string | null, req: Request): boolean {
  if (origin === null) return true;
  const normalized = originOf(origin);
  if (!normalized) return false;
  const { hostname, host } = new URL(normalized);
  if (hostname === "localhost" || hostname === "127.0.0.1") return true;

  const ownHosts = [req.headers.get("host"), req.headers.get("x-forwarded-host"), new URL(req.url).host]
    .flatMap((h) => (h ? h.split(",") : []))
    .map((h) => h.trim().toLowerCase())
    .filter(Boolean);
  if (ownHosts.includes(host)) return true;

  const extra = (process.env.MARKENFREI_ALLOWED_ORIGINS ?? "")
    .split(",")
    .map((o) => originOf(o.trim()))
    .filter((o): o is string => o !== null);
  return extra.includes(normalized);
}

/** Liest den Body bis MAX_BODY_BYTES; null, wenn er größer ist. */
async function readBodyLimited(req: Request, max: number): Promise<string | null> {
  const declared = Number(req.headers.get("content-length"));
  if (Number.isFinite(declared) && declared > max) return null;
  if (!req.body) return "";
  const reader = req.body.getReader();
  const decoder = new TextDecoder();
  let size = 0;
  let text = "";
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > max) {
      await reader.cancel().catch(() => undefined);
      return null;
    }
    text += decoder.decode(value, { stream: true });
  }
  return text + decoder.decode();
}

/** Kosten fürs Rate-Limit: Anzahl der Namen bei markenfrei_check_names, sonst 1. */
function requestCost(message: unknown): number {
  if (!message || typeof message !== "object") return 1;
  const m = message as { method?: unknown; params?: { name?: unknown; arguments?: { names?: unknown } } };
  if (m.method !== "tools/call" || m.params?.name !== "markenfrei_check_names") return 1;
  const names = m.params.arguments?.names;
  return Array.isArray(names) ? Math.min(Math.max(names.length, 1), MAX_NAMES) : 1;
}

export async function POST(req: Request) {
  if (!isAllowedOrigin(req.headers.get("origin"), req)) {
    return rpcError(403, -32000, "Origin nicht erlaubt.");
  }

  const body = await readBodyLimited(req, MAX_BODY_BYTES);
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

  const limited = guardRequest(req, requestCost(parsed));
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
