---
status: in-arbeit # offen | in-arbeit | erledigt
datum: 2026-11-21
spec: 0006
---

# 0006 — Plan

## Ansatz

Die Einkaufsliste ist die Menge der Posten eines Haushalts, ohne eigene Listen-Tabelle (ADR-0012:
die Migrationen werden vor der ersten Auslieferung einmal neu aufgebaut); neue RPCs für Liste leeren, ± und Wiederherstellen; Vorauswahl und Herkunft als reine Logik in
`core`; „Liste“ wird Bearbeitungsansicht, „Einkaufen“ wählt den Markt auf dem Gerät. Betroffen:
`supabase`, `core`, `api`, `app`.

## Datenbank und Sync

1. **Neuaufbau statt Zusammenführen (ADR-0012):** alle Migrationen werden zu einer Grundlage je
   Bereich zusammengefasst; jede Funktion steht nur in ihrer endgültigen Form da. Es gibt keinen
   Code für die Übernahme alter Daten. Vorher/nachher-Vergleich des Schemas (`pg_dump` und
   Katalog-Fingerabdruck in `tmp/baseline/`).
2. **Keine Listen-Tabelle:** `shopping_lists`, `households.default_list_id` und
   `shopping_items.list_id` entfallen. Posten gehören zum Haushalt; je Haushalt und Artikel höchstens
   ein offener Posten (`shopping_items_open_article_idx (household_id, article_id) where not
checked`). `create_household` legt keine Liste an. Hinzufügen, Erledigt leeren, Liste leeren und
   Wiederherstellen nehmen die Haushalts-Kennung; ein fremder Haushalt ergibt `not_member` (42501),
   auch bei den invoker-Funktionen. Die Sperre gilt je (Haushalt, Artikel).
3. **RPCs:** `clear_shopping_list(household)` (alle Posten inkl. Erledigt, liefert Zeilen für Rückgängig),
   `restore_cleared_items` erweitert: Wiederhergestelltes vereint sich mit inzwischen offenen Posten
   desselben Artikels (AC-037); `adjust_item_count(item, delta)` atomar je Tipp (AC-017, Regel 4a:
   erst der Anteil „von Hand“), Grenzen 0…99; Zusatz für den ganzen Posten über `apply_changes`.
4. **Warteschlange:** entfällt als Migrationsthema (ADR-0012). Ein Hinzufügen in der
   Laden-Warteschlange trägt die Haushalts-Kennung; Haken auf gelöschte Posten werden ohne Fehler
   verworfen (wie AC-025 aus 0003); vom Server abgelehnte Einträge (P0001/P0002, `not_member`) sind
   endgültig.

## core / api

- core: Vorauswahl D21 (ab heute bis Wochenende, nur was noch nicht auf der Liste steht), Herkunft
  („Mango-Curry (Sa)“ vs. ohne Tag), ±-Aufteilung, „Nadja kauft gerade ein“ (Haken der letzten 15 min).
- api: eine Liste als Hook, Befehle für ±, Zusatz, Entfernen (mit Rückgängig), Liste leeren,
  Erledigt leeren; zuletzt gewählter Markt **nur auf dem Gerät** je Haushalt (beim Abmelden gelöscht);
  Vorratscheck startbar mit beliebigen Rezepten (für 0008/0009). `CACHE_VERSION` +1 — **dabei bleibt
  die Laden-Warteschlange erhalten** (bisher löschte ein Versionswechsel sie mit; das behebt auch den
  in Spec 0014 gefundenen Fehler).

## App

- **„Liste“** (D24): kein Abhaken; Zeilen mit „− 2× +“ bzw. „500 g ›“, Tipp → „Posten bearbeiten“
  (m: Zusatz, Bereich per „Suchen oder anlegen“, Entfernen), Wischen entfernt mit Rückgängig, ⋯ mit
  Erledigt leeren / Liste leeren (kleines Bestätigungsfenster) / Märkte & Bereiche; „Was fehlt?“
  immer sichtbar (F1, Test gegen echtes Backend).
- **„Einkaufen“** (D26): Markt-Chip → „Wo kaufst du ein?“, Abhaken mit Sammel-Fenster (0005),
  „Im Wagen (n)“, „Fertig“ mit „8 gekauft · 2 bleiben“.
- **„Auf die Einkaufsliste“** (D21): großes Fenster, Schritt 1 mit Wochen ‹ ›, Tag-Tipp wählt alle,
  „Vorgemerkt“, „Rezept wählen …“; Schritt 2 Vorratscheck ausgewählt = normal, abgewählt = blass.
  Direkt-Einstieg von der Rezeptseite (REQ-010).

## Risiken und Gegenmaßnahmen

| Risiko                                               | Gegenmaßnahme                                                                             | Test                                                 |
| ---------------------------------------------------- | ----------------------------------------------------------------------------------------- | ---------------------------------------------------- |
| Verhalten verschiebt sich beim Neuaufbau             | Funktionen wörtlich aus ihrer letzten Fassung, Schema-Vergleich vorher/nachher            | `tmp/baseline/*/fingerprint.diff`, pgTAP vollständig |
| Zweiter offener Posten desselben Artikels            | eindeutiger Index je (Haushalt, Artikel) für offene Posten, Sperre je (Haushalt, Artikel) | pgTAP 23505, gleicher Artikel in Haushalt B erlaubt  |
| Listen-Spalten über die API                          | keine Tabelle, keine Spalte, nicht in der Allowlist                                       | pgTAP Angriff (`invalid_change`)                     |
| Fremder Haushalt leert/ändert Liste                  | ausdrückliche Mitgliedsprüfung (`not_member`), auch in den invoker-RPCs                   | pgTAP je RPC, anon                                   |
| ± verliert Tipps / läuft über                        | atomares Inkrement, Grenzen 0…99                                                          | pgTAP + api-Test                                     |
| Offline-Aktionen gehen beim Versionswechsel verloren | Warteschlange, Markt- und Haushaltswahl überstehen den Versionswechsel                    | api-Test                                             |
| Rückgängig nach „Liste leeren“ dupliziert Posten     | Wiederherstellen vereint mit offenen Posten                                               | pgTAP AC-037                                         |
| Markt-Wahl verrät Aufenthalt                         | bleibt auf dem Gerät, beim Abmelden gelöscht                                              | api-Test                                             |

## Aufgaben

1. DB (Migrationen 1–4, pgTAP) ‖ core-Logik — parallel.
2. api (Hooks, Befehle, Warteschlange über Versionswechsel, Gerät-Marktwahl, Seed ohne Liste).
3. App „Liste“ + „Posten bearbeiten“ ‖ App „Einkaufen“ + „Auf die Einkaufsliste“ — getrennte Dateien.
4. `/security-check`, Nachweis im plan.md. Keine volle E2E-Suite (kommt am Ende der Wellen);
   F1 wird gezielt gegen das echte Backend geprüft.

## Verifikation

`pnpm db:reset` + `pnpm exec supabase test db`, `pnpm check`, `pnpm e2e:dev`, gezielter
Klick-Durchlauf (Liste bearbeiten, ±, leeren + Rückgängig, Einkaufen mit Markt, Auf die Einkaufsliste
aus der Vorwoche, offline hinzufügen → online), Schema-Vergleich vorher/nachher des Neuaufbaus
(ADR-0012) ohne andere Unterschiede als die Listen-Entfernung.

## Nachweis

Wird am Ende ausgefüllt.
