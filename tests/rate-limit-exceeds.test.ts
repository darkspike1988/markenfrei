import { test, before } from "node:test";
import assert from "node:assert/strict";
import type { POST as CheckPost } from "@/app/api/check/route";
import type { POST as McpPost } from "@/app/api/mcp/route";
import type { CHECK_ERRORS as CheckErrors } from "@/app/api/_lib/check-schema";

let checkPOST: typeof CheckPost;
let mcpPOST: typeof McpPost;
let CHECK_ERRORS: typeof CheckErrors;
let CLIENT_RATE_LIMIT: number;

before(async () => {
  // Das Limit wird beim Laden des Moduls gelesen: vor den Importen setzen.
  process.env.MARKENFREI_RATE_LIMIT = "3";
  checkPOST = (await import("@/app/api/check/route")).POST;
  mcpPOST = (await import("@/app/api/mcp/route")).POST;
  CHECK_ERRORS = (await import("@/app/api/_lib/check-schema")).CHECK_ERRORS;
  CLIENT_RATE_LIMIT = (await import("@/lib/rate-limit")).CLIENT_RATE_LIMIT;
});

test("Limit kommt aus MARKENFREI_RATE_LIMIT", () => {
  assert.equal(CLIENT_RATE_LIMIT, 3);
});

function check(names: string[]) {
  return checkPOST(
    new Request("http://localhost/api/check", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-forwarded-for": "198.51.100.90" },
      body: JSON.stringify({ names, namespaces: ["known_names"], sources: ["known_brands"] }),
    }),
  );
}

test("POST /api/check: Kosten über dem Limit ergeben 400 mit fester Meldung statt 429", async () => {
  const res = await check(["alpha", "bravo", "charlie", "delta"]);
  assert.equal(res.status, 400);
  assert.deepEqual(await res.json(), { error: CHECK_ERRORS.exceedsLimit(3) });
  assert.match(CHECK_ERRORS.exceedsLimit(3), /größer als das Limit von 3 Einheiten/);
  assert.equal(res.headers.get("retry-after"), null);
  assert.equal(res.headers.get("cache-control"), "no-store");
});

test("POST /api/check: Kosten genau am Limit werden noch verarbeitet", async () => {
  const res = await check(["alpha", "bravo", "charlie"]);
  assert.equal(res.status, 200);
  assert.equal(res.headers.get("ratelimit-remaining"), "0");
});

test("POST /api/mcp: Prüf-Werkzeug über dem Limit ergibt 400 (-32600) statt 429", async () => {
  const res = await mcpPOST(
    new Request("http://localhost/api/mcp", {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json, text/event-stream", "x-forwarded-for": "198.51.100.91" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "tools/call",
        params: { name: "markenfrei_check_names", arguments: { names: ["alpha", "bravo", "charlie", "delta"] } },
      }),
    }),
  );
  assert.equal(res.status, 400);
  const body = (await res.json()) as { error: { code: number; message: string } };
  assert.equal(body.error.code, -32600);
  assert.equal(body.error.message, CHECK_ERRORS.exceedsLimit(3));
  assert.equal(res.headers.get("retry-after"), null);
});
