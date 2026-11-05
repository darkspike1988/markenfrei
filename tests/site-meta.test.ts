import { test } from "node:test";
import assert from "node:assert/strict";
import robots from "@/app/robots";
import sitemap from "@/app/sitemap";
import { DEFAULT_PUBLIC_URL, publicUrl } from "@/lib/site";
import { webApplicationJsonLd } from "@/lib/structured-data";

test("publicUrl nimmt MARKENFREI_PUBLIC_URL und fällt bei fehlendem oder ungültigem Wert zurück", () => {
  assert.equal(publicUrl({}).origin, DEFAULT_PUBLIC_URL);
  assert.equal(publicUrl({ MARKENFREI_PUBLIC_URL: "   " }).origin, DEFAULT_PUBLIC_URL);
  assert.equal(publicUrl({ MARKENFREI_PUBLIC_URL: "kein url" }).origin, DEFAULT_PUBLIC_URL);
  assert.equal(publicUrl({ MARKENFREI_PUBLIC_URL: "https://example.org/" }).origin, "https://example.org");
});

test("robots erlaubt die Seiten, sperrt API und Zählendpunkt und nennt die Sitemap", () => {
  const r = robots();
  const rule = Array.isArray(r.rules) ? r.rules[0] : r.rules;
  assert.equal(rule.allow, "/");
  assert.deepEqual(rule.disallow, ["/api/", "/_gc/"]);
  assert.equal(r.sitemap, `${DEFAULT_PUBLIC_URL}/sitemap.xml`);
});

test("sitemap listet nur absolute Adressen der öffentlichen Seiten, ohne Query", () => {
  const urls = sitemap().map((e) => e.url);
  assert.ok(urls.includes(`${DEFAULT_PUBLIC_URL}/`));
  assert.ok(urls.includes(`${DEFAULT_PUBLIC_URL}/quellen`));
  for (const u of urls) assert.ok(!u.includes("?") && u.startsWith("https://"), u);
  assert.ok(!urls.some((u) => u.includes("/api/") || u.includes("/kontakt")), "API und Formular gehören nicht hinein");
});

test("JSON-LD ist gültiges JSON und kann ein </script> nicht beenden", () => {
  const json = webApplicationJsonLd(new URL("https://example.org"));
  assert.ok(!json.includes("<"));
  const data = JSON.parse(json) as { "@type": string; url: string; isAccessibleForFree: boolean };
  assert.equal(data["@type"], "WebApplication");
  assert.equal(data.url, "https://example.org/");
  assert.equal(data.isAccessibleForFree, true);
});
