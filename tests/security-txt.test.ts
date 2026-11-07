import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { buildSecurityTxt, securityTxtFromEnv } from "@/lib/security-txt";
import { GET } from "@/app/.well-known/security.txt/route";
import sitemap from "@/app/sitemap";
import robots from "@/app/robots";
import { SITEMAP_PATHS } from "@/lib/site";

const ROOT = join(__dirname, "..");
const DAY = 24 * 60 * 60 * 1000;

test("security.txt: Pflichtfelder, mailto-Kontakt, Ablauf in der Zukunft und höchstens 365 Tage", () => {
  const now = new Date();
  const txt = buildSecurityTxt("sicherheit@example.org", "https://example.org", now);
  const lines = txt.trim().split("\n");
  assert.ok(lines.includes("Contact: mailto:sicherheit@example.org"));
  assert.ok(lines.includes("Canonical: https://example.org/.well-known/security.txt"));
  assert.ok(lines.includes("Preferred-Languages: de, en"));
  const expires = lines.find((l) => l.startsWith("Expires: "));
  assert.ok(expires, "Expires fehlt");
  const value = expires.slice("Expires: ".length);
  assert.match(value, /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/);
  const diff = new Date(value).getTime() - now.getTime();
  assert.ok(diff > 0 && diff <= 365 * DAY, `Expires ${value} außerhalb des Bereichs`);
});

test("security.txt: Adresse aus der Umgebung, ungültig oder leer ergibt null", () => {
  assert.equal(securityTxtFromEnv({}), null);
  assert.equal(securityTxtFromEnv({ MARKENFREI_OPERATOR_EMAIL: "keine adresse" }), null);
  const txt = securityTxtFromEnv({
    MARKENFREI_OPERATOR_EMAIL: "a@example.org",
    MARKENFREI_PUBLIC_URL: "https://example.org/x",
  });
  assert.ok(txt?.includes("Contact: mailto:a@example.org\n"));
  assert.ok(txt?.includes("Canonical: https://example.org/.well-known/security.txt\n"));
});

test("Route /.well-known/security.txt: ohne Adresse 404, mit Adresse 200 text/plain", async () => {
  const old = process.env.MARKENFREI_OPERATOR_EMAIL;
  try {
    delete process.env.MARKENFREI_OPERATOR_EMAIL;
    const res404 = GET(new Request("http://localhost/.well-known/security.txt"));
    assert.equal(res404.status, 404);

    process.env.MARKENFREI_OPERATOR_EMAIL = "sicherheit@example.org";
    const res = GET(new Request("http://localhost/.well-known/security.txt"));
    assert.equal(res.status, 200);
    assert.match(res.headers.get("content-type") ?? "", /^text\/plain; charset=utf-8/);
    assert.match(await res.text(), /^Contact: mailto:sicherheit@example\.org$/m);
  } finally {
    if (old === undefined) delete process.env.MARKENFREI_OPERATOR_EMAIL;
    else process.env.MARKENFREI_OPERATOR_EMAIL = old;
  }
});

test("security.txt steht nicht in der Sitemap und robots.txt sperrt sie nicht", () => {
  assert.ok(!SITEMAP_PATHS.some((p) => p.includes("well-known") || p.includes("security")));
  assert.ok(!sitemap().some((e) => e.url.includes("security.txt")));
  const rules = robots().rules;
  const list = Array.isArray(rules) ? rules : [rules];
  for (const r of list) {
    const dis = ([] as string[]).concat(r.disallow ?? []);
    assert.ok(
      !dis.some((d) => d !== "" && "/.well-known/security.txt".startsWith(d)),
      `gesperrt durch ${dis.join(",")}`,
    );
  }
});

test("CHANGELOG.md existiert und hat den Abschnitt [Unveröffentlicht]", () => {
  assert.ok(existsSync(join(ROOT, "CHANGELOG.md")));
  assert.match(readFileSync(join(ROOT, "CHANGELOG.md"), "utf8"), /\[Unveröffentlicht\]/);
});
