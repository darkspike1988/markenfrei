# Firmenregister: Warum Markenfrei sie nicht automatisch abfragt

Stand: 9. November 2026. Alle Angaben live geprüft an diesem Tag.

Markenfrei prüft Namen gegen offene, keylose Quellen. Firmenregister (Handelsregister
Deutschland, Firmenbuch Österreich, Zefix Schweiz) erfüllen keine der möglichen Wege, und
zwar aus Gründen, die außerhalb unseres Einflusses liegen:

## Schweiz: Zefix

- **REST-Schnittstelle** (`www.zefix.admin.ch/ZefixPublicREST`): Ohne Anmeldung antwortet sie
  mit 401. Der Zugang ist kostenlos, wird aber nur auf Anfrage per E-Mail vergeben und braucht
  HTTP-Basic-Authentifizierung mit Konto — verstößt gegen „keine Konten“.
- **robots.txt**: `www.zefix.admin.ch` sperrt für `User-agent: *` alles (`Disallow: /`).
- **LINDAS-Schnappschuss** (`lindas.admin.ch/query`, offizielle Distribution des Datensatzes
  auf opendata.swiss): Die SPARQL-Abfrage nach Namen mit Muster (`REGEX`) über alle rund
  796.690 Rechtseinheiten (877.258 Namen) brauchte im Versuch 7,1 Sekunden — weit über dem
  Zeitbudget von 5 Sekunden je Anfrage. Außerdem sperrt auch diese Domain in der robots.txt
  alles (`Disallow: /`).
- **Schnappschuss im Repository** (wie `wikidata-brands.json`): Selbst auf die enge Teilmenge
  „einteiliger Namensstamm mit Schweizer Rechtsform als einzigem Zusatz“ entfallen 123.845
  verschiedene Namen (Stand 9. November 2026). Das wäre rund der achtzehnfache Umfang des
  Wikidata-Schnappschusses (6.695 Einträge, 282 KB) und sprengt die Bundle-Grenze. Eine
  weitere Einschränkung (z. B. nur kurze Namen) wäre willkürlich und ließe die Liste noch
  unvollständiger wirken, als sie ohnehin wäre.

## Deutschland: handelsregister.de

- Es gibt keine offizielle Schnittstelle. Die Nutzungsbedingungen des Gemeinsamen
  Registerportals erlauben nur einzelne, von Menschen ausgelöste Abfragen (etwa 60 je Stunde);
  automatisierte Abfragen sind untersagt. Ein Scraping der Suchmasken kommt daher nicht in
  Frage.
- **OffeneRegister.de** (OKF Deutschland, ODbL) bietet deutsche Firmennamen als offenen
  Datensatz, beruht aber auf einem Auszug von 2019 und war im Review
  (docs/review-and-competition-2026-11.md) zeitweise gar nicht erreichbar (502). Ein
  Schnappschuss aus veralteten Daten würde ein falsches Gefühl von Vollständigkeit geben.

## Österreich: Firmenbuch

- Die Firmenbuchabfrage braucht ein Konto und ist kostenpflichtig; eine keylose offene
  Schnittstelle gibt es nicht.

## Was es stattdessen gibt

- **GLEIF** (bereits Quelle, Namensraum „Bekannte Namen“): aktive Rechtsträger mit LEI, exakter
  Name. Erfasst aber nur LEI-pflichtige Rechtsträger.
- **Wikidata** (bereits Quelle) und der **Wikidata-Marken-Schnappschuss** enthalten auch
  Firmennamen.
- **Links zur manuellen Prüfung**: Die Recherche-Vorbereitung (`trademark.links`) verlinkt Zefix
  (Schweiz) und handelsregister.de (Deutschland). Die Checkliste erinnert an die Suche nach
  gleichen oder ähnlichen Firmennamen.

## Wiederkehrend prüfen

Ändert sich eine dieser Bedingungen — etwa ein offizieller keyloser Endpunkt oder eine
offizielle Bulk-Datei der Kerndaten —, kann eine Quelle oder ein Schnappschuss wie bei
`wikidata_brands` aufgenommen werden. Bis dahin bleiben Firmenregister Links zur manuellen
Prüfung.
