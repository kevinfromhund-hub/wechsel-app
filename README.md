# WECHSEL. – Setup- und Deployment-Anleitung

Transfer-Matching-App für den Amateurfußball (Österreich). Dieses Projekt ist die
produktionsnahe Version mit echtem Backend (Supabase) und echtem Login per
E-Mail + Passwort. Rechne mit **ca. 30–45 Minuten** für die komplette
Ersteinrichtung.

## Was du brauchst (alles kostenlos für einen Test mit wenigen Personen)

- Einen [Supabase](https://supabase.com)-Account (Datenbank + Login)
- Einen [Vercel](https://vercel.com)- oder [Netlify](https://netlify.com)-Account (Hosting)
- Node.js 18 oder neuer auf deinem Rechner ([nodejs.org](https://nodejs.org))
- Optional: einen [GitHub](https://github.com)-Account (empfohlen, macht spätere Updates einfacher)

---

## Schritt 1: Supabase-Projekt anlegen

1. Auf [supabase.com](https://supabase.com) registrieren, dann **"New project"**.
2. Namen vergeben (z. B. `wechsel-app`), ein Datenbank-Passwort setzen (merken/speichern)
   und eine Region wählen (z. B. Frankfurt für Österreich).
3. Warten, bis das Projekt fertig eingerichtet ist (dauert ca. 1–2 Minuten).

## Schritt 2: Datenbankschema einspielen

1. Im Supabase-Dashboard links auf **"SQL Editor"** klicken -> **"New query"**.
2. Den kompletten Inhalt der Datei [`supabase/schema.sql`](./supabase/schema.sql)
   aus diesem Projekt hineinkopieren und auf **"Run"** klicken.
3. Es sollte "Success. No rows returned" erscheinen. Damit sind alle Tabellen,
   Zugriffsregeln (Row Level Security) und der automatische Match-Mechanismus
   eingerichtet.

## Schritt 3: Login (E-Mail + Passwort) konfigurieren

1. Im Dashboard: **Authentication -> Providers -> Email**. Sollte standardmäßig
   aktiviert sein.
2. **Authentication -> URL Configuration**:
   - **Site URL**: erstmal `http://localhost:5173` eintragen (für die lokale
     Entwicklung). Nach dem Live-Deployment (Schritt 6) hier zusätzlich deine
     echte Domain als **Redirect URL** ergänzen, sonst landen Nutzer:innen nach
     Klick auf den Bestätigungslink auf der falschen Adresse.
3. Bei der Registrierung verschickt Supabase einmalig eine Bestätigungsmail
   (danach ist der Login rein per Passwort, ohne weitere E-Mails). Kostenloser
   Tarif: Standard-Mailserver mit **niedrigem Limit** (ca. 3–4 pro Stunde) –
   reicht für einen kleinen Testkreis meist aus, da jede Person nur einmal
   eine Mail braucht. Für mehr gleichzeitige Neu-Registrierungen: unter
   **Authentication -> Providers -> Email -> SMTP Settings** einen eigenen
   kostenlosen SMTP-Dienst (z. B. Resend, Brevo) hinterlegen.

## Schritt 4: Zugangsdaten holen

Im Dashboard: **Project Settings -> API**. Zwei Werte kopieren:
- **Project URL**
- **anon public key**

## Schritt 5: Projekt lokal einrichten

```bash
npm install
cp .env.example .env
```

In `.env` die beiden Werte aus Schritt 4 eintragen:

```
VITE_SUPABASE_URL=https://dein-projekt.supabase.co
VITE_SUPABASE_ANON_KEY=dein-anon-key
```

Dann lokal starten:

```bash
npm run dev
```

Im Browser `http://localhost:5173` öffnen und einmal komplett durchklicken
(E-Mail eingeben -> Link in der Mail anklicken -> Profil anlegen -> swipen).

## Schritt 6: Live-Deployment (Vercel, kostenlos)

1. Projekt zu GitHub pushen (oder Ordner direkt bei Vercel hochladen).
2. Auf [vercel.com](https://vercel.com) -> **"Add New Project"** -> Repo auswählen.
   Vercel erkennt Vite automatisch, keine weitere Konfiguration nötig.
3. Unter **Environment Variables** die gleichen zwei Werte wie in `.env` eintragen
   (`VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`).
4. **Deploy** klicken. Du bekommst eine URL wie `https://wechsel-app.vercel.app`.
5. Zurück in Supabase (**Authentication -> URL Configuration**): diese Vercel-URL
   als **Site URL** setzen bzw. zusätzlich als **Redirect URL** eintragen.

Alternative: [Netlify](https://netlify.com) funktioniert nach demselben Prinzip
(Build-Befehl `npm run build`, Publish-Verzeichnis `dist`).

## Schritt 7: Für Probanden nutzbar machen

- Link einfach per WhatsApp/E-Mail verschicken – funktioniert direkt im
  Handy-Browser (iOS Safari, Android Chrome).
- **Homescreen-Icon**: In Safari/Chrome auf "Zum Home-Bildschirm hinzufügen" –
  die App startet dann wie eine echte App, ganz ohne App Store (Manifest &
  Icons sind bereits vorbereitet).
- Vor dem Testlauf: kurze Info an die Testpersonen, was getestet wird, plus
  Hinweis auf die Datenschutzerklärung in der App.

---

## Bekannte Grenzen dieser Version

- **Keine Vereinsverifizierung** – aktuell kann sich jede:r als "Verein" anmelden.
- **Keine Zahlungsanbindung** – die Premium-Ansicht ist weiterhin nur ein
  Demo-Schalter ohne echte Zahlung.
- **Keine native App** – läuft als Web-App/PWA, nicht im App Store/Play Store.
- **Ausbildungsentschädigung** ist eine vereinfachte Schätzung, keine
  rechtsverbindliche Berechnung.
- **Rechtstexte** (Datenschutzerklärung) sind ein Entwurf und sollten vor
  einem größeren Rollout von einer fachkundigen Person geprüft werden.

## Fehlerbehebung

**"Bestätigungsmail kommt nicht an"** – Spam-Ordner prüfen; im kostenlosen
Supabase-Tarif ist der Mailversand rate-limitiert (siehe Schritt 3).

**"new row violates row-level security policy"** – meist bedeutet das, dass
`supabase/schema.sql` nicht vollständig ausgeführt wurde. Im SQL Editor erneut
komplett ausführen.

**Leeres Deck trotz Demo-Profilen** – kurz auf "Demo-Profile neu mischen"
tippen (Button erscheint im Leer-Zustand der Entdecken-Ansicht).

**Chat aktualisiert sich nicht live** – im Supabase-Dashboard unter
**Database -> Replication** prüfen, ob die Tabelle `messages` für Realtime
aktiviert ist (wird von `schema.sql` versucht, kann aber je nach Projekt
manuell nachgeholt werden müssen).
