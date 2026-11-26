---
status: angenommen
datum: 2026-11-26
autor: agent
betrifft:
  [
    0014,
    0051,
    supabase/migrations,
    packages/core/src/notices.ts,
    apps/app/src/features/notices,
    AGENTS.md,
    .claude/rules,
  ]
---

# ADR-0017 — Mitteilungen in der App statt Web Push

## Status

`angenommen` · 26.11.2026, vom Eigentümer mit Spec 0051 entschieden · löst
[ADR-0014](0014-zustellung-von-benachrichtigungen.md) ab

## Kontext

ADR-0014 hat Benachrichtigungen per Web Push eingeführt: `pg_cron` plant alle 5 Minuten in SQL,
`pg_net` übergibt signiert an die Edge Function `push-send`, die mit VAPID zustellt; Push-Abos und
ein Zustell-Protokoll liegen im Schema `private`, Schlüssel als Function-Secrets und im Vault. Dafür
standen die Fachregeln (fällig, wer ist dran, Vorlauf, Texte) ein zweites Mal in SQL.

Am 26.11.2026 hat der Eigentümer entschieden: „Wir brauchen keine Push-Benachrichtigungen mehr,
kannst du komplett entfernen! Gerne ein ‚Notification Center‘ einbauen, wo man in der App einfach so
ein Notify-Icon hat mit rotem Kreis mit Zahl drin, wenn was ansteht → soll man bestätigen können und
alle bestätigen können. Aber lightweight halten!“ Die Push-Werte der Produktion waren zu diesem
Zeitpunkt ohnehin überschrieben und nicht mehr gültig.

Gegeben ist: Die App liest nur aus dem lokalen Speicher (Regel 4, ADR-0008), schreibt online und
synchronisiert jede Tabelle mit `household_id` (Regel 5). Die Fachregeln stehen in `packages/core`.

## Entscheidung

Wir zeigen Mitteilungen **nur in der App**: eine Glocke mit rotem Zähler, deren Liste eine reine
Funktion in `packages/core` (`dueNotices`) aus dem lokalen Speicher bildet. Bestätigt wird online
über die RPC `acknowledge_notices`; die bestätigten Schlüssel liegen in der eigenen, synchronisierten
Zeile von `notification_settings` (`acknowledged_notices`). Web Push mit allem, was dazugehört, wird
entfernt.

## Betrachtete Optionen

### Option A — Mitteilungen aus dem lokalen Speicher, Bestätigungen in der Zeile je Mitglied

- **Pro:** nichts zu betreiben (kein Zeitplaner, keine Function, keine Secrets); geht offline zum
  Lesen; Fachregeln nur noch an einer Stelle (`core`); keine neue Tabelle, keine neuen
  personenbezogenen Daten.
- **Contra:** Wer die App nicht öffnet, erfährt nichts. Die Spalte wächst mit jeder Bestätigung
  (Aufräumen beim Schreiben, höchstens 400 Schlüssel).

### Option B — Eigene Tabelle `notice_acknowledgements` (eine Zeile je Bestätigung)

- **Pro:** sauberes Modell, Aufräumen per `delete`.
- **Contra:** eine Tabelle mehr mit allem, was Regel 5 verlangt (RLS, Grants, Sync, Löschspur), für
  eine Handvoll Schlüssel je Tag; „Alle bestätigen“ wären viele Zeilen.

### Option C — Bestätigungen nur auf dem Gerät (lokaler Speicher)

- **Pro:** gar kein Schema.
- **Contra:** Auf dem zweiten Gerät erscheint alles wieder; widerspricht dem Wunsch „bestätigt ist
  bestätigt“.

### Option D — Web Push behalten und reparieren

- **Pro:** erreicht auch, wer die App nicht offen hat.
- **Contra:** vom Eigentümer ausdrücklich nicht gewollt; Betrieb (VAPID, Vault, `pg_net`) und doppelte
  Fachregeln bleiben.

## Begründung

Den Ausschlag geben der Wunsch des Eigentümers („lightweight“) und dass nichts mehr zu betreiben ist.
Option A nutzt die vorhandene, nur für das Mitglied selbst lesbare und synchronisierte Zeile je
Mitglied; Option B wäre für wenige Schlüssel unverhältnismäßig, Option C verfehlt das Ziel.

## Konsequenzen

**Positiv:**

- Keine Edge Function `push-send`, kein `pg_net`-Aufruf, keine Cron-Jobs „notification-tick“ und
  „purge-notification-deliveries“, keine VAPID-Schlüssel, keine Vault-Einträge `push_send_*`.
- Die SQL-Zwillinge der Fachregeln (`private.chore_*`, `prep_items`, Texte) und ihre Gleichlauf-Tests
  entfallen; `core` ist die einzige Stelle.
- Keine Ausnahmen mehr von Regel 4 (Lesen „Deine Geräte“) und Regel 5 (Push-Abos,
  Zustell-Protokoll); einzige Online-Lesung bleibt die Versionsprüfung (ADR-0015).

**Negativ:**

- Keine Nachricht außerhalb der App. Wer sie nicht öffnet, sieht nichts.
- Eine Mitteilung entsteht auf dem Gerät nach dessen Uhr in der Zeitzone des Haushalts; ohne
  Abgleich kann sie auf veralteten Daten beruhen (wie jede Anzeige im Offline-Lesen).
- Die alten Spalten von `notification_settings` bleiben bis zu einem späteren Rückbau
  (expand → contract, Spec 0051, Entscheidung 9).
- Die rote Zahl ist die einzige rote Farbe der App (Token `badge`), entgegen „Kein Rot“ in
  `DESIGN.md`, auf ausdrücklichen Wunsch des Eigentümers.

**Folgearbeiten:**

- Spec 0051: Migration, `core`, `api`, App, Doku, Regeln.
- Nach der nächsten Veröffentlichung: Secrets und Variablen in Supabase und GitHub entfernen,
  `push-send` in der Cloud löschen (Spec 0051, „Enrico-Schritte“).
- Rückbau der alten Spalten in einer Migration, die `apply_changes` ohnehin neu definiert.

## Wann diese Entscheidung neu bewertet wird

- Wenn Mitteilungen außerhalb der App wieder gewünscht sind (dann z. B. native Apps mit Expo Push,
  neue ADR).
- Wenn die Glocke mehr Arten oder Einstellungen je Art braucht.
- Wenn `acknowledged_notices` an die 400 Schlüssel stößt.
