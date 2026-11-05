Status: resolved

# Goldfish Annotated Review Report, Runde 2

**Target:** `docs/design.md` (full file). Findings aus den Stufen 5 bis 9 der zweiten Runde: `zoom_out_report.md`, `comprehension_report.md`, `critic_report.md`, `intermediate_zoom_out_report.md`, `implementation_readiness_report.md`. Bericht der ersten Runde: `review-round-1/goldfish_review_report.md`.

**Vorgehen:** Die Behebung folgt der Zielgestalt aus Stufe 8 und wurde vom Nutzer freigegeben („Ja, beheben“). Das entspricht „auto accept“: Alle `PROPOSE FIX` wurden angewendet, `CONTEST` und `DECLINE` übersprungen, `ESCALATE` gab es nicht. Die rund 60 Findings sind nach Ursache zusammengefasst. Das Dokument ist von 260 auf 159 Zeilen gekürzt: Der Umsetzungsplan für D und die Festlegungen zu B sind entfallen, es gibt eine Optionstabelle statt dreien, und die Tabelle „Entscheidungen“ ist weg.

**Zählung:** PROPOSE FIX 14, CONTEST 6, DECLINE 3, aufgehoben für den späteren Plan 1. Die Review wurde nach dieser Überarbeitung nicht erneut ausgeführt.

## PROPOSE FIX (angewendet)

| Nr. | Ursache | Findings | Wo im neuen Dokument |
|---|---|---|---|
| 1 | Plan trotz unbelegtem Bedarf, Status von D widerspricht sich („wird gebaut“ gegen „nicht begonnen“) | Stufe 5 #1; Stufe 7 M8; Stufe 8 #1, #5; Stufe 6 #3 | Plan gestrichen, Abschnitt „Folgeschritt“; D „skizziert, nicht beschlossen“ |
| 2 | Billigere Alternative fehlt: A plus Dokumentation | Stufe 5 #3; Stufe 7 M6; Stufe 8 | Optionstabelle, Zeile A+ |
| 3 | „einzige Lücke“ widerspricht der Tabelle (Slots) | Stufe 5 #7; Stufe 6 #1; Stufe 7 M1 | „schwerwiegendste Lücke“ mit Begründung (dokumentiertes Limit eines Dienstes) |
| 4 | Neustart: Anlass passt nicht zu D, Garantie gilt nicht über Neustarts | Stufe 5 #2; Stufe 7 M2 | „Bedarf“ (letzter Absatz), „Was die Regel zusichert“, „Restrisiken“ |
| 5 | crates.io: Folge verharmlost, Richtlinie überschritten ohne Entscheider | Stufe 5 #6; Stufe 7 M3 (Teil 1, Entscheidung) | „Folgen“ (zweite Anfrage ab N = 2), Frage 2 |
| 6 | „unter max“ ungenau, Bedingung zuerst, Verschnitt | Stufe 5 #11; Stufe 7 M10 (Teil „höchstens“, Überschrift) | „Was die Regel zusichert“ |
| 7 | „Wer schützt heute“ nennt Empfehlungen als Bestand; Proxy zählt Anfragen, Systemlimit Einheiten | Stufe 7 M5; Stufe 6 Nit | Spalte „Was der Betreiber setzen kann“, Hinweis in Zeile Client-Limit, `GLOBAL_RATE_LIMIT` auf 600 / N |
| 8 | Eskalation zu B legt Details fest | Stufe 5 #4; Stufe 8 #2 | „Eskalation zu B“ auf zwei Auslöser und eine Zeile Randbedingungen gekürzt |
| 9 | Optionen in drei Tabellen, Tabelle „Entscheidungen“ wiederholt Bestand | Stufe 5 #8, #9; Stufe 8 #3 | Eine Optionstabelle; Zusage „Zähler im Arbeitsspeicher“ als Satz |
| 10 | Option C zu stark („hebt“) und ohne Inhalt | Stufe 5 #10; Stufe 7 M4 (zweite Hälfte) | Optionstabelle, Zeile C; „Restrisiken“ (C × D) |
| 11 | Ziele nicht messbar oder nur für B gültig | Stufe 5 #16; Stufe 7 M9 (Ziel 1, Ziel 3) | Ziel 1 mit Bezug auf `HOST_BUDGETS` und Ausnahme `max < N`; Ziel 3 entfallen; Prozessvermerk im Kopf entfernt |
| 12 | Belege und Zitate: Apple-Wert ist Budget, keine Simulation; ROADMAP-Wortlaut; Datenschutzbeleg | Stufe 7 M13; Stufe 6 #7 | „Bedarf“ (Simulation nur für Durchsatz; Apple-Wert aus `HOST_BUDGETS`; ROADMAP „mit der Voraussetzung“); Datenschutzerklärung nicht mehr zitiert |
| 13 | Begriffe uneinheitlich; `budget`, Einheit nicht erklärt; Tabelle ohne Pfade und Standardwerte | Stufe 6 #2 (Definition), #4, #5, #9; Stufe 7 M13, Nits | `budget` in „Folgen“ definiert, „Einheit“ vor den Tabellen, Pfade mit `src/lib/`, „Die Werte sind Standardwerte“, Variablennamen in der ersten Tabelle, „Instanzen“ (Variable) und „Prozess“ durch einen Satz verbunden, „ausgehende IP-Adresse“ statt „Server-IP“ |
| 14 | Hugging Face mit Token fehlt; stdio-Bündel und Variable; Slots als Restrisiko statt Ziel | Stufe 5 #12, #13; Stufe 7 M11 (als Satz) | Tabellenzeile Hugging Face; Satz zu stdio unter „Regel“; Nicht-Ziele |

## CONTEST

| Nr. | Finding | Begründung |
|---|---|---|
| 15 | Stufe 7 M12 und Struktur 1, 2: eigene Abschnitte „Risiken und Mitigationen“ und „Lösungsentwurf“ je Option | Das Dokument ist eine Entscheidungsvorlage. Die Risiken stehen gebündelt unter „Restrisiken“, die Folgen unter „Folgen“. Ein Abschnitt je Option für eine nicht beschlossene Funktion ist Aufwand ohne Entscheidungswert (Stufe 8, Tabelle „Nicht berechtigt“). |
| 16 | Stufe 7 M6 (Teil): zusätzliche Alternativen zu B (Node-`cluster`, `SharedArrayBuffer`, Sidecar), Aufwand von B beziffern | Spekulative Varianten einer zurückgestellten Option. Die einzige fehlende Alternative von Gewicht, A plus Dokumentation, steht jetzt drin (Stufe 8). |
| 17 | Stufe 7 M7: messbare Eskalationskriterien und Messinstrument | Verlangt Instrumentierung für ein zurückgestelltes Feature. Die Auslöser bleiben qualitativ; das Dokument sagt, was belegt sein muss (Stufe 8). |
| 18 | Stufe 7 M3 (Teil 2): Quantifizierung nach Namen und N, Wiederholungen der Oberfläche, Matrix | Ein ehrlicher Satz und Frage 2 genügen. Die Aussage zur Oberfläche (bis zu 6 Wiederholungen) habe ich nicht gegengeprüft und nicht übernommen. |
| 19 | Stufe 7 M10 (Teil) und Stufe 9 R1, R2: stderr-Warnung, Obergrenze, `floor`-Abwägung, Validierung von `instances` | Details von D, die in den späteren Plan gehören (siehe unten). Der Verschnitt bei krummen Teilern steht als Zahl im Dokument. |
| 20 | Stufe 6 #8, #13, #14; Stufe 7 Nits: Glossar, `opendata-words`, „Betreiber“, wie Prozesse gestartet werden, Cache-Schätzung nur als „Schätzung“ | Die Begriffe außerhalb des Vorschlags erklärt `v2-spec.md`; die Frage, wie Prozesse gestartet werden, ist vor Frage 1 nicht beantwortbar. Die Cache-Schätzung steht als „Schätzung“ in der Tabelle. |

## DECLINE

| Nr. | Finding | Grund |
|---|---|---|
| 21 | Reihenfolge der Optionen A, A+, D, B, C erklären; Fettdruck, Umgangssprache („fangen ab“), „wir“ | Kosmetik. Wo es der Umschreibung folgte, ist es übernommen (kein „wir“, kein „fangen ab“). |
| 22 | Eigenschaftstest auf Ganzzahlform, `parseInstances`-Grammatik und -Obergrenze, `export`, `max <= 0` | Betrifft nur den entfallenen Plan; im Plan-Entwurf berücksichtigen (siehe unten). |
| 23 | Querverweise als Links für „Frage 1“, „Schritt 1“ | Es gibt keine „Schritte“ mehr. Verlinkt sind README-Punkte 4 und 8 und die ROADMAP. |

## Für den späteren Plan aufheben

Diese Punkte stammen aus Stufe 9 und gelten, sobald ein Umsetzungsplan für D entsteht (nach einem „Ja“ zu Frage 1). Das Dokument enthält sie nicht mehr.

- **Option `instances` validieren:** `instances: 0` ergibt `floor(max / 0) = Infinity` und hebt das Budget auf; `NaN`, negative und nicht ganze Werte verhalten sich undefiniert. `shareBudget` muss wie `parseInstances` auf 1 zurückfallen. Testfälle `0`, `-1`, `NaN`, `2.5`.
- **`parseInstances`:** Algorithmus festlegen (zum Beispiel `/^[1-9]\d*$/` plus `Number.isSafeInteger`), Obergrenze, Fälle `" 3 "`, `"1e1"`, `"3abc"`, `"+2"`, `"99999999999999999999"`; beide Funktionen exportieren.
- **Eigenschaftstest in Ganzzahlen:** `share.max × N × b.windowMs ≤ b.max × share.windowMs` statt Gleitkomma-Raten (Rundung bei Gleichheit).
- **Lesepfad der Variable testen:** Die Option `instances` überdeckt `INSTANCES`; der Weg `process.env → parseInstances → INSTANCES` braucht einen Kindprozess oder eine eigene Testdatei mit gesetzter Variable vor dem Import. Bestehende Tests brechen, wenn die Variable im Testlauf gesetzt ist (`tests/engine-budget.test.ts:45–48`); die Testumgebung muss sie löschen oder die Tests `instances: 1` übergeben.
- **Fall `max < N` und mehrere Fenster testen:** `{ max: 1, windowMs: 1000 }`, `instances: 2`, injiziertes `now` (+1,5 s ergibt `budget`, +2,001 s geht durch); Zweifenster-Test für `max: 4`, N = 2; vier verschiedene URLs (gleiche Anfragen bündelt `inflight`), eindeutige Hostnamen, `beforeEach(resetHostBudgets)`.
- **Importzeile:** Neue Tests brauchen `parseInstances` und `shareBudget`; entweder die Importzeile in `tests/engine-budget.test.ts` erweitern oder eine neue Testdatei anlegen.
- **Dokumentationsschritte mit Wortlaut:** README Punkt 8 (ersetzen, nicht ergänzen; Punkt 4 enthält keinen Satz zu Budgets), `MARKENFREI_GLOBAL_RATE_LIMIT` hat keine Zeile in der README-Tabelle, weitere Fundstellen README Z. 202 und Punkt 6, `.env.example` Z. 36–38, `src/app/api/README.md` Z. 9, `mcp/README.md`, Kommentar zu `HOST_BUDGETS` (`http.ts` Z. 23), `src/lib/README.md:36` (erwähnt Budgets bisher nicht), ROADMAP-Zeile (Spalte, Status, Wortlaut). Feste Textmuster in `tests/docs-consistency.test.ts` beachten.
- **stdio-Bündel:** Die Variable wird auch im Bündel gelesen; entscheiden, ob `instances: 1` erzwungen oder die Wirkung dokumentiert wird.
- **Typcheck und Abnahme:** `npm test` (über `tsx`) prüft keine Typen; `npx tsc --noEmit` oder `npm run build` in die Prüfzeilen. Zeilennummern durch Ankertext ersetzen.

## Offen

- **Frage 1 (Betreiber):** Soll es einen Betrieb mit mehr als einem Prozess geben? Ohne Ja bleibt es bei A und A+.
- **Frage 2 (Betreiber):** crates.io ab N = 2.
- **Nicht geändert:** Code, README, ROADMAP und `.env.example`. A+ (der ausdrückliche Satz in README und Kommentar) ist beschrieben, aber nicht ausgeführt.
- **Nicht erneut geprüft:** Das überarbeitete Dokument hat noch keine dritte Review-Runde gesehen.
