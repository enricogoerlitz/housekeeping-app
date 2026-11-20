---
status: angenommen
datum: 2026-11-20
autor: agent
betrifft: []
---

# ADR-0004 — Mandantenfähigkeit über Haushalte

## Status

`angenommen`

## Kontext

Daten sollen je Haushalt gekapselt sein. Zunächst gibt es einen Haushalt mit zwei Personen,
später möglicherweise mehrere. Eine Person kann Mitglied mehrerer Haushalte sein. Die Daten
werden auf Geräte synchronisiert (ADR-0002), also muss auch der Sync die Grenze einhalten.

## Entscheidung

Jede Fach-Tabelle trägt eine `household_id`. **Row Level Security** in Postgres erlaubt Zugriff
nur Mitgliedern dieses Haushalts, und die **Sync Streams** filtern nach derselben Regel.

## Betrachtete Optionen

### Option A — Gemeinsame Tabellen mit `household_id` + RLS

- **Pro:** in der Datenbank erzwungen, ein fehlerhafter Client kann nichts Fremdes lesen.
  Testbar per pgTAP. Ein Schema für alle Haushalte.
- **Contra:** Jede Tabelle braucht Policies und Tests. Policies müssen performant sein
  (Index auf `household_id`, Mitgliedschaft über eine Funktion).

### Option B — Prüfung nur im App-Code

- **Pro:** weniger SQL.
- **Contra:** Ein vergessener Filter legt fremde Daten offen. Mit direktem Datenbankzugriff vom
  Client nicht haltbar.

### Option C — Ein Schema oder eine Datenbank je Haushalt

- **Pro:** maximale Trennung.
- **Contra:** Migrationen vervielfachen sich, und der Sync wird kompliziert. Für Haushalte maßlos
  überdimensioniert.

## Begründung

Ausschlaggebend ist, dass die Trennung **nicht vergessen werden kann**. Bei direktem Client-Zugriff
auf Supabase ist RLS die einzige verlässliche Stelle.

## Konsequenzen

**Positiv:** Neue Haushalte kosten nichts. Isolation ist pro Tabelle getestet.

**Negativ:** Jede Schemaänderung berührt Policies, Tests und Sync-Streams. Der `db-change`-Skill
macht das zur Routine.

**Folgearbeiten:** Die Fundament-Spec legt Haushalt, Mitgliedschaft, die Funktion für die
Mitgliedschaftsprüfung und das Testmuster an.

## Wann diese Entscheidung neu bewertet wird

Wenn Daten zwischen Haushalten geteilt werden sollen, z. B. ein Rezept an einen anderen Haushalt
schicken. Dann braucht es ein Freigabe-Konzept statt einer Ausnahme in den Policies.
