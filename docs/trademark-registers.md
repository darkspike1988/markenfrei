# Markenregister: Was ist maschinell abfragbar?

Stand der Prüfung: 4. November 2026. Frage: Kann Markenfrei ein Markenregister ohne
Schlüssel und ohne Vertrag live abfragen? **Ergebnis: Nein, bei keiner geprüften Quelle.**
Markenfrei verlinkt die Register deshalb zur manuellen Recherche und prüft sie nicht.

Gelesen wurde nur, was die Anbieter öffentlich zeigen. "Nicht geprüft" heißt: Der Zugriff
war in dieser Prüfung nicht möglich oder die Aussage ist nicht belegt.

| Quelle | Maschinenzugang | Beleg | Befund |
|---|---|---|---|
| **DPMAregister** (Deutschland) | Nein, nicht frei | Seite "Markenrecherche" und "Datenabgabe" des DPMA (Stand 10.12.2025) | Web-Recherche kostenlos, aber nur manuell und **ohne Ähnlichkeitssuche**. Maschinenlesbare Daten über **DPMAconnectPlus** auf Grundlage einer vertraglichen Regelung gegen Erstattung der Bereitstellungskosten. |
| **EUIPO** (Unionsmarken) | Nur mit Registrierung | `dev.euipo.europa.eu` (API-Portal) | Zugang über ein Konto und Freischaltung für die Sandbox. Nicht schlüsselfrei. |
| **USPTO** (USA) | Nur mit API-Schlüssel | `tsdrapi.uspto.gov` antwortet mit 401 und dem Hinweis, sich für einen API-Schlüssel zu registrieren | Nicht schlüsselfrei. |
| **TMview** (EUIPO, viele Ämter) | Nicht geprüft | Der geprüfte API-Pfad war nicht erreichbar | Kein belegter offener Zugang. |
| **WIPO Global Brand Database** | Nicht geprüft | `api.branddb.wipo.int` antwortete mit 403 | Kein belegter offener Zugang. |
| **TMDB** (`tmdb.eu`) | Nein | Siehe unten | Suche für Menschen kostenlos, keine Schnittstelle, Bot-Abwehr aktiv. |

## TMDB im Detail

- Betreiber laut Nutzungsbedingungen: IP Central GmbH. Rechtsdienstleistungen erbringt die
  Kanzlei Breuer Lehmann (München). Datenquellen laut Nutzungsbedingungen: EUIPO, DPMA,
  Schweizer IGE, WIPO und USPTO. Die Seite schließt jede Gewähr für Richtigkeit,
  Vollständigkeit und Aktualität aus.
- Die Suche ist eine serverseitig erzeugte Seite:
  `GET /de/suche/marken?q=<Begriff>&office=&status=&mode[]=fts`. Die Aufzeichnung der
  Netzwerkaufrufe zeigt keinen JSON-Endpunkt. In der Oberfläche war ein Standardfilter
  "Zeitraum 2025 bis 2026" aktiv. Ob er die Trefferliste im Test beeinflusst hat, wurde
  nicht geprüft. Eine leere Liste ist deshalb **kein** Beleg für einen freien Namen.
- Automatisierte Clients werden mit einer **Cloudflare-Challenge** (Turnstile) abgewiesen:
  `curl` und ein automatisierter Chromium (über REA gestartet) erhielten HTTP 403 und die
  Seite "Nur einen Moment…". Ein normaler Browser lud die Seite ohne Hürde.
- `robots.txt` erlaubt das Crawlen außer `/inhaber/` und `/owner/`. Die Nutzungsbedingungen
  nennen weder eine Schnittstelle noch eine Erlaubnis für automatisierte Abfragen.

**Entscheidung:** Markenfrei fragt TMDB nicht automatisiert ab und versucht nicht, die
Bot-Abwehr zu umgehen. Der Bericht enthält nur einen Link zur Suche: einen Eintrag in
`trademark.links` mit `office: "TMDB"`, den Menschen selbst öffnen.

## Folgen für das Produkt

- Die Ampel entsteht aus Domains, Paketregistern, App Stores und bekannten Namen. Standard
  bei den bekannten Namen sind die Quelle `known_brands` (Heuristik ohne Netz mit 89
  bekannten Tech-Marken), Wikidata und GLEIF. Wikipedia und Show HN laufen nur auf Wunsch und
  zählen als schwache Signale: Ein Treffer ergibt dort höchstens Gelb. Markenregister gehen
  nicht in die Ampel ein, die Marke steht immer auf „nicht geprüft“. **Die Ampel ersetzt
  keine Registerrecherche.** Texte in der Oberfläche und in der MCP-Beschreibung sagen das.
- Die Quelle `wikidata_brands` (nur auf Wunsch) vergleicht ohne Netz gegen einen Schnappschuss
  von Marken aus Wikidata (CC0, mit Abrufdatum im Dateikopf, von Hand erneuert). Die Liste ist
  unvollständig, weil viele bekannte Marken in Wikidata nicht als Marke geführt sind; ein
  Treffer ergibt höchstens Gelb, ein fehlender Treffer ist keine Freigabe.
- Ähnlichkeitsrecherchen (Klang, Schrift, Bild) bieten die Ämter selbst nicht kostenlos an
  (Hinweis des DPMA). Kommerzielle Recherchedienste oder eine anwaltliche Prüfung bleiben
  der Weg vor einer Anmeldung.
- **Offene Entscheidung für den Betreiber:** EUIPO (kostenlose Registrierung für die Sandbox)
  und USPTO (API-Schlüssel) wären die einzigen Wege zu einer echten Live-Abfrage. Das
  widerspräche dem Grundsatz "keine Schlüssel", ließe sich aber als optionale Quelle
  umsetzen: nur aktiv, wenn der Betreiber einen eigenen Schlüssel setzt. Dazu müssten die
  Nutzungsbedingungen beider Programme gelesen und die Antworten gegen bekannte Marken
  getestet werden. Das ist hier nicht geschehen.

## Registerabfrage: Stand der Recherche (10. November 2026)

Zweck: Entscheidungsgrundlage für die offene Zeile „Echte Registerabfrage“ in der
[ROADMAP](../ROADMAP.md). Alle Seiten unten wurden am 10. November 2026 gelesen, sofern nichts
anderes dabeisteht. „nicht bestätigt“ heißt: Die Aussage ist aus einer Primärquelle nicht belegt, die
Seite war nicht lesbar oder der Punkt ließ sich ohne Zugang nicht prüfen. Es gibt keinen Schlüssel und kein
Konto, also wurde keine Schnittstelle mit Anmeldedaten getestet. Undokumentierte Schnittstellen
(zum Beispiel die interne JSON-Abfrage der TMview-Oberfläche) wurden nicht aufgerufen.

### Kurzfassung

| Quelle | Offizielle Maschinenschnittstelle | Zugang | Automatisierte Abfrage durch eine öffentliche Seite |
|---|---|---|---|
| **EUIPO** (Unionsmarken, IR mit Wirkung für die EU) | Ja: „Trademark search“ 1.1.0, REST | Konto, App, Abo, Prüfung durch das Amt; kostenlos | Der vorgesehene Weg; Weitergabe, kommerzielle Nutzung und Anzeige für anonyme Endnutzer sind in den Bedingungen nicht ausdrücklich geregelt (nicht bestätigt) |
| **TMview** | Keine dokumentierte gefunden | Nur Weboberfläche | Nein: Die Rechtlichen Hinweise behalten Web-Scraping und Bots ausdrücklich vor |
| **DPMAregister** | Ja: DPMAconnectPlus, nur nach Vertrag | Standardvertrag per Post im Original, 200 EUR einmalig, feste IP | Nur im Rahmen des Vertragszwecks; ob eine öffentliche Abfrageseite darunter fällt, ist nicht bestätigt |
| **USPTO** | TSDR-API nur für bekannte Aktenzeichen, kein Namenssuche-Endpunkt gefunden | USPTO.gov-Konto und API-Schlüssel | Ohne Namenssuche für diesen Zweck nicht brauchbar |
| **WIPO Global Brand Database** | Keine | Nur Weboberfläche | Nein: Die Nutzungsbedingungen verbieten automatisierte Abfragen ausdrücklich |

### 1. EUIPO: „Trademark search“

**Schnittstelle.** Die einzige amtliche Suchschnittstelle für Unionsmarken ist das Produkt
[Trademark search 1.1.0](https://dev.euipo.europa.eu/product/trademark-search_110) im API-Portal des EUIPO
(REST, JSON). Die OpenAPI-Beschreibung (ZIP unter
[dev.euipo.europa.eu/product/43857/download-specs](https://dev.euipo.europa.eu/product/43857/download-specs),
ohne Anmeldung ladbar) nennt als Basis `https://api.euipo.europa.eu/trademark-search` und die Operationen
`GET /trademarks` (Suche) und `GET /trademarks/{applicationNumber}` (Einzelabruf, dazu Bild, Ton, Video, Modell).
Die Sandbox liegt unter `https://api-sandbox.euipo.europa.eu/trademark-search`
([Seite „Security“](https://dev.euipo.europa.eu/security)). Beide antworteten ohne Anmeldedaten mit HTTP 401
(eigener Aufruf, 10. November 2026). Im [Produktkatalog](https://dev.euipo.europa.eu/product) stehen elf Produkte;
ein eigenes TMview-Produkt ist nicht dabei.

**Sandbox und Produktion.** Sie sind getrennte Portale mit getrennten Anmeldeservern und **unterschiedlichen Daten**;
die [FAQ](https://dev.euipo.europa.eu/faq) sagt: Sie sollen nicht angeglichen werden, die Sandbox dient nur dem Test
und darf nie an Produktivsysteme angebunden werden. Echte Antworten gibt es also nur in der Produktion. Tokens der einen
Umgebung gelten nicht in der anderen.

**Zugang** ([Getting started](https://dev.euipo.europa.eu/getting-started), [FAQ](https://dev.euipo.europa.eu/faq)):

1. EUIPO-Konto anlegen.
2. Im Portal eine App registrieren; es gibt Client ID und Client Secret.
3. Ein Abo für das Produkt anfragen und die „condition of use“ annehmen. Die meisten Anfragen werden geprüft:
   Sandbox laut Getting started bis zu einer Woche, laut FAQ im Schnitt einen Tag; Produktion bis zu einer Woche.
4. Für die Produktion: erfolgreich abgeschlossene Integrationstests in der Sandbox und Nachweise per E-Mail an
   `docs.apiplatform@euipo.europa.eu`. Natürliche Personen: Kopie von Personalausweis oder Reisepass, nötigenfalls
   Adressnachweis. Juristische Personen: Ausweiskopie der handelnden Person und Handelsregisterauszug, der ihre
   Vertretungsmacht und die Adresse zeigt. Ohne rechtzeitige Unterlagen wird die Anfrage gestrichen.
5. Das Amt kann eine Anfrage nach eigenem Ermessen ablehnen (Bedingungen 3.1 d). Pro Organisation ist ein Abo je API
   vorgesehen, Ausnahmen werden einzeln geprüft.

Zugang und Nutzung sind laut FAQ kostenlos.

**Anmeldung der App.** OAuth 2.0 / OpenID Connect ([Security](https://dev.euipo.europa.eu/security)). Für die Suche
reicht der Ablauf *client credentials* (Scope `uid`; Header `Authorization: Bearer …` und `X-IBM-Client-Id`). Dann bleibt
der Endnutzer anonym, und laut OpenAPI-Beschreibung kann die API „unter bestimmten Bedingungen“ Teile der
Markendaten ausblenden; **welche, ist nicht bestätigt**. Der Ablauf *authorization code* verlangt, dass sich jeder
Endnutzer mit einem eigenen EUIPO-Konto anmeldet; er passt nicht zu einer Seite ohne Konten. Lebensdauer des Zugriffstokens:
Die FAQ nennt 2 Stunden (Refresh-Token 4), das Beispiel auf der Seite „Security“ zeigt `expires_in: 28800` (8 Stunden).
Das widerspricht sich; ein Client müsste `expires_in` aus der Antwort lesen.

**Limits.** Auf der Produktionsseite des Produkts steht im „Default Plan“ für die Suche (und alle anderen Operationen)
**6000 Aufrufe pro Tag** und **50 Aufrufe pro Minute** („Burst“); gelesen aus dem Seitenquelltext
([Produktseite](https://dev.euipo.europa.eu/product/trademark-search_110)). Die Sandbox-Seite nennt 25000 pro Tag und
200 pro Minute. Die FAQ sagt dagegen, die Grenzen der Produktion seien dieselben wie in der Sandbox; die Zahlen der
Seiten stimmen damit nicht überein. Für die Planung gilt die niedrigere Produktionszahl. Bei Überschreitung kommt HTTP 429
(FAQ, OpenAPI). Das Amt darf Limits jederzeit ändern und gegen Umgehung (auch durch mehrere Konten oder Systeme)
vorgehen (Bedingungen 3.6 c). Ob das Limit je App oder je Organisation zählt, ist nicht bestätigt. Die FAQ nennt außerdem eine
Weiterleitung (302) auf eine Fehlerseite, wenn die öffentliche IP-Adresse beim Amt einen schlechten Ruf hat.

**Nutzungsbedingungen.** Das Portal verlinkt im Fuß die
[Conditions of Use of APIs and of the API Portal, Version 2 vom 29. Januar 2026](https://euipo.europa.eu/tunnel-web/secure/webdav/guest/document_library/contentPdfs/law_and_practice/decisions_president/EX-25-1_annex-1_v2_en.pdf).
Die FAQ verlinkt noch die ältere Fassung vom 4. Juli 2023. Gelesen wurde die neuere.

| Frage | Was die Bedingungen sagen |
|---|---|
| Automatisierte Abfragen | Die API ist der vorgesehene automatisierte Weg. Verboten sind Handlungen, die die API oder die Systeme des Amts stören (3.2 b v), und das Umgehen von Limits (3.6 c). |
| Weitergabe und Speichern der Ergebnisse | Keine Regel zur Weitergabe oder Speicherung. Die Lizenz ist widerruflich, nicht ausschließlich, nicht übertragbar und kostenlos (3.4 a); am Inhalt entstehen keine Rechte (3.4 b). Ob Ergebnisse gespeichert oder veröffentlicht werden dürfen: **nicht bestätigt**. Die allgemeinen [Rechtlichen Hinweise](https://www.euipn.org/en/info/legal-notices) (tmdn.org leitet dorthin weiter) erlauben Weitergabe mit Quellenangabe, behalten aber Web-Scraping, Bots und die Entnahme wesentlicher Teile der Datenbank ausdrücklich vor. Ob das für Daten aus der API gilt, ist nicht bestätigt. |
| Kommerzielle Nutzung | Nicht erwähnt. Die Rechtlichen Hinweise raten bei Informationen mit anderen Schutzrechten (auch Marken) und kommerzieller Nutzung dazu, die Erlaubnis der Rechteinhaber einzuholen. **Nicht bestätigt**, ob ein Betrieb wie Markenfrei darunter fällt. |
| Anzeige für Endnutzer Dritter | Vorgesehen, aber nicht ausdrücklich erlaubt: Der Nutzer muss dafür sorgen, dass auch seine „end users“ die API nicht schädlich nutzen, und darf keine Verbindung oder Billigung durch das Amt vortäuschen (3.2 b iii) oder irreführende Angaben machen (3.2 b iv). Das Amt verantwortet die Oberfläche nicht und kann nach einer Prüfung Änderungen verlangen (3.3, 3.7). Es darf den API-Client und die Dokumentation jederzeit einsehen (3.7). Ein vorgeschriebener Warntext steht nur für die Anmelde-API (6.1 b). |
| Personenbezogene Daten | Namen von Anmeldern und Vertretern sind im Register öffentlich (Artikel 111 und 112 UMV, genannt in 3.1 b). Der Nutzer ist Verantwortlicher für seinen Client (3.5 d). |
| Beendigung und Haftung | Das Amt kann ein Abo mit fünf Tagen Frist ohne Grund beenden (14 c), die API ohne Vorankündigung ändern (7) und haftet nicht (8, 12). Der Nutzer stellt das Amt unter anderem von Ansprüchen wegen Verletzung fremder Schutzrechte frei (13). |

**Umfang.** Durchsucht wird die Datenbank des EUIPO: Unionsmarken und Internationale Registrierungen mit Wirkung für die EU
(die Personenfelder kennen die Ämter `EM` und `WO`, der Einzelabruf nimmt IR-Nummern an). Nationale Marken (zum Beispiel
beim DPMA) sind nicht darin. Das ergibt sich aus der Beschreibung („EUIPO's database“) und dem OpenAPI-Schema; ein
ausdrücklicher Satz zum Umfang wurde nicht gefunden.

### 2. Die übrigen Register

**TMview** ([tmdn.org/tmview](https://www.tmdn.org/tmview), [Beschreibung](https://www.euipn.org/en/tools/TMview)):
kostenlose Suche für jeden Internetnutzer über viele Ämter. Eine dokumentierte Schnittstelle für Dritte wurde nicht
gefunden: Im Produktkatalog des EUIPO gibt es kein TMview-Produkt, und die Oberfläche ist eine Single-Page-App ohne
lesbaren Text. Die Bedingungen der API nennen nur, dass „some APIs“ Daten anderer Ämter aus TMview liefern können
(3.1 b); welche, ist nicht bestätigt. Die
[Rechtlichen Hinweise](https://www.euipn.org/en/info/legal-notices) enthalten einen Vorbehalt gegen Text- und Data-Mining,
Web-Scraping und Bots (maschinenlesbar `TDM-RESERVATION: 1`), verbieten die Entnahme wesentlicher Teile der Datenbanken und
untersagen Framing und Inline-Linking; Deep Links sind erlaubt. Eine Drittseite beschreibt eine interne JSON-Abfrage der
Oberfläche ([FetchSmith, 24. September 2026](https://fetchsmith.com/blog/tmview-trademark-search-api-no-key)); sie ist
undokumentiert, wurde nicht geprüft und fällt unter den Vorbehalt. Markenfrei ruft sie nicht auf. Der Link in
`trademark.links` bleibt ein Deep Link.

**DPMAregister** ([Recherche](https://www.dpma.de/marken/markenrecherche/index.html), Stand 10.12.2025): kostenlos, aber nur
manuell und ohne Ähnlichkeitssuche; Unionsmarken und IR-Marken mit Wirkung für Deutschland stehen auch darin, das DPMA
übernimmt dafür aber keine Gewähr. Maschinenzugang nur über
[DPMAconnectPlus](https://www.dpma.de/recherche/datenabgabe/dpmaconnect/index.html) (Seite Stand 14.10.2026):

- REST mit Basic-Anmeldung, Suche mit einer Abfrage in der Syntax der Expertenrecherche:
  `https://dpmaconnect.dpma.de/dpmaws/rest-services/DPMAregisterMarkeService/search/<Expertenabfrage>`
  ([Schnittstellenbeschreibung](https://www.dpma.de/docs/recherche/dienste/schnittstellenbeschreibungdpmaconnectplus.pdf)).
  Höchstens 1000 Treffer je Suche, mit Testzugang 100.
- Voraussetzung ist der
  [Standardvertrag](https://www.dpma.de/docs/recherche/dienste/1/standardvertrag_dpmaconnectplus.pdf) (Stand 01.04.2020),
  zweifach mit Originalunterschrift per Post. Einmalig 200 EUR netto für den Anschluss; der Datenabruf selbst ist
  kostenfrei, nur die optionalen wöchentlichen Datenpakete kosten (8 EUR je Lieferung). Das präzisiert den Satz „gegen
  Erstattung der Bereitstellungskosten“ in der Tabelle oben.
- Pflichten laut Vertrag: Abruf von einer registrierten, **nicht dynamischen IP-Adresse** (§ 2 Nr. 1); Zweckbindung (§ 3):
  eigene Datensammlung (a, b) oder „Entwicklung und Vertrieb von Informationsprodukten und -dienstleistungen“ (c) mit
  genauer Beschreibung von Inhalt und Zielgruppe; Weitergabe an Dritte nur im Rahmen dieses Zwecks; das DPMA darf das
  Datenvolumen einschränken (§ 2 Nr. 2) und den Namen des Datenempfängers bekanntgeben (§ 9); Korrekturen des DPMA sind sofort
  nachzuziehen (§ 5 Nr. 2).
- Die Seite vermerkt „aktualisierte Dokumente folgen in Kürze“. Ob Vertrag und Schnittstellenbeschreibung noch gelten, ist
  **nicht bestätigt**. Ein festes Limit für Abfragen je Minute oder Tag steht nicht in den Unterlagen (nicht bestätigt).
  Ob eine öffentliche Abfrageseite unter Zweck c fällt, muss das DPMA beantworten (`datenabgabe@dpma.de`).
- Umfang: deutsche Marken (angemeldet, eingetragen, zurückgewiesen).

**USPTO.**
- [TSDR](https://tsdr.uspto.gov/faqview) (`https://tsdrapi.uspto.gov/ts/cd/…`) verlangt seit 2. Oktober 2020 Registrierung
  und API-Schlüssel (Konto unter account.uspto.gov); ohne Schlüssel antwortet der Dienst mit HTTP 401 (eigener Aufruf,
  10. November 2026). Limit: 60 Anfragen je Schlüssel und Minute, 4 für PDF und ZIP (FAQ). TSDR öffnet einen Akt anhand von
  Anmelde-, Registrierungs-, Referenz- oder IR-Nummer („all that is necessary is entry of …“); eine Suche nach einem
  Namen nennt die FAQ nicht (nicht bestätigt, ob die Schnittstelle selbst keine kennt; die Swagger-Seite wurde nicht gelesen).
- Die neue Plattform data.uspto.gov verlangt laut Seitenauszug seit 18. Juni 2026 eine Anmeldung mit USPTO.gov-Konto; die Seite
  lieferte ohne JavaScript keinen Text, die Aussage ist deshalb nur als Auszug belegt. Die Dokumentationsseite
  `developer.uspto.gov/api-catalog/tsdr-data-api` lief in eine Zeitüberschreitung, die Anleitung zum API-Schlüssel auf
  data.uspto.gov lieferte nur eine HTML-Seite statt der PDF.
- [Nutzungsbedingungen](https://www.uspto.gov/terms-use-uspto-websites) (aktualisiert 13. August 2026): Die Datenbanken sind
  „not designed or intended to be a source for bulk downloads“; wer ungewöhnlich viele Zugriffe erzeugt, „whether generated
  manually or in an automated fashion“, kann ohne Vorwarnung gesperrt werden. Massendaten gibt es als eigene Produkte.
- Eine dokumentierte Namenssuche für `tmsearch.uspto.gov` wurde nicht gefunden (die Hilfeseite ist eine App ohne lesbaren
  Text; eine Drittquelle, [Signa, 14. Oktober 2026](https://signa.so/blog/uspto-trademark-api-guide), nennt nur den Excel-Export mit
  bis zu 500 Treffern; nicht bestätigt). Ergebnis: kein brauchbarer amtlicher Weg für eine Namenssuche.

**WIPO Global Brand Database** ([Nutzungsbedingungen, November 2022](https://www.wipo.int/en/web/global-brand-database/terms_and_conditions),
[FAQ](https://www.wipo.int/en/web/global-brand-database/faqs_branddb)): Verboten sind automatisierte Abfragen, Web-Scraping
und Massenerwerb, -speicherung und -weitergabe (2.1); mehr als 10 suchbezogene Aktionen je Minute und IP gelten als übermäßig;
die Daten dürfen ohne Erlaubnis nicht verkauft oder weiterlizenziert werden (2.2). Die FAQ beantwortet „Can I use a robot to
perform searches?“ mit Nein. Eine Schnittstelle gibt es nicht; die vollständigen Madrid-Daten liefert die WIPO auf Anfrage
gegen Gebühr (3.2). Madrid Monitor wurde nicht geprüft. Der Host `api.branddb.wipo.int` antwortete in der früheren Prüfung mit 403.

### 3. Was eine Abfrage liefern würde und was nicht

Grundlage ist das OpenAPI-Schema der EUIPO-Suche (Version 1.1.0, gelesen 10. November 2026). Die Suche arbeitet mit RSQL,
etwa `wordMarkSpecification.verbalElement==wachwerk`; `*` ist ein Platzhalter (`==*Dog*` enthält „Dog“). Ob die Gleichheit
Groß- und Kleinschreibung oder Akzente unterscheidet, ist ohne Zugang **nicht bestätigt**.

| Liefert | Feld im Ergebnis |
|---|---|
| Wortlaut der Marke | `wordMarkSpecification.verbalElement`, Art der Marke `markFeature` (zum Beispiel `WORD`, `FIGURATIVE`) |
| Stand des Verfahrens | `status` (zum Beispiel `REGISTERED`, `APPLICATION_PUBLISHED`, `OPPOSITION_PENDING`, aber auch `REFUSED`, `WITHDRAWN`, `EXPIRED`, `CANCELLED`) |
| Nizza-Klassen | `niceClasses` (1 bis 45) |
| Inhaber | `applicants` (Name, Kennung, Amt `EM` oder `WO`); unter *client credentials* möglicherweise teilweise ausgeblendet (nicht bestätigt) |
| Daten | Anmeldung, Eintragung, Ablauf (`expiryDate`), Veröffentlichungen |
| Nummer | `applicationNumber`, für den Link zur Detailansicht |

| Liefert nicht | Warum es zählt |
|---|---|
| Ähnlichkeit im Markenrecht (Klang, Schrift, Bedeutung, Verwechslungsgefahr) | Die Suche vergleicht Zeichenketten. Das DPMA weist darauf hin, dass ein Widerspruch auch aus einer **ähnlichen** Marke kommen kann; komplexe Ähnlichkeitsrecherchen bieten kommerzielle Dienstleister. Die WIPO schreibt, ein Suchergebnis sei keine rechtliche Aussage zur Verwechslungsgefahr (Bedingungen 4.4). |
| Nicht eingetragene Rechte | Benutzungsmarken, geschäftliche Bezeichnungen, Werktitel und Ähnliches stehen in keinem Register; das DPMA verweist auf Suche im Internet, in Handelsregistern und Verzeichnissen. |
| Nationale und andere Register | Der EUIPO-Dienst enthält keine deutschen, österreichischen, schweizerischen oder US-Marken. |
| Die Frage, ob die Klasse zum Vorhaben passt | Eine identische Wortmarke in einer ganz anderen Klasse ist kein Hindernis, eine in einer verwandten Klasse kann eines sein. Das beurteilt ein Mensch. |
| Vollständigkeit und Aktualität | Die Ämter geben keine Gewähr; ob nicht veröffentlichte Anmeldungen enthalten sind, ist nicht bestätigt. Die Sandbox hat andere Daten als die Produktion. |

Daraus folgt die einzig zulässige Aussage: **„Eintrag gefunden“** (mit Zahl, Wortlaut, Stand, Klassen) oder **„kein Eintrag
gefunden“** (nur bezogen auf das EU-Register und die exakte Schreibweise). Weder das eine noch das andere darf als „frei“
oder „nicht frei“ formuliert werden. Die Seite zeigt weiter an, dass Ähnlichkeit, nationale Marken und
nicht eingetragene Rechte nicht geprüft sind.

### 4. Was im Code nötig wäre, falls der Betreiber zustimmt

Nur ein Umriss, keine Umsetzung.

1. **Eine optionale Quelle** (Vorschlag: Kennung `euipo`) im Namensraum `known_names`. Ein neuer Namensraum würde `types.ts`,
   `report-schema.ts`, Oberfläche und MCP berühren, ohne dass die Quelle das braucht. Sie wird nur in `STATIC_SOURCES`
   aufgenommen, wenn beide Variablen des Betreibers gesetzt sind (wie `GITHUB_TOKEN` beim Budget); sonst existiert sie
   weder auf `/quellen` noch im MCP. `defaultEnabled: false`: Sie läuft nur auf Wunsch, wie Wikipedia und Show HN, also nur,
   wenn ein Nutzer sie auswählt.
2. **Anmeldung und Abfrage.** `HttpRequest` kennt heute nur `GET` und `HEAD` (die Wiederholungsregel setzt Abfragen ohne
   Nebenwirkung voraus). Das Token braucht einen POST mit Formularkörper an den Anmeldeserver (Produktion laut OpenAPI
   `https://euipo.europa.eu/cas-server-webapp/oidc/accessToken`); der Client müsste das erlauben, ohne die Regel für die anderen
   Quellen zu lockern. Das Token liegt nur im Arbeitsspeicher, bis kurz vor Ablauf (`expires_in` aus der Antwort), mit einer
   einzigen gleichzeitigen Anforderung. Die Suche ist ein GET auf `https://api.euipo.europa.eu/trademark-search/trademarks` mit
   `query=wordMarkSpecification.verbalElement==<Name>`, `size=100` und `fields` auf die nötigen Felder. Der Name wird vor dem
   Einsetzen auf erlaubte Zeichen geprüft und in Anführungszeichen gesetzt (RSQL-Sonderzeichen); Platzhalter für „enthält“
   standardmäßig nicht, sie erzeugen Rauschen.
3. **Abfragebudget aus dem dokumentierten Limit.** Eintrag in `HOST_BUDGETS` für `api.euipo.europa.eu` und einen für den
   Anmeldeserver. Das Limit hat zwei Fenster (50 je Minute, 6000 je Tag), ein `HostBudget` kennt eines; es braucht also zwei
   Fenster je Host oder zwei Einträge. Mit Abstand zu den Grenzen, etwa 45 je Minute und 5400 je Tag. Das Tagesfenster liegt
   über `LONG_BUDGET_WAIT_MS` und ergibt `unknown` ohne `retryable`. Das Limit gilt für die ganze Seite (alle Besucher teilen
   6000 Abfragen am Tag), und nur für einen Prozess ([design.md](design.md)). Jede Prüfung eines Namens kostet eine Abfrage.
4. **Der Schlüssel bleibt auf dem Server.** Zwei Umgebungsvariablen (Vorschlag: `MARKENFREI_EUIPO_CLIENT_ID` und
   `MARKENFREI_EUIPO_CLIENT_SECRET`), nie mit `NEXT_PUBLIC_`, nur im Engine-Modul gelesen. Weder Secret noch Token noch
   Header gelangen in `SourceResult` (`evidence`, `note`, `url`), Protokolle oder Fehlertexte; ein Test prüft das. Der stdio-MCP und
   die CLI laufen auf dem Rechner des Nutzers mit derselben Engine: Der Schlüssel des Betreibers darf nie in das Bündel
   (`mcp/dist`) und nie in eine Konfigurationsvorlage für Nutzer; dort wirkt die Quelle nur, wenn jemand ein eigenes Abo hat.
5. **Ergebnis und Ampel.** Der heutige Vertrag kennt kein „kein Eintrag“ ohne Freigabewirkung: `computeVerdict` meldet
   grün, wenn alle Ergebnisse `not_found` sind. Nötig wäre ein zusätzliches optionales Merkmal an `SourceResult` (additiv wie
   `weak`), das `computeVerdict` und `rankReports` bei der Regel „alle `not_found`“ übergehen. Dann gilt:
   - Antwort ohne Treffer: „kein Eintrag gefunden (EU-Register)“, hat keine Wirkung auf die Ampel und ist nie ein Beitrag zu Grün.
   - Treffer mit gleichem Wortlaut: „Eintrag gefunden“, mit `matches` (Wortlaut, `gleich`, Anmeldenummer als `id`), Status,
     Klassen und Link; höchstens Gelb (`similar`), nie Rot. Ob ein Treffer in einer passenden Klasse Rot rechtfertigt, ist
     eine Entscheidung des Betreibers (Frage 5).
   - Jede andere Antwort (401, 403, 429, 5xx, Zeitüberschreitung, nicht lesbar, Token abgelehnt, Budget) ergibt `unknown`,
     nie `not_found`.
   - `TRADEMARK_PREP_NOTE` („Markenregister wurden nicht abgefragt“) und die Anzeige „Marke: nicht geprüft“ müssten
     abhängig davon, ob die Quelle lief, sagen, dass nur das EU-Register und nur die exakte Schreibweise geprüft wurden.
   - Der bestehende Zwischenspeicher (10 Minuten, im Arbeitsspeicher, nur eindeutige Ergebnisse) genügt; es wird nichts
     dauerhaft gespeichert.
6. **Tests und Dokumente.** Offline mit eingespritztem `fetchImpl`: Tokenablauf und Erneuerung, 401, 429, leere Antwort,
   Treffer, Secret nicht in der Ausgabe, Budget; ein Test zur Ampel, dass die Quelle Grün nicht auslösen kann; Anpassung von
   `tests/docs-consistency.test.ts`, README (Tabelle der Variablen, Hinweis zum Datenschutz „Fremde Dienste sehen den Namen“),
   `.env.example`, `docs/v2-spec.md` und dieses Dokument.
7. **Vorbedingung ohne Code:** Das Abo in der Produktion (Nachweis der Identität, bis zu eine Woche) und die schriftliche
   Klärung der Nutzungsfragen. Tests müssten mit Beispielantworten statt mit der Sandbox laufen, weil deren Daten abweichen.

### 5. Empfehlung und offene Fragen

**Empfehlung.**

1. **Jetzt nichts bauen.** Zuerst die Nutzungsfragen beim EUIPO schriftlich klären (`docs.apiplatform@euipo.europa.eu`,
   Fragen a bis d unten). Das kostet nichts und schließt die Lücken, die in den Bedingungen offen sind.
2. **Nur EUIPO kommt in Frage.** TMview und die WIPO-Datenbank verbieten automatisierte Abfragen; für die USPTO fehlt
   eine Namenssuche; das DPMA verlangt Vertrag, Post, 200 EUR und eine feste IP-Adresse und deckt nur deutsche Marken ab.
   Das DPMA nur dann, wenn deutsche Marken wichtig sind, der Server eine feste IP hat und das DPMA schriftlich bestätigt, dass
   Zweck c eine öffentliche Abfrageseite trägt.
3. **Wenn das EUIPO zustimmt:** die Quelle wie unter 4 als optionale Quelle bauen, standardmäßig aus, Treffer höchstens
   Gelb, ohne Treffer nie ein Beitrag zu Grün.
4. **Bis dahin** bleiben die Links in `trademark.links` und der Hinweis „Die Ampel ersetzt keine Registerrecherche“.

Der Nutzen ist begrenzt: Die Abfrage fände identische Unionsmarken schneller, kann aber Ähnlichkeit, nationale und nicht
eingetragene Rechte nicht beurteilen. „Kein Eintrag gefunden“ hilft wenig, „Eintrag gefunden“ ist ein klarer Anlass zur Prüfung.

**Offene Fragen an den Betreiber.**

1. **Vertragspartner:** Wer registriert sich beim EUIPO, als Person oder als Organisation? Die Produktion verlangt Ausweis- oder
   Registernachweise, und der Nutzer stellt das Amt von Ansprüchen wegen verletzter Schutzrechte frei (13).
2. **Kommerziell oder nicht:** Bleibt Markenfrei kostenlos und ohne Werbung, oder soll es Einnahmen geben? (Betrifft Frage c.)
3. **Fragen an das EUIPO:** (a) Dürfen anonyme Endnutzer über eine öffentliche Webseite mit dem Schlüssel des Betreibers
   abfragen? (b) Dürfen Ergebnisse kurz im Arbeitsspeicher gehalten und angezeigt werden? (c) Ist kommerzielle Nutzung erlaubt?
   (d) Welche Felder blendet *client credentials* aus?
4. **Inhabernamen:** Sollen sie angezeigt werden (personenbezogen, wenn der Inhaber eine Person ist), oder nur Zahl, Stand,
   Klassen und ein Link zu eSearch plus?
5. **Wirkung eines Treffers:** Höchstens Gelb (Empfehlung), oder Rot bei gleichem Wortlaut in einer vorgeschlagenen Klasse? Rot
   würde „vergeben“ als Rechtsaussage behaupten.
6. **Auswahl:** Nur auf Wunsch (Empfehlung) oder in der Standardauswahl? Alle Besucher teilen 6000 Abfragen am Tag.
7. **Betrieb:** Bleibt es bei einem Prozess? Welche ausgehende IP-Adresse hat der Server, und ist sie fest (Voraussetzung für
   DPMAconnectPlus; nicht geprüft)?
8. **Deutsche Marken:** Ist DPMAconnectPlus den Aufwand wert, oder reicht der Link zu DPMAregister?
