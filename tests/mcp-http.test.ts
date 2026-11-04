import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { clearAllCaches } from "@/lib/cache";
import { clearResultCache } from "@/lib/engine/check";
import { NextRequest } from "next/server";
import { GET, POST } from "@/app/api/mcp/route";
import { TOOL_NAMES } from "@/mcp/server";

const realFetch = globalThis.fetch;
const realOrigins = process.env.MARKENFREI_ALLOWED_ORIGINS;
before(() => {
  clearAllCaches();
  clearResultCache();
  // Alle Quellen offline: geprüft werden Protokoll und Fehlerbehandlung.
  globalThis.fetch = (() => Promise.reject(new Error("offline"))) as typeof fetch;
  process.env.MARKENFREI_ALLOWED_ORIGINS = "https://partner.example, https://other.example:8443";
});
after(() => {
  globalThis.fetch = realFetch;
  if (realOrigins === undefined) delete process.env.MARKENFREI_ALLOWED_ORIGINS;
  else process.env.MARKENFREI_ALLOWED_ORIGINS = realOrigins;
  clearAllCaches();
  clearResultCache();
});

// Jeder Test mit eigener IP, damit sich die Rate-Limit-Zähler nicht beeinflussen.
let ipCounter = 10;
function nextIp() {
  return `203.0.113.${ipCounter++}`;
}

function rpc(body: unknown, opts: { raw?: boolean; headers?: Record<string, string>; ip?: string } = {}) {
  return POST(
    new Request("http://localhost/api/mcp", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-forwarded-for": opts.ip ?? nextIp(), ...opts.headers },
      body: opts.raw ? String(body) : JSON.stringify(body),
    }),
  );
}

test("initialize liefert Server-Informationen und Anweisungen", async () => {
  const res = await rpc({
    jsonrpc: "2.0",
    id: 1,
    method: "initialize",
    params: {
      protocolVersion: "2025-06-18",
      capabilities: {},
      clientInfo: { name: "test", version: "0" },
    },
  });
  assert.equal(res.status, 200);
  const body = (await res.json()) as { result: { serverInfo: { name: string }; instructions?: string } };
  assert.equal(body.result.serverInfo.name, "markenfrei");
  assert.match(body.result.instructions ?? "", /keine Markenfreigabe/);
});

test("tools/list nennt genau die vier Werkzeuge", async () => {
  const res = await rpc({ jsonrpc: "2.0", id: 2, method: "tools/list" });
  assert.equal(res.status, 200);
  const body = (await res.json()) as { result: { tools: { name: string; outputSchema?: object }[] } };
  assert.deepEqual(body.result.tools.map((t) => t.name).sort(), [...TOOL_NAMES].sort());
  assert.ok(body.result.tools.every((t) => t.outputSchema));
});

test("Benachrichtigung ohne id bekommt 202 ohne Inhalt", async () => {
  const res = await rpc({ jsonrpc: "2.0", method: "notifications/initialized" });
  assert.equal(res.status, 202);
  assert.equal(await res.text(), "");
});

test("ungültiges JSON ergibt einen JSON-RPC-Fehler -32700 statt eines Absturzes", async () => {
  const res = await rpc("{kaputt", { raw: true });
  assert.ok(res.status >= 400 && res.status < 500, `Status ${res.status}`);
  const body = (await res.json()) as { error: { code: number } };
  assert.equal(body.error.code, -32700);
});

test("Batch-Anfragen werden mit 400 und -32600 abgelehnt", async () => {
  const res = await rpc([
    { jsonrpc: "2.0", id: 1, method: "tools/list" },
    { jsonrpc: "2.0", id: 2, method: "tools/list" },
  ]);
  assert.equal(res.status, 400);
  const body = (await res.json()) as { error: { code: number; message: string } };
  assert.equal(body.error.code, -32600);
  assert.equal(body.error.message, "Batch-Anfragen werden nicht unterstützt.");
});

test("Origin: fremd 403, fehlend, gleicher Host, localhost und Liste erlaubt", async () => {
  const list = { jsonrpc: "2.0", id: 3, method: "tools/list" };
  const status = async (origin?: string) =>
    (await rpc(list, { headers: origin === undefined ? {} : { Origin: origin } })).status;

  const denied = await rpc(list, { headers: { Origin: "https://evil.example" } });
  assert.equal(denied.status, 403);
  assert.equal(((await denied.json()) as { error: { code: number } }).error.code, -32000);
  assert.equal(await status("null"), 403);
  assert.equal(await status("https://partner.example.evil"), 403);
  assert.equal(await status("file:///etc/passwd"), 403);

  assert.equal(await status(undefined), 200);
  assert.equal(await status("http://localhost"), 200, "gleicher Host wie die Anfrage");
  assert.equal(await status("http://localhost:3000"), 200);
  assert.equal(await status("https://127.0.0.1:8080"), 200);
  assert.equal(await status("https://partner.example"), 200, "aus MARKENFREI_ALLOWED_ORIGINS");
  assert.equal(await status("https://other.example:8443"), 200);

  const ownHost = await POST(
    new Request("https://markenfrei.app/api/mcp", {
      method: "POST",
      headers: { "Content-Type": "application/json", Origin: "https://markenfrei.app", "x-forwarded-for": nextIp() },
      body: JSON.stringify(list),
    }),
  );
  assert.equal(ownHost.status, 200);
});

test("Body über 64 KB ergibt 413", async () => {
  const big = { jsonrpc: "2.0", id: 4, method: "tools/list", params: { pad: "x".repeat(70 * 1024) } };
  const res = await rpc(big);
  assert.equal(res.status, 413);
  const body = (await res.json()) as { error: { code: number } };
  assert.equal(body.error.code, -32600);

  // Ohne Content-Length (Stream) greift die Grenze ebenfalls
  const chunk = new TextEncoder().encode("x".repeat(16 * 1024));
  let sent = 0;
  const stream = new ReadableStream<Uint8Array>({
    pull(controller) {
      if (sent++ < 5) controller.enqueue(chunk);
      else controller.close();
    },
  });
  const streamed = await POST(
    new Request("http://localhost/api/mcp", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-forwarded-for": nextIp() },
      body: stream,
      duplex: "half",
    } as RequestInit),
  );
  assert.equal(streamed.status, 413);
});

const customLimit = process.env.MARKENFREI_RATE_LIMIT ? "MARKENFREI_RATE_LIMIT gesetzt" : false;
test("Rate-Limit: markenfrei_check_names kostet so viel wie Namen", { skip: customLimit }, async () => {
  const ip = nextIp();
  const names = Array.from({ length: 10 }, (_, i) => `ratename${i}`);
  const call = (id: number) =>
    rpc(
      {
        jsonrpc: "2.0",
        id,
        method: "tools/call",
        params: { name: "markenfrei_check_names", arguments: { names, tlds: ["de"], sources: ["npm"] } },
      },
      { ip },
    );
  // Standardlimit 60 pro Minute: sechs Aufrufe mit je 10 Namen passen, der siebte nicht.
  for (let i = 0; i < 6; i++) assert.equal((await call(i)).status, 200, `Aufruf ${i + 1}`);
  const limited = await call(99);
  assert.equal(limited.status, 429);
  assert.ok(limited.headers.get("retry-after"));
});

test("Rate-Limit: Schreibvarianten desselben Namens kosten nur einmal", { skip: customLimit }, async () => {
  const ip = nextIp();
  const names = ["dupname", "Dupname", "DUPNAME", "dupname.de", "dupname.com", "DupName", "dUpname", "dupName", "dupname.io", "DUPname"];
  const call = (id: number) =>
    rpc(
      {
        jsonrpc: "2.0",
        id,
        method: "tools/call",
        params: { name: "markenfrei_check_names", arguments: { names, tlds: ["de"], sources: ["npm"] } },
      },
      { ip },
    );
  // Mit Kosten 10 je Aufruf wäre der siebte gesperrt; nach der Normalisierung ist es ein Name.
  for (let i = 0; i < 8; i++) assert.equal((await call(i)).status, 200, `Aufruf ${i + 1}`);
  const body = (await (await call(50)).json()) as { result: { structuredContent: { ranking: { name: string }[] } } };
  assert.deepEqual(
    body.result.structuredContent.ranking.map((e) => e.name),
    ["dupname"],
  );
});

test("check_names über HTTP: Berichte ohne trademark, Lücken im Text", async () => {
  const res = await rpc({
    jsonrpc: "2.0",
    id: 7,
    method: "tools/call",
    params: { name: "markenfrei_check_names", arguments: { names: ["httpname", "anderer"], tlds: ["de"], sources: ["npm"] } },
  });
  const body = (await res.json()) as {
    result: { content: { text: string }[]; structuredContent: { reports: Record<string, unknown>[] } };
  };
  assert.equal(body.result.structuredContent.reports.length, 2);
  for (const r of body.result.structuredContent.reports) assert.ok(!("trademark" in r));
  assert.match(body.result.content[0].text, /Lücken: \.de, npm/);
});

test("initialize: not_found ist eindeutig erklärt", async () => {
  const res = await rpc({
    jsonrpc: "2.0",
    id: 8,
    method: "initialize",
    params: { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "test", version: "0" } },
  });
  const body = (await res.json()) as { result: { instructions?: string } };
  assert.match(body.result.instructions ?? "", /das heißt nicht, dass er frei oder registrierbar ist/);
  assert.doesNotMatch(body.result.instructions ?? "", /das heißt nicht registrierbar/);
});

test("Werkzeugaufruf über HTTP liefert structuredContent (offline: Lücken statt frei)", async () => {
  const res = await rpc({
    jsonrpc: "2.0",
    id: 5,
    method: "tools/call",
    params: { name: "markenfrei_check_name", arguments: { name: "Müller", tlds: ["de"] } },
  });
  const body = (await res.json()) as {
    result: { structuredContent: { schemaVersion: number; name: string; verdict: string; incomplete: string[] } };
  };
  const sc = body.result.structuredContent;
  assert.equal(sc.schemaVersion, 2);
  assert.equal(sc.name, "mueller");
  assert.notEqual(sc.verdict, "green", "offline darf nie grün sein");
  assert.ok(sc.incomplete.length > 0, "offline: Prüfung muss als unvollständig gelten");
});

test("ungültige Eingabe im Werkzeug ist ein Werkzeugfehler mit Klartext", async () => {
  const res = await rpc({
    jsonrpc: "2.0",
    id: 6,
    method: "tools/call",
    params: { name: "markenfrei_check_name", arguments: { name: "a.b.c" } },
  });
  const body = (await res.json()) as { result: { isError?: boolean; content: { text: string }[] } };
  assert.equal(body.result.isError, true);
  assert.match(body.result.content[0].text, /ohne Punkte/);
});

test("GET wird abgelehnt (zustandsloser Server)", () => {
  assert.equal(GET().status, 405);
});

test("auch mit NextRequest (wie im echten Server) und nur Accept: application/json", async () => {
  const res = await POST(
    new NextRequest("http://localhost/api/mcp", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        "x-forwarded-for": nextIp(),
      },
      body: JSON.stringify({ jsonrpc: "2.0", id: 9, method: "tools/list" }),
    }),
  );
  assert.equal(res.status, 200);
  const body = (await res.json()) as { result: { tools: unknown[] } };
  assert.equal(body.result.tools.length, 4);
});
