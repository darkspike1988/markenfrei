#!/usr/bin/env node
/**
 * Pakettest für markenfrei-mcp: baut das Bündel, packt es mit npm pack, entpackt das
 * Tarball in ein leeres temporäres Verzeichnis (ohne node_modules) und startet den Server
 * von dort über stdio. Geprüft werden Paketinhalt, initialize, tools/list und ein
 * tools/call von markenfrei_trademark_prep (läuft ohne Netz).
 *
 * Aufruf aus dem Repo-Wurzelverzeichnis: npm run test:mcp-package
 */
import { execFileSync, spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdtemp, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const TIMEOUT_MS = 30_000;
const EXPECTED_FILES = [
  "README.md",
  "dist/LICENSE",
  "dist/THIRD_PARTY_LICENSES.txt",
  "dist/markenfrei-mcp.mjs",
  "package.json",
].sort();
const EXPECTED_TOOLS = [
  "markenfrei_check_name",
  "markenfrei_check_names",
  "markenfrei_trademark_prep",
  "markenfrei_suggest_names",
];

function check(condition, message) {
  if (!condition) throw new Error(message);
  console.error(`  ok: ${message}`);
}

async function listFiles(dir, base = dir) {
  const out = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...(await listFiles(full, base)));
    else out.push(relative(base, full));
  }
  return out.sort();
}

/** Startet den Server, schickt die Nachrichten und sammelt die Antworten nach id. */
function runServer(bin, cwd, messages, expectedIds) {
  return new Promise((resolve, reject) => {
    // Ohne NODE_OPTIONS, damit kein Loader (etwa tsx) aus der Umgebung mitläuft.
    const env = { ...process.env };
    delete env.NODE_OPTIONS;
    const child = spawn(process.execPath, [bin], { cwd, env, stdio: ["pipe", "pipe", "pipe"] });
    const responses = new Map();
    let stdout = "";
    let stderr = "";
    const timer = setTimeout(() => {
      child.kill("SIGKILL");
      reject(new Error(`Zeitüberschreitung nach ${TIMEOUT_MS / 1000} s. stderr:\n${stderr}`));
    }, TIMEOUT_MS);

    child.stderr.on("data", (chunk) => (stderr += chunk));
    child.stdout.on("data", (chunk) => {
      stdout += chunk;
      let nl;
      while ((nl = stdout.indexOf("\n")) >= 0) {
        const line = stdout.slice(0, nl).trim();
        stdout = stdout.slice(nl + 1);
        if (!line) continue;
        let msg;
        try {
          msg = JSON.parse(line);
        } catch {
          clearTimeout(timer);
          child.kill("SIGKILL");
          reject(new Error(`Keine JSON-Zeile auf stdout: ${line.slice(0, 200)}`));
          return;
        }
        if (msg.id !== undefined) responses.set(msg.id, msg);
        if (expectedIds.every((id) => responses.has(id))) child.stdin.end();
      }
    });
    child.on("error", (err) => {
      clearTimeout(timer);
      reject(err);
    });
    child.on("exit", (code, signal) => {
      clearTimeout(timer);
      resolve({ code, signal, responses, stderr });
    });

    for (const msg of messages) child.stdin.write(`${JSON.stringify(msg)}\n`);
  });
}

const work = await mkdtemp(join(tmpdir(), "markenfrei-mcp-pack-"));
try {
  console.error("Bauen …");
  execFileSync(process.execPath, [join(here, "build.mjs")], { stdio: "inherit" });

  console.error("Packen …");
  const packJson = execFileSync("npm", ["pack", "--json", "--pack-destination", work], {
    cwd: here,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "inherit"],
  });
  // npm bis 11 liefert ein Array, npm 12 ein Objekt mit dem Paketnamen als Schlüssel.
  const parsed = JSON.parse(packJson);
  const packed = Array.isArray(parsed) ? parsed[0] : Object.values(parsed)[0];
  const tarball = join(work, packed.filename);
  const packedFiles = packed.files.map((f) => f.path).sort();
  check(
    JSON.stringify(packedFiles) === JSON.stringify(EXPECTED_FILES),
    `Paketinhalt ist genau ${EXPECTED_FILES.join(", ")} (gefunden: ${packedFiles.join(", ")})`,
  );

  const extractDir = join(work, "extract");
  execFileSync("mkdir", ["-p", extractDir]);
  execFileSync("tar", ["-xzf", tarball, "-C", extractDir]);
  const pkgDir = join(extractDir, "package");
  check(
    JSON.stringify(await listFiles(pkgDir)) === JSON.stringify(EXPECTED_FILES),
    "entpacktes Paket enthält nur die erwarteten Dateien",
  );
  check(!existsSync(join(pkgDir, "node_modules")), "kein node_modules im entpackten Paket");

  // Ein fremdes, leeres Verzeichnis als Arbeitsverzeichnis.
  const foreignCwd = await mkdtemp(join(tmpdir(), "markenfrei-mcp-cwd-"));
  const bin = join(pkgDir, "dist", "markenfrei-mcp.mjs");
  console.error(`Starten aus ${foreignCwd} …`);
  const { code, signal, responses, stderr } = await runServer(
    bin,
    foreignCwd,
    [
      {
        jsonrpc: "2.0",
        id: 1,
        method: "initialize",
        params: {
          protocolVersion: "2025-06-18",
          capabilities: {},
          clientInfo: { name: "markenfrei-pakettest", version: "0.0.0" },
        },
      },
      { jsonrpc: "2.0", method: "notifications/initialized" },
      { jsonrpc: "2.0", id: 2, method: "tools/list" },
      {
        jsonrpc: "2.0",
        id: 3,
        method: "tools/call",
        params: { name: "markenfrei_trademark_prep", arguments: { name: "Lumora", classes: [9, 42] } },
      },
    ],
    [1, 2, 3],
  );
  await rm(foreignCwd, { recursive: true, force: true });

  check(code === 0 && signal === null, `Server endet mit Exit 0 (code ${code}, signal ${signal})`);
  const init = responses.get(1)?.result;
  check(init?.serverInfo?.name === "markenfrei", `initialize: serverInfo ${JSON.stringify(init?.serverInfo)}`);
  const tools = (responses.get(2)?.result?.tools ?? []).map((t) => t.name);
  check(
    JSON.stringify([...tools].sort()) === JSON.stringify([...EXPECTED_TOOLS].sort()),
    `tools/list: ${tools.join(", ")}`,
  );
  const call = responses.get(3)?.result;
  const prep = call?.structuredContent;
  check(call && !call.isError, "tools/call markenfrei_trademark_prep ohne Fehler");
  check(prep?.name === "lumora", `trademark_prep normalisiert den Namen (${prep?.name})`);
  check(Array.isArray(prep?.links) && prep.links.length > 0, `trademark_prep liefert ${prep?.links?.length} Links`);
  check(typeof prep?.dpmaExpertQuery === "string" && prep.dpmaExpertQuery.length > 0, "trademark_prep liefert den DPMA-Suchstring");
  check(!/Cannot find module|ERR_/.test(stderr), "keine Modul- oder Ladefehler auf stderr");

  console.error("Pakettest bestanden.");
} catch (err) {
  console.error(`Pakettest fehlgeschlagen: ${err instanceof Error ? err.message : String(err)}`);
  process.exitCode = 1;
} finally {
  await rm(work, { recursive: true, force: true });
}
