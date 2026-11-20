---
status: offen # offen | in-arbeit | erledigt
datum: 2026-11-20
spec: 0004
---

# 0004 — Plan

## Ansatz

Wird direkt nach Spec 0003 umgesetzt, auf dem echten Backend. Aktivitäten folgen dem Muster der
Restaurants (Spec 0002): eigene Tabelle, Karten-Link über `parseMapsLink` bzw. die Edge Function
`resolve-maps-link`, Route über `routeLinks`, „Zuletzt · N-mal“ aus vergangenen Planeinträgen.
Neu sind die Foto-Ablage in Supabase Storage (für Aktivitäten und Rezepte) und die dritte Tageszeit. Betroffen: `supabase`,
`core`, `api`, `app`.

## Datenbank und Sync

Mit dem `db-change`-Skill:

- Tabelle `activities` (`name`, `name_key` unique je Haushalt, `description`, `photo_path`,
  `place_name`, `lat`, `lng`, `maps_url`, `created_by`), alle Standardspalten, RLS, Trigger,
  pgTAP-Isolation.
- `meal_plan_entries`: `kind` um `activity` erweitern, Spalten `activity_id` (zusammengesetzter
  Fremdschlüssel) und `note`; additive Migration.
- Tageszeit „Vormittag“: Migration ergänzt `meal_slots` bestehender Haushalte vorn (neue ID,
  bestehende IDs unverändert, AC-003); `create_household` legt künftig drei Tageszeiten an.
- `recipes.photo_path` (eigenes Foto; das mitgelieferte Beispielfoto `photo` bleibt als Rückfall).
- Storage: privater Bucket `household-media`, Pfad `<household_id>/<activities|recipes>/<id>/<uuid>.jpg`;
  Policies auf `storage.objects`: Lesen, Schreiben, Löschen nur für Mitglieder des Haushalts im
  ersten Pfadteil; Größen- und Typgrenze am Bucket. pgTAP für fremde Haushalte (AC-012).

## Risiken und Gegenmaßnahmen

| Was könnte schiefgehen                                | Gegenmaßnahme                                                                    | Getestet durch              |
| ----------------------------------------------------- | -------------------------------------------------------------------------------- | --------------------------- |
| Fremder Haushalt liest oder überschreibt Fotos        | Bucket privat, Policies über ersten Pfadteil + Mitgliedschaft                    | pgTAP auf `storage.objects` |
| Riesige oder schädliche Dateien                       | Grenze am Bucket (Größe, MIME), Verkleinern und Neu-Kodieren als JPEG im Browser | vitest + E2E AC-010         |
| Verwaiste Fotos nach Löschen                          | Löschen der Aktivität löscht das Objekt; Aufräum-Job für Objekte ohne Aktivität  | pgTAP/Integration           |
| Bestehende Planeinträge verrutschen durch „Vormittag“ | neue Slot-ID, bestehende IDs bleiben                                             | pgTAP AC-003                |

## Aufgaben

Werden nach Abschluss von Spec 0003 detailliert (Datenbank → core-Sortierung und Besuche → api
→ App → E2E).

## Nachweis

Wird am Ende ausgefüllt.
