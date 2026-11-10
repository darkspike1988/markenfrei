import type { NameReport } from "@/lib/engine/check";
import type { SourceResult } from "@/lib/engine/types";
import { NAMESPACE_LABEL } from "@/lib/engine/types";
import { STATUS_LABEL, VERDICT_LABEL } from "@/lib/engine/verdict";

/**
 * Exportformate für Ergebnisse (rein, ohne Netz und ohne DOM): CSV und Markdown.
 * Die Reihenfolge der Berichte bestimmt die Aufrufstelle (in der Oberfläche die Rangfolge).
 * Es werden nur Felder der Berichte ausgegeben, nie Eingaben außerhalb davon.
 * Registrierungs-Links des Betreibers (`SourceResult.register`) stehen nur im Markdown, mit Hinweis;
 * die CSV behält ihre Spalten, `url` bleibt der Link zum Nachprüfen.
 */

/** Schlusszeile jedes Markdown-Exports, gleicher Wortlaut wie im JSON-Export. */
export const EXPORT_DISCLAIMER = "Vorprüfung, keine Rechtsberatung. Marke nicht geprüft.";

export const CSV_COLUMNS = ["name", "namespace", "source", "target", "status", "note", "url", "checkedAt"] as const;

/** Zeilen, die eine Tabellenkalkulation als Formel lesen würde (OWASP: CSV Injection). */
const FORMULA_START = /^[=+\-@\t\r]/;

/** Ein CSV-Feld nach RFC 4180, Formelanfänge mit einfachem Anführungszeichen entschärft. */
export function csvCell(value: string): string {
  const safe = FORMULA_START.test(value) ? `'${value}` : value;
  return /[",\r\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
}

/** Hinweis einer Quelle, schwache Signale vorn markiert. */
function sourceNote(r: SourceResult): string {
  if (!r.weak) return r.note ?? "";
  return r.note ? `schwaches Signal: ${r.note}` : "schwaches Signal";
}

/**
 * CSV mit einer Zeile je Name und Quelle (CRLF, UTF-8 ohne BOM). `namespace` und `status` tragen die
 * stabilen Kennungen des Berichts (z. B. `domains`, `taken`), `source` den Anzeigenamen.
 */
export function toCsv(reports: readonly NameReport[]): string {
  const lines: string[] = [CSV_COLUMNS.join(",")];
  for (const report of reports) {
    if (report.results.length === 0) {
      lines.push([report.name, "", "", "", "", "", "", report.checkedAt].map(csvCell).join(","));
      continue;
    }
    for (const r of report.results) {
      lines.push(
        [report.name, r.namespace, r.label, r.target, r.status, sourceNote(r), r.url ?? "", report.checkedAt]
          .map(csvCell)
          .join(","),
      );
    }
  }
  return `${lines.join("\r\n")}\r\n`;
}

/** Text für eine Markdown-Tabellenzelle oder Überschrift: Steuerzeichen neutralisiert, Zeilenumbrüche zu Leerzeichen. */
export function mdEscape(value: string): string {
  return value
    .replace(/\s*[\r\n\u2028\u2029]+\s*/g, " ")
    .replace(/[\\|`*_[\]<>#]/g, (c) => `\\${c}`)
    .trim();
}

/** Nur http(s)-Ziele werden verlinkt; Klammern und Leerzeichen würden den Link beenden. */
function mdUrl(url: string): string | null {
  if (!/^https?:\/\//i.test(url)) return null;
  return url.replace(/[()\s<>]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase().padStart(2, "0")}`);
}

function mdSource(r: SourceResult): string {
  const href = r.url ? mdUrl(r.url) : null;
  return href ? `[${mdEscape(r.label)}](${href})` : mdEscape(r.label);
}

/**
 * Markdown: ein Abschnitt je Name mit Ampel und Quellentabelle, darunter die Registrierungs-Links des
 * Betreibers mit ihrem Hinweis, am Ende der Hinweis zur Vorprüfung.
 */
export function toMarkdown(reports: readonly NameReport[]): string {
  const out: string[] = ["# Markenfrei: Vorprüfung", ""];
  if (reports.length === 0) out.push("Keine Ergebnisse.", "");
  for (const report of reports) {
    out.push(`## ${mdEscape(report.name)}`, "");
    out.push(`Ampel: ${VERDICT_LABEL[report.verdict]} · geprüft am ${mdEscape(report.checkedAt)}`, "");
    if (report.results.length > 0) {
      out.push("| Namensraum | Quelle | Ziel | Status | Hinweis |", "|---|---|---|---|---|");
      for (const r of report.results) {
        const status = r.weak && r.status === "taken" ? "schwacher Treffer" : STATUS_LABEL[r.status];
        out.push(
          `| ${NAMESPACE_LABEL[r.namespace]} | ${mdSource(r)} | ${mdEscape(r.target)} | ${status} | ${mdEscape(sourceNote(r))} |`,
        );
      }
      out.push("");
    }
    const register = report.results.filter((r) => r.register && mdUrl(r.register.url));
    if (register.length > 0) {
      out.push("Domain registrieren (Angebot des Betreibers, vergütet):", "");
      for (const r of register) {
        out.push(`- [${mdEscape(`${r.register?.label}: ${r.target}`)}](${mdUrl(r.register?.url ?? "")})`);
      }
      out.push("", mdEscape(register[0].register?.notice ?? ""), "");
    }
    if (report.incomplete.length > 0) {
      out.push(
        `Ohne Antwort: ${report.incomplete.map(mdEscape).join(", ")}. Dort heißt „nichts gefunden“ nicht „frei“.`,
        "",
      );
    }
    out.push("Marke: nicht geprüft.", "");
  }
  out.push("---", "", EXPORT_DISCLAIMER, "");
  return out.join("\n");
}

/** Dateiname für den Download: einzelner Name oder „shortlist“, ohne Zeichen, die Dateisysteme ablehnen. */
export function exportFileName(reports: readonly NameReport[], extension: "json" | "csv" | "md" | "ics"): string {
  const base = reports.length === 1 ? reports[0].name.replace(/[\\/:*?"<>|\u0000-\u001f]/g, "_") : "shortlist";
  return `markenfrei-${base || "shortlist"}.${extension}`;
}
