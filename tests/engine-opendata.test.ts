import { test } from "node:test";
import assert from "node:assert/strict";
import { HOST_BUDGETS, buildUserAgent, resetHostBudgets, takeBudget } from "@/lib/engine/http";
import { discoverOpenDataWords } from "@/lib/opendata";

function recorder(respond: (url: string) => Response) {
  const seen: { url: string; ua: string }[] = [];
  const fetchImpl = (async (u: string, init?: RequestInit) => {
    seen.push({ url: u, ua: (init?.headers as Record<string, string>)["User-Agent"] });
    return respond(u);
  }) as unknown as typeof fetch;
  return { seen, fetchImpl };
}

test("Wortfeld-Anfragen senden den dokumentierten User-Agent mit Kontakt", async () => {
  const { seen, fetchImpl } = recorder((u) =>
    u.includes("openthesaurus")
      ? Response.json({ synsets: [{ terms: [{ term: "Wächter" }, { term: "Hüter" }] }] })
      : Response.json([{ word: "guard" }, { word: "keeper" }]),
  );
  const field = await discoverOpenDataWords({ keywords: ["Wache"] }, { contact: "mailto:a@b.c", fetchImpl });
  assert.ok(seen.length >= 3, `Anfragen: ${seen.length}`);
  for (const s of seen) assert.equal(s.ua, buildUserAgent("mailto:a@b.c"), s.url);
  assert.ok(field.germanSynonyms.includes("Wächter"));
  assert.ok(field.semanticRelated.includes("guard"));
});

test("zu große Antworten werden nicht gelesen und brechen die Ideen nicht ab", async () => {
  const huge = JSON.stringify(Array.from({ length: 40_000 }, (_, i) => ({ word: `w${i}abc` })));
  const { fetchImpl } = recorder(() => new Response(huge, { headers: { "content-type": "application/json" } }));
  const field = await discoverOpenDataWords({ keywords: ["Wache"] }, { fetchImpl });
  assert.deepEqual(field.germanSynonyms, []);
  assert.deepEqual(field.semanticRelated, []);
  assert.ok(field.synthesizedCandidates.length > 0, "deterministische Ideen kommen trotzdem");
});

test("Fehler und Nicht-2xx der Wortquellen ergeben leere Listen statt Ausnahmen", async () => {
  const failing = (async () => {
    throw new TypeError("fetch failed");
  }) as unknown as typeof fetch;
  const a = await discoverOpenDataWords({ keywords: ["Wache"] }, { fetchImpl: failing });
  assert.deepEqual(a.germanSynonyms, []);
  const { fetchImpl } = recorder(() => new Response("nope", { status: 503 }));
  const b = await discoverOpenDataWords({ keywords: ["Wache"] }, { fetchImpl });
  assert.deepEqual(b.semanticRelated, []);
});

test("Wortquellen haben ein Budget: OpenThesaurus unter 60 pro Minute, Datamuse mit eigener Grenze", () => {
  const ot = HOST_BUDGETS["www.openthesaurus.de"];
  assert.ok(ot && ot.max < 60 && ot.windowMs === 60_000);
  const dm = HOST_BUDGETS["api.datamuse.com"];
  assert.ok(dm && dm.max > 0 && dm.windowMs > 0);
});

test("erschöpftes OpenThesaurus-Budget: keine Anfrage dorthin, weniger Vorschläge, keine Ausnahme", async () => {
  resetHostBudgets();
  try {
    const ot = HOST_BUDGETS["www.openthesaurus.de"];
    for (let i = 0; i < ot.max; i++) takeBudget("www.openthesaurus.de", ot, Date.now());
    const { seen, fetchImpl } = recorder((u) =>
      u.includes("openthesaurus")
        ? Response.json({ synsets: [{ terms: [{ term: "Wächter" }] }] })
        : Response.json([{ word: "guard" }]),
    );
    const field = await discoverOpenDataWords({ keywords: ["Wache"] }, { fetchImpl });
    assert.equal(seen.filter((s) => s.url.includes("openthesaurus")).length, 0, "keine Anfrage über das Budget hinaus");
    assert.deepEqual(field.germanSynonyms, []);
    assert.ok(field.semanticRelated.includes("guard"), "Datamuse liefert weiter");
    assert.ok(field.synthesizedCandidates.length > 0);
  } finally {
    resetHostBudgets();
  }
});
