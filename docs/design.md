# Markenfrei: Betrieb mit mehreren Prozessen

- **Status:** Entscheidungsvorlage, Stand 5. November 2026, beschreibt Version 2.0.0
- **Entscheider:** Betreiber
- **Empfehlung:** Option A (ein Prozess) gilt heute. Option A+ (A plus ausdrücklicher Hinweis in der Dokumentation) ist umgesetzt (README, Kommentare, ROADMAP). Option D (Abfragebudgets teilen) ist skizziert, aber nicht beschlossen; Option B (gemeinsamer Zähler) ist zurückgestellt. Option C und E stehen in der Tabelle.
- **Zu entscheiden:** die [offenen Fragen](#offene-fragen)
- **Verbindlich** für die Prüfung bleibt [v2-spec.md](v2-spec.md); den Datenfluss beschreibt [src/lib/README.md](../src/lib/README.md).

Begriffe: Ein **Prozess** ist ein laufender Markenfrei-Server (die README sagt „Instanz“; die vorgeschlagene Variable hieße `MARKENFREI_INSTANCES`). **N** ist die Zahl der Prozesse, die dieselbe ausgehende IP-Adresse teilen. Eine **Anfrage** kommt von einem Client, eine **Abfrage** geht an einen Zieldienst (Apple, GitHub, RDAP-Server und andere).

## Optionen und Empfehlung

Markenfrei zählt Anfragen, Abfragebudgets und gleichzeitige Abfragen im Arbeitsspeicher eines Prozesses. Laufen mehrere Prozesse auf derselben ausgehenden IP-Adresse, können sie zusammen die Grenzen der Zieldienste überschreiten, obwohl jeder für sich in seiner Grenze bleibt.

| Option | Inhalt | Aufwand | Status | Grund |
|---|---|---|---|---|
| A | Ein Prozess | keiner | gilt heute | Ein Bedarf für mehr als einen Prozess ist nicht belegt ([Bedarf](#bedarf)). |
| A+ | Wie A, dazu der ausdrückliche Hinweis, dass mehrere Prozesse auf derselben ausgehenden IP nicht unterstützt sind und Budgets je Prozess gelten | Textänderungen ([Empfehlung A+](#empfehlung-a)) | **empfohlen** | Die README behandelt Mehrinstanzbetrieb in Punkt 4 als möglich und warnt in Punkt 8 davor; A+ beseitigt den Widerspruch. |
| D | Das Abfragebudget je Zieldienst durch N teilen (`MARKENFREI_INSTANCES`) | eine Funktion, eine Variable, Tests, Textänderungen, Ergänzung der v2-spec | skizziert, nicht beschlossen | Start erst nach einem „Ja“ zu Frage 2. D hält die Budgets unter Bedingungen ein ([Option D](#option-d-budgets-teilen-skizze)). |
| B | Gemeinsamer Zähler in Redis oder Valkey | neuer Dienst, neue Abhängigkeit, Tests und CI | zurückgestellt | Der Aufwand lohnt erst, wenn D nachweislich nicht reicht ([Eskalation zu B](#eskalation-zu-b)). |
| C | Der Reverse-Proxy ordnet jeden Client einem Prozess zu | Konfiguration beim Betreiber | Maßnahme des Betreibers, ergänzend zu D | Sie macht das Client-Limit je Prozess exakt zählbar und hält den Cache für wiederholte Namen desselben Clients nutzbar, verstärkt aber die ungleiche Last. |
| E | Ein gemeinsamer ausgehender Proxy (Egress-Gateway) hält Budgets und Slots für alle Prozesse | neuer Dienst beim Betreiber | nicht verfolgt | E teilt die Budgets ohne statisches N und lässt bei ungleicher Last nichts verfallen, braucht aber einen zusätzlichen Dienst beim Betreiber. Ohne belegten Bedarf wird er nicht verfolgt. |

## Problem und Bedarf

### Was im Prozess liegt und was bei N Prozessen geschieht

Eine Einheit ist die Größe, die `checkCost` berechnet: die Zahl verschiedener Namen mal aufgerundetes Verhältnis der gewählten zu den Standardquellen. Die Standardprüfung kostet 1 je Name. Die Werte in der Tabelle sind Standardwerte.

| Zähler | Ort und Verfahren | Wirkung bei N Prozessen | Was der Betreiber heute setzen kann |
|---|---|---|---|
| Client-Limit | `src/lib/rate-limit.ts` (`guardRequest`): festes Fenster, 60 Einheiten pro Minute und IP (`MARKENFREI_RATE_LIMIT`) | bis zu N × 60 pro Minute je Client | Limit am Proxy ([README, Punkt 4](../README.md#vor-dem-livegang)); der Proxy zählt Client-Anfragen, nicht Einheiten |
| Systemlimit | `src/app/api/_lib/http.ts` (`processGuard`): festes Fenster, 600 Einheiten pro Minute (`MARKENFREI_GLOBAL_RATE_LIMIT`), zählt nur Anfragen mit ausgehenden Abfragen | bis zu N × 600 Einheiten pro Minute | `MARKENFREI_GLOBAL_RATE_LIMIT` auf 600 / N |
| Abfragebudget | `src/lib/engine/http.ts` (`takeBudget`, `HOST_BUDGETS`): gleitendes Fenster, sechs Zieldienste | der Dienst sieht bis zu N × Budget, bei Apple N × 18 pro Minute | nichts: `HOST_BUDGETS` ist fest im Code, einen Einstellweg gibt es nicht |
| Slots je Host | `src/lib/engine/http.ts` (`acquireSlot`): 4 gleichzeitige Abfragen je Host | bis zu N × 4 gleichzeitige Abfragen je Host | nichts |
| Cache | `src/lib/cache.ts`: 10 Minuten, nur eindeutige Ergebnisse | bei gleichmäßiger Verteilung etwa 1 / N der Cache-Treffer (Schätzung) | Option C |
| GitHub-Sperre | `src/lib/engine/sources/packages.ts`: keine Abfragen bis `x-ratelimit-reset` | andere Prozesse kennen die Sperre nicht und laufen in dasselbe Limit | `GITHUB_TOKEN` (5.000 statt 60 Abfragen pro Stunde) |

Annahme: Jeder dieser Zähler ist Modulzustand je Prozess. Ob Next.js dieselben Module für alle Routen eines Prozesses teilt, ist nicht geprüft; teilt es sie nicht, wäre die Vervielfachung größer als N.

Ist das Abfragebudget eines Dienstes ausgeschöpft, wird keine Abfrage gesendet: `HttpResponse.error` lautet `"budget"` (`src/lib/engine/types.ts`), die Quelle meldet `unknown`. Bei vorübergehenden Gründen (Abfragebudget, Zeitüberschreitung, Ablauf der Frist, HTTP 429) trägt sie `retryable: true`. Das Ergebnis ist nie „frei“. Die Oberfläche (`src/components/checker.tsx`) wiederholt solche Ergebnisse automatisch; jede Wiederholung kostet Einheiten und Budget. API und MCP liefern das Flag, wiederholen aber nicht selbst.

Der Reverse-Proxy zählt keine ausgehenden Abfragen; teilen können das Abfragebudget die Anwendung (D), ein gemeinsamer Zähler (B) oder ein ausgehender Proxy (E). Der Kommentar zu `HOST_BUDGETS` belegt Limits für Apple („ungefähr 20 pro Minute“; das Budget ist mit 18 bewusst darunter), crates.io (Crawler-Richtlinie), Hex, Mastodon, Hugging Face, Repology (1 pro Sekunde), ecosyste.ms (5.000 pro Stunde ohne E-Mail-Adresse im User-Agent) und das AUR (4000 pro Tag); für GLEIF ist die Zahl nicht offiziell bestätigt. Auch GitHub hat ein belegtes Limit (60 Abfragen pro Stunde ohne Token), das D nicht löst. Welche Folge eine Überschreitung hat (Sperre der IP, HTTP 429, Dauer), ist für die meisten Dienste nicht belegt. Für Slots belegt das Repository kein Limit eines Dienstes; ob Dienste wie Wikidata eigene Drosselung anwenden, ist nicht geprüft.

### crates.io: Mangel bei Shortlists (behoben)

Die Namen einer Shortlist liefen parallel gegen das Budget `{ 1, 1000 ms }` der crates.io-API, und die Engine wartet höchstens 1,5 Sekunden auf ein Budget (`MAX_BUDGET_WAIT_MS`). Gemessen mit gestubbten Antworten: Von 6 Namen erhielten nur 2 ein crates-Ergebnis, die anderen endeten mit `budget`. Behoben: Die Quelle `crates` fragt den Sparse-Index (`index.crates.io`) ab, für den die Data Access Policy von crates.io (https://crates.io/data-access, Stand 7. November 2026) sagt: „No rate limits are required to use data from the sparse crate index“, und prüft dabei alle Schreibweisen mit - und _ (bis zu zwei Bindestriche; darüber die API mit Budget). `tests/shortlist-crates.test.ts` sichert das ab. Für die Optionen unten bleibt relevant, dass nur noch die API-Rückfalloption (Namen mit mehr als zwei Bindestrichen) am Budget hängt.

### Bedarf

Ein Bedarf für mehr als einen Prozess ist nicht belegt:

- `docker-compose.yml` startet einen Container mit festem Namen und Port.
- [README, Punkt 8](../README.md#vor-dem-livegang): Laut Simulation reicht eine Instanz mit 1 vCPU und 1 GB. Der Durchsatz von etwa 4 bis 5 Prüfungen pro Sekunde stammt aus einer Simulation mit fester Antwortzeit von 300 ms und gestubbten Diensten, nicht aus echtem Verkehr.
- Die Kapazität für neue Standardnamen ist unabhängig von N durch die Zieldienste begrenzt: Das Apple-Budget von 18 pro Minute (README: „ca. 18 neue Namen pro Minute“) und GitHub ohne Token mit 60 pro Stunde. Ein zweiter Prozess auf derselben IP erhöht diese Limits der Zieldienste nicht.
- Die [ROADMAP](../ROADMAP.md) führt „Rate-Limit über mehrere Instanzen“ unter „Später“ mit der Voraussetzung „Betrieb mit mehr als einer Instanz“.

Ein möglicher Anlass wäre ein Neustart ohne Ausfall, bei dem kurz zwei Prozesse laufen. Dafür hilft D nicht: Ein Neustart setzt die Zähler zurück, und ein dauerhaft gesetztes `N = 2` halbiert im Normalbetrieb die Budgets.

## Empfehlung A+

Diese Stellen behandeln den Betrieb mit mehreren Prozessen als unterstützt:

| Datei | Stelle | Änderung |
|---|---|---|
| `README.md` | „Vor dem Livegang“, Punkt 4 | Den Satz „Bei mehr als einer Instanz zusätzlich am Proxy begrenzen“ ersetzen: Mehrere Prozesse auf derselben ausgehenden IP werden nicht unterstützt. |
| `README.md` | Punkt 8, Spiegelstrich zu mehr Instanzen | Als Betriebsgrenze formulieren; eine kurze Überlappung beim Neustart erlaubt bis zu doppelt so viele Abfragen, solange der Zieldienst die des alten Prozesses noch zählt (höchstens eine Fensterlänge). |
| `README.md` | Tabelle „Umgebungsvariablen“, Zeile `MARKENFREI_RATE_LIMIT` | Den Satz zu mehreren Instanzen angleichen. |
| `src/lib/rate-limit.ts` | Kommentar am Dateikopf („serverlose Plattform … zusätzlich am Reverse-Proxy begrenzen“) | Angleichen. |
| `src/lib/engine/http.ts` | Kommentar zu `HOST_BUDGETS` | Den Satz „dort entsprechend senken“ entfernen. |
| `ROADMAP.md` | Zeile „Rate-Limit über mehrere Instanzen“ | Status an die Entscheidung anpassen. |

Unverändert bleiben diese Stellen, die bereits „pro Prozess“ sagen: README Punkt 7, `.env.example` (Kommentar zu `MARKENFREI_GLOBAL_RATE_LIMIT`: „pro Serverprozess“), `src/lib/README.md` (Zeile zu `rate-limit.ts`: „Gilt pro Serverprozess“) und `src/app/api/README.md` (Absatz zum Limit pro Prozess). Die [v2-spec.md](v2-spec.md) beschreibt Abfragebudgets bisher nicht und wird erst bei einem Bau von D ergänzt.

## Ziele und Nicht-Ziele

### Ziele

1. Bei A+: Betreiber erfahren vor dem Livegang, dass mehrere Prozesse auf derselben ausgehenden IP nicht unterstützt sind. Abnahmekriterium: Die Texte in der Tabelle „Empfehlung A+“ sind geändert und widersprechen einander nicht mehr.
2. Zusätzlich, falls D gebaut wird: Mit N Prozessen bleibt die Summe der Abfragen an einen Zieldienst innerhalb seines Eintrags in `HOST_BUDGETS`, unter den Bedingungen von „Was die Regel garantiert“.
3. Ohne Konfiguration verhält sich Markenfrei wie heute.
4. Randbedingung für alle Optionen: Die Zähler bleiben im Arbeitsspeicher, bei B im gemeinsamen Speicher ohne Persistenz; nichts wird auf die Platte geschrieben.

### Nicht-Ziele

- Kein gemeinsamer Cache für Quellenantworten: Er bräuchte einen gemeinsamen Speicher mit Antworttexten. Die sinkende Trefferquote wird hingenommen.
- Kein gemeinsames Client-Limit: Der Überschuss über das Limit eines Prozesses ist auf (N − 1) × 60 begrenzt, und der Proxy kann ihn begrenzen.
- Keine Verteilung auf mehrere ausgehende IP-Adressen: Das würde die Dienstgrenzen der Zieldienste vervielfachen und gilt hier als Umgehung der Limits, nicht als Lösung; es ist zudem eine Frage der Infrastruktur.
- Kein serverloser Betrieb und kein Autoscaling mit wechselnder Prozesszahl: Die Prozesszahl ist dort unbekannt, ein statisches N passt nicht.
- Kein Hochverfügbarkeits- oder Zero-Downtime-Betrieb: Der Container hat einen festen Namen und Port, ein Neustart unterbricht den Dienst kurz.
- Keine Änderung am Berichtsschema (`schemaVersion: 2`) und an den MCP-Tools.
- Slots und GitHub-Sperre sind Restrisiken, keine Ziele.

## Option D: Budgets teilen (Skizze)

### Regel

`MARKENFREI_INSTANCES` ist N: eine ganze Zahl ab 1, Standard 1, ein ungültiger Wert zählt als 1. Jeder Prozess erhält von jedem Abfragebudget `{ max, windowMs }` den Anteil 1 / N:

- Ist `floor(max / N) ≥ 1` (gleichwertig: `max ≥ N`), gilt `{ floor(max / N), windowMs }`.
- Sonst (`max < N`) gilt `{ 1, ceil(windowMs × N / max) }`, also eine Abfrage je verlängertem Fenster.

`HOST_BUDGETS` bleibt das Gesamtbudget des Dienstes, das gleitende Fenster von `takeBudget` bleibt erhalten. Daneben muss der Betreiber `MARKENFREI_GLOBAL_RATE_LIMIT` auf 600 / N setzen. Die zwei Werte bleiben bewusst getrennt, weil `MARKENFREI_GLOBAL_RATE_LIMIT` eine bestehende Variable ist; ein Umsetzungsplan darf das ändern.

| Dienst | Gesamtbudget | N = 2 je Prozess | N = 3 je Prozess |
|---|---|---|---|
| `itunes.apple.com` | 18 pro Minute | 9 pro Minute | 6 pro Minute |
| `api.gleif.org` | 50 pro Minute | 25 pro Minute | 16 pro Minute |
| `hex.pm` | 90 pro Minute | 45 pro Minute | 30 pro Minute |
| `mastodon.social` | 250 pro 5 Minuten | 125 pro 5 Minuten | 83 pro 5 Minuten |
| `huggingface.co` (anonym) | 450 pro 5 Minuten | 225 pro 5 Minuten | 150 pro 5 Minuten |
| `crates.io` | 1 pro Sekunde | 1 pro 2 Sekunden | 1 pro 3 Sekunden |
| `repology.org` | 1 pro Sekunde | 1 pro 2 Sekunden | 1 pro 3 Sekunden |
| `packages.ecosyste.ms` | 4500 pro Stunde | 2250 pro Stunde | 1500 pro Stunde |
| `aur.archlinux.org` | 3600 pro Tag | 1800 pro Tag | 1200 pro Tag |

Mit `HF_TOKEN` gilt für Hugging Face das Gesamtbudget 900 pro 5 Minuten. Die Tabelle zeigt abgerundete Werte; ein Rest bleibt ungenutzt (50 / 3: 16 je Prozess, zusammen 48 von 50).

Würde die Engine die Variable selbst lesen, teilte auch das stdio-MCP-Paket (ein Prozess je Nutzer) seine Budgets. Ein Umsetzungsplan muss das ausschließen, etwa indem der Server-Einstieg N an `createHttpClient` übergibt.

### Was die Regel garantiert

Die Garantie gilt nur, wenn `MARKENFREI_INSTANCES` der tatsächlichen Prozesszahl entspricht (zu klein: Überschreitung, zu groß: Budget bleibt ungenutzt) und nur ohne Neustart, denn die Zähler liegen im Arbeitsspeicher.

- Ist `max ≥ N`, hält jeder Prozess in jedem Fenster höchstens `floor(max / N)` Abfragen. Die Summe liegt damit in jedem Fenster höchstens bei `max`.
- Ist `max < N` (crates.io ab N = 2), gilt die Rate nur im Mittel: Im Fenster von einer Sekunde können bis zu N Abfragen zusammenfallen. Die Crawler-Richtlinie von crates.io nennt 1 pro Sekunde (Frage 3).

### Folgen

- Bei ungleicher Last bleibt Budget eines Prozesses ungenutzt, während ein anderer sein Budget ausschöpft.
- Die sinkende Cache-Trefferquote und das geteilte Budget verstärken sich: Wiederholte Namen, die ein anderer Prozess schon beantwortet hat, kosten wieder Budget.
- Der Mangel bei crates.io (siehe oben) verschärft sich: Mit N = 2 beträgt der Abstand 2 Sekunden, also mehr als die Wartegrenze von 1,5 Sekunden. Schon die zweite gleichzeitige crates-Abfrage eines Prozesses endet mit `budget`.

## Risiken und Gegenmaßnahmen

| Risiko | betrifft | Gegenmaßnahme oder Hinnahme |
|---|---|---|
| Neustart: Zähler beginnen leer, der Zieldienst zählt die Abfragen des alten Prozesses noch | A, A+, D | Hingenommen: Die Wirkung hält höchstens eine Fensterlänge je Dienst an (Apple: eine Minute). Bei einer Absturzschleife (`restart: unless-stopped`) wiederholt sie sich; der Betreiber überwacht den Container. |
| Der Betreiber ignoriert den Hinweis und startet mehrere Prozesse | A+ | Die Wirkung steht in der Tabelle „Was im Prozess liegt“. Der Hinweis ist keine technische Sperre; D würde die Folge für die Budgets mindern. |
| Falsches N | D | Zu klein mindert die Wirkung von D, zu groß lässt Budget ungenutzt. Es gibt keinen technischen Schutz; der Betreiber setzt N und `MARKENFREI_GLOBAL_RATE_LIMIT` gemeinsam. Ein Umsetzungsplan kann eine Startmeldung (ohne Namen und IP) prüfen. |
| Ungleiche Last | D | Hingenommen: Das Ergebnis ist `unknown`, nie frei. |
| Cache und geteiltes Budget verstärken sich | D | Hingenommen; Option C mildert das für wiederholte Namen desselben Clients. |
| Ein Client mit hohem Anfragevolumen belegt einen Prozess, der sein Budget ausschöpft, während die anderen ihren Anteil ungenutzt lassen | C mit D | Hingenommen. |
| crates.io bei `max < N` | D | Frage 3 |
| Client-Limit, Slots, Cache, GitHub-Sperre | A, A+, D | D löst sie nicht. Gegenmaßnahmen stehen in der Tabelle „Was im Prozess liegt“ (Proxy-Limit, `GITHUB_TOKEN`, Option C); für Slots ist kein Limit belegt, das Risiko ist hingenommen. |

## Eskalation zu B

B kommt erst in Betracht, wenn beides gilt:

1. Es laufen mehrere Prozesse (durch Betriebsdaten belegt, nicht nur geplant).
2. D reicht nachweislich nicht: Ein Zieldienst meldet die Sperre oder Drosselung der Server-IP trotz D, oder ungleiche Last erzeugt über sieben Tage bei mehr als 10 % der Abfragen an einen Dienst `budget`. Die Schwelle von 10 % ist ein Vorschlag dieses Dokuments, den der Betreiber bestätigt.

Heute gibt es dafür keine Messung: Der Webserver zählt `budget`-Ergebnisse nicht, und Namen dürfen nicht in Logs stehen. Ein aggregierter Zähler ohne Namen und IP wäre eine eigene Voraussetzung; bis dahin stützt sich die Eskalation auf Meldungen der Dienste. Randbedingungen für einen Plan: nur Abfragebudgets, keine IP im gemeinsamen Speicher, nichts auf der Platte.

## Offene Fragen

1. **Wird A+ angenommen?** Empfehlung: Ja. Folge: Die Texte der Tabelle „Empfehlung A+“ werden geändert. Entscheider: Betreiber.
2. **Soll es einen Betrieb mit mehr als einem Prozess geben, und aus welchem Grund?** Dabei ist zu klären, wie mehrere Prozesse gestartet würden; `docker-compose.yml` erschwert das mit festem Containernamen und Port. Empfehlung: Nein, solange kein Bedarf belegt ist. Entscheider: Betreiber. Ohne ein „Ja“ bleibt es bei A und A+.
3. **Nur bei „Ja“ zu Frage 2: Wie soll crates.io bei N ≥ 2 behandelt werden?** (a) Die mittlere Rate einhalten und kurze Überschreitungen der Richtlinie von 1 Abfrage pro Sekunde hinnehmen; (b) die Wartegrenze der Engine für diesen Host mit dem Abstand anheben, sodass mehr Namen ein Ergebnis bekommen; die Frist von 8 Sekunden begrenzt das (bei einem Abstand von 2 Sekunden auf etwa vier Namen je Shortlist, bei 1 Sekunde braucht der zehnte Name schon etwa 9 Sekunden); (c) crates.io bei N ≥ 2 abschalten. (b) behebt den Mangel nicht vollständig, vergrößert aber die Zahl der Namen mit Ergebnis. Empfehlung: (b), weil (a) die Richtlinie verletzt und (c) eine Standardquelle entfernt; das Verhältnis von Wartezeit und Frist ist im Umsetzungsplan zu beziffern. Entscheider: Betreiber.

## Nächste Schritte

- Nach „Ja“ zu Frage 1: Die Textänderungen der Tabelle „Empfehlung A+“ in einem eigenen Pull Request.
- Unabhängig von allen Optionen: Der crates.io-Mangel bei Shortlists ist als eigener Punkt zu führen (ROADMAP oder Issue).
- Nach „Ja“ zu Frage 2: Ein Umsetzungsplan für D in einer eigenen Datei. Er regelt Frage 3, die Übergabe von N an die Engine, die Validierung ungültiger Werte (insbesondere 0), den Test des Lesepfads der Variable und die Textänderungen.
