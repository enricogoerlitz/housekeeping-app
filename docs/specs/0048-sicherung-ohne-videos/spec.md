---
status: freigegeben
datum: 2026-11-26
---

# 0048 — Sicherung ohne Videos

**Quelle:** Enrico, 26.11.2026 (Vorschau-Feedback, Batch 3): Das Supabase-Projekt hat im Free-Tarif
5 GB ungecachten Egress im Monat; „wir brauchen die Videos nicht backupen, nicht nötig“.
**Kritischer Pfad:** ja: Infrastruktur (Sicherung, Wiederherstellung).

## Ziel

Die nächtliche Sicherung soll das Egress-Kontingent des Projekts nicht aufbrauchen, sonst drosselt
Supabase die App bis zum nächsten Abrechnungszeitraum. Rezeptvideos lassen sich jederzeit über
ihren TikTok-Link neu speichern und werden deshalb nicht mehr gesichert; Datenbank und Fotos
bleiben vollständig in jeder Sicherung. Gelöst ist es, wenn die Sicherung den Video-Bucket nicht
mehr liest und der Wiederherstellungstest grün bleibt.

## Nicht-Ziele

- Fotos inkrementell sichern (nur neue Fotos laden, Ablage in Azure): erst ab der Schwelle in
  `betrieb.md` (Entscheidung 4).
- Videos aus älteren Sicherungen entfernen: sie laufen mit der Aufbewahrung ab (31 bzw. 366 Tage).
- Bucket `household-videos` oder die Videofunktion ändern: `verify.mjs` („Video-Bucket“) prüft ihn
  weiter, der Reset leert ihn weiter.

## Anforderungen

**REQ-001 — Keine Videos in der Sicherung.** Die Sicherung liest nur die Datenbank und
`household-media`. Quelle: Enrico, 26.11.2026. Offline: entfällt (Betrieb, kein App-Verhalten).

- AC-001: Angenommen in `household-videos` liegt ein Video · Wenn `backup.yml` läuft · Dann liest
  kein Schritt `household-videos` und das Archiv enthält nur `roles.sql`, `schema.sql`, `data.sql`
  und `media/`
- AC-002: Angenommen die Sicherung ist gepackt · Wenn `manifest.mjs` die Begleitdatei schreibt ·
  Dann hat sie Format 3 mit Tabellen, Fotos und Prüfsumme und kein Feld `videos`

**REQ-002 — Der Wiederherstellungstest liest alle Formate.** Quelle: Spec 0014 (AC-056), Spec 0043. Offline: entfällt.

- AC-003: Angenommen die neueste Sicherung hat Format 3 · Wenn `compare.mjs counts` ohne
  Videoordner vergleicht · Dann ist sie grün mit „… Zeilen, 2 Fotos“ und kein Ordner `videos/`
  wird gesucht
- AC-004: Angenommen eine ältere Sicherung im Format 2 (mit `videos`) oder 1 · Wenn
  `compare.mjs counts` sie prüft · Dann vergleicht es Zeilen und Fotos und übergeht die Videos
- AC-005: Angenommen eine Begleitdatei im Format 0 oder 4 · Wenn `compare.mjs` sie liest · Dann
  meldet es „Begleitdatei ungültig (Format oder Felder)“

**REQ-003 — Egress der Fotos im Blick.** Quelle: Enrico, 26.11.2026. Offline: entfällt.

- AC-006: Angenommen die Fotos in `media/` sind zusammen 1,5 MB groß · Wenn `manifest.mjs` läuft ·
  Dann nennt die Log-Zeile „… 2 Fotos (1,5 MB)“ und die Begleitdatei bleibt ohne Größenangabe

## Entscheidungen

1. **Ersetzt Spec 0043, Entscheidung 8** (Enrico, 26.11.2026): Rezeptvideos gehören nicht mehr in
   die Sicherung, weder nachts noch vor einer Veröffentlichung. Grund: Egress (jede Nacht alle
   Videos, bei 1 GB Videos etwa 30 GB im Monat), und ein Video lässt sich aus seinem TikTok-Link neu
   speichern. `verify.mjs` („Video-Bucket“) und der Reset bleiben, die App braucht den Bucket.
2. Begleitdatei **Format 3** hat denselben Inhalt wie Format 1 (ohne `videos`), aber eine eigene
   Nummer: Man sieht der Datei an, dass die Videos bewusst fehlen. `compare.mjs` liest 1, 2 und 3;
   bei Format 2 bleiben die Videos ungeprüft (sie liegen noch im Archiv, harmlos).
3. Nach einer Wiederherstellung nennen Rezepte Videos, die es nicht mehr gibt. Die App zeigt dann
   „Das Video ließ sich gerade nicht laden …“ und bietet „Video entfernen“; danach lässt sich das
   Video über den Link neu speichern. Das Runbook in `betrieb.md` sagt das. Bei einer Sicherung im
   Format 2 können die Videos aus `videos/` hochgeladen werden.
4. **Fotos bleiben voll gesichert** (wie heute). Schätzung und Schwelle für eine inkrementelle
   Sicherung stehen in `betrieb.md`. Befunde für später: Fotos sind in der App unveränderlich (neuer
   UUID-Name je Upload, `upsert: false`), die Policy `household_media_update` erlaubt aber das
   Überschreiben; eine Ablage müsste daher Name **und** ETag als Schlüssel nehmen. Und die Identität
   der Sicherung darf heute nur schreiben, nicht auflisten; eine Ablage bräuchte Leserecht am
   Container.
5. Die Zeitgrenzen (45 Minuten) bleiben; ohne Videos sind sie reichlich.

## Daten

Gelesen: Datenbank und `household-media` wie bisher. Nicht mehr gelesen: `household-videos`. Keine
Schemaänderung, keine neue Azure-Ressource, kein neues Secret. Personenbezogene Daten: Videos
verlassen Supabase nicht mehr über die Sicherung; ältere Archive mit Videos laufen ab.

## Risiken

| Risiko                                           | Gegenmaßnahme                                                       | Test                                  |
| ------------------------------------------------ | ------------------------------------------------------------------- | ------------------------------------- |
| Videos nach einer Wiederherstellung verloren     | bewusst (Entscheidung 1); Runbook: „Video entfernen“, neu speichern | `betrieb.md`                          |
| Ältere Sicherung (Format 1, 2) bricht den Test   | `compare.mjs` liest beide weiter, Videos übergangen                 | `compare.test.mjs` AC-004             |
| Ungültige oder manipulierte Begleitdatei         | Formatprüfung, Prüfsumme des Archivs unverändert                    | `compare.test.mjs` AC-005             |
| Sicherung liest den Video-Bucket doch wieder     | Workflow-Test: genau ein `aws s3 sync`, nur `household-media`       | `workflows.test.mjs` AC-001           |
| Foto-Egress wächst unbemerkt über das Kontingent | Fotogröße im Log, Schätzung und Schwelle in `betrieb.md`            | `manifest.test.mjs` AC-006            |
| Fehlerpfad: Fotoordner fehlt / Bucket fehlt      | „Fotoordner fehlt“, Warnung bei `NoSuchBucket` unverändert          | `manifest.test.mjs`, `workflows.test` |
| Video-Bucket geht verloren, fällt niemandem auf  | `verify.mjs` „Video-Bucket“ nach jeder Auslieferung bleibt          | `scripts/release/verify.test.mjs`     |

Fremder Haushalt und abgemeldete Person: nicht betroffen (keine App-, RLS- oder Rechteänderung; der
Azure-Zugriff und die Selbstprüfung „Löschen und Überschreiben scheitern“ bleiben unverändert).

`/security-check` (26.11.2026, Diff gegen `develop`): keine Befunde. Hinweise: (1) Die Log-Zeile
nennt jetzt auch die Gesamtgröße der Fotos; das Repo ist öffentlich, die Zahl verrät aber nur das
Volumen, keine Inhalte (die Fotoanzahl stand schon im Log). (2) Sicherungen im Format 2 enthalten
weiter Videos, bis sie ablaufen (täglich 31, monatlich 366 Tage).

## Umsetzung

- [x] 1. Tests rot: `workflows.test.mjs`, `manifest.test.mjs`, `compare.test.mjs` (AC-001–AC-006)
- [x] 2. `backup.yml`, `manifest.mjs`, `compare.mjs`, `restore-test.yml` (AC-001–AC-006)
- [x] 3. `betrieb.md` (Inhalt, Format 3, Egress-Schätzung, Schwelle, Runbook), Spec 0043
      Entscheidung 8 als abgelöst markieren, Glossar „Sicherung“
- [x] 4. actionlint, `/security-check` auf dem Diff
- [x] Nachweis: `pnpm format:check && pnpm check && pnpm build:web` grün

**Nachweis (26.11.2026):** `node --test scripts/backup/*.test.mjs` erst rot (14 von 62
fehlgeschlagen), dann grün (62/62). `pnpm format:check && pnpm check` grün (427 Skript-Tests,
17 Turbo-Aufgaben), `pnpm build:web` grün (mit den öffentlichen Werten und Wegwerf-VAPID-Schlüsseln
wie in `checks.yml`), actionlint 1.7.12 ohne Befund. Kein Lauf gegen Supabase oder Azure; die erste
echte Prüfung ist die Nachtsicherung nach der nächsten Veröffentlichung (Log: „… Fotos (… MB)“,
kein Schritt „Videos sichern“) und der Wiederherstellungstest danach.
