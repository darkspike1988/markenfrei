import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { CHECK_PROFILES, PROFILE_IDS, profileSummary } from "@/lib/engine/format";
import { AGENT_INSTRUCTIONS_DE, AGENT_INSTRUCTIONS_EN, buildLlmsTxt } from "@/lib/llms-txt";
import { TOOL_NAMES } from "@/mcp/server";

// Die Anweisung für AGENTS.md/CLAUDE.md und die Profilliste stehen an mehreren Stellen; hier wird
// geprüft, dass die Kopien mit dem Code übereinstimmen.

const ROOT = join(__dirname, "..");
const read = (path: string) => readFileSync(join(ROOT, path), "utf8");

test("Anweisung für AGENTS.md: nennt Anlass, Ablauf, nur echte Werkzeuge und Profile", () => {
  for (const text of [AGENT_INSTRUCTIONS_DE, AGENT_INSTRUCTIONS_EN]) {
    for (const tool of text.match(/markenfrei_[a-z_]+/g) ?? []) assert.ok((TOOL_NAMES as readonly string[]).includes(tool), tool);
    for (const line of text.split("\n").filter((l) => l.includes("profile"))) {
      for (const [, id] of line.matchAll(/"([a-z-]+)"/g)) assert.ok(PROFILE_IDS.includes(id), `Profil ${id} gibt es nicht`);
    }
    assert.match(text, /markenfrei_check_names/);
    assert.match(text, /markenfrei_trademark_prep/);
    assert.match(text, /5 (bis|to) 10/);
  }
  assert.match(AGENT_INSTRUCTIONS_DE, /Bestelle nichts selbst/);
  assert.match(AGENT_INSTRUCTIONS_DE, /Nenne keinen Namen „frei“/);
  assert.match(AGENT_INSTRUCTIONS_EN, /Do not order anything yourself/);
  assert.match(AGENT_INSTRUCTIONS_EN, /Never call a name "free"/);
});

test("mcp/README.md enthält beide Anweisungen wörtlich und alle Profile mit ihrer Auswahl", () => {
  const doc = read("mcp/README.md");
  assert.ok(doc.includes(`\`\`\`markdown\n${AGENT_INSTRUCTIONS_DE}\n\`\`\``), "deutsche Anweisung weicht ab");
  assert.ok(doc.includes(`\`\`\`markdown\n${AGENT_INSTRUCTIONS_EN}\n\`\`\``), "englische Anweisung weicht ab");
  for (const p of CHECK_PROFILES) {
    assert.ok(doc.includes(`| \`${p.id}\` | ${p.label} | ${profileSummary(p)} |`), `Profil ${p.id} weicht ab`);
  }
});

test("llms.txt nennt Profile, Ablauf und Registrierungs-Link und enthält die deutsche Anweisung", () => {
  const text = buildLlmsTxt("https://markenfrei.example");
  for (const id of PROFILE_IDS) assert.ok(text.includes(id), id);
  assert.ok(text.includes(AGENT_INSTRUCTIONS_DE));
  assert.match(text, /nichts selbst bestellen/);
  assert.match(text, /möglicherweise vergütetes Angebot des Betreibers/);
});

test("README beschreibt den Registrierungs-Link mit Hinweis auf Vergütung und Quellenbedingungen", () => {
  const readme = read("README.md");
  const start = readme.indexOf("### Registrierungs-Link");
  assert.notEqual(start, -1);
  const section = readme.slice(start, readme.indexOf("\n## ", start));
  assert.match(section, /Standardmäßig aus/);
  assert.match(section, /verdienen/);
  assert.match(section, /überträgt nichts/);
  assert.match(section, /SWITCH/);
  for (const path of ["README.md", ".env.example", "mcp/README.md"]) {
    const doc = read(path);
    assert.match(doc, /MARKENFREI_REGISTER_URL/, path);
    assert.match(doc, /MARKENFREI_REGISTER_NAME/, path);
  }
});
