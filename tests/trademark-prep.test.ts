import { test } from "node:test";
import assert from "node:assert/strict";
import {
  buildDpmaExpertQuery,
  NICE_CLASSES,
  spellingVariants,
  trademarkPrep,
  trademarkPrepForSelection,
  TRADEMARK_PREP_NOTE,
} from "@/lib/engine/trademark-prep";
import { generatePhoneticTwins } from "@/lib/phonetics";

test("Status ist immer not_checked mit festem Hinweis", () => {
  const p = trademarkPrep("wachwerk");
  assert.equal(p.status, "not_checked");
  assert.equal(
    p.note,
    "Markenregister wurden nicht abgefragt. Eine leere Trefferliste hier heißt nicht, dass der Name als Marke frei ist.",
  );
  assert.equal(p.note, TRADEMARK_PREP_NOTE);
});

test("kommt ohne Netzwerk aus", () => {
  const original = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = (() => {
    calls++;
    throw new Error("kein Netzwerk erlaubt");
  }) as typeof fetch;
  try {
    const p = trademarkPrep("wachwerk", { description: "Software" });
    assert.ok(p.links.length > 0);
  } finally {
    globalThis.fetch = original;
  }
  assert.equal(calls, 0);
});

test("Links: alle Ämter, https, Name korrekt eingesetzt", () => {
  const { links } = trademarkPrep("wach-werk");
  const offices = links.map((l) => l.office);
  for (const o of ["DPMA", "TMview", "EUIPO", "WIPO", "TMDB", "USPTO"]) {
    assert.ok(offices.includes(o), `fehlt: ${o}`);
  }
  for (const l of links) {
    assert.match(l.url, /^https:\/\//);
    assert.ok(l.label.length > 0 && l.what.length > 0);
  }
  const byLabel = Object.fromEntries(links.map((l) => [l.label, l.url]));
  assert.equal(
    byLabel["DPMAregister Schnellsuche"],
    "https://register.dpma.de/DPMAregister/marke/erweitert?fromSmartSearch=true&queryString=wach-werk",
  );
  assert.equal(byLabel["DPMAregister Expertenrecherche"], "https://register.dpma.de/DPMAregister/marke/experte");
  assert.equal(
    byLabel["TMview"],
    "https://www.tmdn.org/tmview/#/tmview/results?page=1&pageSize=30&criteria=C&basicSearch=wach-werk",
  );
  assert.equal(
    byLabel["EUIPO eSearch plus"],
    "https://euipo.europa.eu/eSearch/#basic/1+1+1+1/100+100+100+100/wach-werk",
  );
  assert.equal(byLabel["TMDB"], "https://tmdb.eu/de/suche/marken?q=wach-werk&mode%5B%5D=fts");
  assert.equal(byLabel["WIPO Global Brand Database"], "https://branddb.wipo.int/en/quicksearch");
  assert.equal(byLabel["USPTO Trademark Search"], "https://tmsearch.uspto.gov/");
});

test("EUIPO nutzt die Namenssuche, keine Detailroute", () => {
  const euipo = trademarkPrep("wachwerk").links.find((l) => l.office === "EUIPO");
  assert.ok(euipo);
  assert.match(euipo.url, /#basic\//);
  assert.doesNotMatch(euipo.url, /details/);
});

test("Links ohne nachweisbares Vorausfüllen sagen, dass man den Begriff einträgt", () => {
  const { links } = trademarkPrep("wachwerk");
  for (const label of ["DPMAregister Expertenrecherche", "WIPO Global Brand Database", "USPTO Trademark Search"]) {
    const l = links.find((x) => x.label === label);
    assert.ok(l, label);
    assert.doesNotMatch(l.url, /wachwerk/);
    assert.match(l.what, /Nicht vorausgefüllt/);
  }
});

test("Umlaute und Leerzeichen in nicht normalisierter Eingabe werden bereinigt", () => {
  const p = trademarkPrep("Müller Café");
  const tmview = p.links.find((l) => l.office === "TMview");
  assert.ok(tmview);
  assert.match(tmview.url, /basicSearch=mueller-cafe$/);
});

test("DPMA-Expertenstring nutzt MARKE, KL, UND/ODER und ?-Platzhalter", () => {
  const p = trademarkPrep("wachwerk");
  const q = p.dpmaExpertQuery;
  assert.match(q, /^\(MARKE=\?wachwerk\? ODER .+\) UND \(KL=09 ODER KL=42\)$/);
  assert.doesNotMatch(q, /\b(AND|OR|IC=)\b|\*/);
  assert.ok(q.includes("MARKE=?wachwerc?"));
});

test("DPMA-Expertenstring: Bindestrich entfällt, kurze Namen exakt, Klassen zweistellig", () => {
  assert.equal(buildDpmaExpertQuery("wach-werk", ["wachwerk"], [9]), "(MARKE=?wachwerk?) UND (KL=09)");
  assert.equal(buildDpmaExpertQuery("abc", ["abk"], [3, 42]), "(MARKE=abc ODER MARKE=abk) UND (KL=03 ODER KL=42)");
  assert.equal(buildDpmaExpertQuery("abc", [], []), "(MARKE=abc)");
});

test("DPMA-Expertenstring enthält die Schreibvarianten", () => {
  const p = trademarkPrep("photon");
  assert.ok(p.variants.includes("foton"));
  assert.ok(p.dpmaExpertQuery.includes("MARKE=?foton?"));
});

test("Varianten: Bindestrich und Zusammenschreibung", () => {
  assert.ok(spellingVariants("wach-werk").includes("wachwerk"));
});

test("Varianten: ae/ä, oe/ö, ue/ü", () => {
  assert.ok(spellingVariants("mueller").includes("müller"));
  assert.ok(spellingVariants("schoen").includes("schön"));
  assert.ok(spellingVariants("baer").includes("bär"));
});

test("Varianten: ph/f in beide Richtungen", () => {
  assert.ok(spellingVariants("photon").includes("foton"));
  assert.ok(spellingVariants("fenix").includes("phenix"));
  assert.ok(!spellingVariants("kaffee").includes("kaphphee"));
});

test("Varianten: c/k/z", () => {
  assert.ok(spellingVariants("cicero").includes("zizero"));
  assert.ok(spellingVariants("cola").includes("kola"));
  assert.ok(spellingVariants("kola").includes("cola"));
  assert.ok(spellingVariants("zentro").includes("centro"));
  assert.ok(spellingVariants("check").includes("chek"));
});

test("Varianten: i/y", () => {
  assert.ok(spellingVariants("nexi").includes("nexy"));
  assert.ok(spellingVariants("pyro").includes("piro"));
});

test("Varianten: Doppelkonsonanten zusammenziehen oder verdoppeln", () => {
  assert.ok(spellingVariants("kommit").includes("komit"));
  assert.ok(spellingVariants("lumino").includes("lummino"));
});

test("Varianten enthalten phonetische Zwillinge aus phonetics.ts", () => {
  const v = spellingVariants("taxi");
  for (const twin of generatePhoneticTwins("taxi")) {
    if (v.length < 12) assert.ok(v.includes(twin), twin);
  }
  assert.ok(v.includes("taksi"));
});

test("Varianten: dedupliziert, ohne den Namen selbst, höchstens 12", () => {
  for (const n of ["kaffee-phizzy-cola", "phoenix-cyclone", "wachwerk", "kommit", "ab", "zzqxkvjwabc"]) {
    const v = spellingVariants(n);
    assert.ok(v.length <= 12, `${n}: ${v.length}`);
    assert.equal(new Set(v).size, v.length);
    assert.ok(!v.includes(n));
  }
  assert.equal(spellingVariants("kaffee-phizzy-cola").length, 12);
  assert.deepEqual(trademarkPrep("ab").variants, []);
});

test("Klassen: Standard für Software ist 9 und 42", () => {
  const p = trademarkPrep("wachwerk");
  assert.deepEqual(
    p.classes.map((c) => c.number),
    [9, 42],
  );
  for (const c of p.classes) assert.ok(c.title.length > 0 && c.reason.length > 0);
});

test("Klassen: Beschreibung ergänzt Klassen nach den Regeln aus phonetics.ts", () => {
  const p = trademarkPrep("wachwerk", { description: "Online-Shop mit Chat und Kursen" });
  assert.deepEqual(
    p.classes.map((c) => c.number),
    [9, 42, 35, 38, 41],
  );
  assert.match(p.dpmaExpertQuery, /UND \(KL=09 ODER KL=42 ODER KL=35 ODER KL=38 ODER KL=41\)$/);
});

test("Klassen: Vorgabe ersetzt den Vorschlag, ungültige Werte fallen weg", () => {
  const p = trademarkPrep("wachwerk", { classes: [42, 3, 42, 0, 46, 2.5] });
  assert.deepEqual(
    p.classes.map((c) => c.number),
    [3, 42],
  );
  assert.equal(p.classes[0].title, "Klasse 3 · Körperpflegemittel");
  assert.equal(p.classes[0].reason, "Vorgegeben.");
  assert.match(p.dpmaExpertQuery, /UND \(KL=03 ODER KL=42\)$/);
});

test("Klassen: nur ungültige Vorgaben ergeben den Standardvorschlag", () => {
  const p = trademarkPrep("wachwerk", { classes: [0, 99] });
  assert.deepEqual(
    p.classes.map((c) => c.number),
    [9, 42],
  );
});

test("Checkliste: 5 bis 7 Schritte mit den DPMA-Empfehlungen", () => {
  const { checklist } = trademarkPrep("wachwerk");
  assert.ok(checklist.length >= 5 && checklist.length <= 7);
  const all = checklist.join(" ");
  for (const needle of ["Identische", "Ähnliche", "Klassen", "Handelsregister", "Internet", "Anwalt", "WIPO", "EUIPO"]) {
    assert.ok(all.includes(needle), needle);
  }
  assert.ok(all.includes("9, 42"));
});

/** Klassen im Suchstring als Zahlen, in der Reihenfolge des Strings */
function queryClasses(query: string): number[] {
  return [...query.matchAll(/KL=(\d{2})/g)].map((m) => Number(m[1]));
}

test("Klassenkatalog: alle 45 Nizza-Klassen der Reihe nach, jede mit Überschrift", () => {
  assert.deepEqual(
    NICE_CLASSES.map((c) => c.number),
    Array.from({ length: 45 }, (_, i) => i + 1),
  );
  for (const c of NICE_CLASSES) assert.ok(c.heading.length > 0, `Klasse ${c.number}`);
  const p = trademarkPrepForSelection("wachwerk", "", [3]);
  assert.equal(p.classes[0].title, `Klasse 3 · ${NICE_CLASSES[2].heading}`);
});

test("Markenblock: ohne Beschreibung und ohne Auswahl genau die Vorbereitung vom Server", () => {
  assert.deepEqual(trademarkPrepForSelection("wachwerk", "", null), trademarkPrep("wachwerk"));
});

test("Markenblock: Beschreibung ändert den Klassenvorschlag, Suchstring und Checkliste folgen", () => {
  const p = trademarkPrepForSelection("wachwerk", "Online-Shop mit Chat", null);
  assert.deepEqual(
    p.classes.map((c) => c.number),
    [9, 42, 35, 38],
  );
  assert.deepEqual(queryClasses(p.dpmaExpertQuery), [9, 42, 35, 38]);
  assert.ok(p.checklist.join(" ").includes("Vorschlag: 9, 42, 35, 38"));
});

test("Markenblock: gewählte Klassen ersetzen den Vorschlag aus der Beschreibung", () => {
  const p = trademarkPrepForSelection("wachwerk", "Online-Shop mit Chat", [42, 9, 35]);
  assert.deepEqual(
    p.classes.map((c) => c.number),
    [9, 35, 42],
  );
  // Begründung aus dem Vorschlag bleibt, wo die Klasse vorgeschlagen ist
  assert.match(p.classes[1].reason, /E-Commerce/);
  assert.ok(p.checklist.join(" ").includes("9, 35, 42"));
});

test("Markenblock: der Suchstring enthält genau die gewählten Klassen", () => {
  for (const chosen of [[9], [3, 25], [9, 35, 41, 44], [1, 45]]) {
    const p = trademarkPrepForSelection("wachwerk", "Lern-App für Pflege", chosen);
    assert.deepEqual(queryClasses(p.dpmaExpertQuery), chosen, chosen.join(","));
  }
});

test("Markenblock: keine Klasse gewählt sucht ohne Klasseneinschränkung", () => {
  const p = trademarkPrepForSelection("wachwerk", "Online-Shop", []);
  assert.deepEqual(p.classes, []);
  assert.deepEqual(queryClasses(p.dpmaExpertQuery), []);
  assert.match(p.dpmaExpertQuery, /^\(MARKE=\?wachwerk\?( ODER MARKE=[^)]+)?\)$/);
  assert.ok(p.checklist.join(" ").includes("noch keine gewählt"));
  assert.deepEqual(p.variants, trademarkPrep("wachwerk").variants);
  // API und MCP bleiben beim Vorschlag, wenn die Vorgabe leer ist
  assert.deepEqual(
    trademarkPrep("wachwerk", { classes: [] }).classes.map((c) => c.number),
    [9, 42],
  );
});
