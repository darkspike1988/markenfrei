import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";

/**
 * Von jeder Datei mit "use client" aus dürfen known-names.ts, wikidata-brands.ts und die
 * Schnappschuss-Datei nicht erreichbar sein (sonst landen 4.742 Marken im Browser-Bundle).
 * Folgt statisch allen import/export-from/import()-Zielen unter src/ (Alias @/ = src/).
 */

const ROOT = resolve(import.meta.dirname, "..");
const SRC = join(ROOT, "src");
const FORBIDDEN = [
  "src/lib/engine/sources/known-names.ts",
  "src/lib/engine/sources/wikidata-brands.ts",
  "src/lib/engine/sources/wikidata-brands.json",
  "src/lib/engine/sources/wikidata-brands-format.ts",
];

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((f) => {
    const p = join(dir, f);
    return statSync(p).isDirectory() ? walk(p) : [p];
  });
}

const EXT = ["", ".ts", ".tsx", ".json", "/index.ts", "/index.tsx"];
function resolveImport(from: string, spec: string): string | null {
  let base: string;
  if (spec.startsWith("@/")) base = join(SRC, spec.slice(2));
  else if (spec.startsWith(".")) base = resolve(dirname(from), spec);
  else return null; // Paket
  for (const e of EXT) {
    const p = base + e;
    if (existsSync(p) && statSync(p).isFile()) return p;
  }
  return null;
}

/**
 * Gruppe 1: "type" bei `import type` / `export type` (beim Bauen entfernt, kein Bundle-Weg);
 * Gruppe 2: Ziel von import/export ... from "x" und import "x"; Gruppe 3: Ziel von import("x").
 */
const IMPORT_RE = /\b(?:import|export)(\s+type\b)?\s*(?:[^"';]*?\bfrom\s*)?["']([^"']+)["']|\bimport\s*\(\s*["']([^"']+)["']\s*\)/g;

/** Alle von `start` erreichbaren Dateien (mit Weg), `overrides` ersetzt Dateitext (für die Gegenprobe). */
export function reachable(start: string, overrides: Record<string, string> = {}): Map<string, string[]> {
  const seen = new Map<string, string[]>([[start, [start]]]);
  const queue = [start];
  while (queue.length > 0) {
    const file = queue.shift() as string;
    if (!/\.(ts|tsx)$/.test(file)) continue;
    const text = overrides[file] ?? readFileSync(file, "utf8");
    for (const m of text.matchAll(IMPORT_RE)) {
      if (m[1]) continue;
      const spec = m[2] ?? m[3];
      const target = spec ? resolveImport(file, spec) : null;
      if (target && !seen.has(target)) {
        seen.set(target, [...(seen.get(file) as string[]), target]);
        queue.push(target);
      }
    }
  }
  return seen;
}

const clientFiles = walk(SRC).filter(
  (f) => /\.(ts|tsx)$/.test(f) && /^\s*["']use client["']/.test(readFileSync(f, "utf8")),
);

function violations(overrides: Record<string, string> = {}): string[] {
  const out: string[] = [];
  for (const c of clientFiles) {
    const r = reachable(c, overrides);
    for (const f of FORBIDDEN) {
      const hit = r.get(join(ROOT, f));
      if (hit) out.push(`${relative(ROOT, c)} erreicht ${f} über ${hit.map((h) => relative(ROOT, h)).join(" -> ")}`);
    }
  }
  return out;
}

test("es gibt Client-Dateien, und die Importverfolgung findet Importe", () => {
  assert.ok(clientFiles.length >= 10, `nur ${clientFiles.length} Client-Dateien gefunden`);
  const insights = join(SRC, "lib/insights.ts");
  assert.ok(reachable(insights).has(join(SRC, "lib/brand-match.ts")));
  assert.ok(reachable(insights).has(join(SRC, "lib/phonetics.ts")));
});

test("aus keiner Datei mit \"use client\" sind known-names, wikidata-brands.* und das Format erreichbar", () => {
  assert.deepEqual(violations(), []);
});

test("Gegenprobe: ein Import von insights.ts auf die Quelle schlägt an", () => {
  const insights = join(SRC, "lib/insights.ts");
  const text = readFileSync(insights, "utf8");
  const bad = violations({
    [insights]: `import { wikidataBrands } from "@/lib/engine/sources/wikidata-brands";\n${text}`,
  });
  assert.ok(bad.length > 0, "Import auf die Quelle wurde nicht erkannt");
  assert.ok(bad.some((v) => v.includes("wikidata-brands.json")));
  const viaKnownNames = violations({
    [insights]: `export { matchKnownBrands } from "@/lib/engine/sources/known-names";\n${text}`,
  });
  assert.ok(viaKnownNames.some((v) => v.includes("known-names.ts")));
});

test("insights.ts importiert nur die Funktion aus brand-match.ts", () => {
  const text = readFileSync(join(SRC, "lib/insights.ts"), "utf8");
  assert.match(text, /import \{ matchKnownBrands \} from "@\/lib\/brand-match";/);
  assert.doesNotMatch(text, /sources\/known-names|sources\/wikidata/);
});
