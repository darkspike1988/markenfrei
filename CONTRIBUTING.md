# Beitragen zu Markenfrei

Danke für dein Interesse. Markenfrei ist Open Source (MIT-Lizenz). Fehlerberichte, neue
Quellen und Korrekturen sind willkommen. Wir erwarten einen respektvollen, sachlichen Umgang.

Verbindlich für Verhalten und Texte ist [docs/v2-spec.md](docs/v2-spec.md). Kurz: kein LLM im
Produkt, keine Konten, kein Tracking, keine Speicherung von Suchanfragen, nur offene Quellen
ohne Schlüssel, ehrliche Texte („nicht gefunden“ statt „frei“, Marke immer „nicht geprüft“).

---

## Entwicklungsumgebung

Voraussetzung: Node.js 20.9 oder neuer.

Solange das GitHub-Repository nicht öffentlich ist, braucht `git clone` Zugriff darauf.

```bash
git clone https://github.com/darkspike1988/markenfrei.git
cd markenfrei
npm install
npm run dev   # http://localhost:3000
```

Den MCP-Server startest du ohne Build direkt aus den Quellen mit `npm run mcp` (stdio, über
tsx). Das veröffentlichbare Bündel entsteht mit `npm run build:mcp` in `mcp/dist/`.

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
| `src/components/` | Komponenten der Oberfläche; `checker.tsx` ist die Client-Komponente |
| `src/mcp/` | MCP-Server (`server.ts`) und stdio-Start (`cli.ts`) |
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
```

Die Tests laufen ohne Netz: `fetch` bzw. der HTTP-Client wird gestubbt, die Uhr injiziert.
Die CI (`.github/workflows/ci.yml`) führt Lint, Tests, MCP-Build, Pakettest und den
Next.js-Build aus.

---

## Pull Requests

1. Feature-Branch anlegen, z. B. `git checkout -b feature/neue-quelle`.
2. Die Prüfungen oben ausführen.
3. Commit-Nachrichten nach Conventional Commits, z. B. `feat: Endung .se aufnehmen`.
4. Pull Request gegen `main` stellen.

---

## Lizenz

Mit deinem Beitrag erklärst du dich einverstanden, dass er unter der MIT-Lizenz steht.
