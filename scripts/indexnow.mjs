#!/usr/bin/env node
/**
 * Meldet alle Adressen der Sitemap per IndexNow (Bing, Yandex und weitere Suchmaschinen).
 * Der Schlüssel ist öffentlich vorgesehen: public/<schluessel>.txt enthält ihn, damit die
 * Suchmaschinen die Inhaberschaft prüfen können.
 *
 * Aufruf nach einem Deployment: npm run indexnow
 * Optional: MARKENFREI_PUBLIC_URL=https://markenfrei.app (Standard)
 */
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

const base = new URL(process.env.MARKENFREI_PUBLIC_URL?.trim() || "https://markenfrei.app");
const keyFile = readdirSync("public").find((f) => /^[0-9a-f]{32}\.txt$/.test(f));
if (!keyFile) throw new Error("Keine Schlüsseldatei public/<32 Hexzeichen>.txt gefunden.");
const key = readFileSync(join("public", keyFile), "utf8").trim();
if (keyFile !== `${key}.txt`) throw new Error("Dateiname und Schlüssel stimmen nicht überein.");

const sitemap = await fetch(new URL("/sitemap.xml", base));
if (!sitemap.ok) throw new Error(`Sitemap nicht erreichbar: HTTP ${sitemap.status}`);
const urlList = [...(await sitemap.text()).matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);
if (urlList.length === 0) throw new Error("Die Sitemap enthält keine Adressen.");

const res = await fetch("https://api.indexnow.org/indexnow", {
  method: "POST",
  headers: { "Content-Type": "application/json; charset=utf-8" },
  body: JSON.stringify({ host: base.host, key, keyLocation: new URL(`/${key}.txt`, base).toString(), urlList }),
});
console.log(`IndexNow: HTTP ${res.status} für ${urlList.length} Adressen`);
if (res.status !== 200 && res.status !== 202) process.exit(1);
