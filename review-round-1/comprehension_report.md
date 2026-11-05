# Comprehension-Test: `docs/design.md`

Stufe 6 der EGM-Review. Reviewer: `egm:egm-comprehension`. FeatureRange: Zeilen 1–155, DetailedRange: Zeilen 156–216.

## Paraphrase

**What this proposes**

Markenfrei läuft heute in einem Serverprozess. Dort liegen vier Dinge im Arbeitsspeicher: das Rate-Limit pro Client, das Limit pro Prozess, die Abfragebudgets je Zieldienst (zum Beispiel Apple 18 pro Minute) und der Cache. Laufen mehrere Prozesse hinter einem Reverse-Proxy auf derselben Server-IP, vervielfachen sich dadurch die Grenzen. Apple sieht dann bis zu 18 × N Anfragen pro Minute, und ein Client bekommt N-mal so viel Kontingent.

Das Dokument vergleicht vier Optionen: A (bei einem Prozess bleiben), B (gemeinsamer Zähler in Redis oder Valkey), C (Sticky Routing) und D (Budgets durch die Prozesszahl teilen). Empfohlen wird zuerst A, dann D und danach B nur für das Client-Limit. Der Umsetzungsplan baut dennoch B für alles. Die Wahl zwischen D und B steht ausdrücklich als offene Frage.

B funktioniert so: Eine Schnittstelle `LimitStore` mit `take(...)` hat zwei Implementierungen, `memoryStore` und `redisStore`. Ohne `MARKENFREI_STATE_URL` bleibt alles wie heute. Bei einem Ausfall oder Timeout (50 ms) fällt der Aufrufer auf den Prozessspeicher zurück (fail-open). Der Plan hat fünf Schritte: Schnittstelle, Budget über den Speicher, Redis-Implementierung, Tests, Doku.

**How the existing system works, per this document**

Eine Engine prüft einen Namen gegen viele Quellen (Domains, Pakete, Stores, bekannte Namen). Jede Quelle liefert ein `SourceResult` mit einem Status. Daraus entsteht eine Ampel: Rot bei `taken` aus einer nicht schwachen Quelle, Grün nur wenn alle Quellen `not_found` melden, sonst Gelb. Oberfläche, HTTP-API und MCP-Server nutzen dieselbe Engine.

Eine Anfrage durchläuft zuerst die Routen-Prüfung und den Wächter (Kosten werden von Client- und Prozesslimit abgezogen). Dann startet die Engine alle Quellen parallel über einen gemeinsamen `HttpClient`. Der Client begrenzt Slots je Host und Abfragebudgets für sechs Hosts und bündelt gleiche Anfragen. Eindeutige Ergebnisse kommen 10 Minuten in den Cache, `unknown` nie. Die Marke wird nicht abgefragt, sondern nur als Recherche-Vorbereitung ausgegeben.

Die Paraphrase gelang für alle Abschnitte. Der Plan ist in sich verständlich. An einigen Stellen konnte der Reviewer aber nur raten, wie die Teile zusammenpassen (siehe Findings).

## Findings

1. **Severity: Major**
   **Affected Scope:** „Lösungsraum“ und Empfehlung (Z. 116–121) gegen „Detailed Implementation Plan“ (Z. 156–216)
   **Beschreibung:** Das Dokument empfiehlt A, dann D, dann B nur für das Client-Limit. Der Plan setzt aber B für alles um, und D kommt im Plan nicht vor. Auch die Abnahme gilt nur für B. Ein Leser weiß nicht, was er freigeben soll. Wenn D gewählt wird, ist unklar, welche Teile des Plans entfallen oder ersetzt werden. Unklar ist auch, ob Schritt 1 (Interface und `await`-Umbau) für D überhaupt nötig wäre. Das Dokument sollte klar sagen: Der Plan gilt nur, wenn B entschieden ist.

2. **Severity: Major**
   **Affected Scope:** `HOST_BUDGET_SHARE` (Z. 114)
   **Beschreibung:** Die Variable wird nur im Namen genannt. Es fehlen Format, Standardwert und Bedeutung (Zahl der Prozesse? Divisor?). Es fehlt auch, wie bei krummen Ergebnissen gerundet wird, etwa crates.io mit 1 pro Sekunde geteilt durch 2. Der Name hat außerdem kein Präfix `MARKENFREI_`, anders als die übrigen Variablen. Da D die erste Empfehlung ist, ist diese Lücke relevant.

3. **Severity: Major**
   **Affected Scope:** Entscheidungstabelle (Z. 85–87) gegen Vorschlag
   **Beschreibung:** Die Tabelle steht unter „gebauter Zustand“. Sie verwirft „Redis von Anfang an“ und begründet den Arbeitsspeicher mit der Datenschutzzusage. Der Vorschlag führt Redis nun ein. Das Dokument markiert nicht, dass diese Entscheidungen durch den Vorschlag überholt oder neu bewertet werden. Auch ob die Datenschutzzusage „Zustand im Arbeitsspeicher“ nur dem Wortlaut nach oder inhaltlich betroffen ist, bleibt offen. Nur Z. 145–146 und Frage 2 berühren das.

4. **Severity: Major**
   **Affected Scope:** Namen der Wächter: `guard`, `guardRequest`, `createGuard`, `createProcessGuard`, `processGuard`, „Limit des Prozesses“, „Systemlimit“ (Z. 51, 62, 130–131, 170)
   **Beschreibung:** Dieselbe Sache hat mehrere Namen, und es ist unklar, ob sie identisch sind. Ist `guard` gleich `guardRequest`? Ist „Limit des Prozesses“ gleich `processGuard` gleich „Limit pro Gesamtsystem“? Warum gibt es überhaupt ein Prozesslimit neben dem Client-Limit? Es fehlt auch sein Wert. Genannt sind nur 60 Einheiten pro Minute und Client. Unter „Wächter“ steht „pro Client (IP) und pro Prozess“, im Vorschlag wird daraus „pro System“. Ob `processGuard` bei mehreren Prozessen wirklich systemweit zählen soll, ist ein stiller Bedeutungswechsel.

5. **Severity: Major**
   **Affected Scope:** `getStore().kind` (Z. 178) gegen die Schnittstelle `LimitStore` (Z. 127–129, 163)
   **Beschreibung:** `LimitStore` wird als Schnittstelle mit nur einer Methode `take` beschrieben. Schritt 2 verwendet aber `getStore().kind`, das nirgends definiert ist. Unklar bleibt auch:
   - Welchen Wert hat `kind`, wenn `redisStore` gerade im Rückfall auf den Prozessspeicher ist?
   - Läuft bei `memory` der alte `takeBudget` (mit `budgetLog`) oder `memoryStore.take`?
   - Gilt im Rückfall derselbe Pfad wie bei „Grenzen im Prozess gelten weiter“ (Z. 142)?

   Das sind zwei Zählverfahren (Protokoll bzw. Fenster) für dasselbe Budget, ohne dass das erklärt wird.

6. **Severity: Major**
   **Affected Scope:** „Zähler als festes Zeitfenster“ (Z. 137), „weil es die Grenzen exakt hält“ (Z. 119–120), Abnahme (Z. 213–214)
   **Beschreibung:** Das Dokument behauptet, B halte die Grenzen exakt. Ein festes Zeitfenster lässt an der Fenstergrenze bis zu 2 × Limit in kurzer Zeit zu. Der bisherige `budgetLog` ist nach dem Namen zu urteilen ein Protokoll mit gleitendem Fenster. Ob das so ist, steht nicht im Dokument. Der Leser kann nicht beurteilen, ob die Aussage „höchstens 18 Anfragen“ in der Abnahme für jede Minutenlage gilt oder nur für den Testlauf. Gemeint ist hier „exakter als heute“, nicht „exakt“.

7. **Severity: Major**
   **Affected Scope:** Betrieb von Redis (Schritt 3, Z. 190–192; Abnahme Z. 213)
   **Beschreibung:** Die Variablen kommen in `docker-compose.yml`. Es steht aber nirgends, wer den Redis-/Valkey-Dienst im Betrieb startet, ob er ins Compose-File kommt und ob er von außen erreichbar sein darf. Die Abnahme verlangt zwei lokale Prozesse mit gemeinsamem Redis, ohne zu sagen, wie dieses Redis lokal zu starten ist. Für Option B ist das eine unausgesprochene Voraussetzung.

8. **Severity: Major**
   **Affected Scope:** Route `opendata-words` (Z. 50, 170)
   **Beschreibung:** Die Route erscheint in der Tabelle und in Schritt 1 (auf `await` umstellen). Weder dieses Dokument noch v2-spec.md erklären, was sie tut oder warum sie ein Rate-Limit braucht. Ein neuer Leser kann nicht beurteilen, ob sie zum Umfang gehört.

9. **Severity: Nit**
   **Affected Scope:** Kosten: „Namen × Quellenumfang“, „Einheiten“, `checkCost` (Z. 51, 62, 97)
   **Beschreibung:** „Quellenumfang“ ist nicht definiert, ebenso wenig, ob „Einheiten“ dasselbe wie „Kosten“ sind. Für den Plan ist das wichtig, weil `take(key, cost, ...)` genau diese Größe nimmt.

10. **Severity: Nit**
    **Affected Scope:** Begriffe „Speicher“, „Zwischenspeicher“, „Cache“, „Prozessspeicher“, „Arbeitsspeicher“, „gemeinsamer Speicher“ (Z. 40, 57, 87, 125–146)
    **Beschreibung:** „Zwischenspeicher“ (Cache) und „Speicher“ (Redis bzw. `LimitStore`) liegen sprachlich nah beieinander. Das erschwert das Lesen, besonders in „Fällt der gemeinsame Speicher aus“ und im Nicht-Ziel „kein gemeinsamer Zwischenspeicher“. Ein Glossar oder feste Begriffe würden helfen.

11. **Severity: Nit**
    **Affected Scope:** Schlüsselbildung (Z. 134, 176–177)
    **Beschreibung:** Das Dokument nennt `mf:host:<host>`, der Code in Schritt 2 übergibt aber `"host:" + host`. Wer das Präfix `mf:` setzt, steht nicht da. Ebenso bleibt offen, wo die IP gehasht wird: im Aufrufer oder in `redisStore(url, secret)`. Aus Z. 188 lässt sich nur folgern, dass es in `redisStore` geschieht, weil nur dort das Geheimnis ankommt.

12. **Severity: Nit**
    **Affected Scope:** README-Verweise (Z. 100, 116–117, 203) und `MAX_KEYS`, `MAX_BUDGET_WAIT_MS`, `memoryStore(now?)` (Z. 163, 179)
    **Beschreibung:** Der README wird mehrfach als Quelle genannt, aber nicht verlinkt (Punkte 4 und 8, die gemessenen 4 bis 5 Prüfungen pro Sekunde). Das Ergebnis der Messung wird als Argument gegen eine Umstellung verwendet. Was dort gemessen wurde (ein Name, welche Quellen, welche Hardware), steht nicht da. Konstanten wie `MAX_KEYS` und der Parameter `now?` (vermutlich eine austauschbare Uhr für Tests) werden ohne Erklärung genannt. Das ist für einen Leser der Dateien in Ordnung, nicht aber für ein eigenständiges Dokument.

13. **Severity: Nit**
    **Affected Scope:** „höchstens 3 je Prüfung“ (Z. 66–67), Statuswerte und `weak` (Z. 69–73), „MCP“ (Z. 12, 52)
    **Beschreibung:**
    - Die Grenze „3 je Prüfung“ steht weder in v2-spec noch sonst erklärt. Dort steht nur „4 pro Host“. Unklar ist auch, ob „Prüfung“ einen Namen oder einen ganzen Aufruf meint.
    - `similar`, `invalid` und `weak` werden nur aufgezählt, nicht definiert. Die Definition steht in v2-spec.md, das am Anfang verlinkt ist. Das genügt, ein Satz dazu wäre aber besser.
    - Das Kürzel MCP wird nie ausgeschrieben. Zudem fehlt im Dokument ein Satz, warum stdio-Betrieb immer `memoryStore` nutzt (Z. 185–186).

14. **Severity: Nit**
    **Affected Scope:** „Betreiber“, „Datenschutzprüfung“, „Grundsätze“ (Z. 151–152); „300 Sekunden“ (Z. 144)
    **Beschreibung:**
    - Die Rolle „Betreiber“ wird nicht erklärt. Sie kommt auch in v2-spec.md vor, dort ebenfalls ohne Definition.
    - Die „Grundsätze“ stehen in Ziel 4 (Z. 29). Dass die Frage dort anknüpft, muss man sich selbst herleiten.
    - Die 300 Sekunden als maximale Ablaufzeit stehen ohne Herleitung, während das Client-Fenster 60 Sekunden hat.

## Geprüfte Dateien

- `docs/design.md`
- `docs/v2-spec.md`
- `docs/trademark-registers.md`
