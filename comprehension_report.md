# Comprehension-Test: `docs/design.md`, Runde 2

Stufe 6 der wiederholten EGM-Review. Reviewer: `egm:egm-comprehension`, ohne Kenntnis der ersten Runde. FeatureRange: Zeilen 1–203, DetailedRange: Zeilen 204–260. Bericht der ersten Runde: `review-round-1/comprehension_report.md`.

## What this proposes

Markenfrei soll vorerst mit genau einem Serverprozess laufen (Option A). Falls ein Betreiber später mehrere Prozesse hinter demselben Reverse-Proxy auf derselben Server-IP will, soll Option D gelten. Dabei setzt der Betreiber die Umgebungsvariable `MARKENFREI_INSTANCES` auf die Zahl der Prozesse. Jeder Prozess nimmt dann von jedem festen Abfragebudget je Zieldienst nur den Anteil 1/N.

- Reicht das Budget nicht für N ganze Anfragen (crates.io ab N = 2), wird stattdessen das Zeitfenster verlängert.
- Ein gemeinsamer Zähler in Redis oder Valkey (Option B) wird zurückgestellt. Das Dokument legt aber vorab Randbedingungen für ihn fest: nur Budgets, keine IP, nichts auf der Platte, bei Ausfall zurück auf den Anteil aus D.
- Option C (feste Zuordnung eines Clients zu einem Prozess am Proxy) ist nur eine Ergänzung.
- Ein Umsetzungsplan in drei Schritten (Code, Tests, Dokumentation) mit Abnahmekriterien gilt nur für D und beginnt erst, wenn der Betreiber Frage 1 mit „ja“ beantwortet.

## How the existing system works, per this document

Markenfrei hält sechs Zähler im Arbeitsspeicher jedes Prozesses.

- **Zwei Eingangslimits:** Das Client-Limit liegt bei 60 pro Minute und IP, das Systemlimit bei 600 pro Minute.
- **Abfragebudget je Zieldienst:** Es hat ein gleitendes Fenster und gilt für sechs Hosts. Es steht fest im Code (`HOST_BUDGETS`).
- **Slots je Host:** Höchstens 4 gleichzeitige Anfragen je Host und 3 je Prüfung.
- **Cache:** Er speichert eindeutige Ergebnisse 10 Minuten.
- **GitHub-Sperre:** Sie hält Anfragen zurück, bis das Rate-Limit abläuft.

Mit N Prozessen auf einer IP multiplizieren sich diese Grenzen, weil jeder Prozess nur seine eigenen Zähler kennt. Eingangslimits und GitHub kann der Betreiber am Proxy bzw. mit Token abfangen, die Abfragebudgets nicht. Heute läuft laut Dokument ein einziger Container, und ein Bedarf für mehr ist nicht belegt.

Der Reviewer konnte jeden Abschnitt paraphrasieren. Keiner ist ein Blocker.

## Findings

**1. Major. Zeilen 53 und 98 gegen 49 und 150**
Zeile 53 nennt das Abfragebudget „die einzige Lücke, die der Proxy nicht schließt“. Zeile 98 sagt, D schließe „die einzige offene Lücke“. Die Tabelle in Zeile 49 führt bei den Slots aber ebenfalls „niemand“ als Schützer auf. „Was D nicht löst“ (Zeile 150) nennt Slots ausdrücklich als offen. Das Dokument widerspricht sich also beim Kernargument für D. Es sollte sagen, ob Slots bewusst als geringeres Risiko gelten und warum.

**2. Major. Zeilen 140 bis 144 und Zeile 238**
`budget`, `retryable: true` und `error: "budget"` sind projektspezifisch. Das Dokument definiert sie nicht, und die verlinkte v2-spec und die READMEs enthalten sie auch nicht. `unknown` ist in der v2-spec erklärt, die beiden anderen nicht.

Auch die Mechanik hinter „wartet höchstens 1,5 Sekunden“ (`MAX_BUDGET_WAIT_MS`) fehlt. Gemeint ist offenbar: `takeBudget` liefert eine Wartezeit, und über 1,5 Sekunden bricht die Engine mit `budget` ab. Diese Annahme wird nie ausgesprochen. Der Satz „Auch bei N = 1 bleibt die dritte gleichzeitige Anfrage dort ohne Budget“ (Zeile 144) ist ohne diese Mechanik nicht nachvollziehbar. Gemeint ist wohl: Die erste Anfrage geht sofort, die zweite wartet 1 s, die dritte 2 s und überschreitet damit die 1,5 s. Auch der Zusammenhang „2 s Abstand, deshalb häufiger `budget`“ steht nur implizit da.

**3. Major. Abnahme (Zeile 258) gegen Schritt 2 (Zeile 236)**
Die Abnahme verlangt: „Mit `MARKENFREI_INSTANCES=2` und gezählten `fetch`-Aufrufen im Test aus Schritt 2“. Der Test in Schritt 2 setzt aber die Option `instances: 2` an `createHttpClient`, nicht die Umgebungsvariable. `INSTANCES` wird laut Zeile 215 beim Laden des Moduls gelesen. Der Weg von der Variable bis zur Teilung (`parseInstances(process.env…)` und `INSTANCES`) hat laut Plan keinen Test. Das Abnahmekriterium kann so, wie es formuliert ist, nicht erfüllt werden. Entweder braucht es einen eigenen Test oder einen Prozessstart mit gesetzter Variable, oder die Abnahme muss auf die Option verweisen.

**4. Nit. Zeile 39**
`checkCost` wird als Funktion genannt, ohne Datei und ohne Verweis. Die Beschreibung („verschiedene Namen mal aufgerundetes Verhältnis der gewählten zu den Standardquellen“) ist knapp, aber lesbar.

**5. Nit. Zeilen 3, 63 und 68**
- „EGM-Review“ (Zeile 3) ist weder erklärt noch verlinkt.
- „Prozess“, „Instanz“ und „Container“ werden wechselnd benutzt. „Instanz mit 1 vCPU und 1 GB“ (Zeile 63) meint einen Server. „Betrieb mit mehr als einer Instanz“ (Zeile 68) meint offenbar mehrere Prozesse. `MARKENFREI_INSTANCES` zählt Prozesse.
- Ein Satz zur Gleichsetzung würde genügen. Außerdem fehlt, wie mehrere Prozesse überhaupt gestartet würden (mehrere Container oder Worker), was für die Frage 2 relevant ist.

**6. Nit. Zeile 108 und Zeile 144**
„stdio-MCP-Paket“ und „Shortlist“ sind im Dokument nicht erklärt. Beide stehen nur in der README bzw. der v2-spec, zu denen es oben Links gibt.

**7. Nit. Zeilen 118 bis 125 und 124**
- Die Zeile „`huggingface.co` (anonym)“ legt ein zweites Budget mit `HF_TOKEN` nahe. Das Dokument nennt es nicht und sagt nicht, ob und wie es geteilt wird. Die README nennt 500 bzw. 1.000 pro 5 Minuten als Dienstgrenze, das Budget ist 450.
- Dass Budgets bewusst unter der Dienstgrenze liegen (450 gegen 500, Apple 18 gegen etwa 20), steht nicht im Dokument. „Dokumentierte Budgets“ in Ziel 1 (Zeile 78) bleibt dadurch mehrdeutig.

**8. Nit. Zeilen 85 bis 87, 100 und 155**
Option C ist eine „ergänzende“ Maßnahme und wird als Milderung für Cache und Client-Limit empfohlen. Wie die feste Zuordnung am Proxy aussieht (etwa Hash über die Client-IP) und ob der Betreiber sie einrichten muss, steht nirgends. Nach der Logik von Zeile 140 verschärft sie außerdem die ungleiche Last. Das Dokument erwähnt das nicht.

**9. Nit. Zeilen 33, 46 bis 47 und 53**
- In der ersten Tabelle trägt das Systemlimit keinen Variablennamen. `MARKENFREI_GLOBAL_RATE_LIMIT` (Standard 600) fällt erst in der zweiten Tabelle. Er steht auch nicht in der Umgebungsvariablen-Tabelle der README, sondern nur in deren Punkt 7.
- „Proxy-Limit“ erscheint als Schutz („Wer schützt heute“). Das Caddy-Beispiel der README enthält aber kein Limit, es ist eine Betreiberaufgabe. „README, Punkt 4“ ist an diesen Stellen nicht verlinkt.

**10. Nit. Zeilen 81, 165 bis 168 und 177**
- Ziel 3 („keine personenbezogene Angabe in einem gemeinsamen Speicher“) gilt für D trivial, weil D keinen gemeinsamen Speicher hat. Es wirkt nur für B und sollte so gekennzeichnet sein.
- „Hash, Geheimnis“ (Zeile 168) setzt voraus, dass ein gemeinsames Client-Limit die IP gehasht speichern müsste.
- „Fällt der Speicher aus, gilt der Anteil aus Option D“ (Zeile 177) setzt stillschweigend voraus, dass dann auch `MARKENFREI_INSTANCES` korrekt gesetzt ist.

**11. Nit. Schritt 3 (Zeilen 247 bis 252) und Zeile 200**
- „Punkt 4 und Punkt 8 den Satz … durch den Verweis … ergänzen“ ist widersprüchlich formuliert: ersetzen oder ergänzen?
- Bei der ROADMAP-Zeile „auf den Stand … setzen“ ist unklar, ob die Spalte „Idee“, „Voraussetzung“ oder das Status-Symbol geändert wird.
- Frage 2 nennt nicht, bis wann sie zu klären ist. Nur Frage 1 hat „vor Schritt 1“.

**12. Nit. Beobachtung zu den Referenzdateien**
Die README nennt in Punkt 6 „Apple etwa 20 pro Minute“. In Punkt 8 und im Design-Dokument steht 18. Schritt 3 ändert Punkt 6 nicht. Das ist kein Mangel des Zieldokuments, es kann aber einen neuen Leser irritieren.

## Prüfung der Rechenbeispiele

Die Rechenbeispiele wurden nachgerechnet. Die Tabelle in den Zeilen 118 bis 125, die Testwerte in Schritt 2 (darunter `{1, 63334}` für 18/60000 bei N = 19) und die Regel für `floor` und `ceil` sind konsistent.

## Geprüfte Dateien

`docs/design.md`, `docs/v2-spec.md`, `docs/trademark-registers.md`, `src/lib/README.md`, `README.md`, `ROADMAP.md`
