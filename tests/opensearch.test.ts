import { test } from "node:test";
import assert from "node:assert/strict";
import { buildOpenSearchXml } from "@/lib/opensearch";
import { GET } from "@/app/opensearch.xml/route";
import { DEFAULT_PUBLIC_URL } from "@/lib/site";
import robots from "@/app/robots";

/** Prüft die Wohlgeformtheit ohne XML-Bibliothek: Deklaration vorhanden, Tags korrekt verschachtelt. */
function assertWellFormed(xml: string): void {
  assert.ok(xml.startsWith('<?xml version="1.0" encoding="UTF-8"?>'), "XML-Deklaration fehlt");
  const stack: string[] = [];
  const tag = /<(\/?)([A-Za-z][\w:-]*)[^>]*?(\/?)>/g;
  let m: RegExpExecArray | null;
  while ((m = tag.exec(xml))) {
    const [, closing, name, selfClosing] = m;
    if (selfClosing) continue;
    if (closing) {
      assert.equal(stack.pop(), name, `schließendes Tag </${name}> passt nicht`);
    } else {
      stack.push(name);
    }
  }
  assert.deepEqual(stack, [], `ungeschlossene Tags: ${stack.join(", ")}`);
  assert.doesNotMatch(xml, /&(?!(amp|lt|gt|quot|apos|#\d+|#x[\da-fA-F]+);)/, "unmaskiertes &");
}

test("buildOpenSearchXml: gültiges XML, ShortName ≤ 16 Zeichen, Vorlage mit {searchTerms} auf der eigenen Adresse, keine Vorschlags-URL", () => {
  const xml = buildOpenSearchXml("https://example.org");
  assertWellFormed(xml);
  assert.match(xml, /<OpenSearchDescription xmlns="http:\/\/a9\.com\/-\/spec\/opensearch\/1\.1\/">/);
  const short = /<ShortName>([^<]*)<\/ShortName>/.exec(xml)?.[1];
  assert.ok(short && short.length <= 16, `ShortName zu lang oder fehlt: ${short}`);
  assert.equal(short, "Markenfrei");
  assert.match(xml, /<InputEncoding>UTF-8<\/InputEncoding>/);
  assert.match(xml, /<Url type="text\/html" method="get" template="https:\/\/example\.org\/\?q=\{searchTerms\}"\/>/);
  assert.match(xml, /<Image [^>]*>https:\/\/example\.org\/icon-192\.png<\/Image>/);
  assert.doesNotMatch(xml, /type="application\/x-suggestions\+json"/, "keine Vorschlags-URL");
});

test("GET /opensearch.xml: Content-Type, Cache-Control, Adresse aus MARKENFREI_PUBLIC_URL", async () => {
  const old = process.env.MARKENFREI_PUBLIC_URL;
  try {
    process.env.MARKENFREI_PUBLIC_URL = "https://suche.example.org/pfad";
    const res = GET(new Request("http://localhost/opensearch.xml"));
    assert.equal(res.status, 200);
    assert.equal(res.headers.get("content-type"), "application/opensearchdescription+xml; charset=utf-8");
    assert.equal(res.headers.get("cache-control"), "public, max-age=86400");
    const body = await res.text();
    assertWellFormed(body);
    assert.match(body, /template="https:\/\/suche\.example\.org\/\?q=\{searchTerms\}"/);
    assert.ok(!body.includes("/pfad"), "nur der Ursprung, kein Pfad");
  } finally {
    if (old === undefined) delete process.env.MARKENFREI_PUBLIC_URL;
    else process.env.MARKENFREI_PUBLIC_URL = old;
  }
  const fallback = await GET(new Request("http://localhost/opensearch.xml")).text();
  assert.match(fallback, new RegExp(`template="${DEFAULT_PUBLIC_URL.replace(/\./g, "\\.")}/\\?q=`));
});

test("Sonderzeichen in der Adresse werden für XML maskiert", () => {
  const xml = buildOpenSearchXml('https://example.org/?a=1&b="2"<x>\'y\'');
  assertWellFormed(xml);
  assert.ok(xml.includes("https://example.org/?a=1&amp;b=&quot;2&quot;&lt;x&gt;&apos;y&apos;/?q={searchTerms}"));
  assert.doesNotMatch(xml, /<x>/);
});

test("robots.txt sperrt /opensearch.xml nicht", () => {
  const rules = robots().rules;
  const list = Array.isArray(rules) ? rules : [rules];
  for (const r of list) {
    const dis = ([] as string[]).concat(r.disallow ?? []);
    assert.ok(!dis.some((d) => d !== "" && "/opensearch.xml".startsWith(d)), `gesperrt durch ${dis.join(",")}`);
  }
});
