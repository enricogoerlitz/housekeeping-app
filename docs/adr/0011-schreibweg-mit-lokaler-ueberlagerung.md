---
status: angenommen
datum: 2026-11-20
autor: agent
betrifft: [0008]
---

# ADR-0011 — Schreibweg mit lokaler Überlagerung

## Status

`angenommen`

## Kontext

ADR-0008 legt fest: lesen aus dem lokalen Speicher, schreiben online, vier Laden-Aktionen offline.
Offen blieb, **wie** ein Schreibvorgang aus der App zum Server kommt. Die App hat 45 synchrone
Befehle (Spec 0001/0002); 41 Dateien nutzen sie, zehn Stellen brauchen den Rückgabewert sofort
(neue ID zum Navigieren, Anzahl im Hinweis). Mehrteilige Aktionen müssen in einer Transaktion
laufen (`31-sync.md`). Berechtigungen prüft allein die Datenbank (RLS).

## Entscheidung

Befehle ändern **sofort den lokalen Zustand** und schicken ihre Änderung als **genau eine RPC**
an Supabase. Der sichtbare Zustand ist `Serverzeilen ⊕ Laden-Warteschlange ⊕ ausstehende
Änderungssätze`; lehnt der Server ab, fällt der Satz heraus und die Anzeige springt zurück.

- **Allgemeiner Weg:** `apply_changes(household_id, ops)` als `security invoker` mit einer festen
  Tabellen- und Spalten-Allowlist in SQL. Die App berechnet die Zeilenänderungen eines Befehls aus
  dem Zustand vorher und nachher.
- **Eigene RPCs** für alles, was bei mehreren Personen gleichzeitig umkämpft ist oder nach einer
  Bedingung löscht: Beiträge auf die Liste (Merge auf dem Server), „Erledigt leeren“, Rückgängig
  von „auf die Liste“, Favoriten/Bewertungen/Stimmen je Person, die vier Laden-Aktionen,
  Haushalt, Einladung und Mitgliedschaft.
- **Rückgängig** schickt die Umkehrung der eigenen Änderung, nicht den alten Gesamtzustand.

## Betrachtete Optionen

### Option A — Eine eigene RPC je Befehl

- **Pro:** jede Aktion explizit und einzeln prüfbar.
- **Contra:** rund 45 RPCs; Fachlogik doppelt in TypeScript und SQL; jeder neue Befehl braucht
  eine Migration.

### Option B — Befehle werden asynchron und warten auf den Server

- **Pro:** kein Zurückspringen.
- **Contra:** alle 41 Dateien ändern sich; jede Aktion wartet auf das Netz; Rückgabewerte werden
  zu Promises.

### Option C — Lokal anwenden, Änderungssatz über eine allgemeine RPC, eigene RPCs für Umkämpftes

- **Pro:** Bildschirme bleiben fast gleich; Fachlogik bleibt an einer Stelle (core); jeder Befehl
  ist eine Transaktion; RLS gilt, weil die RPC als aufrufende Person läuft.
- **Contra:** eine mächtige allgemeine RPC, die sorgfältig abgesichert und getestet werden muss;
  Zurückspringen bei Fehlern muss die Oberfläche ehrlich anzeigen.

## Begründung

Den Ausschlag gibt, dass die Sicherheit ohnehin in der Datenbank liegen muss: Mit den nötigen
Tabellenrechten kann jedes Mitglied dieselben Zeilen auch direkt über die API schreiben. Die
allgemeine RPC fügt nur die Transaktion hinzu. Damit ist Option C so sicher wie A, bei einem
Bruchteil des Codes, und hält die Bildschirme stabil.

## Konsequenzen

**Positiv:** Schreiben fühlt sich sofort an; ein Weg für fast alle Befehle; Fachlogik bleibt in
`packages/core` testbar.

**Negativ:**

- Die Datenbank muss alle Regeln selbst durchsetzen: Spaltenrechte, unveränderliche
  `household_id`, vom Server gesetzte Zeitstempel, zusammengesetzte Fremdschlüssel
  `(household_id, x_id)`, Felder zur Person per Trigger.
- `apply_changes` braucht eine eigene Angriffs-Testsuite (pgTAP).
- Gleichzeitiges Bearbeiten derselben Rezept-Zutatenliste: die letzte Änderung gewinnt für die
  ganze Liste.

**Folgearbeiten:** Spec 0003, Plan Tasks T4–T6, A5–A6.

## Wann diese Entscheidung neu bewertet wird

Wenn Zurückspringen im Alltag spürbar oft passiert, oder wenn Offline-Bearbeiten über die
Laden-Aktionen hinaus gebraucht wird.
