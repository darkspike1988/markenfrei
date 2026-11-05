# Implementation Readiness Report: `docs/design.md`, Zeilen 204–260 (DetailedRange), Runde 2

Stufe 9 der wiederholten EGM-Review. Drei unabhängige Reviewer ohne Kenntnis der ersten Runde: `egm-implementation-readiness` (Standard: implementation-readiness), `egm-codebase-details` (Standard: implementation-readiness, Abgleich mit dem Code), `egm-style` (ohne Standard). Alle drei haben berichtet (Status: completed). Dieser Bericht fasst ihre Findings zusammen und entfernt Doppelungen. Kennungen: IR = Umsetzungsreife, CB = Codebasis-Details, ST = Stil, mit der Nummer im Roh-Bericht. Bericht der ersten Runde: `review-round-1/implementation_readiness_report.md`.

**Urteil: bedingt umsetzbar, noch nicht ohne Rückfragen.** Kein Blocker (Runde 1: 7 Blocker). 10 Major, 12 Nits nach Zusammenführung. Der Code-Teil (Schritt 1 und 2) ist weitgehend präzise und stimmt mit `src/lib/engine/http.ts` überein; die Mängel liegen bei Randfällen von `instances`, der Testverdrahtung und den Dokumentationsschritten. Zero-Decision-Rule verletzt in R1 bis R4, R7, R8 und R9.

## Geprüft und korrekt

- `HostBudget`, `HOST_BUDGETS`, `takeBudget`, `MAX_BUDGET_WAIT_MS`, `createHttpClient(opts)` und `run` existieren wie beschrieben. `tests/engine-budget.test.ts` enthält `counting()`, `far()` und `beforeEach(resetHostBudgets)`.
- `HF_TOKEN` wird beim Laden in `http.ts:44` gelesen, `MARKENFREI_TRUSTED_PROXIES` in `rate-limit.ts:56`: Beide sind ein passendes Vorbild.
- Alle Rechenbeispiele stimmen (`{18,60000}` mit N = 2, 3, 19 ergibt `{9,…}`, `{6,…}`, `{1,63334}`; `{1,1000}` mit N = 2 ergibt `{1,2000}`).
- Die Dokumentationsziele existieren: `.env.example:38`, README-Tabelle „Umgebungsvariablen“ (Z. 194–203), „Vor dem Livegang“ Punkt 4 und 8, `ROADMAP.md:76`, `src/lib/README.md:36`.
- Die Skripte `test`, `lint`, `build`, `build:mcp`, `test:mcp-package` stehen in `package.json`; die Abnahme deckt die CI-Kette ab. `docker-compose.yml` reicht Variablen per `env_file` durch, dort ist nichts zu ändern.
- Jede Datei im Plan ist mit „ändern“ gekennzeichnet; die Schreib-Allowlist ist im Kern eindeutig (ergänzen: siehe N1).

## 🟡 Major

### R1. Ungültiges `opts.instances` hebt das Budget still auf (Z. 217–221, 212–213)
- `parseInstances` bereinigt nur den Umgebungswert. Die Option `instances?: number` geht ungeprüft an `shareBudget` (Z. 220). `shareBudget(b, 0)` ergibt `floor(max / 0) = Infinity`, also `{Infinity, windowMs}`: das Budget ist aufgehoben. Bei `NaN` oder negativem Wert wird `windowMs` negativ oder `NaN`, der Filter `nowMs - t < windowMs` ist nie wahr, `recent` bleibt leer, es gibt immer „frei“. Bei `2.5` entsteht ein Wert, der keiner ganzen Prozesszahl entspricht. Auch `max <= 0` (Division durch 0 bei `ceil(windowMs × N / max)`) ist offen.
- Das widerspricht dem Dokument selbst („kein fail-open, das die Budgets aufhebt“, Z. 177–178; „nie fälschlich frei“, Z. 141). Die Option ist öffentliche API von `createHttpClient`.
- **Erwartet:** Eine Zeile im Plan, etwa „`shareBudget` normalisiert `instances` zu `Number.isInteger(n) && n >= 1 ? n : 1`“, und Testfälle für `0`, `-1`, `NaN`, `2.5`. (IR M1, CB 2)

### R2. `parseInstances` ist nur über Beispiele definiert (Z. 212, 230–231)
- „Ganze Zahl ab 1, sonst 1“ lässt das Verfahren offen. `Number()` ergibt für `" 3 "` 3, `"1e1"` 10, `"0x10"` 16, `"007"` 7; `parseInt` für `"3abc"` 3 und für `"2.5"` 2 (der Test in Z. 230 erwartet 1); ein Regex `/^\d+$/` für `"+2"` 1. Eine Obergrenze fehlt (`"99999999999999999999"` ist keine sichere ganze Zahl); ob bei ungültigem Wert geloggt wird, ebenso.
- Die Funktionen müssen `export`ieren, damit Schritt 2 sie importieren kann; das steht nicht da.
- **Erwartet:** Algorithmus, zum Beispiel `/^[1-9]\d*$/` plus `Number.isSafeInteger`, Aussage zu Obergrenze und Log, „exportiert“, Testfälle für Leerzeichen, `"1e1"`, `"3abc"`, `"+2"`, `"99999999999999999999"`. (IR M2, CB 8, ST N5)

### R3. Die Eigenschaftsprüfung kann an Gleitkomma-Rundung scheitern (Z. 234–235)
- `rate(shareBudget(b, N)) × N ≤ rate(b)` mit `rate = max / windowMs` rechnet in Gleitkomma. Viele der etwa 300 Fälle (6 Einträge × N = 1 bis 50) gelten exakt mit Gleichheit; bei N = 3, 5, 6, 7 usw. kann das Ergebnis um ein ULP über dem Soll liegen, der Test wird rot, obwohl die Regel stimmt.
- Der Test belegt außerdem nur die mittlere Rate, nicht die Zusage „in jedem Fenster höchstens `max`“ (Z. 129–130).
- **Erwartet:** Ganzzahlform festschreiben, `share.max × N × b.windowMs ≤ b.max × share.windowMs`. Bei den vorkommenden Werten (bis etwa 450 × 50 × 300.000 ≈ 6,75e9) bleibt das unter 2^53. (IR M3, CB 1, ST M5)

### R4. Abnahme, Umgebungsvariable und „unverändert“ passen nicht zusammen (Z. 206–208, 225–226, 236–238, 257–260)
- Die Abnahme verlangt „Mit `MARKENFREI_INSTANCES=2` … im Test aus Schritt 2“. Der Test setzt aber die Option `instances: 2`, nicht die Variable; `opts.instances ?? INSTANCES` bevorzugt die Option. `INSTANCES` wird beim Laden des Moduls gelesen, `tsx --test` startet je Testdatei einen Prozess, eine nach dem Import gesetzte Variable wirkt nicht. Der Lesepfad `process.env → parseInstances → INSTANCES → Standard in createHttpClient` hat keinen Test; ebenso fehlt ein Test „ohne Option bleibt das Verhalten gleich“.
- Wird die Variable für den gesamten `npm test`-Lauf gesetzt, brechen bestehende Tests: `tests/engine-budget.test.ts:45–48` erwartet `[404, 404, "budget", "budget"]` bei `max: 2` und bekäme mit `INSTANCES=2` `{1, …}`, weil `shareBudget` auch auf überschriebene Budgets wirkt. „Standardwert 1 ändert nichts“ gilt nur, wenn die Variable in der Testumgebung ungesetzt ist. „jedes bestehende Verhalten gleich“ (Z. 260) geht über den Beleg hinaus.
- Z. 207–208 („keine bestehenden Tests geändert; die Abnahme verlangt das“) hat keinen klaren Bezug; Z. 257 nennt `tests/rate-limit.test.ts` und `tests/api-guard.test.ts`, die der Plan nicht anfasst: ein Überbleibsel eines früheren Planstands.
- **Erwartet:** Den Lesepfad der Variable testen (Kindprozess oder eigene Testdatei mit gesetzter Variable vor dem Import) oder die Abnahme ausdrücklich auf die Option beziehen; festlegen, ob die Testumgebung die Variable löscht oder die Tests `instances: 1` übergeben; „jedes bestehende Verhalten“ streichen und durch „bei ungesetzter Variable liefern alle bestehenden Tests dieselben Ergebnisse“ ersetzen; `tests/engine-budget.test.ts` als maßgebliche Datei der Abnahme nennen und die zwei anderen Dateien streichen oder begründen. (IR M4, CB 3, CB 10, ST M1, M2, M4)

### R5. „Nur neue Tests anhängen“ ist nicht einhaltbar (Z. 228, 207–208)
- Die neuen Tests brauchen `parseInstances` und `shareBudget`. Die Importzeile in `tests/engine-budget.test.ts` (Z. 3) muss erweitert werden, und die Funktionen müssen exportiert sein. Das kollidiert mit „keine bestehenden Tests geändert“.
- **Erwartet:** Entweder die Importzeile als zulässige Ausnahme nennen oder eine neue Datei (zum Beispiel `tests/engine-instances.test.ts`), die auch den Dateirahmen sauber hält. (IR M5, ST M4)

### R6. Testlücken: `max < N` und mehrere Fenster (Z. 233, 236–238; Soll aus Z. 129–134, 142–144)
- Der einzige Verhaltenstest sendet vier Anfragen in einem Fenster. Er belegt „in jedem Fenster“ nicht. Das Verhalten bei `max < N` ist nicht getestet: verlängerter Abstand (crates.io, N = 2: 2 s), die Engine wartet nur 1,5 s und liefert dann `budget`, Wiedereintritt nach dem verlängerten Fenster.
- **Erwartet:** Test über `createHttpClient` mit `{ max: 1, windowMs: 1000 }`, `instances: 2` und injiziertem `now`: zweite Anfrage bei +1,5 s ergibt `budget`, bei +2,001 s geht sie durch. Dazu ein Zweifenster-Test für `max: 4`, N = 2.
- Rahmenbedingungen nennen: `counting()`, `far()`, `deadlineAt`, `userAgent`, vier verschiedene URLs (gleiche gleichzeitige Anfragen bündelt `createHttpClient` über `inflight` zu einer, `http.ts:348–353`), eindeutige Hostnamen wie `budget5.test` (`budgetLog` ist modulglobal; `x.test` in Z. 236 kollidiert nicht, solange `beforeEach(resetHostBudgets)` greift). Der Beispielaufruf `createHttpClient({ hostBudgets: …, instances: 2 })` in Z. 236 lässt Pflichtfelder weg. (IR M6, CB 9, ST N7)

### R7. Die Dokumentationsschritte sind nicht ausführbar (Z. 222–223, 244–252)
- **README Punkt 4** (Z. 220–221) lautet „Rate-Limit und Cache gelten pro Prozess. Bei mehr als einer Instanz zusätzlich am Proxy begrenzen.“ Ein Satz zu Budgets „pro Prozess“ steht nur in Punkt 8 (Z. 248–249). „ersetzen … ergänzen“ im selben Satz ist widersprüchlich: Die Aussage in Punkt 8 wird mit gesetzter Variable falsch und muss ersetzt, nicht ergänzt werden.
- **`MARKENFREI_GLOBAL_RATE_LIMIT`:** „den Wert 600 / N nennen“ hat keine Zielstelle. Die Variable fehlt in der README-Tabelle (Z. 194–203), sie steht nur in Punkt 7 (Z. 235), `.env.example:36–38` und `src/app/api/README.md:9`, jeweils als „pro Prozess“.
- Weitere Fundstellen derselben Aussage sind nicht erfasst oder nicht als bewusst unberührt gekennzeichnet: README Z. 202 (`MARKENFREI_RATE_LIMIT`: „bei mehreren Instanzen zusätzlich am Reverse-Proxy begrenzen“) und README Punkt 6 (Z. 224–226, „Apple etwa 20“).
- **Wortlaut fehlt:** Tabellenzeile `MARKENFREI_INSTANCES`, Ergänzung in `src/lib/README.md` Z. 36, Kommentar zu `HOST_BUDGETS` (`http.ts:19–23`; der Satz „Gilt pro Prozess: …“ steht in Z. 23, der Kommentarblock reicht bis Z. 35), Text für `.env.example`.
- `src/lib/README.md:36` erwähnt Abfragebudgets bisher gar nicht; „ergänzen“ setzt voraus, dass dort schon ein Budgetbegriff steht.
- `tests/docs-consistency.test.ts` prüft feste Textmuster in `README.md`, `ROADMAP.md` und `.env.example` („ersetzt die Standardquellen“, „Der Container liest keine `.env.local`“, „Produktversion, derzeit …“). Der Plan sollte sie als Randbedingung nennen; Schritt 3 hat keine „Prüfen“-Zeile.
- **Erwartet:** Je Datei Fundstelle (Ankertext statt Zeilennummer) und Zieltext im Wortlaut; ein Prüfkriterium für Schritt 3 (zum Beispiel `npm test` erneut, `600 / N` stimmt mit Schritt 1 überein). (IR M7, CB 4, CB 6, ST M3)

### R8. Die ROADMAP-Änderung ist doppeldeutig (Z. 251–252)
- Die Zeile `ROADMAP.md:76` hat drei Spalten (Status, Idee, Voraussetzung). „auf den Stand … setzen“ sagt nicht, welche Spalte den Text bekommt, ob ⬜ bleibt oder zu ✅ oder 🟡 wird (die Legende kennt kein Symbol für „teilweise gebaut“), und ob die Zeile unter „Später“ bleibt. Die Voraussetzung („Betrieb mit mehr als einer Instanz“) ist laut Z. 68–69 gerade nicht eingetreten, der Plan setzt aber Frage 1 = „ja“ voraus. Der Zeilenname im Plan lässt die Klammer „(gemeinsamer Speicher)“ weg.
- **Erwartet:** Die komplette neue Tabellenzeile im Wortlaut. (IR M8, CB 6, ST M6)

### R9. Frage 2 ist ungeklärt, bestimmt aber den Dokumentationstext (Z. 200–202 gegen 206)
- Die Voraussetzung nennt nur Frage 1. Was die README zu Skalieren und Rolling-Restart sagt, hängt von Frage 2 ab, einschließlich des Hinweises, dass der Wert zur tatsächlichen Prozesszahl passen muss (Z. 135–136). `docker-compose.yml` hat einen festen `container_name`; zwei Container gehen so nicht ohne Änderung.
- **Erwartet:** Frage 2 als Voraussetzung („zu klären vor Schritt 3“) oder einen festen Standardtext für die README. (IR M9)

### R10. Das stdio-Bündel liest die Variable, der Plan behandelt das nicht (Z. 107–108, 210–223)
- `engine/http.ts` steckt über `engine/check.ts` im Einstieg `src/mcp/cli.ts` und damit im Bündel von `mcp/build.mjs`. `INSTANCES = parseInstances(process.env.MARKENFREI_INSTANCES)` liest dort die Umgebung des Nutzers; setzt jemand die Variable, halbiert das still das Budget auf dem eigenen Rechner. „setzt ihn nicht“ (Z. 108) ist kein Schutz. Es gibt weder Maßnahme noch Test in `mcp/test-package.mjs` noch eine Änderung an `mcp/README.md`.
- **Erwartet:** Entscheiden und festhalten: dokumentieren („das Bündel liest die Variable ebenfalls“) oder per Code verhindern (stdio übergibt `instances: 1`). (IR M10, CB 5)

## 🟢 Nits

- **N1. Dateiliste und Versionsfrage:** Es gibt keine geschlossene Liste „geändert / neu / gelöscht“. Nicht genannt, aber betroffen oder zu klären: `docs/design.md` (Status von D nach dem Bau), `mcp/README.md`, `src/app/api/README.md` Z. 9, `src/lib/engine/types.ts` Z. 74 (Kommentar zu `HOST_BUDGETS`). „keine Versionsänderung“ steht nirgends; die ROADMAP-Regeln (Z. 64–67) kennen eine Nebenversion für neue Quellen, nicht für Konfigurationsvariablen. (IR N1, CB 10)
- **N2. Zeilenangaben:** „Z. 264 bis 265“: Geändert wird nur Z. 264, Z. 265 ist `if (budget) {`. „Z. 20 bis 24“: Zu ersetzen ist der Satz in Z. 23. Zeilennummern gelten für den Stand vor Schritt 1 und veralten; Ankertext verwenden („in `run`, Zeile `const budget = …`“). (IR N2, CB 7, ST N3)
- **N3. Typfehler:** `npm test` läuft über `tsx` und prüft keine Typen, `npm run lint` ist ESLint. Der Typcheck kommt erst mit `npm run build` in der Abnahme; Schritt 1 und 2 sollten `npx tsc --noEmit` oder `npm run build` in die „Prüfen“-Zeilen aufnehmen. (IR N3)
- **N4. Rückgabe bei N = 1:** „liefert … unverändert“ lässt offen, ob dasselbe Objekt oder eine Kopie zurückkommt; für `takeBudget` ohne Folge, ein Halbsatz genügt. `shareBudget` läuft bei jeder Anfrage; vernachlässigbar, als bewusst festhalten. (IR N4)
- **N5. Überschrift und Sprache:** „Detailed Implementation Plan“ (Z. 204) ist die einzige englische H2; Z. 24 und 198 sagen „Umsetzungsplan“. „hinterlässt … grün“ (Z. 207) umgangssprachlich, besser „laufen fehlerfrei“. „sind grün“ für Build-Befehle (Z. 256) besser „beenden sich mit Exit-Code 0“. (ST N1, N2, N9)
- **N6. Begriffe:** Variable `MARKENFREI_INSTANCES`, Konstante `INSTANCES`, Option `instances`, aber Text und Zeile 245–246 sagen „Prozesse“. Einmal definieren: Instanz = ein Serverprozess. (ST N10)
- **N7. Vergleichstext:** „wie `HF_TOKEN` und `MARKENFREI_TRUSTED_PROXIES`“: Die zweite Variable wird in `rate-limit.ts` gelesen, nicht in `http.ts`; ergänzen. (ST N4)
- **N8. Wortlaut und Gliederung:** Der Kommentartext für `HOST_BUDGETS` fehlt (ein Satz genügt). Schritt 1 und 2 enden mit „Prüfen:“, Schritt 3 nicht; „Prüfen: `npm test`“ in Schritt 2 wiederholt Z. 206–207. (ST N6, N8)
- **N9. Abnahme:** „höchstens“ (Z. 258) gegen „genau zwei“ im Test (Z. 236) vereinheitlichen und festlegen, ob andere `max`-Werte als 4 gelten. Der Lesepfad der Variable ist nur durch `parseInstances` abgedeckt. (ST N12, M1)
- **N10. Status nach dem Bau:** Z. 20 („spezifiziert, wird gebaut“) und Z. 192 stimmen nach der Umsetzung nicht mehr; ein Schritt „Status in `docs/design.md` auf ‚gebaut‘ setzen“ fehlt. (ST N11, CB 10)
- **N11. Dokumentationstest:** Ein neuer Test in `tests/docs-consistency.test.ts`, der die Variable in `README.md` und `.env.example` verlangt, wäre repokonform und machte Schritt 3 prüfbar. Zu beachten: Ein allgemeiner Abgleich aller `MARKENFREI_*`-Variablen wäre heute rot, weil die README-Tabelle zum Beispiel `MARKENFREI_PUBLIC_URL` nicht nennt. (IR N5)
- **N12. Hostname im Test:** `x.test` (Z. 236) darf mit anderen Tests nicht kollidieren; ein eigener Hostname je Test, wie die vorhandenen Tests ihn nutzen. (CB 9)

## Ergebnis nach Standard

| Anforderung | Stand |
|---|---|
| Phasierung, jeder Schritt baubar | erfüllt; Einschränkung: kein Typcheck vor der Abnahme (N3) |
| Datei-Allowlist | teilweise (N1, R10) |
| Actionable Steps (Code) | weitgehend; offen bleiben R1, R2, R5 |
| Actionable Steps (Dokumentation) | nicht erfüllt (R7, R8, R9) |
| Testplan inklusive Randfälle | Lücken (R1 bis R4, R6) |
| Zero-Decision-Rule | verletzt in R1 bis R4, R7, R8, R9 |

## Vergleich mit Runde 1

Alle 7 Blocker der ersten Runde sind weg, weil der Redis-Plan gestrichen und der Plan auf D beschränkt wurde: Die Signaturen bleiben synchron, es gibt keinen `ioredis`-Build-Bruch, keinen leeren `docs-consistency`-Schritt. Offen sind Randfälle des neuen, kleineren Plans: ungeprüfte Option (R1), Lesepfad der Variable und Abnahme (R3, R4), Dokumentationsschritte ohne Wortlaut (R7, R8) und das stdio-Bündel (R10).
