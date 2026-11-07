import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { SITEMAP_PATHS } from "@/lib/site";

// Prüft die Fehlerseiten statisch (nur Dateien lesen, kein Next-Server, kein Netz).

const ROOT = join(__dirname, "..");
const FILES = ["src/app/not-found.tsx", "src/app/error.tsx", "src/app/global-error.tsx"];
const read = (path: string) => readFileSync(join(ROOT, path), "utf8");

test("alle drei Fehlerseiten existieren", () => {
  for (const f of FILES) assert.ok(existsSync(join(ROOT, f)), `${f} fehlt`);
});

test("not-found.tsx: noindex, Link auf /, deutscher Titel, default export", () => {
  const src = read("src/app/not-found.tsx");
  assert.match(src, /index:\s*false/, "robots muss noindex setzen");
  assert.match(src, /title:\s*"Seite nicht gefunden"/);
  assert.match(src, /href="\/"/);
  assert.match(src, /href="\/quellen"/);
  assert.match(src, /export default function/);
  assert.doesNotMatch(src, /^\s*["']use client["']/m, "not-found ist eine Server Component");
});

for (const f of ["src/app/error.tsx", "src/app/global-error.tsx"]) {
  test(`${f}: Client Component, gibt weder error.message noch error.stack aus`, () => {
    const src = read(f);
    assert.match(src, /^\s*["']use client["']/, '"use client" muss die erste Anweisung sein');
    assert.doesNotMatch(src, /error\.message/);
    assert.doesNotMatch(src, /error\.stack/);
    assert.match(src, /export default function/);
    assert.match(src, /Etwas ist schiefgelaufen/);
    assert.match(src, /Erneut versuchen/);
    assert.match(src, /href="\/"/);
  });
}

test("global-error.tsx bringt html und body selbst mit und hängt nicht am Root-Layout", () => {
  const src = read("src/app/global-error.tsx");
  assert.match(src, /<html lang="de">/);
  assert.match(src, /<body>/);
  assert.doesNotMatch(src, /from "@\/components\//, "keine Layout-Komponenten importieren");
});

test("Fehlerseiten stehen nicht in der Sitemap", () => {
  const paths: readonly string[] = SITEMAP_PATHS;
  for (const p of ["/not-found", "/_not-found", "/error", "/global-error", "/404", "/500"]) {
    assert.equal(paths.includes(p), false, `${p} darf nicht in SITEMAP_PATHS stehen`);
  }
  const sitemap = read("src/app/sitemap.ts");
  assert.doesNotMatch(sitemap, /not-found|global-error|error/);
});
