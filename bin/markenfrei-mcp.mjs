#!/usr/bin/env node
// Startet den gebündelten Markenfrei-MCP aus mcp/dist. Das veröffentlichte Paket ist
// mcp/ (markenfrei-mcp); diese Datei dient nur dem Start aus dem Repo.
// Ohne Bündel: erst "npm run build:mcp", oder direkt aus den Quellen mit "npm run mcp".
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";

const bundle = fileURLToPath(new URL("../mcp/dist/markenfrei-mcp.mjs", import.meta.url));

if (!existsSync(bundle)) {
  console.error("Markenfrei MCP: mcp/dist/markenfrei-mcp.mjs fehlt. Bitte zuerst \"npm run build:mcp\" ausführen.");
  process.exit(1);
}

await import(new URL("../mcp/dist/markenfrei-mcp.mjs", import.meta.url).href);
