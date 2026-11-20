---
status: in-arbeit # offen | in-arbeit | erledigt
datum: 2026-11-20
spec: 0004
---

# 0004 — Plan

Gebaut auf dem Backend aus Spec 0003 (Branch `feat/0004-aktivitaeten`). Fotos in Supabase Storage.
Ergänzt um drei Punkte aus Enricos UI-Review vom 20.11.2026 (Bewerten/Favorit, Neu anlegen beim
Einplanen, „Heute geplant“); der Rest des Reviews folgt im UI-Konzept (unten).

## Ansatz

Aktivitäten folgen exakt dem Restaurant-Muster (Spec 0002/0003). Wiederverwendet werden:
`parseMapsLink`, `routeLinks` (`packages/core/src/restaurants.ts`), `readMapsLink`/
`resolveMapsShortLink` (`packages/api/src/commands-restaurants.ts`), `RouteSheet`
(`apps/app/src/features/restaurants/route-sheet.tsx`, Prop auf `{name,address,location}` lockern),
Favorit/Bewertung-RPC-Muster und `commit()`-Pfade (`packages/api/src/store.ts`).
Ein verschachteltes `commit()` wird zu **einem** `apply_changes` → „anlegen und einplanen“ ist
eine Transaktion.

## Datenbank (★ kritischer Pfad: Migration ändert bestehende Haushalte, Storage-Rechte)

Neue Migrationen (mit `db-change`-Skill, pgTAP rot zuerst):

1. **Tageszeit „Vormittag“:** bestehenden Haushalten ohne „Vormittag“ wird `{id: gen_random_uuid(),
name:'Vormittag', sort: min(sort)-1}` vorn in `households.meal_slots` eingefügt; bestehende
   Slot-IDs bleiben (AC-003). `private.create_household` neu mit drei Tageszeiten. Seed
   (`packages/api/src/seed/demo.ts`) bekommt den dritten Slot, `supabase/seed.sql` neu generiert.
2. **`activities`** (`name`, `name_key` unique je Haushalt, `description`, `photo_path`,
   `place_name`, `address`, `lat`, `lng`, `maps_url` https-Check, `tags`, `created_by` = auth.uid()
   per Trigger) + `activity_favorites`, `activity_ratings` + RPCs `set_activity_favorite/rating`
   — Kopie von `20261120151213_domain_restaurants_absences_feedback.sql`.
3. **`meal_plan_entries`:** `kind` + `'activity'`, `activity_id` (zusammengesetzter FK, `on
delete restrict`), `note` (≤ 120 Zeichen, nur bei Aktivitäten), kind-Check und Spalten-Grants.
4. **`recipes.photo_path`** (eigenes Foto; `photo` bleibt Beispielfoto-Rückfall).
5. **`sync_pull` und `apply_changes`** per `create or replace` (Body aus
   `20261120182725_apply_changes_entry_limits.sql`) um die neuen Tabellen/Spalten erweitert.
6. **Storage:** privater Bucket `household-media` (Migration, nicht nur config.toml), nur
   `image/jpeg`, ≤ 2 MB (nach Verkleinern); Pfad `<household_id>/<activities|recipes>/<id>/<uuid>.jpg`;
   Policies auf `storage.objects` für select/insert/update/delete: erster Pfadteil ∈
   `private.my_household_ids()`. pgTAP: fremder Haushalt kann nicht lesen/schreiben/löschen,
   anon nichts, falscher Pfad (fremde Haushalts-ID) beim Upload abgelehnt (AC-012).

## core (`packages/core`)

- Typen: `Activity`, `MealPlanEntry.kind 'activity'`, `activityId`, `note`; `Recipe.photoPath`.
- `orderSlotEntries(entries)`: Aktivitäten → Rezepte/Freitext/Reste → Restaurants, dann `sort`
  (AC-002); `entriesForDay` nutzt sie.
- `visitsOf(kind, id, entries, today)` (verallgemeinert `restaurantVisits`, AC-016),
  `findDuplicateActivity` über `normalizeText` (AC-008).

## api (`packages/api`)

- `commands-activities.ts`: create/update/favorite/rate (Muster Restaurants), Karten-Link wie
  Restaurants; `createAndPlan…` für Rezept/Restaurant/Aktivität (verschachteltes commit = eine
  Transaktion, AC-021–023).
- Mapping/Tabellen/Fake-Server/`changes.ts` erweitern; `CACHE_VERSION` +1; `pnpm db:types`.
- **Fotos** (`photos-remote.ts`): `pickAndUpload` (Validierung Typ/≤ 15 MB → Verkleinern auf
  1600 px per Canvas, JPEG ~0,82, **EXIF/Standort entfällt durch Neukodieren** → Upload →
  `photo_path` setzen → altes Objekt löschen), `removePhoto` (AC-018), `usePhoto(path)`:
  Download über supabase-js mit Sitzung → Blob im IndexedDB-Speicher (wird beim Abmelden gelöscht)
  → `blob:`-URL; offline aus dem Speicher (AC-011). Kein CSP-Lockern nötig (`img-src blob:`).

## App (`apps/app`)

- **Plan-Tab als Ordner mit Stack** (`(tabs)/plan/_layout.tsx`, `index.tsx`,
  `aktivitaet/[id].tsx`), damit Detailseiten Tab-Leiste/Seitenleiste behalten. Umschalter
  „Woche · Aktivitäten“ über `?view=` wie in `recipes-screen.tsx`.
- `features/activities/`: Sammlung (Foto, „Zuletzt · N-mal“, Herz, Sterne, leerer Zustand),
  Detail (Foto ändern/entfernen, Ort + Route, Bewertungen je Person, Verlauf, Einplanen),
  Anlege-/Bearbeiten-Formular (Name, Beschreibung, Foto, Karten-Link oder Ort von Hand, Dublette).
- **Hinzufügen-Fenster im Plan:** neue Art „Aktivität“ mit Zusatz-Feld; je Art „Neu anlegen“ als
  Formular **im selben Fenster** (Formular-Teile aus `add-restaurant-sheet.tsx` und
  `new-recipe-sheet.tsx` herausgelöst). Eintrag-Sheet: Zusatz bearbeiten, „Wer kocht?“ nur bei
  Rezepten.
- **Heute:** „Heute geplant“ statt „Essen heute“, alle Arten in Tageszeit-Reihenfolge, Kennzeichen
  über neues `badge`-Prop von `MediaCard` (`packages/ui/src/display.tsx`), Route bei Ort.
- **Rezept:** Foto hochladen/entfernen in der Rezeptansicht; eigenes Foto hat Vorrang überall
  (`photoSource` → gemeinsamer `useRecipePhoto`).

## Risiken und Gegenmaßnahmen

| Risiko                                           | Gegenmaßnahme                                                                         | Test                     |
| ------------------------------------------------ | ------------------------------------------------------------------------------------- | ------------------------ |
| Fremder Haushalt liest/überschreibt/löscht Fotos | privater Bucket, Policies über ersten Pfadteil + Mitgliedschaft                       | pgTAP `storage_policies` |
| Upload in fremden Ordner                         | insert-Policy prüft Pfad; Client baut Pfad aus aktiver Haushalts-ID                   | pgTAP                    |
| Schädliche oder riesige Dateien (SVG, 50 MB)     | Bucket nur `image/jpeg`, ≤ 2 MB; Client kodiert neu                                   | pgTAP + vitest           |
| Standortdaten im Foto (EXIF)                     | Neukodieren per Canvas entfernt Metadaten                                             | vitest (Blob ohne EXIF)  |
| Verwaiste Fotos                                  | altes Objekt nach erfolgreichem Wechsel löschen; Rest-Risiko bei Abbruch dokumentiert | api-Test                 |
| Plan-Einträge verrutschen durch „Vormittag“      | neue Slot-ID, alte unverändert, idempotente Migration                                 | pgTAP AC-003             |
| Fotos anderer Person nach Kontowechsel           | Foto-Cache im selben, an die User-ID gebundenen Speicher                              | api-Test                 |
| Activity-Tabelle ohne Isolation                  | Schema-Linter + `tenant_isolation`                                                    | pgTAP                    |

## Aufgaben (parallel, wo Dateien getrennt sind)

1. **DB** (Migrationen 1–6, pgTAP inkl. Linter, Isolation, Storage) ‖ **core** (Typen, Reihenfolge,
   Besuche, Dublette).
2. **api** (Befehle, Mapping, Fake-Server, Fotos, Seed mit Vormittag + 3 Demo-Aktivitäten mit
   Besuchen, `db:types`).
3. **App** in zwei getrennten Agents: (a) Plan-Tab-Umbau + Aktivitäten-Sammlung/Detail/Formular +
   Hinzufügen-Fenster; (b) Heute „Heute geplant“ + Rezeptfoto + Eintrag-Sheet-Zusatz +
   `MediaCard.badge`.
4. **E2E**: neue `rundgang-aktivitaeten.spec.ts` (AC-001–023, zwei Geräte für AC-009/017/020),
   bestehende Erwartungen an zwei Tageszeiten anpassen, Dev-Smoke um Aktivitäten erweitern.
5. **Nachweis**: `/security-check` (Storage!), spec-auditor, `pnpm check`, `supabase test db`,
   `pnpm e2e`, `pnpm e2e:dev`; plan.md und Rückverfolgbarkeit nachführen.

## Bewusst nicht Teil dieses Plans

Löschen von Aktivitäten (wie bei Restaurants noch kein Löschweg), Fotos für Restaurants,
Neugestaltung von Heute/„Wie war's“/Wochenleiste, Detailseiten von Rezept und Restaurant in die
Tabs holen (kommt mit dem UI-Konzept).

## Danach (nicht Teil von 0004): UI-Konzept zur Freigabe

Aus Enricos Review in `tmp/TMP.md` plus Sammlungen-Idee ein Konzept unter
`docs/product/ui-konzept-v2.md` (auch als Seite zum Durchklicken), u. a.:

- **Sammlungen als besondere Rezepte:** beim Anlegen „Rezept oder Sammlung“; Sammlung = eigene
  Zutaten + enthaltene Rezepte; unter „Essen → Rezepte“ mit Kennzeichen; einplanbar; „Auf die
  Einkaufsliste“ aus Plan, Rezept und Sammlung (inkl. enthaltener Rezepte, mit Vorratscheck).
- **Nur eine Einkaufsliste** (Domänenänderung), Liste bearbeiten (Menge ±, Zusatz, leeren mit
  Bestätigung), Einkaufen mit Markt-Wahl.
- Globale Muster: Sticky-Header, feste Dialoggröße mit Scroll, Abhaken mit 2-s-Verzögerung,
  KI ausgeblendet bis zum Schluss, Navigation auf allen Seiten, Stammdaten-Seiten ausgereift,
  Zutaten aus dem Katalog mit Suche statt Freitext, Essen-Filter neu (Küche, Zufall, Endlos-Liste),
  Heute (Wochen wechseln, „Wie war's“ für alles mit halben Sternen), Haushalt (Verlauf nach
  Wochen, Bearbeiten), Einstellungen entrümpeln, Frisch-Theme ruhiger, Desktop-Layout.

## Nachweis

Wird am Ende ausgefüllt.
