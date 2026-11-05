import { test } from "node:test";
import assert from "node:assert/strict";
import type { NameReport } from "@/lib/engine/check";
import type { Namespace, SourceResult, Status } from "@/lib/engine/types";
import { trademarkPrep } from "@/lib/engine/trademark-prep";
import { computeVerdict, countStatuses, VERDICT_LABEL } from "@/lib/engine/verdict";
import { csvCell, EXPORT_DISCLAIMER, exportFileName, mdEscape, toCsv, toMarkdown } from "@/lib/export";

const CHECKED_AT = "2026-11-05T10:00:00.000Z";

function src(
  label: string,
  status: Status,
  extra: Partial<SourceResult> & { namespace?: Namespace } = {},
): SourceResult {
  return {
    sourceId: label,
    namespace: "domains",
    label,
    target: `wachwerk${label}`,
    status,
    ...extra,
  };
}

function report(name: string, results: SourceResult[]): NameReport {
  return {
    schemaVersion: 2,
    input: name,
    name,
    checkedAt: CHECKED_AT,
    verdict: computeVerdict(results),
    verdictLabel: VERDICT_LABEL[computeVerdict(results)],
    counts: countStatuses(results),
    incomplete: results.filter((r) => r.status === "unknown").map((r) => r.label),
    results,
    trademark: trademarkPrep(name),
    manualLinks: [],
  };
}

/** Minimaler CSV-Leser nach RFC 4180, nur für den Rundlauf im Test. */
function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') {
        cell += '"';
        i++;
      } else if (c === '"') quoted = false;
      else cell += c;
    } else if (c === '"') quoted = true;
    else if (c === ",") {
      row.push(cell);
      cell = "";
    } else if (c === "\r" && text[i + 1] === "\n") {
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
      i++;
    } else cell += c;
  }
  return rows;
}

test("csvCell: nur bei Komma, Anführungszeichen oder Zeilenumbruch in Anführungszeichen", () => {
  assert.equal(csvCell("wachwerk"), "wachwerk");
  assert.equal(csvCell("a,b"), '"a,b"');
  assert.equal(csvCell('sagt "hallo"'), '"sagt ""hallo"""');
  assert.equal(csvCell("zwei\nZeilen"), '"zwei\nZeilen"');
  assert.equal(csvCell("zwei\r\nZeilen"), '"zwei\r\nZeilen"');
  assert.equal(csvCell(""), "");
});

test("csvCell: Formelanfänge werden mit einfachem Anführungszeichen entschärft", () => {
  for (const start of ["=", "+", "-", "@", "\t", "\r"]) {
    const out = csvCell(`${start}SUM(A1)`);
    assert.ok(out.replace(/^"/, "").startsWith(`'${start}`), `Anfang ${JSON.stringify(start)}: ${out}`);
  }
  assert.equal(csvCell("=1+1"), "'=1+1");
  assert.equal(csvCell("=HYPERLINK(\"x\",\"y\")"), '"\'=HYPERLINK(""x"",""y"")"');
  // nur der Anfang zählt
  assert.equal(csvCell("a=b"), "a=b");
  assert.equal(csvCell("https://example.org/?a=1"), "https://example.org/?a=1");
});

test("toCsv: leere Eingabe ergibt nur die Kopfzeile, CRLF, ohne BOM", () => {
  const out = toCsv([]);
  assert.equal(out, "name,namespace,source,target,status,note,url,checkedAt\r\n");
  assert.notEqual(out.charCodeAt(0), 0xfeff);
});

test("toCsv: eine Zeile je Name und Quelle, Spalten in fester Reihenfolge", () => {
  const a = report("wachwerk", [
    src(".de", "not_found", { url: "https://example.org/de" }),
    src("npm", "taken", { namespace: "packages", target: "wachwerk", note: "Paket, existiert" }),
  ]);
  const b = report("planzeit", [src(".de", "unknown", { target: "planzeit.de", note: 'Zeit "abgelaufen"' })]);
  const rows = parseCsv(toCsv([a, b]));
  assert.equal(rows.length, 4);
  assert.deepEqual(rows[0], ["name", "namespace", "source", "target", "status", "note", "url", "checkedAt"]);
  assert.deepEqual(rows[1], ["wachwerk", "domains", ".de", "wachwerk.de", "not_found", "", "https://example.org/de", CHECKED_AT]);
  assert.deepEqual(rows[2], ["wachwerk", "packages", "npm", "wachwerk", "taken", "Paket, existiert", "", CHECKED_AT]);
  assert.deepEqual(rows[3], ["planzeit", "domains", ".de", "planzeit.de", "unknown", 'Zeit "abgelaufen"', "", CHECKED_AT]);
});

test("toCsv: Formeln in Notiz, Ziel und Name werden entschärft", () => {
  const r = report("-evil", [src("x", "similar", { target: "=cmd|' /C calc'!A0", note: "@SUM(1)" })]);
  const rows = parseCsv(toCsv([r]));
  assert.equal(rows[1][0], "'-evil");
  assert.equal(rows[1][3], "'=cmd|' /C calc'!A0");
  assert.equal(rows[1][5], "'@SUM(1)");
});

test("toCsv: Unicode bleibt erhalten, schwache Signale sind in der Notiz erkennbar", () => {
  const r = report("größe-ü", [
    src("Wikipedia", "taken", { namespace: "known_names", target: "Größe – Ü", weak: true, note: "Eintrag „Größe“" }),
  ]);
  const rows = parseCsv(toCsv([r]));
  assert.equal(rows[1][0], "größe-ü");
  assert.equal(rows[1][3], "Größe – Ü");
  assert.equal(rows[1][4], "taken");
  assert.equal(rows[1][5], "schwaches Signal: Eintrag „Größe“");
});

test("toCsv: Bericht ohne Quellen bleibt als Zeile sichtbar", () => {
  const rows = parseCsv(toCsv([report("leer", [])]));
  assert.deepEqual(rows[1], ["leer", "", "", "", "", "", "", CHECKED_AT]);
});

test("mdEscape: Pipes, Zeilenumbrüche und Markdown-Zeichen", () => {
  assert.equal(mdEscape("a|b"), "a\\|b");
  assert.equal(mdEscape("zwei\nZeilen\r\nund mehr"), "zwei Zeilen und mehr");
  assert.equal(mdEscape("a_b*c`d[e]<f>"), "a\\_b\\*c\\`d\\[e\\]\\<f\\>");
  assert.equal(mdEscape("back\\slash"), "back\\\\slash");
  assert.equal(mdEscape("größe"), "größe");
});

test("toMarkdown: Abschnitt je Name mit Ampel, Tabelle und Schlusszeile", () => {
  const a = report("wachwerk", [
    src(".de", "not_found", { url: "https://example.org/de?q=(x)" }),
    src("npm", "taken", { namespace: "packages", target: "wachwerk", note: "a|b\nc" }),
  ]);
  const b = report("planzeit", [src(".com", "unknown")]);
  const md = toMarkdown([a, b]);
  assert.ok(md.startsWith("# Markenfrei: Vorprüfung\n"));
  assert.equal(md.match(/^## /gm)?.length, 2);
  assert.ok(md.indexOf("## wachwerk") < md.indexOf("## planzeit"));
  assert.ok(md.includes("Ampel: Vergeben"));
  assert.ok(md.includes("| Namensraum | Quelle | Ziel | Status | Hinweis |"));
  assert.ok(md.includes("| Domains | [.de](https://example.org/de?q=%28x%29) | wachwerk.de | nicht gefunden |  |"));
  assert.ok(md.includes("| Pakete | npm | wachwerk | vergeben | a\\|b c |"));
  assert.ok(md.includes("Ohne Antwort: .com. Dort heißt „nichts gefunden“ nicht „frei“."));
  assert.ok(md.includes("Marke: nicht geprüft."));
  assert.ok(md.trimEnd().endsWith("Vorprüfung, keine Rechtsberatung. Marke nicht geprüft."));
  assert.equal(EXPORT_DISCLAIMER, "Vorprüfung, keine Rechtsberatung. Marke nicht geprüft.");
});

test("toMarkdown: jede Tabellenzeile hat genau fünf Zellen, auch mit Pipes in Werten", () => {
  const r = report("x", [src("a|b", "similar", { target: "t|u", note: "n|m" })]);
  const rowLine = toMarkdown([r])
    .split("\n")
    .find((l) => l.startsWith("| Domains"));
  assert.ok(rowLine);
  assert.equal(rowLine.split(/(?<!\\)\|/).length - 2, 5);
});

test("toMarkdown: nur http(s)-Links, keine Skript-URLs", () => {
  const r = report("x", [src("a", "not_found", { url: "javascript:alert(1)" })]);
  const md = toMarkdown([r]);
  assert.ok(!md.includes("javascript:"));
  assert.ok(md.includes("| Domains | a |"));
});

test("toMarkdown: leere Eingabe und schwacher Treffer", () => {
  const empty = toMarkdown([]);
  assert.ok(empty.includes("Keine Ergebnisse."));
  assert.ok(empty.trimEnd().endsWith(EXPORT_DISCLAIMER));
  const weak = toMarkdown([report("x", [src("Wikipedia", "taken", { namespace: "known_names", weak: true })])]);
  assert.ok(weak.includes("schwacher Treffer"));
});

test("exportFileName: ein Name oder shortlist, ohne unzulässige Zeichen", () => {
  assert.equal(exportFileName([report("wachwerk", [])], "csv"), "markenfrei-wachwerk.csv");
  assert.equal(exportFileName([report("a", []), report("b", [])], "md"), "markenfrei-shortlist.md");
  assert.equal(exportFileName([], "json"), "markenfrei-shortlist.json");
  assert.equal(exportFileName([report("a/b:c", [])], "csv"), "markenfrei-a_b_c.csv");
});
