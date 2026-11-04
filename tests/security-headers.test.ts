import { test } from "node:test";
import assert from "node:assert/strict";
import { buildCsp, securityHeaders } from "@/lib/security-headers";
import nextConfig from "../next.config";

test("CSP sperrt fremde Skripte, Plug-ins, Einbettung und fremde Formularziele", () => {
  const csp = buildCsp(false);
  for (const d of ["default-src 'self'", "object-src 'none'", "base-uri 'self'", "form-action 'self'", "frame-ancestors 'none'", "connect-src 'self'"]) {
    assert.ok(csp.includes(d), d);
  }
  assert.ok(!/script-src[^;]*https?:/.test(csp), "keine fremde Skriptquelle");
});

test("'unsafe-eval' nur in der Entwicklung", () => {
  assert.ok(!buildCsp(false).includes("unsafe-eval"));
  assert.ok(buildCsp(true).includes("unsafe-eval"));
});

test("alle erwarteten Header sind gesetzt", () => {
  const keys = securityHeaders(false).map((h) => h.key);
  for (const k of ["Content-Security-Policy", "X-Content-Type-Options", "Referrer-Policy", "X-Frame-Options", "Permissions-Policy", "Strict-Transport-Security", "Cross-Origin-Opener-Policy"]) {
    assert.ok(keys.includes(k), k);
  }
});

test("next.config liefert die Header für alle Pfade", async () => {
  const rules = await nextConfig.headers!();
  assert.equal(rules.length, 1);
  assert.equal(rules[0].source, "/(.*)");
  assert.ok(rules[0].headers.some((h) => h.key === "Content-Security-Policy"));
});
