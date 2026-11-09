/**
 * Live-Probe der Quellen: Fragt jede Quelle mit einem bekannten vergebenen Namen (Kanarienname) und
 * einem Zufallsnamen ab, der nirgends existieren darf. Zweck: Format- oder Endpunktänderungen bei
 * Dritten bemerken, die die gestubbten Tests nicht sehen (die Quelle würde dann still "unknown" liefern).
 *
 *   npm run probe:live            alle Kanarien
 *   npm run probe:live -- npm,pypi  nur diese Quellen
 *   npm run probe:live -- --json probe-status.json  zusätzlich Status je Quelle als JSON (ohne Notizen und Namen)
 *
 * Exit-Code 1, wenn eine Quelle mit Status "gate" abweicht. "advisory" meldet nur (Warnung).
 * Fragt je Quelle zwei Namen ab, also nur wenige Dutzend Anfragen; nicht in Schleifen aufrufen.
 */
import { writeFileSync } from "node:fs";
import { parseArgs } from "node:util";
import { checkName, clearResultCache, resolveSources } from "@/lib/engine/check";
import type { Status } from "@/lib/engine/types";
import { toProbeStatus } from "@/lib/probe-status";

type Canary = { name: string; level: "gate" | "advisory" };

/** Namen, die in der jeweiligen Quelle seit Jahren vergeben sind. */
const CANARIES: Record<string, Canary> = {
  npm: { name: "react", level: "gate" },
  pypi: { name: "requests", level: "gate" },
  crates: { name: "serde", level: "gate" },
  github: { name: "torvalds", level: "advisory" },
  homebrew: { name: "wget", level: "advisory" },
  // NuGet-IDs enthalten Punkte (Newtonsoft.Json); mit Bindestrich gibt es 404. Darum ein Name ohne Trennzeichen.
  nuget: { name: "serilog", level: "advisory" },
  rubygems: { name: "rails", level: "advisory" },
  packagist: { name: "symfony", level: "advisory" },
  hex: { name: "phoenix", level: "advisory" },
  cran: { name: "ggplot2", level: "advisory" },
  hackage: { name: "aeson", level: "advisory" },
  wikidata: { name: "microsoft", level: "advisory" },
  gleif: { name: "siemens", level: "advisory" },
  chocolatey: { name: "git", level: "advisory" },
  psgallery: { name: "pester", level: "advisory" },
  launchpad: { name: "ubuntu", level: "advisory" },
  known_brands: { name: "github", level: "gate" },
};

async function main(): Promise<number> {
  const { values, positionals } = parseArgs({ args: process.argv.slice(2), options: { json: { type: "string" } }, allowPositionals: true });
  const wanted = positionals[0]?.split(",").filter(Boolean);
  const ids = Object.keys(CANARIES).filter((id) => !wanted || wanted.includes(id));
  const sources = resolveSources({ namespaces: ["packages", "stores", "known_names"], sources: ids });
  const free = `zq${Math.random().toString(36).slice(2, 12).replace(/[^a-z]/g, "q")}x`;

  type Row = { id: string; taken: Status; free: Status; ok: boolean; level: string; note: string };
  const rows: Row[] = [];

  for (const s of sources) {
    const c = CANARIES[s.id];
    clearResultCache();
    const [a, b] = await Promise.all([
      checkName(c.name, { sources: [s.id], namespaces: ["packages"] }),
      checkName(free, { sources: [s.id], namespaces: ["packages"] }),
    ]);
    const ra = a.results[0];
    const rb = b.results[0];
    const okTaken = ra.status === "taken" || ra.status === "similar";
    const okFree = rb.status === "not_found";
    rows.push({
      id: s.id,
      taken: ra.status,
      free: rb.status,
      ok: okTaken && okFree,
      level: c.level,
      note: [!okTaken && `${c.name}: ${ra.status} (${ra.evidence ?? ra.note ?? "-"})`, !okFree && `${free}: ${rb.status} (${rb.evidence ?? rb.note ?? "-"})`]
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
