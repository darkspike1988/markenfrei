/**
 * Aktualisiert src/lib/engine/sources/rdap-tlds.json aus dem IANA-RDAP-Bootstrap.
 *
 * NUR VON HAND, mit Netz: `npx tsx scripts/update-rdap-tlds.ts`. Läuft weder im Build noch in CI
 * noch in den Tests. Ein Abruf (https://data.iana.org/rdap/dns.json), kein Abgleich einzelner Domains.
 * Das Ergebnis kommt per Pull Request ins Repository und wird dort geprüft.
 *
 * Übernommen werden nur Endungen mit https-Server und ohne `xn--`; die Endungen sind
 * sortiert, die Datei hat ein festes Format (kleine Diffs). Danach gibt das Skript die
 * Anzahl, die Größe des geladenen Bootstraps und die Größe des Schnappschusses aus. Der Abruf
 * zur Laufzeit ist auf 512 KB begrenzt (BOOTSTRAP_MAX_BYTES in domains.ts): Liegt der geladene
 * Bootstrap darüber, bricht dieser Abruf ab und der Schnappschuss dient als Rückfall.
 */
import { statSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const SOURCE = "https://data.iana.org/rdap/dns.json";
const TARGET = fileURLToPath(new URL("../src/lib/engine/sources/rdap-tlds.json", import.meta.url));

type Bootstrap = { publication?: string; services?: unknown };

async function main(): Promise<void> {
  const res = await fetch(SOURCE, {
    headers: { Accept: "application/json", "User-Agent": "markenfrei-update-rdap-tlds (manuell)" },
  });
  if (!res.ok) throw new Error(`IANA-Bootstrap: HTTP ${res.status}`);
  const raw = await res.text();
  console.log(`Bootstrap geladen: ${(Buffer.byteLength(raw) / 1024).toFixed(1)} KB`);
  const json = JSON.parse(raw) as Bootstrap;
  if (!Array.isArray(json.services) || json.services.length === 0) throw new Error("Unerwartetes Format: services fehlt");

  const map = new Map<string, string>();
  for (const entry of json.services) {
    if (!Array.isArray(entry) || entry.length < 2) continue;
    const [tlds, urls] = entry as [unknown, unknown];
    if (!Array.isArray(tlds) || !Array.isArray(urls)) continue;
    const https = urls.find((u): u is string => typeof u === "string" && u.startsWith("https://"));
    if (!https) continue;
    const base = https.endsWith("/") ? https : `${https}/`;
    for (const t of tlds) {
      if (typeof t !== "string") continue;
      const tld = t.toLowerCase();
      if (!/^[a-z0-9]+$/.test(tld) || tld.startsWith("xn--")) continue;
      map.set(tld, base);
    }
  }
  if (map.size === 0) throw new Error("Keine Endung übernommen");

  const sorted = [...map.entries()].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  const lines = sorted.map(([t, u]) => `${JSON.stringify(t)}: ${JSON.stringify(u)}`);
  const out =
    `{\n"quelle": ${JSON.stringify(SOURCE)},\n"veroeffentlicht": ${JSON.stringify(json.publication ?? "")},\n` +
    `"endungen": {\n${lines.join(",\n")}\n}\n}\n`;
  writeFileSync(TARGET, out, "utf8");
  console.log(`${sorted.length} Endungen geschrieben nach ${TARGET}`);
  console.log(`Dateigröße: ${(statSync(TARGET).size / 1024).toFixed(1)} KB`);
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
