# Reichweitenmessung (optional)

Markenfrei zählt Seitenaufrufe und wenige feste Aktionen mit [GoatCounter](https://www.goatcounter.com/)
(Open Source, ISC/EUPL), das **auf dem eigenen Server** läuft. Ohne GoatCounter hinter `/_gc/count`
passiert nichts: Der Browser sendet die Zählung per `sendBeacon`, ein Fehler stört die Seite nicht.

## Was übertragen wird

Der Browser lädt **kein** GoatCounter-Skript, weil dessen `count.js` die Adresszeile (`location.search`)
mitsenden würde und dort die geprüften Namen stehen. Stattdessen sendet `src/lib/analytics.ts` an
`/_gc/count`:

| Feld | Inhalt |
|---|---|
| `p` | Pfad ohne Query und Fragment (`/`, `/quellen`) oder `event/<Name>` |
| `t` | Seitentitel oder Ereignisname |
| `r` | nur die Origin einer **externen** Herkunftsseite, nur beim ersten Aufruf |
| `s` | Bildschirmbreite |
| `e` | `true` bei Ereignissen |

Ereignisse (feste Namen, nie Eingaben): `pruefung`, `ergebnis/green|yellow|red`, `anpassen`,
`quelle/<id>`, `endung/<tld>`, `export/json`, `export/csv`, `export/markdown`. Der Export selbst entsteht
im Browser; gezählt wird nur der Klick. Drucken und Vergleichsansicht werden nicht gezählt.
`varianten/tippfehler` (Knopf „Tippfehler-Varianten prüfen“ unter „Name im Detail“) und `varianten/muster`
(Knopf „Alle prüfen“ in der Varianten-Auswahl) zählen nur den Klick, nie die Namen oder gewählten Muster.
Do Not Track und Global Privacy Control schalten die Zählung ab. Auf `localhost` und privaten Adressen wird nicht gezählt.

## Betrieb

1. GoatCounter starten (Beispiel `docker-compose.yml`, nur lokal erreichbar):

   ```yaml
   services:
     goatcounter:
       image: arp242/goatcounter:latest
       restart: unless-stopped
       ports:
         - "127.0.0.1:18095:8080"
       volumes:
         - ./db:/home/goatcounter/goatcounter-data
       command: ["serve", "-listen", ":8080", "-tls", "none", "-db", "sqlite+/home/goatcounter/goatcounter-data/db.sqlite3", "-automigrate"]
   ```

2. Seite anlegen (einmalig), Hostname frei wählbar, hier `stats.example.org`:

   ```sh
   docker run --rm -v ./db:/home/goatcounter/goatcounter-data arp242/goatcounter:latest \
     db create site -createdb -vhost stats.example.org -user.email du@example.org -password '…' \
     -db sqlite+/home/goatcounter/goatcounter-data/db.sqlite3
   ```

3. Im Reverse-Proxy nur den Zähl-Endpunkt von Markenfrei aus weiterreichen, mit dem Hostnamen der
   GoatCounter-Seite (Caddy):

   ```caddy
   markenfrei.example.org {
       @gc path /_gc/count
       handle @gc {
           rewrite * /count
           reverse_proxy http://127.0.0.1:18095 {
               header_up Host stats.example.org
           }
       }
       handle {
           reverse_proxy http://127.0.0.1:3000
       }
   }
   ```

4. Das Dashboard liegt unter `https://stats.example.org/` (eigener DNS-Eintrag und Proxy-Block mit
   TLS) oder bleibt über einen SSH-Tunnel erreichbar. Aufbewahrung in GoatCounter auf 365 Tage
   stellen (Einstellungen, „Data retention“), wie in der Datenschutzerklärung zugesagt.
