# Critic Review: `docs/design.md`, Zeilen 1–203 (FeatureRange), Runde 2

Stufe 7 der wiederholten EGM-Review. Drei unabhängige Reviewer ohne Kenntnis der ersten Runde: `egm-design` (Standard: feature-spec), `egm-structural` (Standard: feature-spec), `egm-style` (ohne Standard). Alle drei haben berichtet (Status: completed). Dieser Bericht fasst ihre Findings zusammen und entfernt Doppelungen. Kennungen: D = Design, S = Struktur, T = Stil, mit der Nummer im Roh-Bericht. Bericht der ersten Runde: `review-round-1/critic_report.md`.

**Gesamturteil: bestanden mit Auflagen, kein Blocker** (Runde 1: 2 Blocker). 13 Major, etwa 15 Nits nach Zusammenführung. Zahlen und Formeln stimmen: Die Zählertabelle passt zum Code, die Budgettabelle und `{1, 63334}` rechnen richtig, die Teilung ist für `max ≥ N` korrekt. Die Schwächen liegen in der Begründung der Entscheidung, in den Randfällen von D und in der Gliederung.

## 🟡 Major

### M1. „Einzige Lücke“ widerspricht der eigenen Tabelle (Z. 53, 98; vgl. 49, 146–155)
- Z. 53: Das Abfragebudget sei „die einzige Lücke, die der Proxy nicht schließt“. Z. 98: D schließe „die einzige offene Lücke“. Z. 49 führt Slots ebenfalls mit „niemand“, Z. 150 und 151 nennen Slots und GitHub-Sperre als offen.
- Die Begründung für D hängt an diesem Wort. Der Satz widerspricht dem Dokument.
- **Vorschlag:** „einzige“ streichen, benennen, welche Lücke D schließt und welche bleiben. Für Slots (N × 4 gleichzeitige Anfragen an RDAP, npm, PyPI) bewerten, ob der Schaden real ist, oder `PER_HOST_LIMIT` ebenfalls teilen. (D1, T1; Stufe 6 #1; Stufe 5 #7)

### M2. Die Garantie gilt nicht über Neustarts, und der einzige genannte Anlass passt nicht zu D (Z. 71–72, 97, 106–108, 129–131, 200–202)
- `budgetLog` ist ein Modul-Map im Arbeitsspeicher. Ein neu gestarteter Prozess beginnt mit leerem Log, der Zieldienst zählt die Anfragen des alten Prozesses noch. Genau das ist der einzige genannte Anlass (Neustart ohne Ausfall). Die Summe kann im Fenster bis etwa zum Doppelten steigen. Z. 97 nennt das nur für A.
- D müsste für diesen Anlass dauerhaft `N=2` setzen: Apple dauerhaft 9 statt 18 pro Minute, die Hälfte des Budgets verfällt, solange ein Prozess läuft. Der Wert wird beim Laden des Moduls gelesen, eine Änderung zur Laufzeit ist nicht möglich. Das Dokument bewertet das nicht.
- **Vorschlag:** Garantie auf „ohne Neustart“ einschränken, den Neustartfall unter „Was D nicht löst“ aufnehmen und den Anlass gegen D durchrechnen oder aus der Begründung für D entfernen. (D2, D3; Stufe 5 #2)

### M3. Die Folgen für crates.io werden verharmlost (Z. 131–134, 141–144)
- crates.io ist eine Standardquelle. Ab N = 2 gilt `{1, 2000 ms}`, `MAX_BUDGET_WAIT_MS` liegt bei 1500 ms: Schon die zweite gleichzeitige Anfrage eines Prozesses endet sofort mit `budget` (`http.ts` Z. 269–271). Eine Shortlist bekommt für crates.io fast nur `unknown`, die Ampel wird nie Grün. Das Dokument schreibt „häufiger“.
- Die Oberfläche wiederholt `retryable` bis zu 6-mal (`checker.tsx` Z. 31, 146); jeder Versuch kostet Einheiten vom Client-Limit von 60 pro Minute, bei 10 Namen bis zu 70, also 429.
- „Auch bei N = 1 bleibt die dritte gleichzeitige Anfrage dort ohne Budget“ beschreibt Ist-Verhalten ohne Beleg oder Test.
- Z. 133–134 („wir nehmen diese kurzzeitige Überschreitung hin“) ist eine Entscheidung, die eine Richtlinie eines Drittdienstes verletzen kann. Sie steht nicht unter „Offene Fragen“, nennt keinen Entscheider und keine Quelle. Die Grundsätze der v2-Spezifikation verlangen, Nutzungsbedingungen zu respektieren.
- **Vorschlag:** Wirkung quantifizieren (1 Name gegen 10 Namen bei N = 1, 2, 3), entscheiden, ob `MAX_BUDGET_WAIT_MS` mit dem Abstand wachsen oder crates.io bei N > 1 anders behandelt wird, die Überschreitung als offene Entscheidung des Betreibers mit Optionen (zulassen oder crates.io bei N ≥ 2 abschalten) und verlinkter Richtlinie führen. (D4, T5, T9; Stufe 5 #6)

### M4. Option C hat keinen Inhalt, und ihre Wirkung ist unbelegt (Z. 22, 50, 87, 100, 155)
- C wird fünfmal als Abhilfe genannt, hat aber keinen Abschnitt: Wer richtet sie ein, wie, wann? Die Caddy-Konfiguration der README enthält weder Zuordnung noch Limit.
- „hebt die Cache-Trefferquote“ stimmt nur für Wiederholungen desselben Clients; der Cache ist nach Namen geschlüsselt, die Treffer zwischen Clients bleiben bei etwa 1 / N.
- C verstärkt die ungleiche Last aus Z. 140 und verschlechtert damit D: Ein starker Client oder ein NAT-Block belegt einen Prozess, der dort in `budget` läuft, während die anderen Anteile verfallen.
- **Vorschlag:** Entweder einen Kurzabschnitt zu C mit Konfigurationsgrenze und Wirkung, oder C auf „kann … verringern“ zurücknehmen, als Betreiberempfehlung ausweisen und die Wechselwirkung C × D als Restrisiko nennen. (D5, T3, S2; Stufe 5 #10)

### M5. Der Proxy ersetzt das Systemlimit nicht gleichwertig, und „Wer schützt heute“ nennt Empfehlungen als Bestand (Z. 19, 44–51, 88–89, 97, 153–154)
- Das Systemlimit zählt Einheiten (`checkCost`: Namen × Quellenfaktor), ein Proxy zählt Anfragen. Eine Anfrage mit 10 Namen oder allen Quellen kostet ein Vielfaches. Wirksam ist nur `MARKENFREI_GLOBAL_RATE_LIMIT` auf 600 / N: dieselbe manuelle Teilung, die D für Budgets automatisiert. Der Betreiber muss `INSTANCES` und `GLOBAL_RATE_LIMIT` konsistent pflegen.
- „Proxy-Limit“, „Zuordnung am Proxy (Option C)“ und „600 / N“ sind keine bestehenden Schutzmaßnahmen, sondern Empfehlungen. Die README rät dazu (Punkt 4), der Betrieb belegt es nicht. Z. 19 setzt A mit „Client- und Systemlimit zusätzlich am Proxy“ auf „gilt jetzt“, Z. 97 beschreibt A nur als „Ein Prozess“.
- **Vorschlag:** Spalte umbenennen („Was der Betreiber setzen kann“), „zusätzlich am Proxy“ aus Z. 19 streichen oder belegen, das Systemlimit-Standard in D aus `INSTANCES` ableiten (600 / N, solange nichts gesetzt ist) oder die Abweichung zwischen Anfragen und Einheiten benennen. (D6, T2)

### M6. Alternativen zu eng, Ablehnung von B subjektiv (Z. 93–100, 157–182)
- B ist nur als Redis oder Valkey gefasst. Nicht betrachtet: Node-`cluster`-Primärprozess oder Worker-Threads mit Zählern per IPC oder `SharedArrayBuffer` (kein neuer Dienst, nichts auf der Platte); ein ausgehender Proxy oder Sidecar, der Budgets, Slots und GitHub-Sperre zentral hält. Ebenso fehlt „A plus Dokumentation“ als kleinste Stufe (Stufe 5, Runde 2).
- „stehen in keinem Verhältnis zum Gewinn“ (Z. 99), „kleinster Eingriff“ (Z. 98), „Budgets exakt über alle Prozesse“ (Z. 99), „Alle Grenzen stimmen“ (Z. 97) sind Werturteile oder Überzeichnungen ohne Zahl. Die Begründung für B (Z. 99) und die Eskalationslogik (Z. 159–163: D kann ausreichen) nennen zwei verschiedene Gründe. Die Spalte „Entscheidung und Grund“ mischt beides; Querverweise auf Persistenz und Betrieb fehlen.
- **Vorschlag:** Varianten ohne neuen Dienst aufnehmen und mit Gründen verwerfen, Aufwand und Betriebslast von B grob beziffern, Spalte in „Entscheidung“ und „Begründung“ trennen, „exakt“ durch „gemeinsam gezählt“ ersetzen. (D7, T6, S3; Stufe 5 #3)

### M7. Die Eskalationskriterien für B sind nicht messbar (Z. 159–163; vgl. 15–24, 195–202)
- „gemessen, nicht geplant“ nennt weder Messgröße noch Quelle, „dauerhaft viele `budget`-Ergebnisse“ weder Schwelle noch Zeitraum. Im Webserver gibt es keine Metriken; Namen in Logs sind ausgeschlossen. Ohne Instrumentierung ist keine der Bedingungen feststellbar, B würde nie oder nach Bauchgefühl ausgelöst.
- Weder Ziele noch Abnahme prüfen den Betrieb; ein falsch gesetztes `INSTANCES` ist nicht erkennbar.
- **Vorschlag:** Schwelle, Zeitraum und eine datenschutzneutrale Messung festlegen (Aggregat je Host, ohne Namen) oder die Bedingungen auf das beschränken, was heute beobachtbar ist (Sperren durch Dienste); sonst ausdrücklich festhalten, dass die Messung erst zu bauen ist. (D8, T10)

### M8. Statusangaben zu D widersprechen sich (Z. 20, 24, 197–199, 206; vgl. 71–72)
- Z. 20: D „wird gebaut, sobald ein zweiter Prozess geplant ist“. Z. 197–199: ohne ein „Ja“ des Betreibers auf Frage 1 bleibt es bei A, der Plan wird nicht begonnen. Der Auslöser ist einmal „geplant“, einmal „Ja des Betreibers“; fett gesetztes „wird gebaut“ klingt nach einer Zusage, die Frage 1 offenlässt. Außerdem hängt der Plan von einer noch offenen Entscheidung ab, die Reihenfolge der Auslöser (Entscheidung, Messung, Umsetzung) ist nicht angegeben, und Z. 20 verweist auf „Frage 1“ vor ihrer Definition.
- **Vorschlag:** „spezifiziert, nicht begonnen; Start nach ‚Ja‘ zu Frage 1“, überall derselbe Auslöser. (T7, D13; Stufe 5 #1)

### M9. Ziele nicht messbar oder nur für B gültig (Z. 76–81)
- Ziel 1: „innerhalb seines dokumentierten Budgets“ lässt offen, welches Budget gemeint ist. `HOST_BUDGETS` sind die Werte des Projekts, GitHub (60 pro Stunde) hat ein dokumentiertes Limit, das D nicht einhält; für `max < N` gilt das Ziel nur im Mittel. Ziel 3 gilt für D trivial, weil D keinen gemeinsamen Speicher hat.
- **Vorschlag:** Ziel 1 mit Bezug auf `HOST_BUDGETS` und mit der Ausnahme `max < N` formulieren, Ziel 3 in den B-Teil verschieben. (T4, D16, S; Stufe 5 #16)

### M10. Die Garantie ist stärker formuliert, als sie gilt (Z. 127–136)
- Die Überschrift „Was die Regel garantiert“ verspricht mehr, als der Stand trägt: Die Regel ist nicht gebaut, die Tests stehen erst im Plan. Die Bedingung „Prozesszahl stimmt“ steht erst als dritter Punkt, gilt aber für alles. „unter `max`“ ist formal falsch, `N × floor(max / N)` kann genau `max` ergeben (18 mit N = 2 oder 3).
- Beim `floor` verfallen bei mittlerem N viele Anteile (18 mit N = 7: 14 von 18; N = 10: 44 % verfallen). Der Kompromiss gegenüber einem ratenbasierten Anteil ist nicht genannt.
- Ein ungültiger Wert (`"two"`, `"2 "`) fällt still auf 1 zurück: fail-unsafe, die Folge wäre eine IP-Sperre. Es gibt keine Obergrenze.
- **Vorschlag:** Überschrift „Was die Regel bei richtiger Prozesszahl zusichert“, Bedingung an den Anfang, „höchstens `max`“, eine Zeile zur `floor`-Abwägung, Warnung auf stderr bei ungültigem Wert (ohne Namen) und eine Obergrenze. (T8, D9, D10; Stufe 5 #11)

### M11. Das stdio-MCP-Bündel liest die Variable doch (Z. 107–108, 170–171)
- D liest `MARKENFREI_INSTANCES` beim Laden von `engine/http.ts`; das Modul steckt auch im stdio-Bündel. Eine in der Umgebung des Nutzers gesetzte Variable senkt dort still die Budgets. Z. 108 sagt nur, das Paket „setzt ihn nicht“ (mehrdeutig). Für B verspricht Z. 170, das Bündel importiere den Speicher nicht; für D gilt das nicht.
- **Vorschlag:** Festlegen, ob das Bündel die Variable ignoriert (Standard 1) oder liest, und es einheitlich beschreiben. (D12, T11; Stufe 5 #13)

### M12. Pflichtabschnitte und Aufbau (Z. 93–182)
- Es fehlt ein eigener Abschnitt „Risiken und Mitigationen“: Die Risiken stehen verstreut in drei H3 unter Option D, ohne Zuordnung Risiko → Wirkung → Gegenmaßnahme; Risiken von A, C und des Rollouts fehlen (Struktur 1).
- Es fehlt ein Abschnitt „Lösungsentwurf“: D hat einen eigenen H2, B nur „Eskalation“, A und C nichts. Die Gesamtsicht auf Prozesse, Proxy und Zieldienste wird an `src/lib/README.md` delegiert (Struktur 2).
- „Eskalation zu B“ mischt Auslöser und Festlegungen ohne Unterüberschriften; „Entscheidung:“, „Ziele:“, „Nicht-Ziele:“ sind Pseudo-Überschriften; die Optionen stehen dreimal als Tabelle (Z. 15–22, 93–100, 184–193).
- **Vorschlag:** Ein H2 „Risiken und Mitigationen“ als Tabelle, Kurzabschnitte je Option in Entscheidungsreihenfolge (auch ein Satz zu C), H3 „Auslöser“ und „Festlegungen für B“, Optionen auf eine Tabelle zurückführen. (S1, S2, S4–S6; auch Stufe 5 #9)

### M13. Belege und Zitate (Z. 53–55, 63–69, 120, 174–176)
- „Die Zahlen stammen aus einer Simulation“ fasst Durchsatz (4 bis 5 Prüfungen pro Sekunde) und „Apple etwa 18 neue Namen pro Minute“ zusammen; der Apple-Wert ist ein konfiguriertes Budget aus `HOST_BUDGETS`, keine Simulation. Die README nennt an anderer Stelle „etwa 20“ (Punkt 6).
- „Teil der Zusage in der Datenschutzerklärung und der README“: Die Datenschutzerklärung liegt nicht im Kontext; die README-Stelle „nichts wird auf die Platte geschrieben“ bezieht sich auf den Cache, nicht auf alle Zähler.
- Die ROADMAP führt die Zeile als ⬜ mit „Voraussetzung“, nicht als „Auslöser … nicht eingetreten“. README Punkt 4 lautet „zusätzlich am Proxy begrenzen“, nicht „zu begrenzen“, und spricht von „Rate-Limit und Cache“, nicht von Budgets.
- **Vorschlag:** Aussagen trennen und belegen, Zitate wörtlich oder ausdrücklich als Zusammenfassung, Datenschutzbeleg mit Datei und Stelle nennen. (T12, T13, T15, D15)

## 🟢 Nits

- **Option A (Z. 19):** „Client- und Systemlimit zusätzlich am Proxy“ bei einem Prozess: Die README verlangt den Proxy-Schutz nur bei mehreren Instanzen. (D14)
- **Server-IP (Z. 11, 107):** Maßgeblich ist die ausgehende Adresse; hinter NAT teilen sich mehrere Hosts dieselbe Egress-IP, bei Dual-Stack sehen Dienste IPv4 und IPv6 getrennt. N als „Prozesse mit derselben ausgehenden Adresse“ definieren. (D11)
- **Präzision:** „Überschuss ist auf N × 60 begrenzt“ meint die Gesamtmenge, der Überschuss ist (N − 1) × 60; „überschreiten sie zusammen“ gilt nur bei voller Auslastung („können überschreiten“); „sinkt grob auf 1 / N“ ist eine Schätzung. (T17–T19)
- **Begriffe:** Prozess, Instanz und Container wechseln (README, ROADMAP und `MARKENFREI_INSTANCES` sagen „Instanz“, das Dokument „Prozess“); Limit, Grenze und Budget werden gemischt; „Einheit“ und „Kosten“ sind Synonyme, die Definition (Z. 39) steht nach der Tabelle und ist schwer lesbar; `budget` und `retryable: true` sind undefiniert; Reverse-Proxy und Proxy wechseln. (T23, T24, T29)
- **Tabelle „Was im Prozess liegt“ (Z. 30–37):** „sechs Zieldienste“ ist kein Verfahren; `engine/check.ts` ohne `src/lib/`-Präfix; 60, 600 und 10 Minuten sind änderbare Standardwerte; die Variablennamen erscheinen erst in Z. 47. Die Überschrift „Problem und Bedarf“ enthält Ist-Zustand, das Problem formuliert erst „Folge bei N Prozessen“. (T25, S9)
- **Tabelle „Entscheidungen“ (Z. 184–193):** Die ersten Zeilen (Engine, Ampel, Marke) haben mit dem Thema nichts zu tun. (T22)
- **Option-Reihenfolge A, D, B, C** ist nicht erklärt; Bezeichnungen uneinheitlich (Z. 17 nackte Buchstaben, Z. 95 „A. Ein Prozess“). (S4, T20)
- **Querverweise:** README Punkt 4, ROADMAP „Später“, „Frage 1“, „Schritt 1“, Datenschutzerklärung und `mcp/README.md` sind nicht verlinkt, obwohl Ziele existieren. (S10)
- **Prozessvermerk (Z. 3):** „überarbeitet nach der EGM-Review“ ist für einen neuen Leser unerklärt. Status als eigene Zeile. (T26, S11)
- **Frage 2 (Z. 200–202):** Der zweite Satz ist eine Feststellung ohne Antwortmöglichkeiten; die Neustart-Situation aus Z. 71 gehört hierher. Nur Frage 1 hat eine Frist. (T33)
- **Abschnitt B:** „legt dieses Dokument fest“ und „nach dieser Entscheidung“ haben unklare Bezüge; „Hash, Geheimnis“ ist unerklärt; „Es gibt kein ‚fail-open‘“ besser „B darf bei Ausfall die Budgets nicht aufheben“. Ein verwalteter Redis-Dienst widerspricht der Persistenz-Zusage womöglich ohne Einflussmöglichkeit; als Ausschlusskriterium festhalten. (T32, D16)
- **Rhetorik und Umgangssprache:** „**niemand**“, „**jedem**“, „**beides**“ fett; „fangen das ab“, „bleibt das Mittel“, „verfällt Budget“, „mehr Betrieb“; „wir“ in Z. 87 und 134. (T28)
- **Sprachbruch:** „Detailed Implementation Plan“ (Z. 204) ist die einzige englische H2; Z. 24 und 198 sagen bereits „Umsetzungsplan“. (T27, S12)
- **Listen und Tabellen:** uneinheitliche Auszeichnung (fette Stichwörter nur teils), Budgettabelle (Z. 118–125) ohne Einleitung, Hugging Face nur anonym (mit `HF_TOKEN` 900), „Slots und GitHub-Sperre fehlen unter Nicht-Ziele“. (S7, S8, D16, T31)
- **Rückgriff auf Runde 1:** Redundanz „Bedarf nicht belegt“, „600 / N“, Cache und Client-/Systemlimit an mehreren Stellen. (T21)

## Nicht belegt im Prüfumfang

Z. 35 „höchstens 3 je Prüfung“, Z. 62 „festem Namen“ im Container, Z. 142 `MAX_BUDGET_WAIT_MS` und 1,5 s, Z. 175 Wortlaut der Datenschutzerklärung, Z. 33–36/56/215–223 Code-Fundstellen. Der Design-Reviewer hat sie gegen den Code geprüft und als zutreffend gefunden, soweit nicht oben als Mangel geführt.

## Standard-Abdeckung

| Anforderung | Stand |
|---|---|
| Problem | gut, inklusive ehrlicher Bedarfsprüfung |
| Ziele und Nicht-Ziele | vorhanden, aber nicht messbar; Ziel 3 nur für B (M9) |
| Architektur | für D klar; Randfälle (Neustart, Rundung, crates.io) fehlen, kein symmetrischer Aufbau (M2, M3, M10, M12) |
| Alternativen | vorhanden, aber eng, B unquantifiziert (M6) |
| Risiken und Mitigationen | nur als „Was D nicht löst“; Lücken bei Neustart, Slots, C × D (M1, M2, M4, M12) |

## Vergleich mit Runde 1

Die Blocker sind weg: Der Plan widerspricht der Empfehlung nicht mehr, der Bedarf ist ehrlich benannt, kein Redis-Plan mehr, der Build und Tests bricht. Neu aufgedeckt sind die Randfälle von D (Neustart, crates.io, Systemlimit in Einheiten, stdio-Bündel, `floor`-Verschnitt, stilles Zurückfallen auf 1) sowie Widersprüche, die die Überarbeitung selbst eingeführt hat („einzige Lücke“, Status von D, „Wer schützt heute“).
