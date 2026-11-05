# Markenfrei: Betrieb mit mehreren Prozessen

Status: Entscheidungsvorlage, Stand 5. November 2026, beschreibt Version 2.0.0. Verbindlich für die
Prüfung bleibt [v2-spec.md](v2-spec.md); den Datenfluss beschreibt [src/lib/README.md](../src/lib/README.md).

## Entscheidung

Markenfrei zählt Anfragen, Abfragebudgets und gleichzeitige Verbindungen im Arbeitsspeicher eines
Prozesses. Laufen mehrere Prozesse auf derselben ausgehenden IP-Adresse, überschreiten sie zusammen
die Grenzen der abgefragten Dienste, obwohl jeder für sich in seiner Grenze bleibt.

| Option | Inhalt | Entscheidung |
|---|---|---|
| A | Ein Prozess | **gilt jetzt**: Ein Bedarf für mehr ist nicht belegt (siehe „Bedarf“). |
| A+ | Wie A, dazu ein ausdrücklicher Satz in der README und im Kommentar zu `HOST_BUDGETS`: Mehrere Prozesse auf derselben ausgehenden IP werden nicht unterstützt, Budgets gelten je Prozess. Kein Code. | **nächster Schritt**, sobald dieses Dokument angenommen ist. |
| D | Das Abfragebudget je Zieldienst durch die Prozesszahl teilen (`MARKENFREI_INSTANCES`) | **skizziert, nicht beschlossen**: Start erst nach einem „Ja“ zu Frage 1. |
| B | Gemeinsamer Zähler in Redis oder Valkey | **zurückgestellt**: neuer Dienst und neue Abhängigkeit, D reicht voraussichtlich. |
| C | Der Proxy ordnet jeden Client einem Prozess zu | **Betreiberempfehlung zu D**, keine eigene Lösung: Sie kann das Client-Limit je Prozess genau machen und den Cache für wiederholte Namen desselben Clients nutzbar halten, verstärkt aber die ungleiche Last (siehe Option D). |

Die Zähler bleiben im Arbeitsspeicher, nichts wird auf die Platte geschrieben. Das gilt für A, A+ und D.
B müsste diese Zusage für Abfragebudgets neu bewerten.

## Problem und Bedarf

### Was im Prozess liegt

Die Werte sind Standardwerte.

| Zähler | Ort | Verfahren | Zweck |
|---|---|---|---|
| Client-Limit | `src/lib/rate-limit.ts` (`guardRequest`) | festes Fenster, 60 Einheiten pro Minute und IP (`MARKENFREI_RATE_LIMIT`) | Missbrauch durch einen Client begrenzen |
| Systemlimit | `src/app/api/_lib/http.ts` (`processGuard`) | festes Fenster, 600 Einheiten pro Minute (`MARKENFREI_GLOBAL_RATE_LIMIT`) | Server-IP vor Sperren bei Dritten schützen |
| Abfragebudget | `src/lib/engine/http.ts` (`takeBudget`, `HOST_BUDGETS`) | gleitendes Fenster, sechs Zieldienste | dokumentierte Grenzen der Dienste einhalten |
| Slots je Host | `src/lib/engine/http.ts` (`acquireSlot`) | 4 gleichzeitige Anfragen je Host | Zieldienste nicht überlasten |
| Cache | `src/lib/cache.ts` | 10 Minuten, nur eindeutige Ergebnisse | wiederholte Namen ohne Abfrage beantworten |
| GitHub-Sperre | `src/lib/engine/sources/packages.ts` | keine Anfragen bis `x-ratelimit-reset` | nicht in ein bekanntes Limit laufen |

Eine Einheit ist die Größe, die `checkCost` berechnet: die Zahl verschiedener Namen mal aufgerundetes
Verhältnis der gewählten zu den Standardquellen. Die Standardprüfung kostet 1 je Name.

### Folge bei N Prozessen

| Zähler | Wirkung bei N Prozessen | Was der Betreiber setzen kann |
|---|---|---|
| Client-Limit | bis zu N × 60 pro Minute je Client | Limit am Proxy ([README, Punkt 4](../README.md#vor-dem-livegang)); der Proxy zählt Anfragen, nicht Einheiten |
| Systemlimit | bis zu N × 600 Einheiten pro Minute | `MARKENFREI_GLOBAL_RATE_LIMIT` auf 600 / N |
| Abfragebudget | der Dienst sieht bis zu N × Budget, bei Apple N × 18 pro Minute | nichts: `HOST_BUDGETS` ist fest im Code; der Kommentar dort rät, die Budgets zu senken, einen Einstellweg gibt es nicht |
| Slots | bis zu N × 4 gleichzeitige Anfragen je Host | nichts |
| Cache | bei gleichmäßiger Verteilung etwa 1 / N der Treffer (Schätzung) | Option C |
| GitHub-Sperre | andere Prozesse laufen in dasselbe Limit | `GITHUB_TOKEN` (5.000 statt 60 Anfragen pro Stunde) |

Das Abfragebudget ist die schwerwiegendste Lücke: Für diese Dienste belegt das Repository ein
dokumentiertes Limit (Belege im Kommentar zu `HOST_BUDGETS`), und der Proxy kann sie nicht zählen, weil
es ausgehende Abfragen sind. Für Slots nennt das Repository kein Limit eines Dienstes.

### Bedarf

Ein Bedarf für mehr als einen Prozess ist nicht belegt:

- `docker-compose.yml` startet einen Container mit festem Namen und Port.
- [README, Punkt 8](../README.md#vor-dem-livegang): Eine Instanz mit 1 vCPU und 1 GB reicht. Die Grenze setzen
  die Zieldienste, nicht der Server. Der Durchsatz von etwa 4 bis 5 Prüfungen pro Sekunde stammt aus einer
  Simulation mit fester Antwortzeit von 300 ms und gestubbten Diensten, nicht aus echtem Verkehr. Ein zweiter
  Prozess auf derselben IP erhöht diese Grenzen nicht. Das Apple-Budget von 18 pro Minute ist ein konfigurierter
  Wert in `HOST_BUDGETS`.
- Die [ROADMAP](../ROADMAP.md) führt „Rate-Limit über mehrere Instanzen“ unter „Später“ mit der Voraussetzung
  „Betrieb mit mehr als einer Instanz“.

Ein möglicher Anlass wäre ein Neustart ohne Ausfall, bei dem kurz zwei Prozesse laufen. Dafür hilft D nicht:
Ein Neustart setzt die Zähler zurück, und ein dauerhaft gesetztes `N = 2` halbiert im Normalbetrieb die Budgets.

## Ziele und Nicht-Ziele

Ziele, falls D gebaut wird:

1. Mit N Prozessen auf einer ausgehenden IP bleibt die Summe der Anfragen an einen Zieldienst innerhalb
   seines Eintrags in `HOST_BUDGETS`. Ausnahme: Ist `max < N`, gilt das nur im Mittel (siehe Option D).
2. Ohne Konfiguration verhält sich Markenfrei wie heute.

Nicht-Ziele:

- Kein gemeinsamer Cache für Quellenantworten: Er bräuchte einen gemeinsamen Speicher mit Antworttexten und mehr
  Betriebsaufwand. Die sinkende Trefferquote wird hingenommen.
- Kein gemeinsames Client-Limit: Der Überschuss ist auf N × 60 begrenzt, und der Proxy kann ihn begrenzen.
- Keine Verteilung auf mehrere ausgehende IP-Adressen.
- Keine Änderung am Berichtsschema (`schemaVersion: 2`) und an den MCP-Tools.
- Slots und GitHub-Sperre sind Restrisiken, keine Ziele (siehe Option D).

## Option D: Budgets teilen (Skizze)

### Regel

`MARKENFREI_INSTANCES` ist die Zahl der Serverprozesse hinter dem Proxy, die dieselbe ausgehende IP-Adresse
teilen: eine ganze Zahl ab 1, Standard 1, ein ungültiger Wert zählt als 1. Jeder Prozess nimmt von jedem
Abfragebudget `{ max, windowMs }` den Anteil 1 / N:

- Ist `floor(max / N) ≥ 1`, gilt `{ floor(max / N), windowMs }`.
- Sonst gilt `{ 1, ceil(windowMs × N / max) }`, also eine Anfrage je verlängertem Fenster.

`HOST_BUDGETS` bleibt das Gesamtbudget des Dienstes, das gleitende Fenster von `takeBudget` bleibt erhalten.
Das stdio-MCP-Paket läuft einmal je Nutzer; die Variable ist dort nicht vorgesehen.

| Dienst | Gesamtbudget | N = 2 je Prozess | N = 3 je Prozess |
|---|---|---|---|
| `itunes.apple.com` | 18 pro Minute | 9 pro Minute | 6 pro Minute |
| `api.gleif.org` | 50 pro Minute | 25 pro Minute | 16 pro Minute |
| `hex.pm` | 90 pro Minute | 45 pro Minute | 30 pro Minute |
| `mastodon.social` | 250 pro 5 Minuten | 125 pro 5 Minuten | 83 pro 5 Minuten |
| `huggingface.co` (anonym; mit `HF_TOKEN` 900) | 450 pro 5 Minuten | 225 pro 5 Minuten | 150 pro 5 Minuten |
| `crates.io` | 1 pro Sekunde | 1 pro 2 Sekunden | 1 pro 3 Sekunden |

### Was die Regel zusichert

Die Zusage gilt nur, wenn `MARKENFREI_INSTANCES` der tatsächlichen Prozesszahl entspricht (zu klein:
Überschreitung; zu groß: Budget bleibt ungenutzt) und nur ohne Neustart, denn die Zähler liegen im Arbeitsspeicher.

- Ist `max ≥ N`, hält jeder Prozess in jedem Fenster höchstens `floor(max / N)` Anfragen. Die Summe liegt damit in
  jedem Fenster bei höchstens `max`.
- Ist `max < N` (crates.io ab N = 2), gilt die Rate nur im Mittel: Im Fenster von einer Sekunde können bis zu N
  Anfragen zusammenfallen. Die Crawler-Richtlinie von crates.io nennt 1 pro Sekunde; das ist Frage 2.
- Teilt N das Budget nicht, bleibt ein Rest ungenutzt (18 mit N = 7: 14 von 18).

### Folgen

`budget` heißt: Das Abfragebudget des Dienstes ist ausgeschöpft, es wurde keine Anfrage gesendet. Die Quelle meldet
`unknown` mit `retryable: true`, nie fälschlich frei.

- Bei ungleicher Last bleibt Budget eines Prozesses ungenutzt, während ein anderer in `budget` läuft.
- crates.io ist eine Standardquelle. Ab N = 2 beträgt der Abstand 2 Sekunden, die Engine wartet höchstens 1,5 Sekunden
  (`MAX_BUDGET_WAIT_MS`): Schon die zweite gleichzeitige crates-Anfrage eines Prozesses endet mit `budget`, eine
  Shortlist mit zwei Namen wird nie grün. Bei N = 1 trifft das erst die dritte.

### Restrisiken

- **Neustart.** Die Zähler beginnen leer, der Zieldienst zählt die Anfragen des alten Prozesses noch.
- **Slots.** Hosts ohne Budget (RDAP-Server, npm, PyPI) sehen bis zu N × 4 gleichzeitige Anfragen.
- **GitHub-Sperre.** Ein Prozess, der ein Limit erkennt, sperrt nur sich. `GITHUB_TOKEN` bleibt das Mittel.
- **Client- und Systemlimit.** Sie bleiben je Prozess; Proxy und `MARKENFREI_GLOBAL_RATE_LIMIT` begrenzen den Überschuss.
- **Cache und Option C.** Die Trefferquote sinkt bei N Prozessen; C hilft nur bei Wiederholungen desselben Clients
  und verstärkt die ungleiche Last, weil ein starker Client einen Prozess belegt.

## Eskalation zu B

B kommt erst in Betracht, wenn beides gilt: Es laufen mehrere Prozesse (belegt, nicht geplant), und D reicht
nachweislich nicht (Zieldienste sperren die Server-IP trotz D, oder ungleiche Last erzeugt dauerhaft `budget`).
Randbedingungen für einen Plan: nur Abfragebudgets, keine IP im Speicher, nichts auf der Platte.

## Offene Fragen

1. **Soll es einen Betrieb mit mehr als einem Prozess geben, und aus welchem Grund?** Entscheider: Betreiber. Ohne ein
   „Ja“ bleibt es bei A und A+.
2. **Wie soll crates.io ab N = 2 behandelt werden?** Die mittlere Rate einhalten und kurze Überschreitungen der
   Richtlinie von 1 Anfrage pro Sekunde hinnehmen, oder crates.io bei N ≥ 2 abschalten. Entscheider: Betreiber, zusammen
   mit Frage 1.

## Folgeschritt

Nach einem „Ja“ zu Frage 1 entsteht für D ein eigener Umsetzungsplan (Code in `src/lib/engine/http.ts`, Tests,
Dokumentation) in einer eigenen Datei.
