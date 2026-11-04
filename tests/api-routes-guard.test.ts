import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { clearAllCaches } from "@/lib/cache";
import { clearResultCache, STATIC_SOURCES } from "@/lib/engine/check";
import { DOMAIN_TLDS } from "@/lib/engine/sources/domains";
import { POST as checkPOST } from "@/app/api/check/route";
import { POST as mcpPOST } from "@/app/api/mcp/route";
import { POST as wordsPOST } from "@/app/api/opendata-words/route";

/**
 * Belege zu den Review-Befunden der API: Origin, Content-Type, Body-Grenze, Schema und
 * Kosten. Alle Quellen offline; gezählt wird, ob überhaupt ausgehende Anfragen entstehen.
 */

const realFetch = globalThis.fetch;
const realPublic = process.env.MARKENFREI_PUBLIC_URL;
let outbound: string[] = [];
before(() => {
  clearAllCaches();
  clearResultCache();
  delete process.env.MARKENFREI_PUBLIC_URL;
  globalThis.fetch = ((input: RequestInfo | URL) => {
    outbound.push(String(input instanceof Request ? input.url : input));
    return Promise.reject(new Error("offline"));
  }) as typeof fetch;
});
after(() => {
  globalThis.fetch = realFetch;
  if (realPublic === undefined) delete process.env.MARKENFREI_PUBLIC_URL;
  else process.env.MARKENFREI_PUBLIC_URL = realPublic;
  clearAllCaches();
  clearResultCache();
});

let ipCounter = 10;
function post(
  handler: (req: Request) => Promise<Response>,
  path: string,
  body: unknown,
  opts: { raw?: boolean; headers?: Record<string, string>; ip?: string; url?: string } = {},
) {
  return handler(
    new Request(opts.url ?? `http://localhost${path}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-forwarded-for": opts.ip ?? `192.0.2.${ipCounter++}`,
        ...opts.headers,
      },
      body: opts.raw ? String(body) : JSON.stringify(body),
    }),
  );
}

async function errorOf(res: Response): Promise<string> {
  return ((await res.json()) as { error: string }).error;
}

// --- /api/mcp: Origin nur aus der Konfiguration -------------------------------

test("/api/mcp: X-Forwarded-Host oder Host machen einen fremden Origin nicht erlaubt", async () => {
  const list = { jsonrpc: "2.0", id: 1, method: "tools/list" };
  const viaForwarded = await post(mcpPOST, "/api/mcp", list, {
    headers: { Origin: "https://evil.example", "X-Forwarded-Host": "evil.example" },
  });
  assert.equal(viaForwarded.status, 403);
  const rebinding = await post(mcpPOST, "/api/mcp", list, {
    url: "http://evil.example:3927/api/mcp",
    headers: { Origin: "http://evil.example:3927", Host: "evil.example:3927" },
  });
  assert.equal(rebinding.status, 403);
  const ipv6 = await post(mcpPOST, "/api/mcp", list, { headers: { Origin: "http://[::1]:3000" } });
  assert.equal(ipv6.status, 200);
});

// --- /api/check: Content-Type, Origin, Kosten ---------------------------------

test("/api/check: text/plain von fremdem Origin wird abgelehnt, ohne Abfragen", async () => {
  outbound = [];
  const simple = await post(checkPOST, "/api/check", { names: ["wachwerk"] }, {
    headers: { "Content-Type": "text/plain", Origin: "https://evil.example" },
  });
  assert.equal(simple.status, 403);
  const plain = await post(checkPOST, "/api/check", { names: ["wachwerk"] }, { headers: { "Content-Type": "text/plain" } });
  assert.equal(plain.status, 415);
  assert.equal(plain.headers.get("cache-control"), "no-store");
  assert.match(await errorOf(plain), /application\/json/);
  const foreignJson = await post(checkPOST, "/api/check", { names: ["wachwerk"] }, {
    headers: { Origin: "https://evil.example", "Sec-Fetch-Site": "cross-site" },
  });
  assert.equal(foreignJson.status, 403);
  assert.equal(outbound.length, 0);
});

test("/api/check: Aufruf der eigenen Oberfläche (Sec-Fetch-Site: same-origin) geht durch", async () => {
  const res = await post(checkPOST, "/api/check", { names: ["wachwerk"], namespaces: ["packages"] }, {
    url: "https://eigene-domain.example/api/check",
    headers: { Origin: "https://eigene-domain.example", "Sec-Fetch-Site": "same-origin" },
  });
  assert.equal(res.status, 200);
});

test("/api/check: alle Quellen und 8 Endungen kosten mehr als die Standardauswahl", async () => {
  const ip = "192.0.2.250";
  const names = Array.from({ length: 10 }, (_, i) => `teuer${i}x`);
  const body = { names, sources: STATIC_SOURCES.map((s) => s.id), tlds: DOMAIN_TLDS.slice(0, 8) };
  // Vorher: sechs solcher Anfragen pro Minute (je Kosten 10). Jetzt kostet jede mindestens 20.
  const statuses: number[] = [];
  for (let i = 0; i < 4; i++) statuses.push((await post(checkPOST, "/api/check", body, { ip })).status);
  assert.equal(statuses[0], 200);
  assert.ok(statuses.includes(429), `Status: ${statuses.join(",")}`);
  assert.ok(statuses.indexOf(429) <= 3);
});

// --- /api/opendata-words: Grenzen und Schema ----------------------------------

test("/api/opendata-words: Body über 8 KB ergibt 413 ohne ausgehende Anfrage", async () => {
  outbound = [];
  const res = await post(wordsPOST, "/api/opendata-words", { keywords: ["schicht"], description: "x".repeat(7_000_000) });
  assert.equal(res.status, 413);
  assert.equal(res.headers.get("cache-control"), "no-store");
  assert.match(await errorOf(res), /8 KB/);
  assert.equal(outbound.length, 0);
});

test("/api/opendata-words: falsche Typen geben 400 mit deutscher Meldung statt interner Fehler", async () => {
  outbound = [];
  for (const body of [{ keywords: [1, 2] }, { keywords: ["schicht"], avoid: [1] }, null, { keywords: ["schicht"], maxLen: "x" }]) {
    const res = await post(wordsPOST, "/api/opendata-words", body);
    assert.equal(res.status, 400, JSON.stringify(body));
    assert.equal(res.headers.get("cache-control"), "no-store");
    const error = await errorOf(res);
    assert.doesNotMatch(error, /is not a function|Cannot read|undefined/);
  }
  const bad = await post(wordsPOST, "/api/opendata-words", "{kaputt", { raw: true });
  assert.equal(bad.status, 400);
  assert.match(await errorOf(bad), /kein gültiges JSON/);
  assert.equal(outbound.length, 0);
});

test("/api/opendata-words: Längen- und Mengengrenzen", async () => {
  const cases: [unknown, RegExp][] = [
    [{ keywords: ["x".repeat(41)] }, /40 Zeichen/],
    [{ keywords: ["a", "b", "c", "d", "e", "f", "g"].map((k) => k.repeat(3)) }, /Höchstens 6 Stichwörter/],
    [{ keywords: [] }, /mindestens ein Stichwort/],
    [{ keywords: ["a"] }, /mindestens ein Stichwort/],
    [{ keywords: ["schicht"], description: "x".repeat(501) }, /500 Zeichen/],
    [{ keywords: ["schicht"], brandSeed: "x".repeat(41) }, /brandSeed/],
    [{ keywords: ["schicht"], maxLen: 99 }, /4 bis 16/],
    [{ keywords: ["schicht"], avoid: Array.from({ length: 51 }, () => "ab") }, /avoid/],
  ];
  for (const [body, pattern] of cases) {
    const res = await post(wordsPOST, "/api/opendata-words", body);
    assert.equal(res.status, 400, JSON.stringify(body).slice(0, 80));
    assert.match(await errorOf(res), pattern);
  }
});

test("/api/opendata-words: gültige Anfrage liefert das Wortfeld mit no-store", async () => {
  for (const keywords of [["schicht", "plan"], "schicht, plan"]) {
    const res = await post(wordsPOST, "/api/opendata-words", { keywords, maxLen: 12 });
    assert.equal(res.status, 200);
    assert.equal(res.headers.get("cache-control"), "no-store");
    const field = (await res.json()) as { synthesizedCandidates: unknown[]; sourcesQueried: string[] };
    assert.ok(Array.isArray(field.synthesizedCandidates));
  }
});

test("/api/opendata-words: text/plain und fremder Origin werden abgelehnt", async () => {
  const plain = await post(wordsPOST, "/api/opendata-words", { keywords: ["schicht"] }, { headers: { "Content-Type": "text/plain" } });
  assert.equal(plain.status, 415);
  const foreign = await post(wordsPOST, "/api/opendata-words", { keywords: ["schicht"] }, { headers: { Origin: "https://evil.example" } });
  assert.equal(foreign.status, 403);
});
