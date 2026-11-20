---
status: angenommen
datum: 2026-11-20
autor: agent
betrifft: []
---

# ADR-0003 — Anmeldung und Zugang

## Status

`angenommen`

## Kontext

Nur eingeladene Personen dürfen sich anmelden, zunächst zwei. Gewünscht ist die Anmeldung mit
**Google** oder **Apple**: Die Zwei-Faktor-Absicherung des jeweiligen Kontos gilt dann gleich mit,
und eigene Passwörter entfallen. Die App muss nach der Anmeldung offline starten können
(ADR-0002).

## Entscheidung

Wir nutzen **Supabase Auth mit Google und Apple** als einzige Anmeldewege. Neue Konten entstehen
nur für Adressen auf einer **Allowlist**, geprüft durch einen **„Before User Created“-Auth-Hook**
in Postgres.

## Betrachtete Optionen

### Option A — Supabase Auth, Google + Apple, Allowlist per Auth-Hook

- **Pro:** Zwei-Faktor über Google/Apple. Native Anmeldedialoge (Google Sign-In,
  `expo-apple-authentication`, Übergabe per ID-Token). Der Hook greift auch bei OAuth-Anmeldungen.
  Die Allowlist lässt sich später für Haushaltseinladungen nutzen.
- **Contra:** Google braucht OAuth-Clients je Plattform (Web, iOS, Android). Apple braucht den
  Apple-Developer-Account.

### Option B — Registrierung abschalten, Personen vorab per Admin-Einladung anlegen

- **Pro:** keine eigene Logik.
- **Contra:** Das Zusammenspiel mit OAuth-Erstanmeldungen ist fehleranfällig (verknüpfte
  Identitäten). Einladungen in weitere Haushalte gingen nicht ohne Admin.

### Option C — E-Mail + Passwort / Einmalcode

- **Pro:** ohne externe Konten.
- **Contra:** Zwei-Faktor müssten wir selbst einführen; entspricht nicht dem Wunsch.

## Begründung

Ausschlaggebend sind **Zwei-Faktor ohne eigenen Aufwand** und eine **Allowlist, die zum
Einladungskonzept wächst**.

## Konsequenzen

**Positiv:** keine Passwörter. Einladungen in einen Haushalt können später einfach einen
Allowlist-Eintrag erzeugen.

**Negativ:**

- **Apple-Anmeldung erst mit Apple-Developer-Account** (99 $/Jahr, ADR-0007). Bis dahin nur
  Google.
- Wird die App je öffentlich im App Store angeboten, verlangt Apple bei Google-Login auch
  „Mit Apple anmelden“. Das ist hier ohnehin geplant.
- Im **Web** liegt die Supabase-Sitzung im Browser-Speicher. Das nehmen wir bewusst in Kauf:
  Die Web-App lädt keine Skripte von Dritten und setzt eine strikte Content Security Policy.
  Nativ liegt die Sitzung im Secure Store.

**Folgearbeiten:** Die Fundament-Spec setzt Hook, Allowlist, Google-Login und Offline-Start mit
gespeicherter Sitzung um, getestet mit Negativtests (nicht eingeladene Adresse).

## Wann diese Entscheidung neu bewertet wird

Wenn Personen ohne Google- oder Apple-Konto teilnehmen sollen.
