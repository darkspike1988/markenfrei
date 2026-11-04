# Markenfrei v1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans (native, in this session). Steps use checkbox (`- [ ]`) syntax.

**Goal:** Markenfrei so fertigstellen, dass es als öffentliches, LLM-freies Schnellcheck-Tool mit MCP-Schnittstelle betrieben werden kann ("v1" = alles unter "Jetzt" und "Als Nächstes" in `ROADMAP.md`).

**Architecture:** Next.js App Router, reine Funktionen in `src/lib/`, dünne Route Handler in `src/app/api/`. Neue Querschnittsfunktionen (Namensnormalisierung, Endungen, Rate-Limit, Cache, öffentliches Berichtsschema) werden eigene kleine Module mit Unit-Tests. Der MCP-Server wird einmal gebaut (`src/mcp/server.ts`) und von stdio und HTTP gemeinsam genutzt.

**Tech Stack:** TypeScript, Next.js 16, `node:test` über `tsx` (keine neue Abhängigkeit), `@modelcontextprotocol/sdk` 1.x (`WebStandardStreamableHTTPServerTransport`, `registerTool`), `zod`.

**Spec:** `ROADMAP.md` (Abschnitte "Jetzt", "Als Nächstes"). Die Abschnitt "Später" ist nicht Teil von v1.

## Global Constraints

- Kein LLM im Produkt, keine Konten, kein Tracking, keine Speicherung von Suchanfragen.
- Antworten und UI-Texte auf Deutsch, Umlaute korrekt.
- Offene Quellen ohne Schlüssel. `GITHUB_TOKEN` ist optional.
- Ein "unknown"-Ergebnis wird nie gecacht und nie als "frei" gewertet.
- Grün nur bei vollständiger Prüfung und Score ≥ 80 (Score bleibt bei Unvollständigkeit ≤ 79).
- Tests laufen offline und deterministisch (Netzwerk gestubbt, Uhr injiziert).
- Commit je Aufgabe auf dem Branch, nichts pushen.

## Review Focus

1. Namen mit Umlauten oder ß (`Müller`, `Größe`) ergeben heute `mller` und `gre`; erwartet `mueller` und `groesse`.
2. Namen, die als Domain-Label ungültig sind (`-foo-`, nur Bindestriche, länger als 63 Zeichen, `foo.bar`) bekommen eine klare Fehlermeldung statt einer stillen Verfälschung.
3. Endungen als `.DE`, doppelt oder unbekannt (`constructor`, `xyz`) werden normalisiert oder mit 400 abgelehnt, nie ungeprüft durchgereicht.
4. MCP-HTTP: Benachrichtigungen ohne `id` (`notifications/initialized`) bekommen 202 ohne Body, ungültiges JSON bekommt -32700, nicht 500.
5. Bei Rate-Limit (429) zeigt die UI eine verständliche Meldung statt "Prüfung fehlgeschlagen".
6. Quellen, die zeitweise nicht antworten, werden nicht gecacht, sonst bleibt ein "unknown" minutenlang haften.

---

### Task 1: Test-Infrastruktur und erste Tests

**Files:**
- Modify: `package.json` (Script `test`), `.github/workflows/ci.yml` (Schritt `npm test`)
- Create: `tests/scoring.test.ts`, `tests/phonetics.test.ts`, `tests/inventory.test.ts`

**Interfaces:**
- Produces: `npm test` = `tsx --test tests/*.test.ts`; Tests importieren mit `@/…`-Alias (tsx liest `tsconfig.json` paths).

- [ ] **Step 1:** Test `tests/scoring.test.ts`: `computeWeightedClearanceScore({word:"fokusnova", domainAvailableRatio:1, primaryDomainsFree:true, tmRiskScore:9, appStoreScore:10, socialDevScore:10})` liefert `verdict === "grün"` und `totalScore >= 80`; mit `tmRiskScore:1` liefert `verdict === "rot"` und `totalScore <= 42`.
- [ ] **Step 2:** Test `tests/phonetics.test.ts`: `koelnerPhonetik("Müller")` ist gleich `koelnerPhonetik("Mueller")`; `analyzeTrademarkSafety("google").protectedCollisions[0].matchType === "identisch"`; `analyzeTrademarkSafety("zzqxkvjw").protectedCollisions.length === 0`.
- [ ] **Step 3:** Test `tests/inventory.test.ts`: jeder Eintrag in `OPEN_APIS` mit Protokoll `RDAP…` hat einen Endpunkt, dessen Basis (ohne `{domain}`) in `Object.values(RDAP_BASE)` vorkommt.
- [ ] **Step 4:** Script `"test": "tsx --test tests/*.test.ts"` eintragen, CI-Schritt nach Lint ergänzen. Run: `npm test`. Expected: alle PASS (fällt `koelnerPhonetik("Müller")` durch, ist das ein Befund für Task 2, dann den Test dort anpassen).
- [ ] **Step 5:** Commit `test: add node:test setup with scoring, phonetics and inventory tests`.

### Task 2: Namensnormalisierung und Endungen

**Files:**
- Create: `src/lib/name.ts`, `src/lib/tlds.ts`, `tests/name.test.ts`, `tests/tlds.test.ts`
- Modify: `src/lib/clearance.ts` (`performClearanceCheck` nutzt beide), `src/app/api/clearance/route.ts` (400 bei Fehler), `src/app/page.tsx` (`clean` ersetzen), `src/lib/phonetics.ts` (`analyzeTrademarkSafety` normalisiert gleich)

**Interfaces:**
- Produces: `normalizeName(raw: string): { ok: true; name: string } | { ok: false; error: string }`; `SUPPORTED_TLDS: readonly string[]` (`de com net app dev io ai fr uk kr`); `parseTlds(input: unknown): { ok: true; tlds: string[] } | { ok: false; error: string }` (Standard bei leerer Eingabe `["de","com","app","ai","io"]`, höchstens 8, kleingeschrieben, ohne Punkt, ohne Duplikate).

- [ ] **Step 1:** Tests `tests/name.test.ts`: `normalizeName("Müller")` → `mueller`; `"Größe"` → `groesse`; `"ÄÖÜ"` → `aeoeue`; `"Foo Bar"` → `foobar`; `"wachwerk.de"` → `wachwerk`; `"-foo-"` → `ok:false`; `"a"` → `ok:false`; 64 Zeichen → `ok:false`; `""` → `ok:false`.
- [ ] **Step 2:** Tests `tests/tlds.test.ts`: `[".DE","de","com"]` → `["de","com"]`; `["constructor"]` → `ok:false`; neun Endungen → `ok:false`; `undefined` → Standardliste.
- [ ] **Step 3:** Run `npm test`, erwartet FAIL (Module fehlen).
- [ ] **Step 4:** Implementieren. Umlaute: `ä→ae ö→oe ü→ue ß→ss`, dann NFD und Akzente entfernen, dann `[^a-z0-9-]` entfernen, Bindestriche am Rand verbieten, Länge 2 bis 63.
- [ ] **Step 5:** `performClearanceCheck` wirft bei `ok:false` einen `ClearanceInputError` (neue Klasse in `clearance.ts`); die Route antwortet dann mit 400 und der Fehlertext. `page.tsx` nutzt `normalizeName` (bei Fehler Meldung anzeigen).
- [ ] **Step 6:** Run `npm test && npx tsc --noEmit`, erwartet PASS. Commit `feat: normalize names with umlaut transliteration and validate TLDs`.

### Task 3: Rate-Limit

**Files:**
- Create: `src/lib/rate-limit.ts`, `tests/rate-limit.test.ts`
- Modify: `src/app/api/clearance/route.ts`, `opendata-words/route.ts`, `rea-inspect/route.ts`, `mcp/route.ts`, `src/app/page.tsx` (Meldung bei 429), `README.md`

**Interfaces:**
- Produces: `createRateLimiter(opts: {limit: number; windowMs: number; now?: () => number}): { check(key: string): { allowed: boolean; retryAfterSec: number } }`; `clientKey(req: Request): string` (erste Adresse aus `x-forwarded-for`, sonst `"local"`); `limitedResponse(retryAfterSec: number): Response` (429, Header `Retry-After`, JSON `{error}` auf Deutsch).
- Konfiguration: `MARKENFREI_RATE_LIMIT` (Anfragen pro Minute und IP, Standard 30).

- [ ] **Step 1:** Tests: bei `limit:2` sind Aufrufe 1 und 2 erlaubt, 3 abgelehnt mit `retryAfterSec >= 1`; nach `windowMs` wieder erlaubt (injizierte Uhr); zwei Schlüssel zählen getrennt.
- [ ] **Step 2:** Run, FAIL. Implementieren (Fixed Window in `Map`, alte Einträge beim Prüfen entfernen). Hinweis in README: pro Prozess, bei mehreren Instanzen zusätzlich am Reverse-Proxy begrenzen.
- [ ] **Step 3:** In die vier Routen einhängen (vor der Arbeit prüfen). `page.tsx`: bei Status 429 Fehlermeldung "Zu viele Anfragen, bitte in N Sekunden erneut versuchen".
- [ ] **Step 4:** Run `npm test`, PASS. Commit `feat: add per-IP rate limit to public API routes`.

### Task 4: Cache für Quellenabfragen

**Files:**
- Create: `src/lib/cache.ts`, `tests/cache.test.ts`
- Modify: `src/lib/clearance.ts` (Wikidata, Wikipedia, DuckDuckGo, iTunes-Suche, Dev-Namensräume, RDAP), `src/lib/rea.ts` (Bundle-Abfragen)

**Interfaces:**
- Produces: `createTtlCache<T>(opts: {ttlMs: number; max: number; now?: () => number}): { get(key: string): T | undefined; set(key: string, value: T): void }`; `cachedLookup<T>(cache, key, fn: () => Promise<T>, isDefinitive: (v: T) => boolean): Promise<T>` speichert nur, wenn `isDefinitive` wahr ist.
- Konfiguration: Standard-TTL 10 Minuten, höchstens 500 Einträge.

- [ ] **Step 1:** Tests: Wert vor Ablauf gleich, nach Ablauf `undefined` (injizierte Uhr); bei `max:2` fliegt der älteste Eintrag raus; `cachedLookup` ruft `fn` bei zweitem Aufruf nicht erneut auf, wenn definitiv; ruft `fn` erneut auf, wenn `isDefinitive` falsch (z. B. Status `unknown`).
- [ ] **Step 2:** Run, FAIL. Implementieren.
- [ ] **Step 3:** Einsetzen: Definitiv sind `available`/`taken` und Antworten mit `ok:true`. Nie cachen: `unknown`, `ok:false`.
- [ ] **Step 4:** Run `npm test`, PASS. Commit `feat: cache definitive source lookups for ten minutes`.

### Task 5: Ein MCP-Server für stdio und HTTP

**Files:**
- Create: `src/lib/public-report.ts`, `tests/public-report.test.ts`, `tests/mcp-http.test.ts`
- Modify: `src/mcp/server.ts` (`registerTool` statt `server.tool`, strukturierte Antworten), `src/app/api/mcp/route.ts` (ersetzen durch Transport), `src/app/api/README.md`

**Interfaces:**
- Produces: `toPublicReport(report: ClearanceReport): PublicReport` (stabiles Schema: `name`, `checkedAt`, `verdict`, `score`, `incomplete: string[]`, `categories: {domain, trademark, appStore, packages: Tone}`, `domains: {tld, status}[]`, `signals: {tone, text}[]`); `POST(req: Request): Promise<Response>` in der Route reicht an `WebStandardStreamableHTTPServerTransport({sessionIdGenerator: undefined})` weiter, zustandslos, pro Anfrage ein Server.
- Consumes: `createMarkenfreiMcpServer()` aus `src/mcp/server.ts`.

- [ ] **Step 1:** Test `tests/mcp-http.test.ts` mit gestubbtem `fetch`: `initialize` → 200 mit `serverInfo.name`; `tools/list` → fünf Tool-Namen; `notifications/initialized` ohne `id` → Status 202; ungültiges JSON → Fehlercode -32700; `tools/call markenfrei_domain_pricing` mit `domainOrTld:"constructor"` → `isError:true`.
- [ ] **Step 2:** Test `tests/public-report.test.ts`: `toPublicReport` enthält `categories` mit genau den vier Schlüsseln und keine `aiGroundedTm`-Felder; Ergebnis ist JSON-serialisierbar.
- [ ] **Step 3:** Run, FAIL. Implementieren; die Route behält Rate-Limit aus Task 3 und lässt `Accept: application/json, text/event-stream` zu.
- [ ] **Step 4:** Run `npm test && npm run build`, PASS. Commit `refactor: serve MCP over HTTP from the shared server with the SDK transport`.

### Task 6: Schnellcheck-Zeile und JSON-Export

**Files:**
- Modify: `src/lib/verdict.ts` (`categoryStatus`, `topSignals`), `src/components/result-row.tsx`, `src/app/page.tsx` (Export-Schaltfläche JSON), `src/components/detail-panel.tsx` (Hinweis bei `incomplete`)
- Test: `tests/verdict.test.ts`

**Interfaces:**
- Produces: `categoryStatus(r: ClearanceReport): { domain: Tone; trademark: Tone; appStore: Tone; packages: Tone }`; `topSignals(r: ClearanceReport, n = 3): Signal[]`.
- Consumes: `toPublicReport` aus Task 5 für den JSON-Export (Dateiname `markenfrei-<name>.json`).

- [ ] **Step 1:** Tests mit handgebauten Berichten: Markenkollision `identisch` → `trademark: "bad"`; alle Domains `taken` → `domain: "bad"`; mindestens eine frei, eine unknown → `"warn"`; App-Store-Kollision → `appStore: "bad"`; npm vergeben → `packages: "warn"`; `topSignals(r, 3).length <= 3` und schwerwiegendste zuerst.
- [ ] **Step 2:** Run, FAIL. Implementieren; `ResultRow` zeigt vier beschriftete Punkte (Domain, Marke, App Store, Pakete, mit `aria-label`) und die drei wichtigsten Gründe statt einem.
- [ ] **Step 3:** Run `npm test && npx eslint src`, PASS. Commit `feat: show four-point quick check and top reasons per result`.

### Task 7: Endungen in der UI, Preisstand, ehrliche Texte

**Files:**
- Modify: `src/app/page.tsx` (`TLDS = SUPPORTED_TLDS`), `src/lib/domain-pricing.ts` (`PRICING_AS_OF`, Anzeige), `src/components/detail-panel.tsx`, `src/app/page.tsx` (Überschrift und Untertitel), `src/mcp/server.ts` und `src/lib/open-apis.ts` (Beschreibungen), `README.md`
- Test: `tests/pricing.test.ts`

**Interfaces:**
- Produces: `PRICING_AS_OF: string` (ISO-Datum) und Feld `asOf` in `TldPriceComparison`.

- [ ] **Step 1:** Test: `compareDomainPrices("foo.com").asOf === PRICING_AS_OF`; `compareDomainPrices("foo.constructor")` ist `null`.
- [ ] **Step 2:** Implementieren. Texte: Überschrift bleibt kurz, der Untertitel sagt, dass Domains, App Stores, Pakete und bekannte Marken geprüft werden und Markenregister manuell nachzuprüfen sind; MCP-Beschreibung von `markenfrei_clearance_check` und `markenfrei_domain_pricing` ohne "echte" Preise und mit Stand-Datum.
- [ ] **Step 3:** Run `npm test && npm run build`, PASS. Commit `feat: offer all supported TLDs, show price date and align copy with scope`.

### Task 8: Markenregister klären (Recherche, kein Code)

**Files:**
- Create: `docs/trademark-registers.md`

- [ ] **Step 1:** Je Register (EUIPO, DPMA, USPTO, WIPO, TMview) prüfen, ob es eine Schnittstelle ohne Schlüssel gibt (Dokumentation lesen und, wo möglich, mit `curl` gegen einen bekannten Markennamen testen).
- [ ] **Step 2:** Ergebnis als Tabelle festhalten (Schnittstelle, Schlüssel nötig ja/nein, getestet ja/nein, Befund). Nur Belegtes eintragen, Offenes als "nicht geprüft" markieren.
- [ ] **Step 3:** Ist ein Register ohne Schlüssel zuverlässig abfragbar, nur dann als zusätzliche Quelle einbauen (eigene Aufgabe mit Test); sonst Entscheidung für Nutzer in `ROADMAP.md` festhalten. Commit `docs: assess trademark register APIs`.

### Task 9: Abschluss

**Files:**
- Modify: `ROADMAP.md` (Status), `README.md`, `CONTRIBUTING.md` (Tests, Umgebungsvariablen)

- [ ] **Step 1:** `npm run lint && npx tsc --noEmit && npm test && npm run build`, erwartet ohne Fehler.
- [ ] **Step 2:** Live-Test gegen `next start`: ein Name mit Umlaut, ein vergebener Name, ein freier Name, MCP `tools/call`, 31 Anfragen in einer Minute → 429.
- [ ] **Step 3:** `ROADMAP.md` auf den tatsächlichen Stand bringen. Commit `docs: update roadmap and contributing for v1`.

---

## Self-Review

- **Spec-Abdeckung (ROADMAP "Jetzt"):** Rate-Limit und Endungsgrenze → Tasks 2, 3. Tests → Task 1 und je Task. MCP einheitlich → Task 5. GitHub-Token und Caching → Task 4 (Token war schon optional, Doku in Task 9). Preisdatum → Task 7. Claim-Texte → Task 7. **"Als Nächstes":** Vier-Punkte-Zeile, Gründe → Task 6. Markenregister → Task 8. `.fr/.uk/.kr` → Task 7. JSON-Export → Tasks 5, 6.
- **Typkonsistenz:** `Tone` kommt aus `verdict.ts`; `toPublicReport` (Task 5) nutzt `categoryStatus` (Task 6). Task 5 darf `categoryStatus` daher nicht vor Task 6 erwarten: Reihenfolge ist Task 6 vor Task 5, siehe Ausführung.
- **Reihenfolge:** 1, 2, 3, 4, 6, 5, 7, 8, 9.
