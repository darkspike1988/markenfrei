#!/usr/bin/env node
/**
 * Einstieg der Kommandozeile: `npm run cli -- check wachwerk`. Die Logik steht in run.ts.
 * Der Alias "@/" funktioniert, weil npm im Repo-Verzeichnis startet (tsconfig.json).
 */
import { checkName, checkNames } from "@/lib/engine/check";
import { run } from "./run";

run(process.argv.slice(2), {
  checkName,
  checkNames,
  stdout: process.stdout,
  stderr: process.stderr,
  env: process.env,
}).then(
  (code) => {
    // process.exitCode statt exit(): bei Pipes bleibt ausstehende Ausgabe erhalten.
    process.exitCode = code;
  },
  (err) => {
    process.stderr.write(`Interner Fehler: ${err instanceof Error ? err.message : String(err)}\n`);
    process.exitCode = 70;
  },
);
