# WECHSEL. – Projektkontext für Claude Code

Transfer-Matching-App für den Amateurfußball in Österreich (Tinder-Prinzip: Spieler und
Vereine matchen sich anonym, Kontaktdaten werden erst nach gegenseitigem Interesse sichtbar).

## Stack

- **Frontend**: React + Vite. `src/App.jsx` enthält fast die komplette UI in einer Datei
  (bewusst so gehalten, aus einem Claude-Artifact-Prototyp portiert).
- **Backend**: Supabase (Postgres + Auth + Realtime). Schema in `supabase/schema.sql`.
- **Datenzugriff**: `src/lib/api.js` kapselt alle Supabase-Aufrufe.
- **Styling**: Inline CSS-in-JS (ein großer Template-String am Dateiende von `App.jsx`),
  keine separate CSS-Datei.
- **Icons**: lucide-react.

## Wichtige fachliche Regeln (bei Änderungen besonders vorsichtig sein)

- **Freemium-Sichtbarkeit**: Vor einem Match sehen Vereine von Spieler-Profilen nur Position,
  starken Fuß, Statistik, Alter und Staatsbürgerschaft – kein Name, kein Foto. Bei Trainern/
  Funktionären zusätzlich zu deren sonstigen Angaben ebenfalls die Staatsbürgerschaft. Spieler
  sehen von Vereinen nur Entfernung, gesuchte Position(en) und Liga. Das ist ein
  Kernversprechen des Produkts, nicht versehentlich aufweichen – jede weitere Erweiterung
  dieser Liste ist eine bewusste Produktentscheidung, keine beiläufige Änderung.
- **Ausbildungsentschädigung**: Berechnung nach ÖFB-Regulativ Anhang I (gültig ab 1.5.2025),
  Funktion `calcAusbildungsentschaedigung()` in `App.jsx`. Automatisch € 0 bei: Pause ≥18
  Monate, Selbstauskunft "keine Entschädigung", Alter ≥28. Ist eine **Schätzung**, keine
  Rechtsauskunft – das muss in der UI so gekennzeichnet bleiben.
- **Ligen/Leistungsstufen**: `AUSTRIA_LEAGUES` bildet die 7 offiziellen Leistungsstufen ab;
  mehrere Liga-Namen teilen sich bewusst denselben `level` (siehe Kommentar im Code).
- **Standort/Privatsphäre**: Exakte GPS-Koordinaten dürfen NIE auf den Matching-Karten anderer
  Nutzer:innen erscheinen, nur die berechnete Distanz in km. Exakte Koordinaten + Google-Maps-
  Link ausschließlich im eigenen Profil-Tab.
- **Minderjährigenschutz**: Bei Spieler:innen unter 18 (berechnet aus `birthDate`) ist eine
  zusätzliche Pflicht-Checkbox für die Zustimmung der Erziehungsberechtigten erforderlich.

## Matching-Mechanik

Matches entstehen NICHT im Client, sondern serverseitig per Postgres-Trigger
(`handle_new_like` in `schema.sql`), sobald ein gegenseitiges Like existiert. Der Client prüft
nach dem eigenen Like nur, ob daraufhin ein Match-Datensatz existiert (`findMatchId` in `api.js`).
Beim Ändern der Matching-Logik immer beide Seiten (Trigger + Client) im Blick behalten.

## Demo-Daten

10 Spieler + 10 Vereine werden bei jedem App-Start lokal im Browser zufällig generiert
(`generateDemoPlayers`/`generateDemoClubs` in `App.jsx`) – NICHT in der Datenbank gespeichert,
damit sie unabhängig vom Backend immer verfügbar sind. IDs beginnen mit `seed-`. Sie "matchen"
sofort bei Interesse, da kein echtes Gegenüber existiert.

## Bekannte offene Punkte (bewusst noch nicht umgesetzt)

- Keine Vereinsverifizierung
- Premium-Ansicht ist nur ein Client-seitiger Demo-Schalter, keine echte Zahlungsanbindung
- Rechtstexte (Datenschutzerklärung, Nutzungsbedingungen) sind Entwürfe, juristisch ungeprüft

## Setup & Deployment

Vollständige Schritt-für-Schritt-Anleitung in `README.md` (Supabase-Projekt anlegen,
`schema.sql` ausführen, `.env` befüllen, lokal starten, auf Vercel deployen).
