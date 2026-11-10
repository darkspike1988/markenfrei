# Beitragen zu Markenfrei

Danke für dein Interesse. Markenfrei ist Open Source (MIT-Lizenz). Fehlerberichte, neue
Quellen und Korrekturen sind willkommen. Wir erwarten einen respektvollen, sachlichen Umgang.

Verbindlich für Verhalten und Texte ist [docs/v2-spec.md](docs/v2-spec.md). Kurz: kein LLM im
Produkt, keine Konten, kein Personen-Tracking (nur anonyme Seitenzählung ohne Cookies, ohne Namen), keine Speicherung von Suchanfragen, nur offene Quellen
ohne Schlüssel, ehrliche Texte („nicht gefunden“ statt „frei“, Marke immer „nicht geprüft“).

---

## Entwicklungsumgebung

Voraussetzung: Node.js 20.9 oder neuer.

```bash
git clone https://github.com/darkspike1988/markenfrei.git
cd markenfrei
npm install
npm run dev   # http://localhost:3000
```

Den MCP-Server startest du ohne Build direkt aus den Quellen mit `npm run mcp` (stdio, über
tsx). Das veröffentlichbare Bündel entsteht mit `npm run build:mcp` in `mcp/dist/`.

Die Kommandozeile startest du mit `npm run cli -- check wachwerk` (siehe README, Abschnitt
Kommandozeile). Nicht in Schleifen aufrufen: die Abfragebudgets gelten nur je Prozess.

---

## Aufbau

| Pfad | Inhalt |
|---|---|
| `src/lib/engine/check.ts` | Einstieg der Engine: `checkName`, `checkNames`, `resolveSources`, Grenzwerte (`MAX_NAMES`, `MAX_TLDS`), `NameReport` |
| `src/lib/engine/types.ts` | Vertrag aller Quellen: `Status`, `Namespace`, `Source`, `SourceResult`, HTTP-Typen |
| `src/lib/engine/verdict.ts` | Ampel (`computeVerdict`), Rangliste (`rankReports`) und Labels |
| `src/lib/engine/http.ts` | HTTP-Client mit Semaphor pro Host, Bündelung, Timeout, Deadline und Größenlimit; User-Agent |
| `src/lib/engine/sources/` | Quellen nach Namensraum: `domains.ts`, `packages.ts`, `stores-social.ts`, `known-names.ts` |
| `src/lib/engine/trademark-prep.ts` | Recherche-Vorbereitung für Marken (ohne Netz) |
| `src/lib/engine/report-schema.ts` | zod-Schemas des Berichts für das MCP-`outputSchema` |
| `src/lib/name.ts`, `src/lib/phonetics.ts` | Namensnormalisierung; Kölner Phonetik, Marken-Heuristik, Varianten, Klassenregeln |
| `src/lib/cache.ts`, `src/lib/rate-limit.ts` | Cache im Arbeitsspeicher; Rate-Limit pro IP |
| `src/lib/opendata.ts` | Wortfeld und regelbasierte Vorschläge für „Keine Idee?“ und `markenfrei_suggest_names` |
| `src/app/` | Oberfläche (`page.tsx`, `/quellen`, `/mcp`) und Routen unter `api/` |
| `src/components/` | Komponenten der Oberfläche; `checker.tsx` ist die Client-Komponente (Formular `check-form.tsx`, Prüflauf `use-check-run.ts`, Ergebnisse `check-results.tsx`) |
| `src/mcp/` | MCP-Server (`server.ts`) und stdio-Start (`cli.ts`) |
| `src/cli/` | Kommandozeile `markenfrei check` (`run.ts` mit ersetzbaren Abhängigkeiten, `main.ts` als Einstieg); lädt das MCP-SDK nicht und hat keine eigene Quellenliste |
| `src/lib/engine/format.ts` | Textausgabe (`formatReport`, `formatRanking`) und Shortlist-Vorbereitung, gemeinsam für MCP und CLI; `src/mcp/server.ts` exportiert sie weiter |
| `mcp/` | npm-Paket `markenfrei-mcp`: Build-Skript, Pakettest, `server.json` |

Die Oberfläche bekommt von der Server-Komponente nur reine Daten. Engine-Code gehört nicht
ins Client-Bundle.

### Neue Quelle aufnehmen

1. Quelle als `Source` in der passenden Datei unter `src/lib/engine/sources/` anlegen, mit
   `id`, `namespace`, `label`, `description`, `endpoint` und `defaultEnabled`.
2. Jede Antwort auf genau einen Status abbilden. Was nicht eindeutig ist, wird `unknown`
   oder `similar`, nie `not_found`.
3. Bei unscharfen oder indirekten Quellen im `SourceResult` `weak: true` setzen; ein Treffer
   ergibt dann höchstens Gelb.
4. Mit einem bekannten und einem sicher nicht vergebenen Testnamen (z. B. `zzqxkvjwabc`)
   live gegenprüfen und das im Kommentar festhalten.
5. Tests mit gestubbtem HTTP ergänzen.

---

## Tests und Prüfungen

```bash
npm test                  # alle tests/*.test.ts mit node:test über tsx
npx tsx --test tests/engine-check.test.ts   # eine Datei
npm run lint              # ESLint
npx tsc --noEmit          # Typen
npm run build             # Next.js-Build
npm run build:mcp         # MCP-Bündel
npm run test:mcp-package  # npm pack, entpacken, Start aus fremdem Verzeichnis
npm run e2e               # Playwright gegen den Build (zuerst npm run build): Oberfläche und axe-Prüfung
npm run probe:live        # Live-Probe der Quellen mit echtem Netz (nicht in der normalen CI)
```

Die Tests in `tests/` laufen ohne Netz: `fetch` bzw. der HTTP-Client wird gestubbt, die Uhr injiziert.
Die End-to-End-Tests in `e2e/` starten `next start` und stubben `POST /api/check` mit einem echten,
aber netzlosen Bericht der Engine (`e2e/helpers.ts`); sie prüfen Ampel, Shortlist, Wiederholung bei
Lücken, Exporte, Tastaturbedienung und WCAG-2.1-AA-Regeln mit axe. Einmalig `npx playwright install chromium`.
Die CI (`.github/workflows/ci.yml`) führt `npm audit`, Lint, Typen, Tests, MCP-Build, Pakettest, den
Next.js-Build und die End-to-End-Tests aus. `.github/workflows/live-probe.yml` fragt montags (`scripts/live-probe.ts`)
jede Quelle aus `STATIC_SOURCES` außer den beiden netzlosen (`known_brands`, `wikidata_brands`) sowie die Domain-Registries
für .de, .com und .io mit einem bekannten vergebenen und einem Zufallsnamen ab. Er meldet Warnungen, wenn ein Dienst
Endpunkt oder Format ändert, und schlägt nur bei npm, PyPI und crates.io sowie bei fehlendem Eintrag fehl. Neue Quelle:
Kanariennamen in `CANARIES` in `src/lib/probe-canaries.ts` ergänzen (oder dort begründet als Ausnahme eintragen);
ohne Eintrag scheitern Probe und `tests/probe-canaries.test.ts`.

---

## Pull Requests

1. Feature-Branch anlegen, z. B. `git checkout -b feature/neue-quelle`.
2. Die Prüfungen oben ausführen.
3. Commit-Nachrichten nach Conventional Commits, z. B. `feat: Endung .se aufnehmen`.
4. Pull Request gegen `main` stellen.

---

## Lizenz

Mit deinem Beitrag erklärst du dich einverstanden, dass er unter der MIT-Lizenz steht.
