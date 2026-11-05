# Zoom-Out-Review Stufe 8: `docs/design.md` (Zeilen 1 bis 260), Runde 2

Zwischenreview (Simplicity und Scope) der wiederholten EGM-Review. Reviewer: `egm:egm-zoom-out`, ohne Kenntnis der ersten Runde. Gegengeprüft: `src/lib/engine/http.ts`, `README.md`, `ROADMAP.md`; gelesen: die Berichte der Stufen 5, 6 und 7 dieser Runde. Das Dokument ist seit Stufe 5 unverändert, alle Stufe-5-Findings sind formal offen. Bericht der ersten Runde: `review-round-1/intermediate_zoom_out_report.md`.

## Gesamturteil

**Bestanden mit Auflagen, kein Blocker. Das Dokument ist aber bereits zu groß für seine Entscheidung. Die Stufen 6 und 7 würden es weiter aufblähen, wenn man ihre Findings abarbeitet.**

Das Kernproblem hat sich seit Stufe 5 nicht geändert. Das Dokument entscheidet für Option A, weil ein Bedarf für mehr als einen Prozess "nicht belegt" ist (Z. 60). Trotzdem arbeitet es Option D bis zum Umsetzungsplan aus (Z. 204 bis 260) und legt Randbedingungen für das zurückgestellte B fest (Z. 157 bis 182). Die Stufen 6 und 7 haben diesen Widerspruch nicht aufgelöst, sie haben ihn eher verstärkt, weil sie Prüfvektoren für ein ungebautes, unbeschlossenes Feature liefern. Jeder Fix an D verlängert ein Dokument, dessen Startbedingung (Frage 1) offen ist.

## Offene Majors aus Stufe 5

Keiner der 7 Majors ist erledigt.

| Stufe 5 | Thema | Stand | Wird durch Stufe 6/7 | Bewertung |
|---|---|---|---|---|
| #1 | Umsetzungsplan trotz unbelegtem Bedarf (Z. 20, 98, 204 bis 260) | offen | bestätigt (Stufe 7 M8, Stufe 6 #3, #11) | Hauptursache der Aufblähung |
| #2 | Anlass "Neustart" passt nicht zu D (Z. 71 bis 72) | offen | bestätigt (Stufe 7 M2) | gültig, kostet nur Streichungen |
| #3 | "A plus Dokumentation" fehlt als kleinste Stufe | offen | bestätigt (Stufe 7 M6) | zentraler Zoom-Out-Punkt |
| #4 | "Eskalation zu B" legt zu viel fest (Z. 157 bis 182) | offen | Stufe 7 M7 will es noch ausbauen | gegenläufig, siehe unten |
| #5 | Plan zu niedrige Flughöhe | offen | Stufe 6 #3 und #11 verlangen weitere Details | erledigt sich mit #1 |
| #6 | crates.io-Folge untertrieben (Z. 142 bis 144) | offen | bestätigt (Stufe 7 M3) | gültig, ein Satz genügt |
| #7 | "einzige Lücke" falsch (Z. 53, 98) | offen | bestätigt (Stufe 6 #1, Stufe 7 M1) | gültig, ein Wort |

#2, #6 und #7 sind kleine Textkorrekturen. #1, #3, #4 und #5 sind Strukturentscheidungen. Entscheidet man sie richtig, entfällt der größere Teil der Stufe-6/7-Arbeit.

## Findings

### 🟡 Major

**1. Z. 20, 98, 204 bis 260: Stufe 5 #1 bleibt offen, und Stufe 6/7 geben dem Plan weitere Arbeit (Scope-Aufblähung)**
- Stufe 6 #3 verlangt, die Abnahme (Z. 258) mit Schritt 2 (Z. 236) abzugleichen. Stufe 6 #11 verlangt, "ersetzen/ergänzen" und die ROADMAP-Spalte zu präzisieren. Stufe 7 M10 und M11 verlangen Warnung auf stderr, eine Obergrenze und eine Entscheidung zum stdio-Bündel. Das sind Details einer Implementierung, deren Bedarf offen ist.
- Jeder dieser Fixes ist nur im Plan nötig. Wird der Plan gestrichen, entfallen Stufe 6 #3, #11 und Stufe 5 #5, #13, #14, #15 ersatzlos.
- **Empfehlung:** Plan (Z. 204 bis 260) streichen. Er kann entstehen, wenn Frage 1 mit "ja" beantwortet ist. Er veraltet bis dahin ohnehin; die Zeilenverweise stimmen schon jetzt nicht.

**2. Z. 157 bis 182: Stufe 7 M7 und M6 würden die Eskalation zu B weiter ausbauen (gegenläufig zu Stufe 5 #4)**
- Stufe 7 M7 verlangt messbare Schwellen, Zeiträume und eine datenschutzneutrale Messung. Stufe 7 M6 verlangt, `cluster`, `SharedArrayBuffer` oder einen ausgehenden Proxy zu bewerten und den Aufwand von B zu beziffern.
- Das ist Planung für eine zurückgestellte Option. Eine Messung ist ein eigenes Feature, das niemand beauftragt hat. Die Auslöser (Z. 159 bis 163) sind absichtlich qualitativ: ein Gespräch mit dem Betreiber, kein Monitoring.
- **Empfehlung:** Z. 165 bis 182 auf eine Zeile kürzen ("B nur bei gemessenem Mehrprozessbetrieb und nachweislich unzureichendem D; keine IP im Speicher, nichts auf der Platte"). Die sechs Festlegungen und M7 entfallen.

**3. Z. 15 bis 22, 93 bis 100, 102 bis 182, 184 bis 193: Optionen A, B, C, D stehen in drei Tabellen und vier Abschnitten**
- Stufe 7 M12 verlangt zusätzlich "Risiken und Mitigationen" und einen "Lösungsentwurf" je Option. Das ist formal korrekt nach feature-spec, für eine Entscheidungsvorlage, die A wählt, aber zu viel.
- **Empfehlung:** Eine Optionstabelle, ein Abschnitt "Restrisiken" (vorhanden als "Was D nicht löst", Z. 146 bis 155). Keine zusätzlichen Pflichtabschnitte.

### 🟢 Nit

**4. Neue Ergänzungen aus Stufe 6/7, die das Dokument verschlechtern würden.** Siehe die Tabelle der Berechtigung unten.

**5. Z. 20 und 198: Status von D.** "wird gebaut" (Z. 20) widerspricht "wird nicht begonnen" (Z. 198). Das kostet eine Zeile: "skizziert, nicht beschlossen; Start nach 'ja' zu Frage 1".

## Berechtigung der Findings aus Stufe 6 und 7

Gegenposition ausdrücklich: Viele Stufe-7-Majors sind formal richtig, aber für das gewählte Dokumentformat unverhältnismäßig.

### Berechtigt (klein, erhöhen die Wahrheit, nicht den Umfang)

| Finding | Warum berechtigt | Aufwand |
|---|---|---|
| Stufe 6 #1 / Stufe 7 M1 ("einzige Lücke") | Die Prämisse der Entscheidung widerspricht der eigenen Tabelle (Z. 49, 53, 150). | ein Wort in Z. 53 und 98 |
| Stufe 7 M2 (Neustart / Garantie) | Der einzige genannte Anlass wird von D nicht gelöst. Das berührt die Entscheidung. `budgetLog` ist ein Modul-Map im Prozess. | Anlass streichen oder 2 Sätze |
| Stufe 7 M3, Teil 1 (crates.io) | Standardquelle, ab N = 2 faktisch `unknown` bei Shortlist. Geprüft in `http.ts` Z. 47, 52, 269: `{max:1, windowMs:1000}` und `MAX_BUDGET_WAIT_MS = 1500` stimmen mit der Aussage überein. | 2 Sätze |
| Stufe 7 M10, Teil "höchstens max" | Formale Korrektur der Garantie (Z. 129 bis 130). | 1 Wort |
| Stufe 7 M5, Teil "Empfehlung vs. Bestand" | "Proxy-Limit" als "Wer schützt heute" ist nicht belegt; README Punkt 4 rät nur dazu (Z. 220). | Spaltenüberschrift |
| Stufe 7 Nit "Server-IP" | Gilt nur für NAT/Dual-Stack. Nur wenn kostenlos. | optional |

### Nicht berechtigt für den Scope (würden das Dokument aufblähen)

| Finding | Warum nicht |
|---|---|
| Stufe 7 M7 (messbare Eskalationskriterien, Messinstrument) | Verlangt Instrumentierung für ein zurückgestelltes Feature. Besser: B-Abschnitt auf Auslöser kürzen. Stufe 5 #4 geht in die Gegenrichtung und hat recht. |
| Stufe 7 M6 (Varianten `cluster`/IPC/`SharedArrayBuffer`/Sidecar, B beziffern) | Spekulative Alternativen für eine Option, die nicht gebaut wird. Die einzige fehlende Alternative von Gewicht ist "A plus Dokumentation" (Stufe 5 #3). |
| Stufe 7 M12 (neue Pflichtabschnitte Risiken und Lösungsentwurf je Option) | Das Dokument ist eine Entscheidungsvorlage. Eine Restrisiko-Liste (vorhanden) genügt. |
| Stufe 7 M4 (Kurzabschnitt zu C oder "kann verringern") | Nur die zweite Hälfte ist richtig: C auf einen Satz kürzen und "hebt" zu "kann mildern" ändern (Stufe 5 #10). Ein Kurzabschnitt mit Konfigurationsgrenze wäre das Gegenteil. |
| Stufe 7 M9 (Ziele messbar machen) | Ziel 3 wandert besser nach B oder entfällt (Stufe 5 #16). Ziel 1 braucht eine Klammer, keinen Abschnitt. |
| Stufe 7 M10, Teil stderr-Warnung, Obergrenze, `floor`-Abwägung | Implementierungsdetails von D. Gehören in den späteren Plan. |
| Stufe 7 M11 (stdio-Bündel liest die Variable) | Gültige Beobachtung, aber Planinhalt. Ein Satz im späteren Plan. |
| Stufe 7 M13 und Nits zu Zitaten, Begriffen, Fettdruck, Sprachbruch | Teils sachlich richtig (Apple-Wert ist Budget, keine Simulation: Z. 65 bis 67), aber Politur. Nur die Faktenfehler korrigieren. |
| Stufe 7 M3, Teil 2 (Client-Wiederholung 6-mal, Quantifizierung nach Namen und N, Richtlinie verlinken, Betreiberentscheidung) | Schiebt die Entscheidung über crates.io zur Betreiberfrage mit neuer Matrix auf. Ein ehrlicher Satz und eine Alternative genügen (Stufe 5 #6). |
| Stufe 6 #5, #6, #8, #9 (Begriffe, Shortlist, wie startet man mehrere Prozesse, C-Konfiguration) | Verständnishilfen; ein Glossarsatz genügt. "Wie werden mehrere Prozesse gestartet" gehört in Frage 2 und ist vor Frage 1 nicht beantwortbar. |

Die Stufen 6 und 7 sind Qualitätsprüfungen des Dokuments, wie es ist. Sie prüfen nicht, ob das Dokument so existieren sollte. Deshalb führen ihre Findings, wörtlich abgearbeitet, zu einem längeren Dokument.

## Läuft die Summe auf Fokus oder Aufblähung hinaus?

**Wörtlich abgearbeitet: Aufblähung.** Geschätzter Zuwachs mindestens 40 bis 60 Zeilen aus zusätzlichen Abschnitten (Risiken, Lösungsentwurf je Option, Kurzabschnitt zu C), Alternativen für B und der Messdefinition, der crates.io-Matrix sowie Glossarsätzen und Zusatzzeilen im Plan. Gleichzeitig stützt das Dokument weiter eine Entscheidung ("A gilt"), die auf 30 Zeilen passt.

**Mit Zielgestalt gekürzt: Fokus.** Die berechtigten Findings sind klein und bleiben vollständig erhalten, wenn man Plan und B-Festlegungen streicht. Von den 16 Stufe-5-Findings und den 13 Stufe-7-Majors entfallen dann etwa zwei Drittel von selbst, weil ihr Bezugstext gestrichen wird (alle Plan-Findings, die B-Festlegungen, die Dreifachtabelle, die Entscheidungstabelle).

## Strukturvorschlag: Zielgestalt (ca. 100 bis 120 Zeilen statt 260)

1. **Kopf (4 Zeilen).** Titel, Status "Entscheidungsvorlage, Stand 5. November 2026", Verweis auf `v2-spec.md` und `src/lib/README.md`. Kein Prozessvermerk, kein "EGM".
2. **Entscheidung (8 bis 10 Zeilen).** Eine einzige Optionstabelle, Reihenfolge A, "A plus Dokumentation", D, B, C. A gilt. "A plus Dokumentation" ist die nächste Stufe und kostet keinen Code. D ist skizziert und nicht beschlossen. B ist zurückgestellt. C ist Proxy-Konfiguration auf Betreiberseite.
3. **Problem (25 Zeilen).** Zählertabelle (Z. 30 bis 37) und Folgetabelle (Z. 44 bis 51) bleiben. Drei Korrekturen: "einzige Lücke" wird "die schwerwiegendste Lücke", Spalte "Wer schützt heute" wird "Was der Betreiber setzen kann", die Apple-Zahl wird als konfiguriertes Budget geführt, nicht als Simulation.
4. **Bedarf (8 Zeilen).** Die drei Belege aus Z. 62 bis 69. Der Neustart-Anlass nur als Satz: "D hilft dabei nicht; ein Neustart setzt `budgetLog` zurück."
5. **Ziele und Nicht-Ziele (10 Zeilen).** Ziel 3 streichen oder bei B nennen. Ziel 1 mit "gemäß `HOST_BUDGETS`, außer bei `max < N`".
6. **Option D als Skizze (25 Zeilen).** Regel (Z. 106 bis 116), Tabelle (Z. 118 bis 125), Garantie mit Bedingung und "höchstens max", Folgen mit dem ehrlichen crates.io-Satz ("ab N = 2 liefert die zweite gleichzeitige crates-Anfrage `unknown`; Standardprüfung mit Shortlist nie grün"). Kein Funktionsname, keine Zeilennummer.
7. **Restrisiken (8 Zeilen).** Das bestehende "Was D nicht löst", ergänzt um Neustart und die Wechselwirkung C × D in einem Satz.
8. **Eskalation zu B (4 Zeilen).** Die beiden Auslöser aus Z. 159 bis 163 und eine Zeile Randbedingungen (keine IP, nichts auf der Platte).
9. **Offene Fragen (6 Zeilen).** Frage 1 und Frage 2, beide mit "vor Umsetzung".
10. **Folgeschritt (3 Zeilen).** "Nach 'ja' zu Frage 1 entsteht ein Umsetzungsplan (Code, Tests, Dokumentation) in einer eigenen Datei." Ersetzt Z. 204 bis 260.

Gestrichen: Entscheidungstabelle (Z. 184 bis 193; nur die Zeilen "Zustand im Arbeitsspeicher" und "Abfragebudget je Zieldienst" wandern als Satz in die Optionstabelle), zweite Optionstabelle, Plan, Festlegungen zu B.

## Reuse-Prüfung

Das Dokument schlägt D als Erweiterung von `createHttpClient(opts)` im Muster von `hostBudgets` und `huggingfaceBudget` vor: Wiederverwendung des vorhandenen Musters, unproblematisch. Die Alternative nach dem Muster `huggingfaceBudget(process.env.HF_TOKEN)`, `HOST_BUDGETS` beim Laden aus der Prozesszahl zu bilden und keine Option an `createHttpClient` anzubauen (Stufe 5 #13), ist ein Detail für den späteren Plan.

## Fazit zur Gegenposition

- **Berechtigt:** Fakten und Widersprüche (M1, M2, crates.io, "höchstens max", "Empfehlung statt Bestand"). Sie berühren die Entscheidung und kosten wenige Zeilen.
- **Nicht berechtigt für diesen Scope:** Alles, was ein Feature ausbaut, das das Dokument selbst zurückstellt oder nicht beschlossen hat (messbare Eskalation, B-Varianten, Pflichtabschnitte je Option, Details des D-Plans).
- **Hauptempfehlung:** Zuerst Plan und B-Festlegungen streichen, "A plus Dokumentation" ergänzen, Status von D auf "skizziert" setzen. Danach die fünf berechtigten Faktenkorrekturen anwenden. Nur das, was dann übrig bleibt, nochmals durch Comprehension und Critic laufen lassen.
