Status: resolved

# Goldfish Annotated Review Report

**Target:** `docs/design.md` (full file). Findings aus den Stufen 5 bis 9, jeweils im Bericht der Stufe: `zoom_out_report.md`, `comprehension_report.md`, `critic_report.md`, `intermediate_zoom_out_report.md`, `implementation_readiness_report.md`.

**Abweichung vom Standardlauf:** Die rund 70 Einzelfindings sind hier nach Ursache zusammengefasst, ein Eintrag je Ursache statt je Finding. Der Nutzer hat die Behebung nach dem Vorschlag aus Stufe 8 freigegeben („Ja, beheben“: Dokument zu einem Entscheidungsdokument machen, A jetzt, D spezifizieren, B zurückstellen). Das entspricht „auto accept“: Alle `PROPOSE FIX` wurden angewendet, `CONTEST` und `DECLINE` übersprungen. `ESCALATE` gab es nicht. Das Dokument wurde neu geschrieben (260 statt 216 Zeilen, weil Option D nun vollständig spezifiziert ist und der Redis-Plan entfallen ist).

**Zählung:** PROPOSE FIX 18, CONTEST 4, DECLINE 4. Offen bleibt eine Entscheidung des Betreibers (Frage 1 im Dokument).

## PROPOSE FIX (angewendet)

| Nr. | Ursache | Findings | Wo im neuen Dokument |
|---|---|---|---|
| 1 | Empfehlung und Plan widersprechen sich, kein Status, Plan ohne Eintrittskriterium | Stufe 5 #1, #3; Stufe 6 #1; Stufe 7 B1; Stufe 8 #1; Stufe 9 R1 | Kopf „Status“, Zusammenfassung (Tabelle), „Detailed Implementation Plan“ (Voraussetzung) |
| 2 | Bedarf nicht belegt | Stufe 7 B2; Stufe 8 #1 | „Bedarf“: Compose, README Punkt 8, ROADMAP; Anlass als Vermutung gekennzeichnet |
| 3 | Umfang größer als das Problem (Client-Limit und Personenbezug) | Stufe 5 #2; Stufe 8 #3 | Ziele und Nicht-Ziele; Eskalation zu B („Umfang“) |
| 4 | Option D unausgearbeitet, `HOST_BUDGET_SHARE` undefiniert | Stufe 5 #3; Stufe 6 #2; Stufe 8 #2 | „Option D“ mit Regel, Beispielen, Grenzen; Variable heißt jetzt `MARKENFREI_INSTANCES` |
| 5 | „exakt“ trotz festem Fenster, Abnahme instabil | Stufe 5 #6; Stufe 6 #6; Stufe 7 M1; Stufe 9 R6 | D behält das gleitende Fenster; „Was die Regel garantiert“ nennt auch die Ausnahme `max < N`; B verlangt gleitendes Fenster |
| 6 | Rückfall bei Ausfall hebt das Ziel auf, „fail-open“ falsch benannt | Stufe 7 M2; Stufe 6 #5 | Eskalation zu B („Ausfall“): Rückfall auf den Anteil aus D, kein fail-open |
| 7 | Cache-Begründung sachlich falsch | Stufe 5 #7; Stufe 7 M3; Stufe 8 #6 | Nicht-Ziele (Kosten ehrlich genannt), Tabelle „Folge bei N Prozessen“ |
| 8 | GitHub-Sperre und Slots weder gelöst noch ausgeschlossen, „alle Grenzen“ zu stark | Stufe 7 M4 | „Was D nicht löst“ |
| 9 | Persistenz und Datenschutz bei Redis | Stufe 5 #8; Stufe 7 M5; Stufe 8 #7 | Eskalation zu B („Umfang“, „Persistenz“), Entscheidungstabelle |
| 10 | `MARKENFREI_GLOBAL_RATE_LIMIT` ändert still die Bedeutung | Stufe 5 #11; Stufe 7 M6 | Entfällt mit D: Variable bleibt je Prozess; Betreiber setzt 600 / N |
| 11 | „Heutiger Umgang“ zitiert die README falsch | Stufe 5 #9; Stufe 7 M7 (Teil); Stufe 9 (außerhalb) | „Folge bei N Prozessen“ (letzter Absatz) |
| 12 | Entscheidungstabelle mischt gültige und berührte Entscheidungen | Stufe 7 M10; Stufe 6 #3 | Spalte „Status“ |
| 13 | Messbasis der Kapazitätszahl fehlt | Stufe 7 M9 (Teil); Stufe 6 #12 | „Bedarf“ nennt Simulation mit 300 ms und gestubbten Diensten |
| 14 | Aussage zu Markenregistern zu stark | Stufe 7 M12 | Entscheidungstabelle, Zeile „Marke“ |
| 15 | Begriffe uneinheitlich (Speicher, Limits, Kosten, Einheiten) | Stufe 6 #4, #9, #10; Stufe 7 M13 | Tabelle „Was im Prozess liegt“ definiert Client-Limit, Systemlimit, Abfragebudget, Slots, Cache; „Einheit“ erklärt |
| 16 | Systemüberblick wiederholt `v2-spec.md` | Stufe 5 #12; Stufe 8 #8 | Entfallen, Verweis auf `v2-spec.md` und `src/lib/README.md` |
| 17 | Plan-Fehler: „Tests unverändert“, Async, `getStore()`, `kind`, `createRateLimiter`, ioredis, MCP-Bündel, Lua, HMAC, Startabbruch, Redis-Dienste in Compose und CI, Datei- und Testliste | Stufe 9 R2 bis R6, M1 bis M8; Stufe 5 #4, #5 | Plan für B gestrichen. Der neue Plan (D) ändert nur `http.ts`, ist synchron, ändert keinen bestehenden Test; Dateien sind mit „ändern“ gekennzeichnet, Prüfbefehle je Schritt; B wird erst nach der Entscheidung geplant |
| 18 | Schritt „`docs-consistency.test.ts` erweitern“ ist leer | Stufe 9 R7; Stufe 5 #11 | Schritt gestrichen. Beleg: Der Test gleicht keine Variablen ab (`tests/docs-consistency.test.ts`). Ein neuer Abgleich wäre heute rot, weil die README-Tabelle `MARKENFREI_PUBLIC_URL` nicht nennt |

## CONTEST

| Nr. | Finding | Begründung |
|---|---|---|
| 19 | Stufe 7 M7: zusätzliche Optionen (ein Prozess als Besitzer aller ausgehenden Abfragen, Node-Cluster) und Alternativen zu Detailentscheidungen | Das Dokument ist ein Entscheidungsdokument mit vier Optionen. Mehr Optionen verlängern die Entscheidung, ohne sie zu verbessern (Stufe 8, Tabelle „Nicht berechtigt“). Das Proxy-Limit steht als Teil von A und D im Dokument. |
| 20 | Stufe 7 M11: Umbau nach Feature-Spec-Gliederung (eigene Risikotabelle, Komponentendiagramm, H2 „Problemstellung“) | Die Risiken stehen als Tabelle „Folge bei N Prozessen“ und „Was D nicht löst“. Eine eigene Gliederung für eine nicht beschlossene Funktion ist Aufwand ohne Entscheidungswert (Stufe 8). Das Dokument hat jetzt einen Abschnitt „Problem und Bedarf“. |
| 21 | Stufe 7 M9: Metriken (Round-Trips, Latenz, „Antwortzeit bei Ausfall höchstens 8 s“) | Das sind Abnahmekriterien eines Plans für B. Sie jetzt zu fixieren ist Scheinpräzision (Stufe 8). |
| 22 | Stufe 6 #8, #13, #14: `opendata-words`, `similar`/`weak`, „Betreiber“, 300 Sekunden, MCP ausschreiben | Das Dokument betrifft nur die Abfragebudgets und verweist für die Prüfungslogik auf `v2-spec.md`. `opendata-words` kommt nicht mehr vor. Begriffe außerhalb des Vorschlags zu erklären bläht das Dokument auf. Die 300 Sekunden entfielen mit dem Redis-Plan. |

## DECLINE (Nits und B-Details)

| Nr. | Finding | Grund |
|---|---|---|
| 23 | Betriebsdetails für B: `maxmemory`, Eviction, TLS und Auth, Rotation des Geheimnisses, ioredis-Queue, Jitter beim Warten, Thundering Herd | Gehören in den Plan für B, der erst nach einer Eskalation entsteht. |
| 24 | Stufe 7 Nits zur Sprache und Gliederung: „gebauten“, „tatsächlich“, Ziele als H3, Links statt Fließtext | Kosmetik. Wo es der Umschreibung folgte, wurde es übernommen (Links auf README und ROADMAP, deutsche Begriffe); der Rest blieb unberührt. |
| 25 | Überschrift „Detailed Implementation Plan“ eindeutschen (Stufe 7 Nit, Stufe 9 N1) | Die Überschrift ist die vom Review-Werkzeug erkannte Grenze zwischen Feature- und Plan-Teil. Sie bleibt, damit eine Wiederholung der Review denselben Schnitt findet. |
| 26 | Stufe 7: Wartelogik mit Jitter bei gemeinsamem Budget | Betrifft nur B. Mit D warten Prozesse je auf ihr eigenes Budget. |

## Offen

- **Frage 1 im Dokument (Betreiber):** Soll es einen Betrieb mit mehr als einem Prozess geben? Ohne Ja bleibt A, und der Plan für D wird nicht begonnen.
- **Nicht geändert:** Code, README, ROADMAP und `.env.example`. Der neue Plan beschreibt diese Änderungen, führt sie aber nicht aus.
- **Nicht erneut geprüft:** Die Review wurde nach der Überarbeitung nicht wiederholt. Die Faktenangaben im neuen Dokument (Zeilen in `http.ts`, Budgetwerte, README-Punkte) habe ich gegen den Code gelesen; ein frischer Durchlauf der Stufen 5 bis 9 steht aus.
