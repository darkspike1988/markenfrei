/**
 * Kern der Kommandozeile `markenfrei check <name…>`. Kein Prozess-Zugriff: Engine, Ausgabe,
 * Umgebung und Netz kommen über `CliDeps` herein, die Tests ersetzen sie.
 *
 * Exit-Codes: 0 grün, 1 gelb, 2 rot (bei mehreren Namen die schlechteste Ampel),
 * 64 Eingabe- oder Aufruffehler, 70 interner Fehler.
 */
import { parseArgs } from "node:util";
import {
  CheckInputError,
  DEFAULT_NAMESPACES,
  MAX_NAMES,
  MAX_TLDS,
  STATIC_SOURCES,
  type CheckOptions,
  type checkName as checkNameFn,
  type checkNames as checkNamesFn,
} from "@/lib/engine/check";
import { effectiveSources, formatRanking, formatReport, prepareShortlist, withoutTrademark } from "@/lib/engine/format";
import { DEFAULT_DOMAIN_TLDS } from "@/lib/engine/sources/domains";
import { NAMESPACES, type Namespace } from "@/lib/engine/types";
import type { Verdict } from "@/lib/engine/verdict";
import { APP_VERSION } from "@/lib/version";
export const EXIT_OK = 0;
export const EXIT_YELLOW = 1;
export const EXIT_RED = 2;
export const EXIT_USAGE = 64;
export const EXIT_INTERNAL = 70;

const EXIT_BY_VERDICT: Record<Verdict, number> = { green: EXIT_OK, yellow: EXIT_YELLOW, red: EXIT_RED };

type Writer = { write(chunk: string): unknown };

export type CliDeps = {
  checkName: typeof checkNameFn;
  checkNames: typeof checkNamesFn;
  stdout: Writer;
  stderr: Writer;
  env: Record<string, string | undefined>;
  fetchImpl?: typeof fetch;
};

export type CliCommand =
  | { kind: "help" }
  | { kind: "version" }
  | { kind: "error"; message: string }
  | { kind: "check"; names: string[]; json: boolean; namespaces?: string[]; tlds?: string[]; sources?: string[] };

const list = (v: string): string[] =>
  v
    .split(",")
    .map((x) => x.trim())
    .filter(Boolean);

export function parseCliArgs(argv: string[]): CliCommand {
  let parsed;
  try {
    parsed = parseArgs({
      args: argv,
      allowPositionals: true,
      strict: true,
      options: {
        json: { type: "boolean" },
        namespaces: { type: "string" },
        tlds: { type: "string" },
        sources: { type: "string" },
        help: { type: "boolean", short: "h" },
        version: { type: "boolean", short: "v" },
      },
    });
  } catch (err) {
    return { kind: "error", message: err instanceof Error ? err.message : String(err) };
  }
  const { values, positionals } = parsed;
  if (values.help) return { kind: "help" };
  if (values.version) return { kind: "version" };
  const [command, ...names] = positionals;
  if (command === undefined) return { kind: "error", message: "Unterbefehl fehlt." };
  if (command !== "check") return { kind: "error", message: `Unbekannter Unterbefehl „${command.slice(0, 30)}“.` };
  if (names.length === 0) return { kind: "error", message: "Bitte mindestens einen Namen angeben." };
  return {
    kind: "check",
    names,
    json: values.json === true,
    ...(values.namespaces !== undefined ? { namespaces: list(values.namespaces) } : {}),
    ...(values.tlds !== undefined ? { tlds: list(values.tlds) } : {}),
    ...(values.sources !== undefined ? { sources: list(values.sources) } : {}),
  };
}

export function helpText(): string {
  return [
    "Aufruf: markenfrei check <name…> [Optionen]",
    "",
    `Prüft bis zu ${MAX_NAMES} Namen in offenen Quellen (Domains, Paketregister, App Stores, bekannte Namen).`,
    "Die Abfragen laufen von diesem Rechner; es gibt keinen Server dazwischen.",
    "",
    "Optionen:",
    "  --json                 Bericht als JSON (ein Name: Bericht, mehrere: { ranking, reports })",
    `  --namespaces a,b       Namensräume (Standard: ${DEFAULT_NAMESPACES.join(",")}); möglich: ${NAMESPACES.join(",")}`,
    `  --tlds de,com          Domain-Endungen ohne Punkt, höchstens ${MAX_TLDS} (Standard: ${DEFAULT_DOMAIN_TLDS.join(",")})`,
    `  --sources x,y          Ausdrücklich diese Quellen: ${STATIC_SOURCES.map((s) => s.id).join(",")}`,
    "  --help, --version",
    "",
    "Exit-Code: 0 grün, 1 gelb (Treffer oder Lücken), 2 rot (vergeben), 64 falscher Aufruf, 70 interner Fehler.",
    "Bei mehreren Namen zählt die schlechteste Ampel. Ohne Netz kommt Gelb (Exit 1), nicht Grün.",
    "",
    "Umgebung: MARKENFREI_CONTACT (E-Mail oder URL) steht im User-Agent der Abfragen; ohne sie geht kein Kontakt mit.",
    "Abfragebudgets (z. B. GitHub ohne Token, crates.io, iTunes) gelten nur innerhalb eines Aufrufs, nicht zwischen",
    "Aufrufen. Den Befehl deshalb nicht in Schleifen aufrufen; alle Namen gehören in einen Aufruf.",
    "Grün heißt nur: in den geprüften Quellen nichts gefunden. Markenregister werden nicht abgefragt.",
  ].join("\n");
}

const CLI_REPORT_HINT = "Marke: nicht geprüft (Markenregister werden nicht abgefragt)";
const CLI_RANKING_HINT =
  "Grün heißt nur: in den geprüften Quellen nichts gefunden. Marke: nicht geprüft (Markenregister werden nicht abgefragt).";

const WORSE: Record<Verdict, number> = { green: 0, yellow: 1, red: 2 };

function worst(verdicts: Verdict[]): Verdict {
  return verdicts.reduce<Verdict>((a, b) => (WORSE[b] > WORSE[a] ? b : a), "green");
}

export async function run(argv: string[], deps: CliDeps): Promise<number> {
  const usage = (message: string): number => {
    deps.stderr.write(`Fehler: ${message}\n\n${helpText()}\n`);
    return EXIT_USAGE;
  };

  const cmd = parseCliArgs(argv);
  if (cmd.kind === "help") {
    deps.stdout.write(`${helpText()}\n`);
    return EXIT_OK;
  }
  if (cmd.kind === "version") {
    deps.stdout.write(`${APP_VERSION}\n`);
    return EXIT_OK;
  }
  if (cmd.kind === "error") return usage(cmd.message);

  // Der Kontakt kommt nur aus deps.env, nie stillschweigend aus process.env.
  const contact = deps.env.MARKENFREI_CONTACT ?? "";
  if (!contact) {
    deps.stderr.write(
      "Hinweis: MARKENFREI_CONTACT ist nicht gesetzt, die Abfragen tragen keinen Kontakt im User-Agent.\n",
    );
  }

  const namespaces = cmd.namespaces as Namespace[] | undefined;
  const opts: CheckOptions = {
    namespaces,
    tlds: cmd.tlds,
    sources: effectiveSources(namespaces, cmd.sources),
    contact,
    ...(deps.fetchImpl ? { fetchImpl: deps.fetchImpl } : {}),
  };

  try {
    if (cmd.names.length === 1) {
      const report = await deps.checkName(cmd.names[0], opts);
      deps.stdout.write(cmd.json ? `${JSON.stringify(report, null, 2)}\n` : `${formatReport(report, CLI_REPORT_HINT)}\n`);
      return EXIT_BY_VERDICT[report.verdict];
    }

    const prepared = prepareShortlist(cmd.names);
    if (!prepared.ok) return usage(prepared.error);
    const result = await deps.checkNames(prepared.inputs, opts);
    const reports = result.reports.map(withoutTrademark);
    deps.stdout.write(
      cmd.json
        ? `${JSON.stringify({ ranking: result.ranking, reports }, null, 2)}\n`
        : `${formatRanking(result.ranking, reports, prepared.merged, CLI_RANKING_HINT)}\n`,
    );
    return EXIT_BY_VERDICT[worst(result.reports.map((r) => r.verdict))];  } catch (err) {
    if (err instanceof CheckInputError) return usage(err.message);
    deps.stderr.write(`Interner Fehler: ${err instanceof Error ? err.message : String(err)}\n`);
    return EXIT_INTERNAL;
  }
}
