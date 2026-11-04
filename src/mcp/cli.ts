#!/usr/bin/env node
/**
 * Markenfrei-MCP über stdio. Protokoll auf stdout, Meldungen nur auf stderr.
 *
 * Exit-Codes: 0 bei normalem Ende (stdin geschlossen, SIGINT, SIGTERM), 1 bei Startfehler
 * oder unerwartetem Absturz.
 */
import * as nodeModule from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";

type ResolveHook = (specifier: string, context: unknown, next: (specifier: string, context?: unknown) => unknown) => unknown;

/**
 * Der Alias "@/..." steht in tsconfig.json. tsx sucht diese Datei im aktuellen Verzeichnis,
 * beim Start aus einem fremden Verzeichnis fehlt der Alias also. Ein Resolve-Hook bildet ihn
 * auf src/ ab. Im gebündelten Paket gibt es keine "@/"-Importe mehr, der Hook greift dann nie.
 */
function installAliasHook(): void {
  const registerHooks = (nodeModule as unknown as { registerHooks?: (hooks: { resolve: ResolveHook }) => unknown })
    .registerHooks;
  if (typeof registerHooks !== "function") return;
  const here = typeof __dirname === "string" ? __dirname : dirname(fileURLToPath(import.meta.url));
  const srcDir = join(here, "..");
  registerHooks({
    resolve(specifier, context, next) {
      return specifier.startsWith("@/") ? next(join(srcDir, specifier.slice(2)), context) : next(specifier, context);
    },
  });
}

function fail(prefix: string, err: unknown): never {
  console.error(`Markenfrei MCP: ${prefix}: ${err instanceof Error ? err.message : String(err)}`);
  process.exit(1);
}

async function main(): Promise<void> {
  installAliasHook();
  const { createMarkenfreiMcpServer, MCP_SERVER_VERSION } = await import("./server");

  const server = createMarkenfreiMcpServer();
  const transport = new StdioServerTransport();
  server.server.onerror = (err) => console.error(`Markenfrei MCP: ${err.message}`);

  let closing = false;
  const shutdown = (code: number) => {
    if (closing) return;
    closing = true;
    server
      .close()
      .catch(() => undefined)
      .finally(() => process.exit(code));
  };
  process.on("SIGINT", () => shutdown(0));
  process.on("SIGTERM", () => shutdown(0));
  // Bei geschlossenem stdin laufende Antworten noch zu Ende schreiben lassen; der Prozess
  // endet dann von selbst mit 0, sobald nichts mehr aussteht.
  process.stdout.on("error", (err: NodeJS.ErrnoException) => {
    if (err.code === "EPIPE") shutdown(0);
    else fail("Schreibfehler", err);
  });

  await server.connect(transport);
  console.error(`Markenfrei MCP ${MCP_SERVER_VERSION} läuft über stdio (PID ${process.pid}).`);
}

process.on("uncaughtException", (err) => fail("Unerwarteter Fehler", err));
process.on("unhandledRejection", (err) => fail("Unerwarteter Fehler", err));

main().catch((err) => fail("Start fehlgeschlagen", err));
