/**
 * Live-Probe der Quellen: Fragt jede Quelle mit einem bekannten vergebenen Namen (Kanarienname) und
 * einem Zufallsnamen ab, der nirgends existieren darf. Zweck: Format- oder Endpunktänderungen bei
 * Dritten bemerken, die die gestubbten Tests nicht sehen (die Quelle würde dann still "unknown" liefern).
 *
 * Abgedeckt sind alle Quellen aus STATIC_SOURCES (Pakete, Stores, soziale Netze, bekannte Namen)
 * und drei Domain-Registries (.de, .com, .io mit dem Label "google"). Ohne Kanariennamen bleiben nur
 * die Quellen aus PROBE_EXCLUSIONS (src/lib/probe-canaries.ts): die beiden Quellen ohne Netz.
 * Fehlt für eine Quelle Kanarienname und Ausnahme, bricht die Probe vor jeder Abfrage mit Exit-Code 1 ab.
 *
 *   npm run probe:live            alle Kanarien
 *   npm run probe:live -- npm,pypi  nur diese Quellen (IDs wie in /api/sources, Domains als rdap:de)
 *   npm run probe:live -- --json probe-status.json  zusätzlich Status je Quelle als JSON (ohne Notizen und Namen)
 *
 * Exit-Code 1, wenn eine Quelle mit Status "gate" abweicht oder die Abdeckung unvollständig ist.
 * "advisory" meldet nur (Warnung). Fragt je Quelle zwei Namen ab (Kanarienname und Zufallsname), also
 * rund 80 Abfragen; manche Quellen stellen je Abfrage mehrere Anfragen. Nicht in Schleifen aufrufen.
 */
import { writeFileSync } from "node:fs";
import { parseArgs } from "node:util";
import { checkName, clearResultCache, STATIC_SOURCES } from "@/lib/engine/check";
import type { NameReport } from "@/lib/engine/check";
import type { Status } from "@/lib/engine/types";
import { CANARIES, coverageProblems, DEFAULT_ACCEPT } from "@/lib/probe-canaries";
import { toProbeStatus } from "@/lib/probe-status";

/** Genau eine Quelle abfragen: Domain-Quellen über die Endung, alle anderen über ihre ID. */
function lookup(id: string, name: string): Promise<NameReport> {
  if (id.startsWith("rdap:")) return checkName(name, { namespaces: ["domains"], tlds: [id.slice("rdap:".length)], sources: [] });
  return checkName(name, { namespaces: ["packages"], sources: [id] });
}

async function main(): Promise<number> {
  const coverage = coverageProblems(STATIC_SOURCES.map((s) => s.id));
  if (coverage.length) {
    for (const p of coverage) console.log(`::error title=Live-Probe Abdeckung::${p}`);
    console.log(`Live-Probe: Abdeckung unvollständig (${coverage.length} Problem${coverage.length === 1 ? "" : "e"}), keine Abfrage gestellt.`);
    return 1;
  }

  const { values, positionals } = parseArgs({ args: process.argv.slice(2), options: { json: { type: "string" } }, allowPositionals: true });
  const wanted = positionals[0]?.split(",").filter(Boolean);
  const unknown = (wanted ?? []).filter((id) => !Object.hasOwn(CANARIES, id));
  if (unknown.length) {
    console.log(`Live-Probe: keine Kanariennamen für ${unknown.join(", ")}. Bekannt: ${Object.keys(CANARIES).join(", ")}.`);
    return 1;
  }
  const ids = Object.keys(CANARIES).filter((id) => !wanted || wanted.includes(id));
  const free = `zq${Math.random().toString(36).slice(2, 12).replace(/[^a-z]/g, "q")}x`;

  type Row = { id: string; taken: Status; free: Status; ok: boolean; level: string; note: string };
  const rows: Row[] = [];

  for (const id of ids) {
    const c = CANARIES[id];
    const accept: readonly Status[] = c.accept ?? DEFAULT_ACCEPT;
    clearResultCache();
    const [a, b] = await Promise.all([lookup(id, c.name), lookup(id, free)]);
    const ra = a.results.find((r) => r.sourceId === id);
    const rb = b.results.find((r) => r.sourceId === id);
    if (!ra || !rb) throw new Error(`Quelle ${id} fehlt in der Antwort (Abfrage ${a.results.length}/${b.results.length} Ergebnisse)`);
    const okTaken = accept.includes(ra.status);
    const okFree = rb.status === "not_found";
    rows.push({
      id,
      taken: ra.status,
      free: rb.status,
      ok: okTaken && okFree,
      level: c.level,
      note: [
        !okTaken && `${c.name}: ${ra.status}, erwartet ${accept.join(" oder ")} (${ra.evidence ?? ra.note ?? "-"})`,
        !okFree && `${free}: ${rb.status}, erwartet not_found (${rb.evidence ?? rb.note ?? "-"})`,
      ]
        .filter(Boolean)
        .join("; "),
    });
  }

  console.log("| Quelle | Kanarienname | Zufallsname | Ergebnis |\n|---|---|---|---|");
  for (const r of rows) {
    console.log(`| ${r.id} | ${r.taken} | ${r.free} | ${r.ok ? "ok" : `${r.level === "gate" ? "FEHLER" : "Warnung"}: ${r.note}`} |`);
  }
  for (const r of rows.filter((x) => !x.ok && x.level === "advisory")) {
    console.log(`::warning title=Live-Probe ${r.id}::${r.note}`);
  }
  const failed = rows.filter((r) => !r.ok && r.level === "gate");
  for (const r of failed) console.log(`::error title=Live-Probe ${r.id}::${r.note}`);
  if (values.json) writeFileSync(values.json, JSON.stringify(toProbeStatus(rows, new Date()), null, 2) + "\n");
  return failed.length ? 1 : 0;
}

main().then((code) => process.exit(code), (err) => {
  console.error(err);
  process.exit(2);
});
