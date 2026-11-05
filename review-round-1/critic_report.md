# Critic Review: `docs/design.md`, Zeilen 1–155 (FeatureRange)

Stufe 7 der EGM-Review. Drei unabhängige Reviewer: `egm-design` (Standard: feature-spec), `egm-structural` (Standard: feature-spec), `egm-style` (ohne Standard). Alle drei haben berichtet (Status: completed). Dieser Bericht fasst ihre Findings zusammen und entfernt Doppelungen. Die Kennungen am Ende jedes Findings nennen den Ursprung: D = Design, S = Struktur, T = Stil, jeweils mit der Nummer im Roh-Bericht.

**Gesamturteil: nicht freigabefähig.** 2 Blocker, 13 Major, 12 Nits nach Zusammenführung. Die Beschreibung des Ist-Zustands stimmt im Wesentlichen mit dem Code überein (Hosts mit Budget, Slots 4 und 3, Budgetwerte, 60 Einheiten pro Minute). Die Schwächen liegen im Vorschlag.

## 🔴 Blocker

### B1. Empfehlung und Plan widersprechen sich, die Entscheidung ist offen (Z. 3–5, 33–36, 105–121, 148–151)
- Die Empfehlung lautet A, dann D, B nur für das Client-Limit. Der Plan ab Zeile 156 baut B für alles. D hat weder Plan noch Abnahme.
- Titel, Einleitung, Zusammenfassung und Ziele des Vorschlags lesen sich, als sei B beschlossen. Das Dokument trägt keinen Status.
- `HOST_BUDGET_SHARE` (Z. 114), die empfohlene Option D, ist nicht spezifiziert: keine Semantik, kein Format, kein Präfix `MARKENFREI_`, keine Herkunft der Prozesszahl.
- **Vorschlag:** Vor der Freigabe entscheiden, entweder (a) D vorschlagen, kurzen D-Plan schreiben und B als Eskalationsstufe mit Auslöser dokumentieren, oder (b) B vorschlagen und begründen, warum A und D nicht reichen. Status und Empfehlung in die Zusammenfassung. (D1, S5, T1)

### B2. Der Bedarf fehlt, und die Kapazitätsargumente sprechen gegen den Nutzen (Z. 16–19, 41, 116)
- Es steht nirgends, warum mehr als ein Prozess laufen soll. `docker-compose.yml` startet einen Container mit festem Namen und Port.
- Laut README Punkt 8 setzen die Zieldienste die Grenze, nicht CPU oder RAM. Ein zweiter Prozess bringt für Standardprüfungen kaum Durchsatz. Das Nicht-Ziel „keine Verteilung auf mehrere IPs“ schließt den einzigen Hebel aus.
- Der mögliche echte Nutzen ist Verfügbarkeit (Zero-Downtime-Deploy, überlappende Container). Er steht nicht als Motivation im Dokument.
- **Vorschlag:** Problemstellung mit konkretem Betriebsszenario und Auslöser ergänzen. Benennen, was B gegenüber „ein Prozess mit sauberem Neustart“ gewinnt. Ohne Beleg ist der Vorschlag spekulative Skalierung. (D2, auch Stufe 5, Finding 1)

## 🟡 Major

### M1. Festes Zeitfenster statt gleitendem Log: „exakt“ stimmt nicht (Z. 119–120, 137–138, 213–214)
- Der Ist-Zustand (`takeBudget`) ist ein gleitendes Fenster und nie über dem Maximum. Der Vorschlag nutzt ein festes Fenster, das an der Grenze bis zu 2 × Maximum kurz hintereinander erlaubt (Apple bis 36, crates.io 2 in kurzer Zeit).
- Die Abnahme „20 Prüfungen in einer Minute, höchstens 18 Anfragen“ ist damit nicht stabil.
- Im Ist-Zustand verbraucht ein abgelehnter Aufruf nichts. Ein naives `INCRBY` verbraucht auch abgelehnte Kosten (bis 10 Namen). `PEXPIRE` darf nur beim ersten Aufruf des Fensters gesetzt werden.
- **Vorschlag:** Gleitendes Fenster (ZSET-Log oder gewichtete Buckets) nehmen oder die Burst-Eigenschaft nennen und Budgets senken. „Exakt“ auf „hält die Grenzen ein, solange der Speicher erreichbar ist“ ändern. (D3, T8)

### M2. Rückfall bei Ausfall untergräbt das Ziel (Z. 139–142, 153–155)
- Im Rückfall gilt pro Prozess wieder das volle Budget, also N × 18 bei Apple. Der Ausfall ist mit Last korreliert.
- 50 ms ist nicht begründet; Event-Loop-Stalls lösen Fehlalarme aus. Flattert der Speicher, zählen zwei Zählstände parallel (bis 2 × Maximum je Prozess).
- ioredis reiht Kommandos bei Verbindungsverlust standardmäßig in eine Offline-Queue ein. Sie laufen später und zählen doppelt. Das Dokument nennt weder `enableOfflineQueue` noch das Verhalten bei Wiederverbindung.
- „fail-open“ ist falsch benannt (es gilt weiter ein Prozesslimit). Der Abschnitt steht als beschlossen, Frage 3 hält ihn offen. Die Folge von fail-closed (`unknown` mit `retryable: true`) fehlt.
- **Vorschlag:** Rückfall mit geteiltem Budget (verbindet D und B). Für Dienste mit Sperrrisiko (Apple, crates.io, GLEIF) fail-closed. Timeout, Backoff und Queue-Verhalten begründen. „Besser als keine Prüfung“ durch die Folge ersetzen. (D4, T9)

### M3. Nicht-Ziel „kein gemeinsamer Zwischenspeicher“ ist falsch begründet (Z. 40–41, 57, 87)
- Die Budgets begrenzen genau die Zahl der Abfragen. Der Cache ist der wichtigste Hebel, darunter zu bleiben. Bei N Prozessen sinkt die Trefferquote je Prozess grob auf 1/N, und Wiederholungen verbrauchen das gemeinsame Budget schneller (mehr `budget`-Unbekannte, Ergebnisse je Prozess unterschiedlich).
- „Nicht die Sicherheit“ und „ein Treffer ohne Netz ändert keine Grenze“ sind nicht nachvollziehbar. Z. 40 („spart Abfragen“) und Z. 87 („verändert nur die Zahl“) widersprechen sich.
- **Vorschlag:** Auf Komplexität und Datenschutz (Antworten im gemeinsamen Speicher) begründen und den Kapazitätsnachteil nennen, oder den gemeinsamen Cache ins Ziel nehmen. (D5, T5; vgl. Stufe 5, Finding 7)

### M4. GitHub-Sperre und Slot-Grenze sind benannt, aber weder gelöst noch ausgeschlossen (Z. 16–19, 98–99, 112, 118, 130–133)
- Die GitHub-Sperre gilt nur im Prozess, der die Antwort bekam. `api.github.com` steht nicht in `HOST_BUDGETS`, und es gibt keinen geteilten Schlüssel. Das ist die engste reale Grenze (60 pro Stunde ohne Token).
- Die Slot-Grenze bleibt im Prozess. Hosts ohne Budget (RDAP, npm, PyPI) sehen bei N Prozessen 4 × N gleichzeitige Anfragen.
- „eine einzige Grenze“ (Z. 16) steht neben vier aufgezählten. „Alle Grenzen gelten“ (Z. 112) und „D deckt die Zieldienst-Grenzen ab“ (Z. 118) sind zu stark.
- **Vorschlag:** GitHub und Slots ausdrücklich als Ziel oder Nicht-Ziel mit Restrisiko einordnen oder lösen (geteilter Schlüssel `github blocked-until`, Slot-Grenze durch Prozesszahl). Formulierungen auf den geprüften Umfang kürzen. (D6, T2)

### M5. Betrieb und Datenschutz des neuen Speichers sind nicht gedeckt (Z. 85, 125–146, 151–152)
- Redis schreibt standardmäßig RDB-Snapshots. Gehashte IP-Schlüssel landen auf der Platte und in Backups. Die Zusage „nichts auf der Platte“ (Z. 85, README) gilt nicht mehr automatisch. Der Plan verlangt kein `save ""` und kein `appendonly no`.
- HMAC mit Geheimnis ist Pseudonymisierung, „damit keine IP im Speicher liegt“ ist zu stark. „Nur gehashte Schlüssel“ stimmt nicht: `mf:system` und `mf:host:<host>` sind Klartext. Frage 2 fragt nach „Speicherung von Suchanfragen“, die Zähler enthalten aber keine. Die eigentliche Frage ist Personenbezug und Speicherort.
- Es fehlen `maxmemory` und Eviction-Policy (bei IPv6-Rotation entstehen beliebig viele Client-Schlüssel; Eviction setzt Zähler zurück), Authentifizierung und TLS, Rotation von `MARKENFREI_STATE_SECRET` (verschiedene Geheimnisse teilen Zähler stillschweigend auf) und eine Startmeldung ohne Passwort in der URL.
- „300 Sekunden“ ist nicht hergeleitet (Invariante: kein Budgetfenster länger als 300 s). „ändern sich entsprechend“ nennt keine konkrete Änderung.
- Es fehlt der Redis-Dienst in `docker-compose.yml` und die Angabe, wer ihn betreibt.
- **Vorschlag:** Abschnitt „Betrieb und Datenschutz“ mit Redis-Konfiguration, Geheimnis-Handling, Pseudonymisierung und Änderungen an Datenschutzerklärung und README einzeln. (D7, T10, S1; Stufe 5, Finding 8; Stufe 6, Finding 7)

### M6. Der Wechsel zum Systemlimit ändert die Bedeutung einer bestehenden Variable still (Z. 130–131)
- `MARKENFREI_GLOBAL_RATE_LIMIT` heißt heute „pro Prozess“ (README, `api/_lib/http.ts`). Mit gesetzter `MARKENFREI_STATE_URL` würde sie „insgesamt“ bedeuten. Ziel 2 („ohne Konfiguration wie heute“) deckt das nicht ab. Bleibt der Wert gleich, wächst die Kapazität mit N nicht.
- **Vorschlag:** Änderung nennen oder neue Variable einführen. (D8, T12; Stufe 5, Finding 11)

### M7. Alternativen unvollständig, Ablehnungsgründe nicht als Struktur, „heutiger Umgang“ falsch zitiert (Z. 100–103, 107–121)
- Es fehlen: ein Prozess als Besitzer aller ausgehenden Abfragen, Node-Cluster mit Primärprozess, Proxy-Rate-Limit als eigene Option. Alternativen zu den Detailentscheidungen (festes gegen gleitendes Fenster, Redis gegen andere Speicher, fail-open gegen fail-closed) werden nicht verglichen.
- Die Tabelle hat keine Spalte „Entscheidung und Begründung“ (gewählt, verworfen, zurückgestellt). Die Überschrift „Lösungsraum“ ist als „Alternatives Considered“ schlecht auffindbar. Die Kostenspalte wiederholt teils die Wirkungsspalte (Z. 113).
- Der „heutige Umgang“ zitiert die README falsch: Punkt 4 und 8 sagen nicht, die Budgets pro Prozess zu senken; das steht nur im Kommentar in `http.ts`. `HOST_BUDGETS` ist hartkodiert, einen Konfigurationsweg gibt es nicht. Der erste Satz („Budgets senken“) ist außerdem Option D von Hand; der Unterschied zu D bleibt unbenannt.
- **Vorschlag:** Tabelle ergänzen und umbenennen, „heutigen Umgang“ trennen in „Proxy-Limit schützt X“ und „manuelles Senken schützt Y, nicht Z“, Unterschied zu D nennen. (D9, S2, T6; Stufe 5, Finding 9)

### M8. Die Schnittstelle `LimitStore` ist unterspezifiziert und der Plan widerspricht sich bei den Tests (Z. 127–133, 163–171, 215–216)
- `retryAfterSec` in ganzen Sekunden, der Budgetpfad braucht Millisekunden (`MAX_BUDGET_WAIT_MS = 1500`). Bei crates.io würde jede Wartezeit auf eine volle Sekunde aufgerundet.
- Ob `take` asynchron ist, steht nicht in der Schnittstelle. Der Plan macht `check` asynchron und passt Tests an (Z. 171), behauptet aber „bestehende Tests unverändert“ (Z. 168, 215–216).
- `getStore().kind` ist nirgends definiert; offen ist der Wert im Rückfall und ob `takeBudget` oder `memoryStore.take` läuft (zwei Zählverfahren für dasselbe Budget).
- **Vorschlag:** Millisekunden in die Schnittstelle, Synchronität entscheiden (`Result | Promise<Result>`), `kind` definieren oder entfernen, Abnahme korrigieren. (D10, T5 der Verständlichkeitsstufe; Stufe 5, Findings 4–5; Stufe 6, Finding 5)

### M9. Erfolgskriterien und Messbasis fehlen (Z. 21–36, 116, 150)
- Keine Metriken: Redis-Round-Trips pro Prüfung (Client, System und bis zu sechs Budgets), zusätzliche Latenz gegen die 8-Sekunden-Frist, Einzelausfallpunkt.
- „4 bis 5 Prüfungen pro Sekunde“ stammt aus einer Simulation mit festen 300 ms und gestubbten Diensten, „nicht mit echtem Verkehr getestet“ (README Punkt 8). Das Dokument lässt die Einschränkung weg. „A, solange ein Prozess reicht“ nennt keinen Auslöser. Ziel 1 („höchstens 8 Sekunden“) lässt offen, ob je Name, je Aufruf oder je Shortlist. Ziel 3 („bleibt nutzbar“) hat keine Zahl.
- **Vorschlag:** Schätzungen und messbare Ziele ergänzen (zum Beispiel Antwortzeit bei Ausfall höchstens 8 s, Rückfall nach höchstens 50 ms), Messbedingungen und Schwelle nennen. (D11, T7, T13)

### M10. Entscheidungstabelle mischt gültige und vom Vorschlag berührte Entscheidungen (Z. 77–87)
- Z. 85 verwirft „Redis von Anfang an“, Z. 86 („Budget je Zieldienst im Prozess“) gilt nur bei einem Prozess. Der Vorschlag führt Redis ein, ohne die Tabelle abzugleichen.
- **Vorschlag:** Spalte „Status“ (gilt weiter, durch Vorschlag berührt) und Begründung für die geänderte Bewertung. (S6, T3)

### M11. Pflichtabschnitte des Standards fehlen oder sind nicht auffindbar (Z. 21–146)
- Kein Abschnitt „Risiken und Gegenmaßnahmen“. Die Risiken stehen verstreut (Z. 139–146, 148–154, Abnahme). Fehlende Punkte: Zugriffsschutz, Speicher als Einzelausfallpunkt, Latenz, Fenstergrenz-Bursts, Geheimnisrotation, Umgehung über gezielte Störung bei Rückfall.
- Kein eigener Abschnitt „Problemstellung“. Ziele (Z. 21–43) kommen vor der ausführlichen Problembeschreibung (Z. 89–103).
- Die vorgeschlagene Architektur steckt unter „Verhalten“ als flache Liste mit sieben Punkten, nur zwei fett markiert, ohne Komponenten- oder Datenflussdarstellung.
- **Vorschlag:** H2 „Problemstellung“ nach der Zusammenfassung, H3 „Architektur“ mit Tabelle analog zu Z. 47–57, H3-Untergliederung (Schlüsselschema, Ausfallverhalten, Datenschutz), eigener Abschnitt „Risiken und Gegenmaßnahmen“ als Tabelle. (S1, S3, S4)

### M12. Aussage zu den Markenregistern geht über die Belege hinaus (Z. 84)
- „Keine Register mit offener, freier Schnittstelle“ ist stärker als `trademark-registers.md` (TMview und WIPO „nicht geprüft“, „kein belegter offener Zugang“).
- **Vorschlag:** „Für keines der geprüften Register ist ein schlüsselfreier Zugang belegt“. (T4)

### M13. Begriffe für Speicher und Limits sind uneinheitlich und teils undefiniert (u. a. Z. 16–19, 34, 36, 40, 51, 57, 62, 87, 96, 125–146)
- Speicher: „Zwischenspeicher“, „Cache“, „Speicher“, „gemeinsamer Speicher“, „Prozessspeicher“, „Arbeitsspeicher“. Z. 87 benutzt „gemeinsamen Zwischenspeicher“ (ausgeschlossen) und „gemeinsamen Speicher“ (vorgeschlagen) mit verschiedener Bedeutung; Ziel 3 nennt den „gemeinsamen Speicher“ vor seiner Definition.
- Limits: „Limit pro Gesamtsystem“, „Limit pro System“, „Systemlimit“, „Limit des Prozesses“, `processGuard`; `guard`, `guardRequest`; „Grenze“ steht für sechs Dinge. „Kosten“, „Quellenumfang“, „Einheiten“, „Wächter“ sind nicht definiert.
- **Vorschlag:** Kleine Begriffsliste („Cache“ nur für Quellenantworten, „Zählerspeicher“ für Limits, „Limit“ für Rate-Limit je Aufrufer, „Abfragebudget“ für Anfragen an Dritte) und Funktionsnamen angleichen. (T11, T12, S9; Stufe 6, Findings 4, 9, 10)

## 🟢 Nits

- Schlüsselpräfix: `mf:host:<host>` (Z. 134) gegen `"host:" + host` (Plan); offen, wo `mf:` entsteht und wo die IP gehasht wird. (D, S, T)
- Z. 3: „gebauten Zustand“ besser „implementierten Zustand“. Z. 100: „zusätzlich“ entbehrlich. Z. 117–118, 150: „tatsächlich“ streichen, „umgangen“ suggeriert Missbrauch.
- Z. 3–6 mit Z. 66–76: Verhalten wie Abfragebudgets, `retryable`, „3 je Prüfung“, Kosten steht nicht in `v2-spec.md`. Quelle der Wahrheit (Code und Tests) angeben.
- Z. 25, 64, 69: „nicht zulässig“ und „unbekannt“ gegen `invalid` und `unknown` abbilden; „ungültiger Name“ und `invalid` meinen Verschiedenes.
- Z. 54: „Bündelung“ erklären. Z. 75–76: „Links für Dienste ohne Abfrage“ ohne Dienste. Z. 82: „Ein Score täuscht Genauigkeit vor“ ist ein Urteil, sachlicher: „setzt eine Gewichtung voraus, die nicht belegt ist“.
- Z. 94–97: „bis zu N-mal“ statt „N-mal“, „auf einer Server-IP“. Z. 98–99: „treffen auf dasselbe Limit“. Z. 112: „Redis oder Valkey“, danach nur Redis.
- Z. 137–138: Satz ohne Verb, besser „damit Zählen und Ablauf atomar ausgeführt werden“.
- Sprachmischung: „fail-open“, „Sticky Routing“, „Detailed Implementation Plan“ (Z. 156).
- Ziele: „Ziele des Gesamtsystems“, „Ziele des Vorschlags“ und „Nicht-Ziele“ sind Absätze statt H3; beide Listen ab 1 nummeriert, Ziele nummeriert, Nicht-Ziele mit Spiegelstrichen.
- Offene Fragen ohne Verantwortlichen und Frist; Frage 1 ist laut Z. 120 Voraussetzung für den Beginn und so nicht markiert.
- Querverweise (Z. 41, 100, 117, 121) als Fließtext statt Links; README-Verweise ohne Link.
- Wartelogik: Wartende wachen gleichzeitig auf, nur einer bekommt den Platz, die anderen enden mit `error: "budget"`; mit geteiltem Speicher häufiger. Kleiner Jitter wäre nötig.

## Standard-Abdeckung

| Anforderung | Stand |
|---|---|
| Problem Statement | Technisch vorhanden, der betriebliche Anlass fehlt, kein eigener Abschnitt (B2, M11) |
| Goals & Non-Goals | Vorhanden; Cache-Nicht-Ziel falsch begründet, GitHub und Slots ungeklärt, Ziele nicht messbar (M3, M4, M9) |
| Proposed Architecture | Grundskizze unter „Verhalten“; Schnittstelle, Betrieb, Datenschutz unterspezifiziert (M5, M8, M11) |
| Alternatives Considered | A–D mit Wirkung und Kosten; Ablehnungsgründe nicht als Struktur, Varianten fehlen, D nicht ausgearbeitet (B1, M7) |
| Risks & Mitigations | Kein Abschnitt; Rückfall, Fenster, Persistenz, Eviction nicht ausreichend (M1, M2, M5, M11) |

## Querverbindungen zu den Stufen 5 und 6

Die drei Reviewer bestätigen unabhängig voneinander die Kernbefunde aus Stufe 5 und 6: Plan und Empfehlung passen nicht zusammen, die Fensterart ändert sich still, die Cache-Begründung trägt nicht, und die Redis-Persistenz widerspricht der Datenschutzzusage. Neu in Stufe 7 sind der fehlende Bedarf (B2), das Verhalten bei Ausfall und die Betriebsfragen zu Redis (M2, M5).
