#!/usr/bin/env node
/**
 * Bündelt den Markenfrei-MCP (src/mcp/cli.ts) mit esbuild zu einer einzigen Datei
 * mcp/dist/markenfrei-mcp.mjs. Alle Abhängigkeiten werden eingebündelt, zur Laufzeit
 * braucht das Paket weder tsx noch das Next-Projekt.
 *
 * Aufruf aus dem Repo-Wurzelverzeichnis: npm run build:mcp
 */
import { chmod, copyFile, mkdir, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { builtinModules } from "node:module";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "..");
const srcDir = join(root, "src");
const entry = join(srcDir, "mcp", "cli.ts");
const distDir = join(here, "dist");
const outfile = join(distDir, "markenfrei-mcp.mjs");

const SHEBANG = "#!/usr/bin/env node";

// Manche Abhängigkeiten sind CommonJS und rufen require() für Node-Module auf. In einem
// ESM-Bündel gibt es require nicht, deshalb wird es aus import.meta.url erzeugt.
// Das Bündel ist generiert; "npm run lint" im Repo soll es nicht prüfen.
const BANNER = [
  "/* eslint-disable */",
  "// Generiert von mcp/build.mjs aus src/mcp/cli.ts. Nicht von Hand bearbeiten.",
  'import { createRequire as __markenfreiCreateRequire } from "node:module";',
  "const require = __markenfreiCreateRequire(import.meta.url);",
].join("\n");

const BUILTINS = new Set(builtinModules.map((name) => name.replace(/^node:/, "").split("/")[0]));
const isBuiltin = (path) => BUILTINS.has(path.replace(/^node:/, "").split("/")[0]);

const pkg = JSON.parse(await readFile(join(here, "package.json"), "utf8"));

await rm(distDir, { recursive: true, force: true });
await mkdir(distDir, { recursive: true });

const result = await build({
  entryPoints: [entry],
  outfile,
  bundle: true,
  platform: "node",
  format: "esm",
  target: "node20",
  // "@/..." aus tsconfig.json auf src/ abbilden.
  alias: { "@": srcDir },
  // Für die ESM-Variante der Pakete entscheiden, wo sie eine anbieten.
  mainFields: ["module", "main"],
  banner: { js: BANNER },
  legalComments: "eof",
  metafile: true,
  logLevel: "warning",
});

// Alles außer den eingebauten Node-Modulen muss im Bündel stecken.
const external = new Set(
  Object.values(result.metafile.outputs)
    .flatMap((out) => out.imports)
    .filter((imp) => imp.external && !isBuiltin(imp.path))
    .map((imp) => imp.path),
);
if (external.size > 0) {
  console.error(`Nicht eingebündelte Abhängigkeiten: ${[...external].join(", ")}`);
  process.exit(1);
}

// Der Shebang muss in der ersten Zeile stehen. esbuild übernimmt ihn aus cli.ts, der Banner
// kann ihn aber verschieben; deshalb alle Shebang-Zeilen entfernen und genau einen voranstellen.
// Zeilenkommentare "// eslint-disable-..." aus den Quellen der Abhängigkeiten fallen auch weg,
// sonst meldet ESLint sie neben dem "/* eslint-disable */" oben als ungenutzt.
const code = await readFile(outfile, "utf8");
const body = code
  .split("\n")
  .filter((line) => !line.startsWith("#!") && !/^\s*\/\/\s*eslint-disable/.test(line))
  .join("\n");
const output = `${SHEBANG}\n${body}`;
await writeFile(outfile, output);
await chmod(outfile, 0o755);

// Lizenztexte: die eigene MIT-Lizenz und die der eingebündelten Pakete gehören ins Paket.
await copyFile(join(root, "LICENSE"), join(distDir, "LICENSE"));
const bundled = await bundledPackages(Object.keys(result.metafile.inputs));
const notices = [];
const seen = new Set();
for (const dir of bundled) {
  const meta = JSON.parse(await readFile(join(root, dir, "package.json"), "utf8"));
  // Dieselbe Version kann mehrfach im Baum liegen (verschachtelte node_modules).
  if (seen.has(`${meta.name}@${meta.version}`)) continue;
  seen.add(`${meta.name}@${meta.version}`);
  const licenseFile = (await readdir(join(root, dir))).find((f) => /^(licen[cs]e|copying)(\.|$)/i.test(f));
  const text = licenseFile ? (await readFile(join(root, dir, licenseFile), "utf8")).trim() : "(kein Lizenztext im Paket)";
  notices.push(`${meta.name}@${meta.version} (${meta.license ?? "unbekannt"})\n\n${text}`);
}
await writeFile(
  join(distDir, "THIRD_PARTY_LICENSES.txt"),
  `Eingebündelte Pakete in markenfrei-mcp ${pkg.version}\n\n${notices.join(`\n\n${"-".repeat(72)}\n\n`)}\n`,
);

const kb = (Buffer.byteLength(output) / 1024).toFixed(0);
console.error(`markenfrei-mcp ${pkg.version}: ${relative(root, outfile)} (${kb} KB, ${seen.size} Pakete eingebündelt)`);

/** Paketverzeichnisse (relativ zum Repo), aus denen Dateien im Bündel stammen. */
async function bundledPackages(inputs) {
  const dirs = new Set();
  for (const input of inputs) {
    const match = input.match(/^(.*node_modules\/(?:@[^/]+\/)?[^/]+)\//);
    if (match) dirs.add(match[1]);
  }
  return [...dirs].sort();
}
