/**
 * Vorbereitung der Markenrecherche (siehe docs/v2-spec.md, Abschnitt "Marke").
 *
 * Markenfrei fragt keine Markenregister ab (Begründung in docs/trademark-registers.md).
 * Dieses Modul baut ohne Netzwerk zur Laufzeit: Links zur manuellen Suche, einen
 * DPMA-Expertensuchstring, Schreibvarianten, einen Klassenvorschlag und eine Checkliste.
 *
 * ## Link-Prüfung (4. November 2026, je ein Aufruf per curl, Vorausfüllen wo nötig im Browser)
 *
 * - DPMAregister Schnellsuche
 *   `https://register.dpma.de/DPMAregister/marke/erweitert?fromSmartSearch=true&queryString={name}`
 *   Dieses Format erzeugt DPMAs eigene "Einfach suchen"-Funktion: `/DPMAregister/js/smartsearchInt.js`
 *   ruft `/DPMAregister/smartsearch?queryString=…` und leitet auf `marLink` weiter, das genau so
 *   aussieht. curl mit Cookie-Jar: 200, 1 Weiterleitung auf `/marke/trefferliste`, Seite zeigt
 *   `Suchanfrage: ((rn="telekom" OR akz="telekom") OR (marke="telekom") OR (inh="telekom" OR anm="telekom"))`
 *   und "Trefferliste: 6966 Treffer". Im Browser ohne vorherige Sitzung gleiches Ergebnis.
 *   (curl ohne Cookies landet auf `HttpSessionExpiredPage`, ein Browser nicht.)
 *   Nicht offiziell dokumentiert, kann sich also ändern.
 * - DPMAregister Expertenrecherche `https://register.dpma.de/DPMAregister/marke/experte`: 200, keine
 *   Weiterleitung. Das Formular ist ein POST (Tapestry), ein Vorausfüllen per Link gibt es nicht.
 *   `/marke/basis?marke=…` füllt das Feld ebenfalls nicht (geprüft: `value` bleibt leer).
 *   `/marke/einsteiger` liefert curl nur eine Bot-Abwehr-Seite (5,6 KB), daher nicht verwendet.
 * - TMview `https://www.tmdn.org/tmview/#/tmview/results?page=1&pageSize=30&criteria=C&basicSearch={name}`:
 *   200, Single-Page-App. Im Bundle (`index.e1860496.js`) ist `RESULTS:"/results"` eine Route,
 *   `basicSearch` und `criteria:"C"` sind Suchparameter, die die App selbst in diese URL schreibt
 *   und aus `location.search` liest. Im Browser: Feld "telekom" gefüllt, "Wortlaut der Marke:
 *   Enthält", "1-30 aus 3.487".
 * - EUIPO eSearch plus `https://euipo.europa.eu/eSearch/#basic/1+1+1+1/100+100+100+100/{name}`:
 *   200. In `javascripts/app.js` ist `"basic/:pages/:ipps/*term":"basicSearch"` die Namenssuche
 *   (keine Detailroute), vier Reiter (Marken, Designs, Inhaber, Vertreter) ergeben je vier Werte.
 *   Im Browser: Suchfeld "telekom", "Trade marks (101)".
 * - WIPO Global Brand Database `https://branddb.wipo.int/en/quicksearch`: 200, aber zuerst eine
 *   automatische Browser-Prüfung (ALTCHA). Deren Skript leitet danach auf den Pfad ohne
 *   Query-String weiter (`let redirect = "/en/quicksearch/results"` für `…/results?by=brandName&v=…`).
 *   Ein Vorausfüllen ist daher nicht nachweisbar; verlinkt wird die Suchseite.
 * - TMDB `https://tmdb.eu/de/suche/marken?q={name}&mode%5B%5D=fts`: curl erhält 403 (Cloudflare,
 *   "Just a moment..."), auch ohne Query. Das Format ist eine serverseitige GET-Suche, belegt durch
 *   eine frühere Aufzeichnung im normalen Browser (docs/trademark-registers.md). Keine
 *   automatisierte Abfrage, kein Umgehen der Bot-Abwehr.
 * ## Firmenregister-Links (9. November 2026, je ein Aufruf ohne Login, Status 200)
 *
 * - Zefix `https://www.zefix.admin.ch/de/search/entity/welcome`: 200, Suchanwendung. Ein Vorausfüllen
 *   per Query-Parameter ist nicht dokumentiert und nicht nachweisbar, daher nur die Suchseite.
 *   Die zugehörige REST-Schnittstelle braucht ein (kostenloses) Konto und ist in der robots.txt
 *   gesperrt (Begründung gegen eine automatische Abfrage: docs/companies-register.md).
 * - handelsregister.de `https://www.handelsregister.de/rp_web/welcome.xhtml`: 200, kein Vorausfüllen
 *   per Link möglich (POST-Formular). Eine automatische Abfrage verbieten die Nutzungsbedingungen
 *   (Begründung: docs/companies-register.md).
 *
 * - USPTO `https://tmsearch.uspto.gov/`: 200, Angular-App mit AWS-WAF-Skript. Das Bundle `main.js`
 *   liest aus der URL nur `page` und `serial`; `text`, `field` und `search_type` kommen darin nicht
 *   vor. Ein Vorausfüllen ist nicht nachweisbar; verlinkt wird die Suchseite.
 *
 * ## DPMA-Expertensyntax (Beleg)
 *
 * Quelle: DPMAregister-Hilfe `https://register.dpma.de/prod/de/register_hilfe.pdf`, Kapitel 3.4
 * "Expertenrecherche" (Marken), und die Seite `/DPMAregister/marke/experte` (Formulierungshilfen):
 * - Feldkürzel: "(540) Markendarstellung (MD)", "Marke (MARKE)", "(511) Klasse(n) (KL)". Die
 *   Recherchebeispiele der Hilfe nutzen durchgehend `MARKE=`, das Trennzeichen ausgleicht
 *   ("MARKE=homework" findet "home work", "home@work"; "MARKE=email" findet "e-Mail"). Deshalb
 *   steht im String `MARKE=` und jede Variante ohne Bindestrich.
 * - Klassenwerte sind zweistellig (Werteauswahl `value="09"`), also `KL=09`.
 * - Boolesche Operatoren `UND ODER NICHT`, Klammern `( )`.
 * - Platzhalter `? ! #` laut Beispielen: `?` beliebig viele Zeichen ("MARKE=fili?", "MARKE=?oase",
 *   "MARKE=?brain?"), `!` genau ein Zeichen ("MARKE=tele!om" für Telekom/Telecom), `#` kein oder ein
 *   Zeichen ("MARKE=köl##sch" für kölnisch/kölsch).
 */

import { foldToAscii } from "@/lib/name";
import { analyzeTrademarkSafety, generatePhoneticTwins } from "@/lib/phonetics";

export type TrademarkLink = {
  office: string;
  label: string;
  url: string;
  what: string;
};

export type TrademarkClass = {
  number: number;
  title: string;
  reason: string;
};

export type TrademarkPrep = {
  status: "not_checked";
  note: string;
  links: TrademarkLink[];
  dpmaExpertQuery: string;
  variants: string[];
  classes: TrademarkClass[];
  checklist: string[];
};

export const TRADEMARK_PREP_NOTE =
  "Markenregister wurden nicht abgefragt. Eine leere Trefferliste hier heißt nicht, dass der Name als Marke frei ist.";

/** Datum der letzten Link-Prüfung (siehe Kommentar oben; Firmenregister-Links dazu am 9. November 2026) */
export const TRADEMARK_LINKS_CHECKED = "2026-11-09";

const MAX_VARIANTS = 12;

/**
 * Kurzform der Klassenüberschrift, meist deren erster Begriff, aus der Werteauswahl "Klasse(n)"
 * der DPMA-Expertenrecherche (Nizza-Klassifikation, Seite abgerufen am 4. November 2026).
 * Gekürzt bei 1, 7, 8, 16, 17 und 21.
 */
const NICE_HEADINGS: Record<number, string> = {
  1: "Chemische Erzeugnisse und Filtermaterialien",
  2: "Färbestoffe, Farbstoffe, Pigmente und Tinten",
  3: "Körperpflegemittel",
  4: "Brennstoffe und Leuchtstoffe",
  5: "Diätetische Präparate und Nahrungsergänzungsmittel",
  6: "Baumaterialien und Bauelemente aus Metall",
  7: "Maschinen",
  8: "Handbetätigte Geräte",
  9: "Herunterladbare und aufgezeichnete Daten",
  10: "Geräte für physikalische Therapie",
  11: "Abzüge und Installationen zum Ableiten von Abgasen",
  12: "Fahrzeuge und Beförderungsmittel",
  13: "Explosive Substanzen und Vorrichtungen, ausgenommen Waffen",
  14: "Edelsteine, Perlen und Edelmetalle sowie Imitationen hiervon",
  15: "Musikinstrumente",
  16: "Waren aus Papier oder Pappe",
  17: "Flexible Leitungen, Röhren und Schläuche, nicht aus Metall",
  18: "Regen- und Sonnenschirme",
  19: "Baumaterialien und Bauelemente, nicht aus Metall",
  20: "Waren, nicht aus Metall",
  21: "Waren aus Keramik und Glas",
  22: "Rohe textile Fasern und deren Ersatzstoffe",
  23: "Garne und Fäden",
  24: "Stoffe",
  25: "Kopfbedeckungen",
  26: "Accessoires für Bekleidung, Nähartikel und schmückende textile Artikel",
  27: "Fußbodenbeläge und künstliche Bodenbeläge",
  28: "Ausrüstungen für den Sport und für Körperübungen",
  29: "Fleisch und Fleischerzeugnisse",
  30: "Fertiggerichte und pikante Snacks",
  31: "Lebende Tiere, Lebewesen für die Zucht",
  32: "Biere und alkoholfreie Biere",
  33: "Alkoholische Essenzen und Extrakte",
  34: "Streichhölzer",
  35: "Werbung, Marketing und Verkaufsförderung",
  36: "Versicherungsdienstleistungen",
  37: "Bau-, Montage- und Abbrucharbeiten",
  38: "Telekommunikationsdienstleistungen",
  39: "Verteilung durch Leitungen und Kabel",
  40: "Kundenspezifische Fabrikations- und Anfertigungsdienstleistungen",
  41: "Verlagsdienstleistungen und Berichterstattung sowie Verfassen von Texten",
  42: "IT-Dienstleistungen",
  43: "Vorübergehende Beherbergung von Gästen",
  44: "Land-, gewässer-, garten- und forstwirtschaftliche Dienstleistungen",
  45: "Dienstleistungen im Bereich Sicherheit, Lebensrettung, Schutz und Vollzug",
};

/** Kleinbuchstaben, a-z0-9 und Bindestrich. Robust auch für nicht normalisierte Eingaben. */
function cleanName(name: string): string {
  return foldToAscii(String(name ?? ""))
    .trim()
    .replace(/[\s_.]+/g, "-")
    .replace(/[^a-z0-9-]/g, "")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "");
}

const CONSONANT = "bcdfghjklmnpqrstvwxz";
const VOWEL = "aeiouy";

/**
 * Schreibvarianten, die bei der Markenrecherche mitgesucht werden sollten.
 * Reihenfolge: Bindestrich/zusammen, ae/ä oe/ö ue/ü, ph/f, c/k/z, i/y, Doppelkonsonanten,
 * dann phonetische Zwillinge aus phonetics.ts. Ohne den Namen selbst, dedupliziert, höchstens 12.
 */
export function spellingVariants(name: string): string[] {
  const base = cleanName(name);
  if (!base) return [];
  const out: string[] = [];
  const seen = new Set<string>([base]);
  const add = (v: string) => {
    const t = v.replace(/-+/g, "-").replace(/^-+|-+$/g, "");
    if (t.replace(/-/g, "").length < 2 || seen.has(t)) return;
    seen.add(t);
    out.push(t);
  };

  // Bindestrich und Zusammenschreibung
  if (base.includes("-")) add(base.replace(/-/g, ""));

  // ae/ä, oe/ö, ue/ü (die Eingabe ist schon ausgeschrieben, also zurück zum Umlaut)
  if (/ae|oe|ue/.test(base)) {
    add(base.replace(/ae/g, "ä").replace(/oe/g, "ö").replace(/ue/g, "ü"));
  }

  // ph/f
  if (base.includes("ph")) add(base.replace(/ph/g, "f"));
  if (/(?<!f)f(?!f)/.test(base)) add(base.replace(/(?<!f)f(?!f)/g, "ph"));

  // c/k/z: c vor e/i/y klingt wie z, sonst wie k; ck wie k
  if (base.includes("ck")) add(base.replace(/ck/g, "k"));
  if (/c(?![hk])/.test(base)) {
    add(base.replace(/c(?![hk])(?=([eiy])?)/g, (_m, soft?: string) => (soft ? "z" : "k")));
  }
  if (/(?<!c)k/.test(base)) add(base.replace(/(?<!c)k/g, "c"));
  if (/(?<!z)z(?=[eiy])/.test(base)) add(base.replace(/(?<!z)z(?=[eiy])/g, "c"));

  // i/y
  if (base.includes("i")) add(base.replace(/i/g, "y"));
  if (base.includes("y")) add(base.replace(/y/g, "i"));

  // Doppelkonsonanten: zusammenziehen, sonst den ersten Konsonanten zwischen Vokalen verdoppeln
  const doubled = new RegExp(`([${CONSONANT}])\\1`, "g");
  if (base.match(doubled)) {
    add(base.replace(doubled, "$1"));
  } else {
    const single = new RegExp(`([${VOWEL}])([${CONSONANT}])(?=[${VOWEL}])`);
    if (single.test(base)) add(base.replace(single, "$1$2$2"));
  }

  // Phonetische Zwillinge (phonetics.ts arbeitet ohne Bindestrich)
  for (const twin of generatePhoneticTwins(base)) add(twin);

  return out.slice(0, MAX_VARIANTS);
}

/** Suchbegriff für MARKE=: ohne Bindestrich (DPMA gleicht Trennzeichen aus), ab 4 Zeichen mit ?…? */
function dpmaTerm(value: string): string {
  const v = value.replace(/-/g, "");
  return v.length >= 4 ? `?${v}?` : v;
}

/**
 * DPMA-Expertensuchstring, z. B.
 * `(MARKE=?wachwerk? ODER MARKE=?wachwerc?) UND (KL=09 ODER KL=42)`
 */
export function buildDpmaExpertQuery(name: string, variants: string[], classes: number[]): string {
  const terms: string[] = [];
  for (const v of [cleanName(name), ...variants]) {
    if (!v) continue;
    const t = dpmaTerm(v);
    if (t && !terms.includes(t)) terms.push(t);
  }
  const marke = terms.map((t) => `MARKE=${t}`).join(" ODER ");
  const kl = classes.map((c) => `KL=${String(c).padStart(2, "0")}`).join(" ODER ");
  if (!marke) return kl ? `(${kl})` : "";
  return kl ? `(${marke}) UND (${kl})` : `(${marke})`;
}

function suggestClasses(name: string, description: string): TrademarkClass[] {
  return analyzeTrademarkSafety(name, description).niceClasses.map((c) => ({
    number: c.classNumber,
    title: c.title,
    reason: c.reason,
  }));
}

function resolveClasses(name: string, description: string, wanted?: number[]): TrademarkClass[] {
  const suggested = suggestClasses(name, description);
  if (!wanted) return suggested;
  const valid = [...new Set(wanted.filter((n) => Number.isInteger(n) && n >= 1 && n <= 45))].sort(
    (a, b) => a - b,
  );
  if (valid.length === 0) return suggested;
  return valid.map((n) => {
    const s = suggested.find((c) => c.number === n);
    return {
      number: n,
      title: s?.title ?? `Klasse ${n} · ${NICE_HEADINGS[n]}`,
      reason: s ? s.reason : "Vorgegeben.",
    };
  });
}

function buildLinks(name: string): TrademarkLink[] {
  const q = encodeURIComponent(name);
  return [
    {
      office: "DPMA",
      label: "DPMAregister Schnellsuche",
      url: `https://register.dpma.de/DPMAregister/marke/erweitert?fromSmartSearch=true&queryString=${q}`,
      what: "Deutsche Marken sowie Unions- und IR-Marken mit Schutz in Deutschland. Vorausgefüllt; sucht den Begriff in Marke, Inhaber und Aktenzeichen. Keine Ähnlichkeitssuche.",
    },
    {
      office: "DPMA",
      label: "DPMAregister Expertenrecherche",
      url: "https://register.dpma.de/DPMAregister/marke/experte",
      what: "Nicht vorausgefüllt: den Expertensuchstring kopieren und ins Eingabefeld einfügen. Findet Schreibvarianten über Platzhalter.",
    },
    {
      office: "TMview",
      label: "TMview",
      url: `https://www.tmdn.org/tmview/#/tmview/results?page=1&pageSize=30&criteria=C&basicSearch=${q}`,
      what: "Marken vieler Ämter in einer Suche (EU-Ämter, EUIPO, WIPO und weitere). Vorausgefüllt mit „Wortlaut enthält“.",
    },
    {
      office: "EUIPO",
      label: "EUIPO eSearch plus",
      url: `https://euipo.europa.eu/eSearch/#basic/1+1+1+1/100+100+100+100/${q}`,
      what: "Unionsmarken (EU-weit). Vorausgefüllte Namenssuche.",
    },
    {
      office: "WIPO",
      label: "WIPO Global Brand Database",
      url: "https://branddb.wipo.int/en/quicksearch",
      what: "International registrierte Marken (Madrid) und viele nationale Register. Nicht vorausgefüllt: den Namen selbst eintragen. Die Seite startet mit einer kurzen automatischen Browser-Prüfung.",
    },
    {
      office: "TMDB",
      label: "TMDB",
      url: `https://tmdb.eu/de/suche/marken?q=${q}&mode%5B%5D=fts`,
      what: "Private kostenlose Suche (IP Central GmbH) über Daten von EUIPO, DPMA, IGE, WIPO und USPTO, ohne Gewähr. Vorausgefüllt; einen voreingestellten Zeitraumfilter gegebenenfalls entfernen.",
    },
    {
      office: "USPTO",
      label: "USPTO Trademark Search",
      url: "https://tmsearch.uspto.gov/",
      what: "US-Marken. Nicht vorausgefüllt: den Namen selbst eintragen.",
    },
    {
      office: "Zefix",
      label: "Zefix (Schweizer Handelsregister)",
      url: "https://www.zefix.admin.ch/de/search/entity/welcome",
      what: "Firmennamen im Schweizer Handelsregister, kein Markenregister. Nicht vorausgefüllt: den Namen selbst eintragen.",
    },
    {
      office: "Handelsregister",
      label: "handelsregister.de (Gemeinsames Registerportal)",
      url: "https://www.handelsregister.de/rp_web/welcome.xhtml",
      what: "Deutsche Firmennamen (Handels- und Unternehmensregister), kein Markenregister. Nicht vorausgefüllt: den Namen selbst eintragen; die erweiterte Suche findet auch ähnliche Firmennamen.",
    },
  ];
}

function buildChecklist(classes: TrademarkClass[]): string[] {
  const kl = classes.map((c) => c.number).join(", ");
  return [
    "Identische Marken suchen: den Namen im DPMAregister, in EUIPO eSearch plus und in TMview eingeben (Deutschland, EU und international registrierte Marken mit Schutz in Deutschland).",
    "Ähnliche Marken suchen: alle Schreibvarianten und klangähnliche Formen prüfen. Das DPMAregister hat keine Ähnlichkeitssuche, dafür hilft der Expertensuchstring mit Platzhaltern.",
    `Waren- und Dienstleistungsklassen festlegen (Vorschlag: ${kl || "keine"}) und Treffer in gleichen oder ähnlichen Klassen besonders genau ansehen.`,
    "International registrierte Marken mit Schutz in Deutschland zusätzlich in der WIPO Global Brand Database prüfen.",
    "Unternehmenskennzeichen prüfen: gleiche oder ähnliche Firmennamen im Handelsregister und im Unternehmensregister suchen.",
    "Im Internet nach dem Namen suchen (Suchmaschinen, App Stores, Domains), denn auch nicht eingetragene Kennzeichen und Werktitel können Rechte begründen.",
    "Bei Treffern oder Zweifeln vor der Anmeldung eine Patentanwältin oder einen Anwalt für Markenrecht fragen.",
  ];
}

/**
 * Vorbereitung der Markenrecherche ohne Netzwerkabfrage.
 * Status ist immer "not_checked": Markenfrei prüft keine Markenregister.
 */
export function trademarkPrep(
  name: string,
  opts: { description?: string; classes?: number[] } = {},
): TrademarkPrep {
  const clean = cleanName(name);
  const variants = spellingVariants(clean);
  const classes = resolveClasses(clean, opts.description ?? "", opts.classes);
  return {
    status: "not_checked",
    note: TRADEMARK_PREP_NOTE,
    links: buildLinks(clean),
    dpmaExpertQuery: buildDpmaExpertQuery(
      clean,
      variants,
      classes.map((c) => c.number),
    ),
    variants,
    classes,
    checklist: buildChecklist(classes),
  };
}
