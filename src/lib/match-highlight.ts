import { foldToAscii } from "@/lib/name";

/**
 * Welche Buchstaben einer ähnlichen Marke stimmen mit dem eingegebenen Namen überein? Reine Funktion
 * ohne Netz und ohne Wertung: Es wird nur markiert, nichts gezählt oder bewertet. Ein Treffer ist
 * nur ein Hinweis, kein Rechtsbefund.
 *
 * Verglichen wird in der Vergleichsform des Namens (klein, Umlaute als ae/oe/ue, ß als ss, ohne
 * Akzente, ohne Bindestriche und Leerzeichen). Markiert wird am Marken-Label:
 *  - Name und Label gleich oder Label im Namen enthalten: alles,
 *  - sonst der längste gemeinsame Präfix und Suffix,
 *  - bei gleicher Länge zusätzlich Zeichen an gleicher Position.
 */

export type HighlightSegment = { text: string; match: boolean };

const KEEP = /[a-z0-9]/;

/** Vergleichsform: nur a-z und 0-9. */
function compare(input: string): string {
  return Array.from(foldToAscii(input))
    .filter((c) => KEEP.test(c))
    .join("");
}

export function highlightMatch(name: string, label: string): HighlightSegment[] {
  const chars = Array.from(label);
  if (chars.length === 0) return [];

  // Vergleichszeichen des Labels mit dem Index des Anzeigezeichens, zu dem sie gehören.
  const seq: { c: string; owner: number }[] = [];
  chars.forEach((ch, owner) => {
    for (const c of compare(ch)) seq.push({ c, owner });
  });
  const a = compare(name);
  const b = seq.map((s) => s.c).join("");
  const marked = new Array<boolean>(seq.length).fill(false);

  if (a.length > 0 && b.length > 0) {
    if (a === b || a.includes(b)) {
      marked.fill(true);
    } else {
      let p = 0;
      while (p < a.length && p < b.length && a[p] === b[p]) p++;
      let s = 0;
      while (s < a.length - p && s < b.length - p && a[a.length - 1 - s] === b[b.length - 1 - s]) s++;
      for (let i = 0; i < p; i++) marked[i] = true;
      for (let i = 0; i < s; i++) marked[b.length - 1 - i] = true;
      if (a.length === b.length) {
        for (let i = 0; i < a.length; i++) if (a[i] === b[i]) marked[i] = true;
      }
    }
  }

  // Ein Anzeigezeichen gilt als übereinstimmend, wenn alle seine Vergleichszeichen es tun (ü = ue).
  const hit = new Array<boolean | null>(chars.length).fill(null); // null: kein Vergleichszeichen (Trenner)
  seq.forEach((s, i) => {
    hit[s.owner] = (hit[s.owner] ?? true) && marked[i];
  });
  // Trenner (Bindestrich, Leerzeichen) folgen dem Nachbarn, wenn beide Seiten übereinstimmen.
  const flags = hit.map((h, i) => {
    if (h !== null) return h;
    let l = i - 1;
    while (l >= 0 && hit[l] === null) l--;
    let r = i + 1;
    while (r < chars.length && hit[r] === null) r++;
    return l >= 0 && r < chars.length && hit[l] === true && hit[r] === true;
  });

  const out: HighlightSegment[] = [];
  chars.forEach((ch, i) => {
    const last = out[out.length - 1];
    if (last && last.match === flags[i]) last.text += ch;
    else out.push({ text: ch, match: flags[i] });
  });
  return out;
}
