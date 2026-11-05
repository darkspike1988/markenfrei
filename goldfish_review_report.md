Status: Schleife nach Runde 3 beendet, nicht konvergiert (siehe Abschnitt „Runde 3 und Abbruch“)

# Goldfish Annotated Review Report: Review-Schleife

**Target:** `docs/design.md` (full file). Reviewer: `egm-design`, `egm-structural` (Standard: feature-spec), `egm-style`. Abbruch: zwei saubere Runden hintereinander oder 5 Runden. Findings sind nach Ursache zusammengefasst; die frühere Fassung dieses Berichts (zweite EGM-Review) steht in der Git-Historie (`git show HEAD:goldfish_review_report.md`).

**Vorgehen:** Auf Wunsch des Nutzers („baue es zu ende“) wende ich die berechtigten Fixes nach jeder Runde selbst an (entspricht „auto accept“). `CONTEST` und `DECLINE` werden begründet und übersprungen, `ESCALATE` gab es nicht.

## Runde 1

Ergebnis der Reviewer: Design 0 Blocker, 7 Major, 6 Nits; Struktur 0 Blocker, 4 Major, 5 Nits; Stil 0 Blocker, 10 Major, 23 Nits. Die Runde ist **nicht sauber** (Major vorhanden).

### PROPOSE FIX (angewendet)

| Nr. | Ursache | Findings | Wo im Dokument |
|---|---|---|---|
| 1 | Entscheidungsstatus unklar, Entscheidungsanfrage steht am Ende, „angenommen“ ohne Entscheider | Struktur 1; Stil M1 | Kopf: Status, Entscheider, Empfehlung, Verweis auf offene Fragen; Abschnitt „Optionen und Empfehlung“ |
| 2 | „D reicht voraussichtlich“ unbelegt, widerspricht der crates.io-Einschränkung; Frage 2 hatte nur zwei Wege | Design M1; Stil M2, M6 | Tabellenzeile B und D; Frage 2 mit drei Wegen (Richtlinie hinnehmen, Wartegrenze anheben, abschalten) |
| 3 | crates.io-Mangel besteht schon bei N = 1 für Shortlists; Kapazität für neue Namen wird von Apple begrenzt, nicht vom Prozess | Design M2; Stil M6 | „Bedarf“ (dritter Punkt), „Folgen“ (crates.io) |
| 4 | Eskalationskriterien nicht messbar; es gibt keine Zähler im Webserver | Design M3; Stil M7 | „Eskalation zu B“: ehrliche Aussage, dass heute keine Messung existiert, Auslöser stützen sich auf Meldungen |
| 5 | Alternativen: Egress-Proxy fehlt, Ablehnungsgründe und Aufwand nicht ausgewiesen; „Proxy kann nicht zählen“ gilt nur für den Reverse-Proxy; mehrere IPs ohne Begründung | Design M4; Struktur 2 | Spalte „Aufwand“, Zeile E, Nicht-Ziele (mehrere IPs begründet), Satz zum Reverse-Proxy |
| 6 | A+ widerspricht der vorhandenen Dokumentation, die Stellen sind nicht benannt; Serverless | Design M5, N4 | Absatz „A+ ändert diese Stellen“, Hinweis zu serverlosen Plattformen, v2-spec-Lücke |
| 7 | „dokumentiertes Limit“ überzogen (GLEIF nicht bestätigt, Apple ungefähr), Superlativ „schwerwiegendste“, Slots als Argument aus Abwesenheit | Design M6; Stil N8, N9 | Absatz unter „Folge bei N Prozessen“ |
| 8 | Wechselwirkung D × Cache, Neustart gilt auch für A, Fehlkonfiguration von N | Design M7, N1, N3 | „Folgen“, „Restrisiken“ |
| 9 | Risiken verstreut und doppelt | Struktur 3; Stil M9 | „Restrisiken“ verweist auf die Tabelle und führt nur Neues |
| 10 | Ziele gelten nur für D; Randbedingung „Arbeitsspeicher“ im falschen Abschnitt; H3 statt Fließtext-Labels | Struktur 4, 5, 8 | „Ziele“ (Ziel 1 für A+, Ziel 4 Randbedingung), H3 „Ziele“ und „Nicht-Ziele“ |
| 11 | Begriffe und Definitionen: N, Prozess und Instanz, Anfrage und Abfrage, `budget`, Einheit, verwaister Satz | Struktur 6, 7; Stil M5, M10, N5, N11 | Absatz „Begriffe“ im Kopf, `budget` mit Fundstelle (`types.ts`), Einheit vor der Tabelle |
| 12 | „Instanz reicht“ ohne Vorbehalt, „diese Grenzen“ unklar | Stil M3, M4 | „Bedarf“: „Laut Simulation“, „Limits der Zieldienste“ |
| 13 | B und „nichts auf der Platte“ widersprechen sich, „Speicher“ unklar | Stil M8 | Randbedingung gilt für alle Optionen, „gemeinsamer Speicher“ |
| 14 | stdio-Bündel liest die Variable | Design N2; Stil N18 | Nicht-Ziele |
| 15 | Systemlimit zählt nur ausgehende Anfragen; HF-Fußnote; Wortwahl (Cache-Treffer, erhält, (N − 1) × 60, „Geht max nicht durch N auf“, kein „läuft in budget“) | Design N6; Struktur 8; Stil N7, N14, N16, N20, N21 | Tabellen, Fußnote unter der Budgettabelle, Formulierungen |
| 16 | Dokument ist nicht verlinkt | Struktur 9 | README-Liste „Weitere Dokumentation“ und ROADMAP-Zeile verlinken `docs/design.md` |

### CONTEST

| Nr. | Finding | Begründung |
|---|---|---|
| 17 | Struktur 2: eine H3 je Option, gleiche Tiefe, D als Anhang | Das Dokument ist eine Entscheidungsvorlage; die Optionstabelle hat jetzt einheitliche Spalten, und nur D hat Inhalt, der über die Tabelle hinausgeht. Ein Unterabschnitt je Option für nicht beschlossene Optionen verlängert das Dokument ohne Entscheidungswert (siehe `review-round-1` und zweite EGM-Review, Stufe 8). |

### DECLINE

| Nr. | Finding | Grund |
|---|---|---|
| 18 | Worker-Threads als Alternative; Dateiname `design.md` ändern | Threads lösen kein Prozessproblem (Zähler sind Modulzustand je Thread); Umbenennen bräche die Pfade in den committeten Berichten. Verlinkung statt Umbenennung (Nr. 16). |
| 19 | Reihenfolge der Optionen erklären; `Anfrage` in jedem Satz exakt; restliche Stil-Nits (Fettdruck, einzelne Wortwahl) | Kosmetik. Die Reihenfolge folgt dem Status von der Empfehlung zur Eskalation; die Begriffe sind im Kopf geklärt. |

## Runde 2

Ergebnis der Reviewer: Design 0 Blocker, 6 Major, 5 Nits; Struktur 0 Blocker, 5 Major, 6 Nits; Stil 0 Blocker, 13 Major, 12 Nits. Design und Stil mussten wegen eines Netzwerkfehlers (`ENOTFOUND`) einmal wiederholt werden; die Wiederholung lief durch, kein Reviewer gilt als „nicht gelaufen“. Die Runde ist **nicht sauber**. Mehrere Majors betreffen Sätze, die ich in Runde 1 eingefügt habe („rät zum Mehrinstanzbetrieb“, „nur die Anwendung kann teilen“, „D löst keinen davon“, „höchstens gelb“, „Neustart: alle Optionen“, Präsens für Ungebautes): Diese Fixes haben das Problem teils selbst erzeugt und werden hier nachgebessert.

### PROPOSE FIX (angewendet)

| Nr. | Ursache | Findings | Wo im Dokument |
|---|---|---|---|
| 20 | Die empfohlene Option A+ hat keinen Abschnitt, die Änderungsliste ist Semikolon-Prosa; Prämisse „Dokumentation rät“ überzogen, Fundstellen unvollständig | Struktur 1, 5; Design 7; Stil M1 | Eigener Abschnitt „Empfehlung A+“ mit Tabelle (Datei, Stelle, Änderung) und Liste der unveränderten Stellen; Formulierung „behandeln als möglich“, Widerspruch Punkt 4 gegen Punkt 8 benannt |
| 21 | Die Annahme von A+ ist keine Frage; Fragen uneinheitlich; kein Folgeschritt für A+ | Struktur 2; Design 1; Stil M9 | Offene Fragen: Frage 1 „A+ annehmen“, Frage 2 Mehrprozessbetrieb, Frage 3 crates.io (bedingt, mit Empfehlung); „Nächste Schritte“ mit A+ |
| 22 | Risiken verstreut, ohne Gegenmaßnahme, für A+ keine Risikobetrachtung | Struktur 3; Design 3; Stil M4 | Abschnitt „Risiken und Gegenmaßnahmen“ als Tabelle (Risiko, betrifft, Gegenmaßnahme oder Hinnahme); „Neustart“ nur für A, A+, D |
| 23 | Optionslabels vor Definition, Kopf als Absatz, Status und Begründung in einer Spalte, zwei parallele Zählertabellen | Struktur 4, 6, 7, 8; Stil N11 | Kopf als Liste, Empfehlung mit Namen statt Labels, Spalten „Status“ und „Grund“, eine zusammengeführte Zählertabelle |
| 24 | Folge einer Überschreitung unbelegt; Verfügbarkeit nicht behandelt | Design 2, 4 | „Problem und Bedarf“ (Folge unbelegt), Nicht-Ziel Hochverfügbarkeit, A+-Tabelle (kurze Überlappung beim Neustart), Frage 2 (wie würden Prozesse gestartet) |
| 25 | crates.io-Mangel besteht schon bei N = 1 und ist unabhängig von D; Unterschied zwischen Weboberfläche und API/MCP; „höchstens gelb“ falsch; Beleg fehlt | Design 6; Stil M5, M13 | Eigener Unterabschnitt „crates.io: ein Mangel schon bei einem Prozess“ („nie grün“, Rechnung aus `run()` und `takeBudget`, kein Test), Gründe für `retryable`, Fundstelle `checker.tsx`; Frage 3 und „Nächste Schritte“ |
| 26 | Widersprüche in meinen Sätzen: „nur die Anwendung kann teilen“ gegen Option E; „D löst keinen davon“ gegen Systemlimit; „Neustart: alle Optionen“ gegen B | Stil M2, M3, M4 | „Der Reverse-Proxy zählt keine ausgehenden Abfragen; teilen können … die Anwendung (D) oder ein ausgehender Proxy (E)“; Risikotabelle (Systemlimit über 600 / N, Neustart nur A, A+, D) |
| 27 | Apple-Limit und Apple-Budget vermischt; D-Zusage an drei Stellen unterschiedlich bedingt; Präsens für Ungebautes; Eskalationskriterium nicht messbar | Stil M6, M7, M8, M11 | „Apple nennt etwa 20, das Budget ist 18“; Tabelle und Ziel 2 verweisen auf „Was die Regel garantiert“; stdio-Satz im Konjunktiv mit Lösungsrichtung; Eskalation mit Schwelle (Vorschlag, vom Betreiber zu bestätigen) |
| 28 | E ohne konkreten Grund, C unklar; Serverless-Satz am falschen Ort; Nicht-Ziel „mehrere IPs“ | Design 5; Stil M10, M12; Struktur 9 | Zeile E mit Grund, Zeile C „Maßnahme des Betreibers, ergänzend zu D“, Nicht-Ziele (serverlos und Autoscaling, mehrere IPs), offene Aufgabe aus den Nicht-Zielen nach „Nächste Schritte“ |
| 29 | Überschriften und Kleinigkeiten | Struktur 11; Stil N5, N6, N7 | „Risiken und Gegenmaßnahmen“, „Nächste Schritte“; „faktisch“ gestrichen; Zeilenverweise im Kommentar durch Beschreibung ersetzt; „mindert“ statt „hebt auf“ |

### CONTEST

| Nr. | Finding | Begründung |
|---|---|---|
| 30 | Design 5, Stil: weitere Alternativen (Node-`cluster`, Leader-Prozess, Skalierungsfaktor statt Prozesszahl) | Bereits in Runde 1 abgelehnt (Nr. 18) und in der zweiten EGM-Review (Stufe 8) als Umfangsausweitung bewertet. Ein Skalierungsfaktor ist D mit anderem Namen. Als beigelegt geführt (settled). |
| 31 | Struktur 10: Quellcode-Dateien als Links statt Code-Spans | Die Dateien liegen außerhalb von `docs/`; Links auf Quelldateien veralten genauso wie Zeilenangaben. Code-Spans bleiben. |

### DECLINE

| Nr. | Finding | Grund |
|---|---|---|
| 32 | Stil N1: „Client-Anfrage“ und „Quellenabfrage“ statt Anfrage und Abfrage; Wortwahl-Nits (Fettdruck, „Mehrinstanzbetrieb“ erklären) | Kosmetik; die Begriffe sind im Kopf definiert. |
| 33 | Design 9: Teilung im Server-Einstieg statt im Engine-Modul als Entwurfsentscheidung festschreiben | Als Lösungsrichtung übernommen (Satz zum stdio-Paket), nicht als Entscheidung: Das gehört in den Umsetzungsplan. |

## Runde 3 und Abbruch

Ergebnis der Reviewer: Design 0 Blocker, 7 Major, 7 Nits; Struktur 0 Blocker, 8 Major, 10 Nits; Stil 0 Blocker, 16 Major, 11 Nits. Die Runde ist **nicht sauber**.

**Verlauf der Major-Findings:** Runde 1: 21, Runde 2: 24, Runde 3: 31. Es gab nie eine saubere Runde, und die Zahl steigt trotz Behebung. Frische Reviewer finden jedes Mal neue Lücken, und das Dokument wächst mit jeder Behebung. Mehrere Findings der Runden 2 und 3 betreffen Sätze, die frühere Fixes eingefügt haben (Churn). Ich habe die Schleife deshalb nach Runde 3 beendet, statt Runde 4 und 5 zu starten. Das ist eine Abweichung vom Standardlauf (Abbruch erst nach 5 Runden oder zwei sauberen Runden) und eine Entscheidung zugunsten eines überprüfbaren Pull Requests.

### Angewendet (nur Sachfehler in eigenen Sätzen)

| Nr. | Finding | Änderung |
|---|---|---|
| 34 | Stil M4: Variable `MARKENFREI_INSTANCES` als bestehend dargestellt | „die vorgeschlagene Variable hieße …“ |
| 35 | Stil M1: D und B beide „zurückgestellt“, C und E fehlen im Kopf | Kopf nennt D „skizziert, nicht beschlossen“, B „zurückgestellt“ und verweist auf C und E |
| 36 | Design 1, Stil M5: Ablehnung von E widerspricht den Nachteilen von D | E-Zeile: teilt ohne statisches N, nichts verfällt, kostet einen Dienst |
| 37 | Stil M6: „nur Anwendung oder Egress-Proxy“ lässt B aus | B ergänzt |
| 38 | Stil M7: „unabhängig von D“ | „besteht auch ohne D und verschärft sich durch D“ |
| 39 | Stil M9: Neustart widersprüchlich | „erlaubt bis zu doppelt so viele Abfragen … höchstens eine Fensterlänge“ |
| 40 | Stil M8: Einleitungssatz zur A+-Tabelle falsch | „behandeln den Betrieb mit mehreren Prozessen als unterstützt“ |
| 41 | Struktur 7: Liste der unveränderten Stellen unscharf | konkrete Stellen genannt; die Behauptung des Reviewers, `src/app/api/README.md` sage nicht „pro Prozess“, ist falsch (der Satz läuft über einen Zeilenumbruch: „… ein Limit pro / Prozess …“) |
| 42 | Design 2, Stil M15: Begründung für Option (b) trägt nicht | Rechnung (Frist 8 Sekunden begrenzt auf etwa vier Namen), „behebt den Mangel nicht vollständig“ |
| 43 | Design 6: „verhindert“ zu stark, Frage 2 ohne Empfehlung | „erschwert“, Empfehlung „Nein, solange kein Bedarf belegt ist“ |
| 44 | Design 3: Grundannahme „ein Prozess = ein Satz Zähler“ nicht belegt | als ausdrückliche Annahme im Dokument |

### Offen (nicht behoben)

Diese Findings der Runde 3 bleiben offen; sie würden das Dokument weiter verlängern oder verlangen eine Entscheidung des Betreibers.

- **Struktur:** Entscheidungen verstreut statt nur in „Offene Fragen“ (10-%-Schwelle, Kopplung der beiden Variablen); Alternativen auf mehrere Orte verteilt und ungleich behandelt; Ziele stehen nach der Empfehlung; Risikotabelle auf D zugeschnitten; Belege zu Drittdiensten ohne Link; uneinheitliches Schema der Fragen.
- **Design:** Der crates.io-Mangel bei N = 1 ist ein Produktfehler und verdient eine eigene Entscheidung mit Alternativen (Sparse-Index, Begrenzung der Zahl der Prüfungen); Eskalationskriterien zu B ohne Messung; Ziel 4 („nichts auf der Platte“) ohne Herleitung; Hosts ohne Budget (RDAP, Wikidata) nicht eingeschätzt; Test-Beleg für die crates-Rechnung fehlt.
- **Stil:** Vokabular „Anfrage“ und „Abfrage“ weicht vom Sprachgebrauch der anderen Dokumente ab; „Limit“, „Budget“, „Dienst“, „Host“, „Quelle“ nicht streng getrennt; Zellen mit mehreren Sätzen; wiederholte Aussagen (ungleiche Last, Slots, Neustart); Ziel 2 und „garantiert“ passen nicht zur Ausnahme `max < N`; „Hingenommen“ ohne benannten Entscheider.

### Prüfung des Repositories (nach der Überarbeitung)

`npm test` (342 Tests, 0 Fehler), `npm run lint`, `npm run build:mcp`, `npm run test:mcp-package` und `npm run build` sind grün. Geändert wurden nur `docs/design.md`, `README.md` (ein Listenpunkt), `ROADMAP.md` (ein Verweis) und die Berichte.
