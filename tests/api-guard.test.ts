import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import {
  checkCost,
  createProcessGuard,
  defaultSourceCount,
  distinctNameCount,
  isAllowedBrowserCall,
  isAllowedMcpOrigin,
  isJsonContentType,
  mcpRequestCost,
} from "@/app/api/_lib/http";
import { CheckInputError, STATIC_SOURCES, resolveSources } from "@/lib/engine/check";
import { DOMAIN_TLDS } from "@/lib/engine/sources/domains";
import { createRateLimiter } from "@/lib/rate-limit";

const saved = {
  public: process.env.MARKENFREI_PUBLIC_URL,
  allowed: process.env.MARKENFREI_ALLOWED_ORIGINS,
};
before(() => {
  delete process.env.MARKENFREI_PUBLIC_URL;
  process.env.MARKENFREI_ALLOWED_ORIGINS = "https://partner.example";
});
after(() => {
  for (const [key, value] of [
    ["MARKENFREI_PUBLIC_URL", saved.public],
    ["MARKENFREI_ALLOWED_ORIGINS", saved.allowed],
  ] as const) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
});

function req(url: string, headers: Record<string, string>) {
  return new Request(url, { method: "POST", headers });
}

test("MCP-Origin: Host und X-Forwarded-Host machen einen fremden Origin nicht zum eigenen", () => {
  // Befund: Origin evil + X-Forwarded-Host evil ergab 200, ebenso Origin und Host gleich (DNS-Rebinding)
  assert.equal(isAllowedMcpOrigin(req("http://localhost/api/mcp", { Origin: "https://evil.example", "X-Forwarded-Host": "evil.example" })), false);
  assert.equal(isAllowedMcpOrigin(req("http://evil.example:3927/api/mcp", { Origin: "http://evil.example:3927", Host: "evil.example:3927" })), false);
  assert.equal(isAllowedMcpOrigin(req("http://evil.example/api/mcp", { Origin: "http://evil.example" })), false, "auch nicht über req.url");
  // Sec-Fetch-Site zählt bei MCP nicht (bei DNS-Rebinding ist es same-origin)
  assert.equal(isAllowedMcpOrigin(req("http://evil.example/api/mcp", { Origin: "http://evil.example", "Sec-Fetch-Site": "same-origin" })), false);
});

test("MCP-Origin: fehlend, localhost, 127.0.0.1, [::1], Standard-Domain und Liste erlaubt", () => {
  const ok = (origin?: string) =>
    isAllowedMcpOrigin(req("http://localhost/api/mcp", origin === undefined ? {} : { Origin: origin }));
  assert.equal(ok(undefined), true);
  assert.equal(ok("http://localhost:3000"), true);
  assert.equal(ok("http://127.0.0.1:8080"), true);
  assert.equal(ok("http://[::1]:3000"), true);
  assert.equal(ok("https://markenfrei.app"), true, "Standard ohne MARKENFREI_PUBLIC_URL");
  assert.equal(ok("https://partner.example"), true);
  assert.equal(ok("https://partner.example.evil"), false);
  assert.equal(ok("null"), false);
  assert.equal(ok("file:///etc/passwd"), false);
});

test("MARKENFREI_PUBLIC_URL ersetzt die Standard-Domain", () => {
  process.env.MARKENFREI_PUBLIC_URL = "https://namen.example.org/pfad";
  try {
    const ok = (origin: string) => isAllowedMcpOrigin(req("http://localhost/api/mcp", { Origin: origin }));
    assert.equal(ok("https://namen.example.org"), true);
    assert.equal(ok("https://markenfrei.app"), false);
  } finally {
    delete process.env.MARKENFREI_PUBLIC_URL;
  }
});

test("Oberflächen-Routen: fremder Origin nur abgelehnt, wenn der Browser nicht same-origin meldet", () => {
  const url = "http://selbst.example/api/check";
  assert.equal(isAllowedBrowserCall(req(url, { Origin: "https://evil.example" })), false);
  assert.equal(isAllowedBrowserCall(req(url, { Origin: "https://evil.example", "Sec-Fetch-Site": "cross-site" })), false);
  assert.equal(isAllowedBrowserCall(req(url, { Origin: "http://selbst.example", "Sec-Fetch-Site": "same-origin" })), true);
  assert.equal(isAllowedBrowserCall(req(url, {})), true, "ohne Origin (curl, Server)");
  assert.equal(isAllowedBrowserCall(req(url, { Origin: "http://localhost:3000" })), true);
});

test("Content-Type: nur application/json", () => {
  const ct = (type?: string) => isJsonContentType(req("http://localhost/", type ? { "Content-Type": type } : {}));
  assert.equal(ct("application/json"), true);
  assert.equal(ct("Application/JSON; charset=utf-8"), true);
  assert.equal(ct("text/plain"), false);
  assert.equal(ct("application/x-www-form-urlencoded"), false);
  assert.equal(ct(undefined), false);
});

test("Kosten wachsen mit Quellen- und Endungsauswahl", () => {
  const base = defaultSourceCount();
  assert.equal(base, resolveSources().length);
  assert.equal(checkCost(1, {}), 1, "Standardauswahl kostet 1 pro Name");
  assert.equal(checkCost(10, {}), 10);
  assert.equal(checkCost(10, { tlds: ["de"], sources: ["npm"] }), 10, "kleine Auswahl kostet nicht weniger als 1 pro Name");

  const all = { sources: STATIC_SOURCES.map((s) => s.id), tlds: DOMAIN_TLDS.slice(0, 8) };
  const factor = Math.ceil(resolveSources(all).length / base);
  assert.ok(factor >= 2, `Faktor ${factor}`);
  assert.equal(checkCost(10, all), 10 * factor);
  assert.throws(() => checkCost(1, { sources: ["gibtsnicht"] }), CheckInputError);
});

test("Namen zählen nach Normalisierung und ohne Doppelte", () => {
  assert.equal(distinctNameCount(["Müller", "mueller", "MÜLLER"]), 1);
  assert.equal(distinctNameCount(["alpha", "beta", "!"]), 2);
  assert.equal(distinctNameCount([]), 1);
  assert.equal(distinctNameCount(Array.from({ length: 30 }, (_, i) => `name${i}x`)), 10);
});

test("MCP-Kosten: markenfrei_check_name zählt den Quellenumfang mit", () => {
  const all = { sources: STATIC_SOURCES.map((s) => s.id), tlds: DOMAIN_TLDS.slice(0, 8) };
  const call = (name: string, args: unknown) => ({ jsonrpc: "2.0", id: 1, method: "tools/call", params: { name, arguments: args } });
  const factor = Math.ceil(resolveSources(all).length / defaultSourceCount());

  // Befund: markenfrei_check_name kostete immer 1, auch bei allen Quellen
  assert.deepEqual(mcpRequestCost(call("markenfrei_check_name", { name: "wachwerk", ...all })), { cost: factor, outbound: true });
  assert.deepEqual(mcpRequestCost(call("markenfrei_check_name", { name: "wachwerk" })), { cost: 1, outbound: true });
  const names = Array.from({ length: 10 }, (_, i) => `n${i}xx`);
  assert.deepEqual(mcpRequestCost(call("markenfrei_check_names", { names, ...all })), { cost: 10 * factor, outbound: true });
  assert.deepEqual(mcpRequestCost(call("markenfrei_check_names", { names, sources: ["gibtsnicht"] })), { cost: 10, outbound: true });
  assert.deepEqual(mcpRequestCost(call("markenfrei_suggest_names", { keywords: ["a"] })), { cost: 1, outbound: true });
  assert.deepEqual(mcpRequestCost(call("markenfrei_trademark_prep", { name: "x" })), { cost: 1, outbound: false });
  assert.deepEqual(mcpRequestCost({ jsonrpc: "2.0", id: 1, method: "tools/list" }), { cost: 1, outbound: false });
  assert.deepEqual(mcpRequestCost([call("markenfrei_check_name", {})]), { cost: 1, outbound: false });
  assert.deepEqual(mcpRequestCost(undefined), { cost: 1, outbound: false });
});

test("Prozess-Limit greift unabhängig vom Client-Schlüssel", () => {
  let t = 1_000_000;
  const guard = createProcessGuard(createRateLimiter({ limit: 30, windowMs: 60_000, now: () => t }));
  assert.equal(guard(20), null);
  assert.equal(guard(10), null);
  const limited = guard(1);
  assert.ok(limited);
  assert.equal(limited.status, 429);
  assert.ok(Number(limited.headers.get("retry-after")) >= 1);
  t += 60_001;
  assert.equal(guard(1), null);
});
