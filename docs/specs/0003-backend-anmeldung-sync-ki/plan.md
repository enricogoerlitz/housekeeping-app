---
status: in-arbeit # offen | in-arbeit | erledigt
datum: 2026-11-20
spec: 0003
---

# 0003 — Plan

## Ansatz

Supabase lokal in Docker wird die Quelle der Wahrheit; `packages/api` bekommt einen lokalen
Speicher mit Delta-Sync und einen Schreibweg, der Befehle sofort lokal anwendet und als genau eine
RPC an den Server schickt (ADR-0011). Reine Sync-Logik liegt in `packages/core`, Sicherheit in der
Datenbank (RLS, Spaltenrechte, Trigger, zusammengesetzte Fremdschlüssel). KI läuft in Edge
Functions. Betroffen: `supabase`, `core`, `api`, `app`, `e2e`.

## Architektur (Kernentscheidungen)

1. **Lokal zuerst, Überlagerung statt Rebase.** Befehle bleiben synchron und ändern sofort den
   lokalen Zustand → Bildschirme bleiben fast unverändert. Sichtbarer Zustand =
   `Serverzeilen ⊕ Laden-Warteschlange ⊕ ausstehende Änderungssätze` (reine Funktion in core).
   Ein Änderungssatz fällt heraus, wenn er bestätigt **und** danach ein Pull angewendet wurde.
   Fehler → Satz und alle späteren Online-Sätze verwerfen, Toast „Hat nicht geklappt – bitte noch
   einmal versuchen“ (AC-019). Eine FIFO-Ausgangsschlange für alles; nur Laden-Einträge werden
   persistiert.
2. **Schreibweg:** Jeder Befehl = **eine RPC in einer Transaktion**.
   - Allgemein: `apply_changes(household_id, ops)` — security invoker (RLS gilt), Tabellen-/
     Spalten-Allowlist als SQL-Konstante, nur reines INSERT/Patch/DELETE, Patch ohne Treffer =
     Fehler, Grenzen (≤ 200 Ops, ≤ 20 Deletes), plus kleine Allowlist von Domain-Operationen
     (z. B. `add_contributions`) für `applyProposal`.
   - **Eigene RPCs** (nicht generisch): Beiträge auf die Liste (`add_shopping_contributions`,
     Merge serverseitig mit Lock), `clear_checked_items`, `remove_contributions` (Undo),
     Favoriten/Bewertungen/Stimmen (`set_*`, mit `auth.uid()`), Laden-Aktionen, Haushalt/Einladung/
     Mitgliedschaft.
   - Schutz liegt in der Datenbank selbst: Spalten-Grants (nie `id`, `household_id`,
     `created_at`, `updated_at`), Trigger erzwingen Zeitstempel und unveränderliche
     `household_id`, Felder zur Person per Trigger (`author_id`, `member_id` = `auth.uid()`),
     **zusammengesetzte FKs `(household_id, x_id)`** gegen Verweise in fremde Haushalte.
   - „Rückgängig“: `undoable()` ersetzt `snapshot()` — Inverse aus den Zeilen vorher bzw.
     Inverse-RPC, statt den ganzen Zustand zurückzusetzen.
3. **Delta-Sync:** `sync_pull(household_cursors)` (invoker) liefert geänderte Zeilen + Grabsteine
   - `server_time`; Cursor **je (Haushalt, Tabelle)**, Sicherheitsfenster 2 min; Kleintabellen
     (Profile, Haushalte, Mitgliedschaften, Einladungen) immer komplett. Grabstein vs. Zeile:
     späteres Ereignis gewinnt. Voll-Load bei Erststart, neuer Speicher-Version, Cursor älter als
     30 Tage (gemessen an `server_time`), neuem Haushalt. Mitgliedschaft weg → Haushalt aus dem
     Gerät löschen.
4. **Realtime nur als Signal:** Statement-Trigger → `realtime.send` auf privates Topic
   `household:<id>`, Payload nur `{table}`, RLS auf `realtime.messages` → Client pullt verzögert.
5. **Lokaler Speicher (Web):** `idb-keyval` hinter einer Speicher-Schnittstelle; Zeilen + Cursor
   atomar je Stufe; an User-ID gebunden; Abmelden/Kontowechsel löscht Speicher, Warteschlange,
   Sitzung.
6. **Laden-Warteschlange:** RPCs `set_shopping_item_checked(item, checked, seen_check_seq)`
   (Zähler `check_seq` statt Zeitstempel-Vergleich; „Abhaken gewinnt“), `set_..._not_available`,
   `add_shopping_contributions` (Client-IDs, idempotent, liefert echte IDs → `remapQueue`),
   `assign_article_area`. Zusammenfassen, Umschreiben der IDs und Wirkung (`queueEffect`) als
   reine Funktionen in core.
7. **Artikel-Normalisierung nur einmal:** Client schreibt `name_key`/`synonym_keys`
   (`normalizeText` aus core), Server löst damit auf; Unique `(household_id, name_key)`.
8. **Auth:** supabase-js, Sitzung im Browser-Speicher (ADR-0003, akzeptiertes Risiko + CSP),
   Google per PKCE. Hook `before_user_created`: nur mit offener Einladung **und** Provider Google;
   E-Mail-Registrierung aus. Trigger auf `auth.users` legt Profil an und macht Einladungen zu
   Mitgliedschaften. Testkonten nur per Seed (lokal), Knopf nur mit `EXPO_PUBLIC_DEV_LOGIN=1`;
   App bricht beim Start ab, wenn der Schalter mit nicht-lokaler Supabase-URL gesetzt ist.
   „Als Nadja ansehen“ entfällt.
9. **KI (Edge Functions, Deno im Docker):** `ai-assistant` (Kontext unter RLS laden, Foundry
   Structured Output, Zod-Vertrag, jede ID gegen den Kontext prüfen, schreibt nichts),
   `ai-search`, `speech-token` (kurzlebiges Token, Browser streamt zu Azure),
   `resolve-maps-link` (nur https + Host-Allowlist, manuelle Weiterleitung ≤ 5, Consent-Seite
   per `continue` auswerten, Timeout). Jede Funktion prüft `role = authenticated` (401),
   Kontingent per `consume_ai_quota()` atomar vor Foundry, Wiederholen nur bei Netz/5xx/429
   (≤ 3). Kein `service_role` irgendwo. Diktat → Posten per core-Parser mit deutschen Zahlwörtern
   (kein zweiter KI-Aufruf).
10. **core ↔ Edge Functions:** Vertrag `packages/core/src/ai-contract.ts` (nur `zod`), per
    `pnpm gen:edge` nach `supabase/functions/_shared/contract.gen.ts` kopiert, Drift-Check in
    `pnpm check`. Handler mit injizierten Abhängigkeiten → vitest ohne Deno; Integration gegen
    `supabase functions serve` mit Foundry-Mock.
11. **Seed:** tsx-Generator baut den Demo-Zustand → `supabase/seed.sql` (UUIDv5 aus Slugs,
    Daten als `(now() at time zone 'Europe/Berlin')::date + n`, Testkonten inkl.
    `auth.identities`); doppeltes „Geschenkpapier“ bereinigen. `pnpm db:reset` = Reset +
    Einladung für `DEV_OWNER_EMAIL` aus `.env` (psql-Variable, nie im Repo).
12. **Offline-Start (PWA):** Service Worker (workbox `injectManifest`, cached keine API-/Auth-
    Antworten), Manifest, CSP; iOS-Hinweis „Zum Home-Bildschirm“.

### Entscheidungen nach Enricos Regel „deine Empfehlung“ (in der Spec als ENTSCHIEDEN vermerkt)

- „Fertig“ im Einkaufsmodus offline: verlässt nur den Modus, Hinweis „Abgehakte räumen wir auf,
  sobald du Netz hast“ — keine fünfte Offline-Aktion.
- Sprach-Kontingent: gezählt über ausgestellte Tokens je Tag (statt Minuten, nicht messbar).
  KI-Kontingent: 200 Anfragen + 20 Sprach-Tokens je Mitglied und Tag.
- Einladung eines **bestehenden** Kontos: muss angenommen werden (schützt Profildaten);
  neue Konten treten bei der Erstanmeldung automatisch bei.
- Zutatenliste eines Rezepts gilt beim gleichzeitigen Bearbeiten als ein Feld (letzte Änderung
  gewinnt), dokumentiert.

### Bewusste Regel-Ausnahmen (stehen im plan.md)

Ohne `household_id`: `profiles`, `households`, `deleted_records` (hat sie, aber ohne Trigger),
`ai_usage` (RLS an, kein Grant, nicht synchronisiert). Tests nach der Umsetzung wo Code schon
existiert, ansonsten rot zuerst (pgTAP, core).

## Aufgaben (Phasen; ★ = kritischer Pfad → pgTAP mit Fremdhaushalt/anon + `/security-check`)

**Phase 0 — Dokumente:** plan.md (dieser Plan + Bedrohungsmodell), Spec freigeben (Entscheidungen
eintragen), ADR-0011 „Schreibweg: lokale Überlagerung, Änderungssätze, Domain-RPCs“,
`sync.md` ergänzen (check_seq, Cursor je Haushalt, statement_timeout), Glossar (Überlagerung).

**Phase 1 — Datenbank** (zuerst, größtes Risiko; mit `db-change`-Skill)

- T1 ★ Fundament: Default-Privileges (Tabellen, Sequenzen, Funktionen inkl. PUBLIC) entziehen,
  Schema `private`, `deleted_records`, Trigger-Helfer, `my_household_ids()`, Realtime-Policy,
  pg_cron-Aufräumen; pgTAP-Harness + **Schema-Linter-Test** (jede Tabelle: RLS, keine anon-Grants,
  Trigger, Index, zusammengesetzte FKs; jede Definer-Funktion `search_path=''`).
- T2 ★ Identität: profiles, households, household_members, household_invitations, RPCs
  (`create_household`, `invite_member`, `accept_invitation`, `remove_member`), Hook, Auth-Trigger,
  `config.toml` (Google per `env()`, Hook, Redirect-URLs, E-Mail-Registrierung aus).
- T3 ★ Fachtabellen: a) areas, articles, stores, shopping_lists · b) recipes + Favoriten/
  Bewertungen · c) restaurants (+ dito), absences, feedback + votes · d) chores, chore_events ·
  e) meal_plan_entries · f) shopping_items (`check_seq`, partieller Unique), shopping_contributions.
- T4 ★ Laden-/Listen-RPCs inkl. ganzer Regel-Tabelle aus `sync.md` als pgTAP.
- T5 ★ `apply_changes` mit Angriffs-Testsuite (Namen-Injection, verbotene Spalten, fremder
  Haushalt, fremdes Eltern-FK, Löschgrenze, Rollback = AC-020).
- T6 ★ `sync_pull`. T7 `ai_usage` + `consume_ai_quota`.

**Phase 1′ — core (parallel ab Start):** C1 ★ Delta anwenden · C2 ★ Überlagerung · C3 Zeilen-Diff
· C4 ★ Laden-Warteschlange · C5 Zahlwörter/Diktat-Parser · C6 KI-Vertrag + `gen:edge`.

**Phase 2 — api:** A1 Typen generieren + Mapping Domain↔Zeilen (Rundreise-Test) · A2 Speicher
(idb-keyval / Speicher im RAM) · A3 ★ Transport + Fake-Transport · A4 ★ Sync-Engine + Realtime ·
A5 ★ Ausgangsschlange · A6 Befehle umstellen (UUIDs, `{local, remote}`, `undoable()`; bestehende
Tests auf Fake-Transport; je Datei parallel) · A7 ★ Auth-Modul · A8 Seed-Generator + `db:reset`.

**Phase 3 — Edge Functions (parallel zu Phase 2):** E1 ★ Gemeinsames (auth, cors, Foundry,
Kontingent) · E2 ★ speech-token · E3 ★ resolve-maps-link · E4 ★ ai-assistant · E5 ai-search.

**Phase 4 — App:** U1 ★ Auth-Gate (zwischen `Themed` und `AssistantProvider` in
`apps/app/src/app/_layout.tsx`) + Anmeldeseite · U2 Haushalt-Einstellungen (einladen, annehmen,
anlegen, entfernen; Demo-Schalter nur in Dev) · U3 async Assistent/Suche/Diktat/Kurzlink mit
Lade-/Fehlerzuständen · U4 Offline-Zustände · U5 ★ Service Worker, Manifest, CSP.

**Phase 5 — E2E:** Playwright gegen lokalen Stack (Global Setup `db:reset`, Login per Testkonto,
fester Testtag entfällt → relative Tage), bestehende Rundgänge angepasst, zwei Browser-Kontexte
mit echtem `setOffline` (AC-012–015, 021–025), API-Negativtests (AC-005, AC-011),
Bundle-Scan (kein Foundry-Schlüssel).

**Phase 6 — Nachweis:** `/security-check`, `/code-review`, spec-auditor; manueller Test mit
deinem echten Google-Konto (AC-001/002) — einmal deine Mithilfe nötig.

Ausführung: Phasen 1/1′/3 mit parallelen Agents (getrennte Dateien), ich prüfe und integriere;
Commits je Task auf Branch `feat/0003-backend-anmeldung-sync-ki` (von der aktuellen
Feature-Branch abgezweigt), Trailer `Spec: 0003`. Nicht gepusht.

## Neue Abhängigkeiten (je ein Satz Begründung im plan.md)

`@supabase/supabase-js` (offizieller Client), `idb-keyval` (~600 B, transaktionales `setMany`),
`zod` (KI-Vertrag, Validierung an Grenzen laut 20-typescript), `microsoft-cognitiveservices-speech-sdk`
(nachgeladen, nur Web), `workbox-build` (Precache-Liste aus dem Export), `uuid` (v5 nur im
Seed-Generator, dev).

## Risiken und Gegenmaßnahmen

Kritische Pfade: Anmeldung, RLS und Mandanten, Delta-Sync und Laden-Warteschlange, Migrationen,
Löschen. Jede Zeile hat einen Test; `/security-check` läuft über alle ★-Aufgaben.

| Was könnte schiefgehen                                              | Gegenmaßnahme                                                                                                                      | Getestet durch                               |
| ------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------- |
| Fremden Haushalt lesen                                              | RLS mit `my_household_ids()`, keine anon-Grants, Sync nur als aufrufende Person                                                    | Schema-Linter + Isolation je Tabelle (pgTAP) |
| In fremden Haushalt schreiben oder Zeile verschieben                | `with check`, kein Update-Recht auf `household_id`, Trigger                                                                        | pgTAP je Tabelle                             |
| Verweis auf Elternzeile eines fremden Haushalts                     | zusammengesetzte Fremdschlüssel `(household_id, x_id)`                                                                             | pgTAP T3/T5                                  |
| Missbrauch von `apply_changes`, SQL-Injection                       | `security invoker`, Allowlist als SQL-Konstante, `%I` nur auf Allowlist-Werte, `jsonb_populate_record`, eine Haushalts-ID, Grenzen | pgTAP-Angriffssuite T5                       |
| Gefälschte Felder zur Person (Autor, Bewertung, Haken)              | Trigger setzen `auth.uid()` bzw. prüfen Mitgliedschaft; Haken-Felder nur per Laden-RPC                                             | pgTAP                                        |
| Bewertung oder Favorit für andere setzen                            | Policy `member_id = auth.uid()`, eigene RPCs                                                                                       | pgTAP                                        |
| Massenlöschung durch einen Fehler im Diff                           | Grenze im Client, Löschgrenze auf dem Server, eigene RPC für Löschen nach Bedingung                                                | vitest C3 + pgTAP T5                         |
| Sich selbst in einen Haushalt eintragen                             | kein Insert-Recht auf Mitgliedschaften, nur Definer-RPCs mit Prüfung                                                               | pgTAP T2                                     |
| Konto ohne Einladung; Übernahme einer Einladung per E-Mail/Passwort | Hook verlangt Einladung **und** Google; E-Mail-Registrierung aus; Testkonten nur im lokalen Seed                                   | pgTAP Hook + manuell                         |
| Profil einer bestehenden Person per Einladung abgreifen             | Annahme-Schritt für bestehende Konten                                                                                              | pgTAP T2                                     |
| Ausführbare Funktionen, `search_path`-Übernahme                     | Default-Rechte inkl. PUBLIC entzogen, Schema `private`, `search_path = ''`                                                         | Schema-Linter                                |
| Datenabfluss über Realtime                                          | private Topics, RLS auf `realtime.messages`, Nachricht ohne Zeilendaten                                                            | pgTAP + E2E                                  |
| Entferntes Mitglied behält Daten                                    | Mitgliedschaft in jedem Pull, Cursor je Haushalt, Haushalt wird vom Gerät gelöscht                                                 | vitest C1 + E2E AC-012                       |
| Sitzungsdiebstahl im Web (XSS)                                      | keine Skripte Dritter, strikte CSP, kein HTML von Nutzern                                                                          | Build-Check CSP + `/security-check`          |
| Daten bleiben nach Abmelden oder Kontowechsel                       | Speicher an User-ID gebunden; Abmelden löscht Speicher, Warteschlange, Sitzung                                                     | api-Test + E2E AC-003                        |
| Foundry-Schlüssel gelangt in die App                                | nur Supabase-Secrets, kurzlebiges Speech-Token                                                                                     | Bundle-Scan + E2E AC-028                     |
| KI-Kosten durch Missbrauch oder Schleifen                           | atomares Kontingent vor Foundry, Eingabegrenzen, begrenzte Wiederholungen                                                          | pgTAP T7 + vitest E1                         |
| Prompt-Injection                                                    | Zod-Vertrag, IDs gegen den unter RLS geladenen Kontext prüfen, Übernehmen nur durch die Person                                     | vitest E4                                    |
| SSRF über Kartenlink                                                | Host-Allowlist, nur https, höchstens 5 Weiterleitungen, Consent-`continue` nur lesen, Timeout                                      | vitest-Tabelle E3                            |
| Edge Function ohne Anmeldung                                        | Prüfung `role = authenticated` in jeder Funktion                                                                                   | Integration anon → 401 (AC-005)              |
| Testzugang in Produktion                                            | Build-Schalter + Abbruch beim Start mit nicht-lokaler URL; nur lokal geseedet                                                      | Unit-Test + AC-007                           |
| Verlorene Offline-Haken                                             | persistierte FIFO, vorübergehende Fehler wiederholen, IDs umschreiben                                                              | vitest C4 + E2E AC-024                       |
| Zurücknehmen greift nie (Zeitstempel-Präzision)                     | Zähler `check_seq` statt Zeitstempel-Vergleich                                                                                     | pgTAP T4                                     |
| Verpasste Änderung durch spätes Commit                              | Sicherheitsfenster 2 min, `statement_timeout` 8 s                                                                                  | vitest C1                                    |
| Rückgängig erscheint wegen Grabstein nicht wieder                   | späteres Ereignis gewinnt                                                                                                          | vitest C1                                    |

## Bewusst nicht Teil dieses Plans

Betrieb in der Cloud (Supabase-Projekt, Hosting, nächtlicher Dump), native Apps, Hochladen von
Fotos, Benachrichtigungen, Desktop-Design (siehe Spec, Nicht-Ziele).

## Nachweis

Wird am Ende ausgefüllt.

- [ ] Alle AC haben einen Test (spec-auditor)
- [ ] `pnpm format:check && pnpm check && pnpm build:web` grün
- [ ] `pnpm exec supabase test db` grün
- [ ] `pnpm e2e` gegen den lokalen Stack grün
- [ ] `/security-check` gelaufen, Befunde behoben oder begründet
- [ ] Offline-Verhalten wie in der Spec geprüft (zwei Browser)
- [ ] Manueller Test mit echtem Google-Konto (AC-001, AC-002)
- [ ] Glossar und Rückverfolgbarkeitstabelle aktuell
