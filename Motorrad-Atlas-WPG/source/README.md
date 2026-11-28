# Motorrad-Atlas WPG

Diese Ausgabe basiert auf der bereitgestellten Version 2.3.0-alpha.1. Für GitHub Pages verwendet sie die geprüfte Ferrostar-Fahransicht des Schwesterprojekts unter ../motorrad-atlas/ferrostar-test/. Fahrtenbuch, Einstellungen und Favoriten sind separat gespeichert. Für einen reproduzierbaren Build im Projektordner npm ci und npm run build ausführen. Der folgende Abschnitt beschreibt den gelieferten Originalstand.

# Motorrad-Atlas 2.3.0-alpha.1 – Entwicklungsstand

## Wichtig: noch keine funktional freigegebene Ferrostar-Live-Navigation
Dies ist ein Quellcode-Arbeitsstand, kein fertig gebautes Web-Deployment.
Die Pitch-Korrekturen und eine isolierte Ferrostar-Adapterstruktur sind enthalten.
Die echte SDK-Installation, der Vite-Build und Browser-/Gerätetests konnten in der Ausführungsumgebung nicht erfolgen.
Deshalb blockiert `live-settings.mjs` absichtlich den Live-Start.
Der Schalter darf nicht allein zum Umgehen dieser Prüfung aktiviert werden.
Die bestehende Probefahrt bleibt separat verfügbar. Der alte Eigenbau wird aus der Oberfläche nicht mehr als echte Navigation gestartet.

## Lokal entwickeln
Node >=20.19 installieren, dann im Projektordner:

```sh
npm install
npm test
npm run dev
npm run build
```

Das Build-Ergebnis liegt in dist und kann statisch über HTTPS ausgeliefert werden.
Am Handy benötigt Ortung HTTPS; localhost auf dem Entwicklerrechner allein genügt nicht für eine LAN-Handyadresse.
Kein npm-Lockfile enthalten: Installation war hier nicht möglich. Nach erster erfolgreicher Installation Lockfile prüfen und einchecken.

## Tatsächlich geändert
- Rundtour meldet nicht mehr schon am Start Ankunft; Schlussmanöver liegt am Routenende.
- Simulation kennt ihren Abschnitt auch auf einem überlagerten Rückweg.
- Neuberechnung verbraucht Ziele erst nach erfolgreicher Antwort; Timeout und Abbruch beim Beenden.
- Eine gemeinsame OSRM-Warteschlange pro Browser-Kontext; kein stiller Fallback ohne Autobahnvermeidung.
- Änderung eines Plans entwertet alte Route und Export sofort; nur vollständige Wegpunktlisten werden berechnet.
- Schnellnavigation verwendet denselben Berechnungspfad und unveränderliche Punkte-Snapshots.
- Planer während Probefahrt deaktiviert; Atlas-Canvas pausiert und bleibt unsichtbar.
- Alte CSS-Listenregeln entfernt, Suchanfragen/ARIA-Auswahl bereinigt, Tagesfarben korrigiert.
- Dokumentation der Sicherung und GPX-Kompatibilität berichtigt.

## Ferrostar: implementierter Einstieg, offene Integration
`ferrostar-live.mjs` lädt das SDK erst bei Bedarf und verwendet die dokumentierten Einstiegspunkte FerrostarCore, BrowserLocationProvider, linkWith, getCurrentLocation, getRoutes und startNavigation.
Der Adapter besitzt eine separate wolkenfreie Ansicht, Abbruchgenerationen, Fehlerbehandlung und bewusst aktivierbare Sprache.
Noch zu verifizieren: konkrete Waypoint-Form und NavigationConfig der Version 0.58.0, Map-Style-Konfiguration, UI-Lebenszyklus und Freigabe sämtlicher SDK-Ressourcen.
`navigationConfig` ist deshalb nicht mit geratenen Werten befüllt.
Einen erlaubten Valhalla-Endpunkt (HTTPS/CORS) auswählen; keine stillschweigende Verwendung eines fremden Demo-Servers.
Vor Freigabe Routing-Timeout, Abweichung/Neuberechnung, Ankunft, Ortungsfrische und Sprachwiedergabe im echten Browser nachweisen.
Diese Adapterversion erlaubt nur Start/Ziel und blockiert Zwischenziele sowie Autobahnvermeidung ausdrücklich.
Sie berechnet ab dem tatsächlichen Standort neu; die OSRM-Vorschau ist NICHT dieselbe verbindliche Route.
Atlas-Aufzeichnung aus Ferrostar ist NICHT implementiert. Laufende Atlas-Aufnahmen blockieren den Live-Einstieg.
Eine gemeinsame Routenbasis und ein gemeinsamer Standort-/Aufzeichnungsdienst sind der nächste Implementierungsschritt.
Keine Hintergrund-, Offline-, Helm-Audio- oder Straßentauglichkeitszusage.

## Daten und Dienste
Atlas: IndexedDB für Fahrten, localStorage für Favoriten und Einstellungen.
Sicherung enthält nur abgeschlossene Fahrten. Entwürfe und Favoriten sind nicht enthalten.
Photon erhält Suchtexte/gerundeten Suchstandort bzw. genaue Rückwärtssuchkoordinaten.
OSRM erhält Planungspunkte; OSM erhält Kachelanfragen. Nach späterer Freigabe erhält Valhalla Routingstandorte.
Browser-/Gerätesprache kann je nach Stimme externe Verarbeitung verwenden.
Vor Veröffentlichung sind konkrete Anbieter-, Datenschutz- und Nutzungsbedingungen zu klären.

## Testnachweis
Siehe TESTPROTOKOLL.txt. Erfolgreiche eigene Tests sind KEIN Nachweis einer funktionierenden Ferrostar-Integration.
