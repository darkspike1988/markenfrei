import { test } from "node:test";
import assert from "node:assert/strict";
import robots from "@/app/robots";
import sitemap from "@/app/sitemap";
import { GUIDES } from "@/lib/guides";
import { DEFAULT_PUBLIC_URL, publicUrl, SITEMAP_PATHS } from "@/lib/site";
import { faqPageJsonLd, webApplicationJsonLd } from "@/lib/structured-data";

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

test("faqPageJsonLd ist gültiges JSON, enthält jede Frage und maskiert <", () => {
  const items = [
    { q: "Frage eins?", a: "Antwort mit <name> und </script>." },
    { q: "Frage zwei?", a: "Antwort zwei." },
  ];
  const json = faqPageJsonLd(items);
  assert.ok(!json.includes("<"));
  const data = JSON.parse(json) as {
    "@type": string;
    mainEntity: { "@type": string; name: string; acceptedAnswer: { text: string } }[];
  };
  assert.equal(data["@type"], "FAQPage");
  assert.deepEqual(
    data.mainEntity.map((e) => [e["@type"], e.name, e.acceptedAnswer.text]),
    items.map((i) => ["Question", i.q, i.a]),
  );
});

test("Anleitungen stehen in der Sitemap und haben je einen eigenen Titel und eine Beschreibung unter 160 Zeichen", async () => {
  const urls = sitemap().map((e) => e.url);
  const titles = new Set<string>();
  const descriptions = new Set<string>();
  for (const g of GUIDES) {
    assert.ok(SITEMAP_PATHS.includes(g.href), `${g.href} fehlt in SITEMAP_PATHS`);
    assert.ok(urls.includes(`${DEFAULT_PUBLIC_URL}${g.href}`), `${g.href} fehlt in der Sitemap`);
    const mod = (await import(`@/app${g.href}/page`)) as { metadata: { title: string; description: string } };
    const { title, description } = mod.metadata;
    assert.ok(title.length > 0 && title.length <= 70, `${g.href}: Titel ${title.length} Zeichen`);
    assert.ok(description.length > 0 && description.length < 160, `${g.href}: Beschreibung ${description.length} Zeichen`);
    assert.ok(!titles.has(title) && !descriptions.has(description), `${g.href}: Titel oder Beschreibung doppelt`);
    titles.add(title);
    descriptions.add(description);
  }
  assert.equal(GUIDES.length, 4);
});
