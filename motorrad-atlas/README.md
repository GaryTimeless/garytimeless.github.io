# Motorrad-Atlas

Ein Fahrtenbuch zum Selberweiterbauen. Die Karte startet im Nebel. Eine aufgenommene oder importierte Tour macht den Bereich entlang ihrer GPS-Spur sichtbar. Die Beispieltour zeigt den Effekt, ohne das Fahrtenbuch zu verändern.

## Lokal starten

1. Entpacke das Projekt und öffne den Ordner im Terminal. Du brauchst Python 3 und einen Browser.
2. Starte den lokalen Webserver.

   ```sh
   python3 -m http.server 8765 --bind 127.0.0.1
   ```

3. Öffne [localhost:8765](http://localhost:8765) in Chrome und wähle **Beispieltour anzeigen**. Lass das Terminal offen. Mit `Ctrl+C` hältst du den Server an.

## Android ausprobieren

- **Am Schreibtisch:** Android per USB anschließen und in Chrome DevTools die Portweiterleitung von Android-Port `8765` auf `localhost:8765` am Rechner einrichten. Auf dem Handy `http://localhost:8765` öffnen. Chrome behandelt localhost als sicheren Kontext. [Chrome-Anleitung zur Portweiterleitung](https://developer.chrome.com/docs/devtools/remote-debugging/local-server) · [W3C zu sicheren Kontexten](https://www.w3.org/TR/secure-contexts/)
- **Unterwegs:** Lege die Projektdateien auf einem statischen Webserver mit **HTTPS** ab. Dazu gehört auch der Ordner `vendor`. Die Dateien können direkt ausgeliefert werden. Eine HTTPS-Adresse ist für die Aufzeichnung auf einem anderen Gerät erforderlich. [GPS-Spezifikation](https://www.w3.org/TR/geolocation/)
- **Erster Test:** Vor dem Losfahren **Fahrt starten** tippen und Standort erlauben. Warte auf die Genauigkeitsanzeige und lass Chrome sichtbar. Nach dem Anhalten **Fahrt beenden**. Prüfe, ob die bekannte Strecke plausibel aussieht. Probiere bewusst einen App-Wechsel bei stehendem Motorrad und prüfe, ob die Karte nach der Fortsetzung eine Unterbrechung zeigt.
- Das Display bleibt nach Möglichkeit per Screen Wake Lock an. Android kann den Wake Lock freigeben. Beim Sperren oder App-Wechsel können Standortdaten fehlen. Eine gespeicherte GPX-Datei lässt sich unabhängig davon importieren. [Chrome zur Screen Wake Lock API](https://developer.chrome.com/docs/capabilities/web-apis/wake-lock)

## Wo du anfangen kannst

| Datei | Hier steckt |
| --- | --- |
| `index.html` | Beschriftungen und Aufbau der Seite |
| `style.css` | Farben, Abstände und Handy-Layout |
| `app.mjs` | Was bei einem Klick passiert, Aufnahme und Fahrtenliste |
| `atlas.mjs` und `fog.mjs` | Leaflet zeigt die Karte. Die Canvas-Fläche zeichnet den Wolkennebel und blendet ihn entlang der Fahrten aus. |
| `gps.mjs` und `track.mjs` | Standortfilter, Streckenabschnitte, Entfernungen und Geschwindigkeit |
| `storage.mjs` und `formats.mjs` | Browserspeicher, GPX und Sicherungsdatei |

**Deine erste Änderung:** Suche in `atlas.mjs` nach `REVEAL_RADIUS_METERS` und probiere 300 statt 200. Aktualisiere den Text in `index.html`. Lade die Seite neu und vergleiche die Beispieltour beim Reinzoomen. In der Deutschlandübersicht wird eine sehr schmale Spur zur besseren Erkennbarkeit breiter gezeichnet.

**Danach:** Gib einer gespeicherten Tour einen eigenen Namen. Die Eigenschaft `name` und ihre Anzeige sind schon vorhanden. Suche in `app.mjs` zuerst nach `ride.name` und dann nach `save` und ergänze eine Eingabe.

Mit Node.js kannst du die Rechentests starten.

```sh
node --test track.test.mjs
```

## Wie Fahrten und Karte zusammenarbeiten

Chrome liefert Koordinaten, einen Zeitstempel und eine geschätzte Genauigkeit. Bei schlechter Genauigkeit oder unplausiblen Sprüngen verwirft der Atlas Punkte. Nach mehr als 20 Sekunden oder einer erkannten Unterbrechung beginnt ein neuer Abschnitt. Dadurch bleiben Lücken offen. Das ist eine einfache Heuristik, die du nach einer Testfahrt anpassen kannst. Ein GPX-Import berücksichtigt die GPX-Segmente und dieselbe 20-Sekunden-Grenze. Enthält ein Export nur selten Zeitstempel oder große Zeitabstände, kann seine Strecke deshalb unvollständig dargestellt werden.

Ø in Bewegung ist die Summe der gemessenen Bewegungskilometer geteilt durch die Summe der Bewegungszeiten ab 5 km/h. GPX ohne Zeitstempel fließt in die Strecke ein. Für den Jahreswert zählen Fahrten mit Startdatum im aktuellen Kalenderjahr. Die Kilometer werden mit 40.075 km Erdumfang verglichen.

Fahrten liegen lokal in IndexedDB, getrennt nach Browser und Webadresse. Denke beim Wechsel vom lokalen Test auf eine HTTPS-Adresse an **Sicherung speichern** und **Sicherung einlesen**. Der Atlas hat keinen Server für Fahrtdaten. Normale Kachelanfragen gehen an OpenStreetMap, damit die Grundkarte sichtbar wird. Der Kacheldienst arbeitet nach Verfügbarkeit und erlaubt keine vorab heruntergeladenen Offline-Karten. [OpenStreetMap-Kachelrichtlinie](https://operations.osmfoundation.org/policies/tiles/)

Eine Google-Grundkarte wäre über die Maps JavaScript API möglich. GPS-Aufzeichnung, Statistik und gespeicherte Fahrten könnten weiter gleich funktionieren. Für die Google-Karte bräuchtest du einen API- und Abrechnungszugang sowie eine Anpassung von `atlas.mjs`. [Nutzung und Abrechnung](https://developers.google.com/maps/documentation/javascript/usage-and-billing) · [Preisliste](https://developers.google.com/maps/billing-and-pricing/pricing)
