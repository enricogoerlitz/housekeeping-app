---
status: angenommen
datum: 2026-11-21
autor: agent
betrifft:
  [supabase/migrations, supabase/tests, packages/api, packages/core, .claude/rules/30-database.md]
---

# ADR-0012 — Neuaufbau der Migrationen vor der ersten Auslieferung

## Status

`angenommen` (Enrico, 21.11.2026)

## Kontext

Bis Spec 0006 sind 24 Migrationen entstanden. Viele davon flicken frühere Migrationen: `apply_changes`
ist fünfmal definiert, `restore_cleared_items` viermal, Prüfregeln und Speicher-Einstellungen
werden nachträglich ersetzt. Spec 0006 hat außerdem Code nur für die Übernahme vorhandener Daten
gebracht: das Zusammenführen mehrerer Einkaufslisten und das Auflösen alter Listen-Kennungen in der
Offline-Warteschlange.

Es gibt aber noch keine echten Daten. Im Cloud-Projekt ist keine Migration eingespielt, und keine
App-Version ist ausgeliefert. Die erste Auslieferung kommt mit Spec 0014. Die Regel „eine
committete Migration nie ändern“ (`.claude/rules/30-database.md`) schützt ausgelieferte Datenbanken
und installierte Apps. Beides gibt es noch nicht. Enrico möchte zu v1 eine Codebasis ohne
Altlasten.

## Entscheidung

Wir bauen die Migrationen einmalig vor der ersten Auslieferung neu auf. Ergebnis ist eine Grundlage
mit einer Datei je Bereich, jede Funktion steht dort nur in ihrer endgültigen Form, und es gibt
keinen Code für die Übernahme alter Daten. Dabei entfällt die Tabelle `shopping_lists`: Posten
gehören direkt zum Haushalt.

## Betrachtete Optionen

### Option A — Alles neu aufbauen

- **Pro:** Das Schema ist ohne Geschichte lesbar. Jede Funktion steht nur einmal da. Es bleibt kein
  Ballast für Daten, die es nie gab.
- **Contra:** Größerer Umbau. Die Gefahr, dass sich beim Zusammenfassen Verhalten verschiebt,
  muss durch einen Schema-Vergleich vorher und nachher abgefangen werden.

### Option B — Nur die Einkaufsliste in bestehenden Migrationen ändern

- **Pro:** Kleinerer Umbau.
- **Contra:** Die mehrfach neu geschriebenen Funktionen und die nachträglichen Sicherheits-Flicken
  bleiben stehen.

### Option C — Neue Migration, die die Listen-Tabelle entfernt

- **Pro:** Hält die bisherige Regel ein.
- **Contra:** Die Geschichte zeigt Listen, die es nie gab. Das ist genau die Altlast, die
  vermieden werden soll.

## Begründung

Bisher ist nichts ausgeliefert, also kostet der Neuaufbau nur Arbeit, aber keine Daten und keine
Verträglichkeit mit installierten Apps. Nach Spec 0014 wäre derselbe Umbau nur noch über
expand → contract möglich.

## Konsequenzen

**Positiv:** ein lesbares Schema und weniger Code in Datenbank, api und App. Keine Pfade, die nur
für Daten existieren, die es nie gab.

**Negativ:** Jede lokale Datenbank braucht einmal `pnpm db:reset`. Auf Entwicklungsgeräten muss man
sich einmal ab- und wieder anmelden, weil eine dort gespeicherte Warteschlange nicht umgewandelt
wird.

**Folgearbeiten:**

- Regel in `.claude/rules/30-database.md` und im `db-change`-Skill anpassen.
- Die Abnahmekriterien von Spec 0006 zum Zusammenführen als „verworfen“ markieren.
- Code-Aufräumen gleich danach.

Nachgehalten wird das in `docs/specs/0006-eine-einkaufsliste/plan.md`.

## Wann diese Entscheidung neu bewertet wird

Gar nicht. Die Ausnahme ist mit diesem einen Neuaufbau verbraucht. Ab der ersten Auslieferung
(dem ersten `supabase db push` in das Produktionsprojekt) gilt wieder: eine committete Migration
wird nie geändert, und Änderungen laufen über expand → migrate → contract.

## Nachtrag (21.11.2026)

Bis zur ersten Auslieferung bleibt die Grundlage die einzige Form der Migrationen. Weitere
Schema-Änderungen vor dem Release (z. B. Spec 0007, 0011) ändern die Dateien der Grundlage direkt,
statt neue Flicken-Migrationen anzulegen. Damit gilt auch für sie: kein Code für die Übernahme
alter Daten. Ab dem ersten `supabase db push` in das Produktionsprojekt gilt die Regel „nie
ändern“ unverändert.

## Nachtrag 22.11.2026: erste Veröffentlichung

Die erste Veröffentlichung (v2026.11.1) hat die Grundlinie am 22.11.2026 in die Produktion gebracht
(`supabase db push`). Seitdem gilt wieder „nie ändern“: Jede Schemaänderung ist eine neue Migration,
nach expand → migrate → contract (`.claude/rules/30-database.md`).
