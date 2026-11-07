import assert from "node:assert/strict";
import { test } from "node:test";
import { buildReminderIcs, foldLine, icsEscape } from "@/lib/ics";

const URL_OWN = "https://markenfrei.app/?q=wachwerk";
const NOW = new Date(2026, 4, 10, 15, 30, 0); // lokal, 10.05.2026

function build(names: string[] = ["wachwerk"], now: Date = NOW, url = URL_OWN) {
  return buildReminderIcs({ names, now, uid: "abc-123", url });
}

/** Entfaltete logische Zeilen (Folgezeilen beginnen mit Leerzeichen). */
function unfold(ics: string): string[] {
  return ics.replace(/\r\n /g, "").split("\r\n").filter(Boolean);
}

test("ics: CRLF, BEGIN/END paarig, VERSION, PRODID, UID, DTSTAMP in UTC", () => {
  const ics = build();
  assert.ok(ics.endsWith("\r\n"));
  assert.equal(ics.replace(/\r\n/g, "").includes("\n"), false, "kein einzelnes LF");
  const lines = unfold(ics);
  assert.equal(lines[0], "BEGIN:VCALENDAR");
  assert.equal(lines.at(-1), "END:VCALENDAR");
  for (const kind of ["VCALENDAR", "VEVENT"]) {
    assert.equal(lines.filter((l) => l === `BEGIN:${kind}`).length, 1);
    assert.equal(lines.filter((l) => l === `END:${kind}`).length, 1);
  }
  assert.ok(lines.includes("VERSION:2.0"));
  assert.ok(lines.some((l) => l.startsWith("PRODID:")));
  assert.ok(lines.includes("CALSCALE:GREGORIAN"));
  assert.ok(lines.includes("METHOD:PUBLISH"));
  assert.ok(lines.includes("UID:abc-123@markenfrei"));
  assert.ok(lines.includes(`DTSTAMP:${NOW.toISOString().replace(/[-:]|\.\d{3}/g, "")}`));
  assert.match(lines.find((l) => l.startsWith("DTSTAMP"))!, /^DTSTAMP:\d{8}T\d{6}Z$/);
});

test("ics: lokales Datum + 30 Tage über Monatsende und Zeitumstellung", () => {
  const start = (d: Date) => unfold(build(["x"], d)).find((l) => l.startsWith("DTSTART"));
  assert.equal(start(new Date(2026, 0, 31, 23, 59)), "DTSTART;VALUE=DATE:20260302");
  assert.equal(start(new Date(2026, 2, 1, 0, 5)), "DTSTART;VALUE=DATE:20260331");
  assert.equal(start(new Date(2026, 9, 1, 12)), "DTSTART;VALUE=DATE:20261031");
  assert.equal(start(new Date(2026, 11, 20, 12)), "DTSTART;VALUE=DATE:20270119");
});

test("ics: DTEND ist der Folgetag", () => {
  const lines = unfold(build(["x"], new Date(2026, 0, 31, 12)));
  assert.ok(lines.includes("DTSTART;VALUE=DATE:20260302"));
  assert.ok(lines.includes("DTEND;VALUE=DATE:20260303"));
  const end = unfold(build(["x"], new Date(2026, 0, 30, 12))).find((l) => l.startsWith("DTEND"));
  assert.equal(end, "DTEND;VALUE=DATE:20260302");
});

test("ics: Maskierung von Komma, Semikolon, Backslash, Zeilenumbruch", () => {
  assert.equal(icsEscape("a,b;c\\d\ne\r\nf"), "a\\,b\\;c\\\\d\\ne\\nf");
  const lines = unfold(build(["a,b;c\\d\ne"]));
  assert.equal(lines.find((l) => l.startsWith("SUMMARY")), "SUMMARY:a\\,b\\;c\\\\d\\ne erneut prüfen");
});

test("ics: keine Zeile über 75 Oktette, auch mit Umlauten", () => {
  const long = Array.from({ length: 40 }, (_, i) => `größenwahn-üöä${i}`);
  for (const ics of [build(long), build(["ä".repeat(200)])]) {
    for (const line of ics.split("\r\n")) {
      assert.ok(Buffer.byteLength(line, "utf8") <= 75, `zu lang: ${Buffer.byteLength(line, "utf8")}`);
    }
    // Entfalten ergibt den vollständigen Inhalt, kein Zeichen zerschnitten
    assert.ok(!unfold(ics).join("").includes("�"));
  }
  assert.equal(unfold(build(["ä".repeat(200)])).find((l) => l.startsWith("SUMMARY")), `SUMMARY:${"ä".repeat(200)} erneut prüfen`);
  assert.equal(foldLine("x".repeat(75)).includes("\r\n"), false);
  assert.equal(foldLine("x".repeat(76)), `${"x".repeat(75)}\r\n x`);
});

test("ics: Zusammenfassung für einen Namen, Hinweis zur Marke", () => {
  const lines = unfold(build(["wachwerk"]));
  assert.ok(lines.includes("SUMMARY:wachwerk erneut prüfen"));
  const desc = lines.find((l) => l.startsWith("DESCRIPTION"))!;
  assert.match(desc, /keine Marken/);
});

test("ics: Shortlist ist ein Termin mit allen Namen, URL nur auf die eigene Adresse", () => {
  const url = "https://markenfrei.app/?q=a,b,c";
  const ics = build(["a", "b", "c"], NOW, url);
  const lines = unfold(ics);
  assert.equal(lines.filter((l) => l === "BEGIN:VEVENT").length, 1);
  assert.ok(lines.includes("SUMMARY:3 Namen erneut prüfen"));
  assert.match(lines.find((l) => l.startsWith("DESCRIPTION"))!, /a\\, b\\, c/);
  const urls = lines.filter((l) => l.startsWith("URL"));
  assert.deepEqual(urls, [`URL:${url}`]);
  assert.equal((ics.match(/https?:\/\//g) ?? []).length, 1, "keine weitere Adresse");
});
