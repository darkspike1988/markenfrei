import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { clearAllCaches } from "@/lib/cache";
import { NextRequest } from "next/server";
import { GET, POST } from "@/app/api/mcp/route";

const realFetch = globalThis.fetch;
before(() => {
  clearAllCaches();
  // Alle Quellen offline: geprüft werden Protokoll und Fehlerbehandlung.
  globalThis.fetch = (() => Promise.reject(new Error("offline"))) as typeof fetch;
});
after(() => {
  globalThis.fetch = realFetch;
  clearAllCaches();
});

const ip = "203.0.113.5";
function rpc(body: unknown, raw = false) {
  return POST(
    new Request("http://localhost/api/mcp", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-forwarded-for": ip },
      body: raw ? String(body) : JSON.stringify(body),
    }),
  );
}

test("initialize liefert Server-Informationen", async () => {
  const res = await rpc({
    jsonrpc: "2.0",
    id: 1,
    method: "initialize",
    params: {
      protocolVersion: "2025-03-26",
      capabilities: {},
      clientInfo: { name: "test", version: "0" },
    },
  });
  assert.equal(res.status, 200);
  const body = (await res.json()) as { result: { serverInfo: { name: string } } };
  assert.equal(body.result.serverInfo.name, "markenfrei");
});

test("tools/list nennt die fünf Werkzeuge", async () => {
  const res = await rpc({ jsonrpc: "2.0", id: 2, method: "tools/list" });
  const body = (await res.json()) as { result: { tools: { name: string }[] } };
  assert.deepEqual(body.result.tools.map((t) => t.name).sort(), [
    "markenfrei_clearance_check",
    "markenfrei_domain_pricing",
    "markenfrei_generate_ideas",
    "markenfrei_inspect_bundle",
    "markenfrei_list_open_apis",
  ]);
});

test("Benachrichtigung ohne id bekommt 202 ohne Inhalt", async () => {
  const res = await rpc({ jsonrpc: "2.0", method: "notifications/initialized" });
  assert.equal(res.status, 202);
  assert.equal(await res.text(), "");
});

test("ungültiges JSON ergibt einen JSON-RPC-Fehler statt eines Absturzes", async () => {
  const res = await rpc("{kaputt", true);
  assert.ok(res.status >= 400 && res.status < 500, `Status ${res.status}`);
  const body = (await res.json()) as { error: { code: number } };
  assert.equal(body.error.code, -32700);
});

test("Domain-Preise für eine unbekannte Endung sind ein Werkzeugfehler", async () => {
  const res = await rpc({
    jsonrpc: "2.0",
    id: 3,
    method: "tools/call",
    params: { name: "markenfrei_domain_pricing", arguments: { domainOrTld: "constructor" } },
  });
  const body = (await res.json()) as { result: { isError?: boolean } };
  assert.equal(body.result.isError, true);
});

test("clearance_check liefert structuredContent im öffentlichen Schema", async () => {
  const res = await rpc({
    jsonrpc: "2.0",
    id: 4,
    method: "tools/call",
    params: { name: "markenfrei_clearance_check", arguments: { name: "Müller", tlds: ["de"] } },
  });
  const body = (await res.json()) as {
    result: { structuredContent: { schemaVersion: number; name: string; categories: object; incomplete: string[] } };
  };
  const sc = body.result.structuredContent;
  assert.equal(sc.schemaVersion, 1);
  assert.equal(sc.name, "mueller");
  assert.deepEqual(Object.keys(sc.categories).sort(), ["appStore", "domain", "packages", "trademark"]);
  assert.ok(sc.incomplete.length > 0, "offline: Prüfung muss als unvollständig gelten");
});

test("ungültige Eingabe im Werkzeug ist ein Werkzeugfehler mit Klartext", async () => {
  const res = await rpc({
    jsonrpc: "2.0",
    id: 5,
    method: "tools/call",
    params: { name: "markenfrei_clearance_check", arguments: { name: "foo", tlds: ["constructor"] } },
  });
  const body = (await res.json()) as { result: { isError?: boolean; content: { text: string }[] } };
  assert.equal(body.result.isError, true);
  assert.match(body.result.content[0].text, /nicht unterstützt/);
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
        "x-forwarded-for": "203.0.113.77",
      },
      body: JSON.stringify({ jsonrpc: "2.0", id: 9, method: "tools/list" }),
    }),
  );
  assert.equal(res.status, 200);
  const body = (await res.json()) as { result: { tools: unknown[] } };
  assert.equal(body.result.tools.length, 5);
});
