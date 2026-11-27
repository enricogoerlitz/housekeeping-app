---
status: umgesetzt # entwurf | freigegeben | umgesetzt | verworfen
datum: 2026-11-26
---

# 0042 — Orte, Einfügen, Teilen und Eigentümer des Haushalts

**Quelle:** Enricos Review 0003 vom 26.11.2026 (`tmp/__PROMPTS/0002-REVIEW-2026-11-26-PROMPT.md`,
F-04, F-05, F-06, F-09, V-01). **Welle 2.** **Kritischer Pfad:** ja: Migration, RLS/Berechtigungen
(Eigentümer), Löschen von Mitgliedern.

## Ziel

Einen Ort trage ich ohne Hin- und Herspringen ein: Name, ein Pin-Knopf öffnet Google Maps mit der
Suche, und ein kopierter Link oder eine Adresse landet mit einem Tipp im richtigen Feld. Märkte haben
auch einen Karten-Link. Rezepte, Restaurants und Aktivitäten kann ich teilen. Nur der Eigentümer
des Haushalts lädt ein und entfernt Mitglieder.

## Nicht-Ziele

- Keine automatische Ortssuche über eine Karten-Schnittstelle (kostet, braucht Schlüssel).
- Kein öffentlicher Link für Nicht-Mitglieder (Teilen schickt Text, Entscheidung 3).
- Keine Rollen außer „Eigentümer“ und „Mitglied“.

## Anforderungen

Haushalt „Enrico & Nadja“: Enrico ist am 20.11.2026 beigetreten, Nadja am 21.11.2026.

### Orte

**REQ-001 — Ortsfeld überall gleich.** Restaurant, Aktivität und Markt haben dasselbe Ortsfeld: oben
optional „Name für die Suche“ (vorbelegt mit dem Namen des Eintrags), darunter „Karten-Link“, rechts
daneben ein Pin-Knopf, der Google Maps mit der Suche nach Name und Adresse öffnet. Quelle: F-05.
Offline: offline lesend.

- AC-001: Angenommen „Neues Restaurant“ „Bless“ · Wenn ich den Pin tippe · Dann öffnet Google Maps die
  Suche „Bless“
- AC-002: Angenommen der Name für die Suche ist leer und es gibt keinen Namen · Dann ist der Pin
  deaktiviert

**REQ-002 — Märkte mit Karten-Link.** Ein Markt hat einen Karten-Link; „Route“ gibt es dort, wo er
hinterlegt ist (Regel aus Spec 0036). Quelle: F-06. Offline: offline lesend.

- AC-003: Angenommen Markt „Edeka Mitte“ mit Karten-Link · Dann zeigt seine Seite „Route“
- AC-004: Angenommen ein Mitglied eines anderen Haushalts · Dann kann es den Karten-Link nicht lesen

**REQ-003 — Einfügen erkennen.** Im Ortsfeld ein Knopf „Einfügen“: liest die Zwischenablage (iOS
fragt einmal mit „Einfügen“), erkennt Karten-Link, Webadresse oder Adresse, füllt das passende Feld
und setzt den Cursor ins nächste leere Feld. Dasselbe gilt beim normalen Einfügen in eines der Felder.
Quelle: F-04. Offline: offline vollständig (Formular).

- AC-005: Angenommen die Zwischenablage enthält `https://maps.app.goo.gl/abc` · Wenn ich „Einfügen“
  tippe · Dann steht der Link in „Karten-Link“
- AC-006: Angenommen die Zwischenablage enthält „Oranienburger Str. 45, 10117 Berlin“ · Wenn ich in
  „Karten-Link“ einfüge · Dann steht der Text in „Adresse“, und der Cursor im nächsten leeren Feld
- AC-007: Angenommen die Zwischenablage ist leer oder ohne erkennbaren Inhalt · Dann sagt die App
  „Nichts Passendes in der Zwischenablage“

### Teilen

**REQ-004 — Teilen.** Rezept, Sammlung, Restaurant und Aktivität haben „Teilen“ als gut sichtbares
Symbol direkt unter dem Foto, am rechten Ende der Zeile mit der Foto-Aktion (auch ohne Foto und
offline); zusätzlich im Menü „Mehr“. Geteilt wird über das Teilen-Menü des Geräts ein ohne App
lesbarer Text und der App-Link; am Desktop ohne Teilen-Menü wird der Text kopiert. Quelle: F-09,
Enricos Nachtrag vom 26.11. Offline: offline vollständig.

- AC-008: Angenommen „Apfelkuchen“ für 2 Portionen · Wenn ich „Teilen“ tippe · Dann enthält der Text
  Titel, „2 Portionen“, alle Zutaten mit Mengen, die Schritte und die Links
- AC-009: Angenommen „AMRIT“ · Dann enthält der Text Name, Adresse, Karten-Link und Webseite
- AC-010: Angenommen Desktop ohne Teilen-Menü · Dann ist der Text kopiert und die App sagt „Kopiert“
- AC-016: Angenommen die Seite von „Apfelkuchen“, „AMRIT“, einer Sammlung oder einer Aktivität ·
  Dann steht unter dem Foto rechts in der Zeile von „Foto ändern“ das Symbol „Teilen“, auch offline

### Eigentümer

**REQ-005 — Eigentümer.** Eigentümer ist das Mitglied mit dem frühesten Beitritt. Nur der Eigentümer
lädt ein und entfernt andere Mitglieder; jedes Mitglied kann den Haushalt verlassen. Verlässt der
Eigentümer den Haushalt, ist das nächstälteste Mitglied Eigentümer. Unter „Haushalt & Mitglieder“
steht beim Eigentümer „Eigentümer“. Quelle: V-01. Offline: offline lesend.

- AC-011: Angenommen Nadja ist angemeldet · Dann sieht sie weder „Einladen“ noch „Entfernen“ bei Enrico
- AC-012: Angenommen Nadja ruft `remove_member` für Enrico direkt auf · Dann lehnt der Server ab
- AC-013: Angenommen Nadja ruft `invite_member` direkt auf · Dann lehnt der Server ab
- AC-014: Angenommen Enrico verlässt den Haushalt · Dann ist Nadja Eigentümerin und kann einladen
- AC-015: Angenommen ein Mitglied eines anderen Haushalts oder abgemeldet · Dann lehnt der Server
  Einladen und Entfernen ab (wie heute)

## Entscheidungen

1. Enrico, 26.11.: Eigentümer wird abgeleitet (frühester Beitritt `household_members.created_at`,
   bei Gleichstand die kleinere Mitglieds-ID); keine neue Spalte, keine Übergabe-Oberfläche.
2. Enrico, 26.11.: Zwischenablage nur über „Einfügen“ (iOS erlaubt kein Lesen beim Antippen).
3. Enrico, 26.11.: Teilen = lesbarer Text + App-Link; Foto mit teilen, wenn das Gerät Dateien teilen
   kann (`navigator.canShare({ files })`).
4. Bau, 26.11.: „Name für die Suche“ ist beim Restaurant und beim Markt nur ein Feld für den Pin
   (nicht gespeichert, leer = Name des Eintrags als Platzhalter); bei der Aktivität ist es der
   gespeicherte Ortsname (`place_name`), der auch „Route“ beschriftet. Der Pin sucht auch mit der
   Adresse allein; deaktiviert nur ohne Name und ohne Adresse (AC-002).
5. Bau, 26.11.: Der Karten-Link des Markts steht im ✎-Fenster „Markt bearbeiten“ (Name + Ortsfeld),
   nicht in „Neuer Markt“ (dort bliebe nur ein zweiter Schreibschritt nach `create_store`). Ein
   Kurzlink wird beim Speichern aufgelöst wie beim Restaurant; „Route“ des Markts nutzt die
   Koordinaten des Links, sonst den Namen.
6. Bau, 26.11.: Einfügen erkennt Karten-Link, Webadresse (→ „Webseite“, wo es sie gibt) und Adresse
   mit fünfstelliger PLZ. Normales Einfügen = mehr als ein Zeichen auf einmal eingefügt
   (`insertedText`); Diktat oder Autokorrektur mit erkennbarem Inhalt wandert ebenso. Danach geht
   der Cursor ins nächste leere Feld von Karten-Link/Adresse.
7. Bau, 26.11.: Ein vor dem Link getippter Restaurantname bleibt; der Link füllt den Namen nur,
   wenn er leer ist oder vom vorigen Link stammt (Reihenfolge Name → Pin → Link).
8. Bau, 26.11.: „Zurückziehen“ einer Einladung bleibt für jedes Mitglied (nicht in REQ-005
   genannt); „Haushalt löschen“ bleibt beim letzten Mitglied.
9. Bau, 26.11.: Das Teilen-Symbol sitzt in `PhotoActionRow` (`own-photo.tsx`) rechts; Spec 0039
   ersetzt die Foto-Knöpfe links durch „Foto ändern“, das Symbol bleibt am Zeilenende.
10. Bau, 26.11. (nach dem Merge von 0041 und 0037): `apply_changes` dieser Migration baut auf der
    Fassung von `20261126111313` (Spec 0041) auf und ergänzt nur `maps_url` bei `stores`;
    Cache-Version 20 (0041: 19). `save_recipe_page` (0037) ruft `apply_changes(uuid, jsonb)`
    unverändert auf.
11. Browser-Durchklick 27.11. (Review 0003, B-02, REQ-003): Was beim Einfügen in ein Ortsfeld
    landet, bestimmt `recognizePaste`: Steht danach im Feld ein Karten-Link, bleibt es ein
    Karten-Link. Vorher wurde beim Ersetzen eines Karten-Links durch einen anderen nur der Teil
    hinter dem gemeinsamen „https://“ erkannt, als Webadresse in „Webseite“ verschoben, und der
    Karten-Link blieb alt.
12. Browser-Durchklick 27.11. (B-12): Scheitert das Abrufen eines Kurzlinks, steht unter dem Feld
    nur der Fehler; „Kurzlink erkannt – Ort wird beim Speichern abgerufen“ fällt dann weg.
13. Browser-Durchklick 27.11., Folge (B-06): Bearbeiten ist auf der Seite und in der
    Schnellansicht eines Restaurants und einer Aktivität der Stift oben rechts zwischen ♥ und ⋯, wie
    beim Rezept (Spec 0037, REQ-001). Der Knopf „Bearbeiten“ neben „Route“ und „Einplanen“ entfällt.

## Daten

Migration: `stores.maps_url` (Grants, Sync-Registrierung, Cache-Version). Geänderte Funktionen
`private.invite_member`, `private.remove_member` (Eigentümer-Prüfung), Hilfsfunktion
`private.household_owner(household_id)`.

## Risiken

| Risiko                                  | Gegenmaßnahme                                  | Test          |
| --------------------------------------- | ---------------------------------------------- | ------------- |
| Mitglied entfernt Eigentümer per API    | Prüfung in `remove_member`                     | pgTAP AC-012  |
| Mitglied lädt per API ein               | Prüfung in `invite_member`                     | pgTAP AC-013  |
| Haushalt ohne Eigentümer nach Verlassen | Eigentümer immer abgeleitet                    | pgTAP AC-014  |
| Fremder Haushalt / abgemeldet           | bestehende Prüfungen                           | pgTAP AC-015  |
| Wiederherstellung ändert Beitrittszeit  | `created_at` bleibt (Migration 20261123070546) | Test Restore  |
| Eigentümer lädt ein, während er geht    | `invite_member` sperrt die Haushaltszeile      | Code-Review   |
| Fremder Text aus der Zwischenablage     | nur Text, nie HTML; Link-Prüfung + DB-Check    | Vitest, pgTAP |

`Test Restore` = `household_owner.test.sql`: Wiederbeitritt (auch mit gesetztem
`housekeeping.keep_created_at` als Client) kommt ans Ende; ein Update behält `created_at`;
Mitglieder haben kein Insert/Update auf `household_members`. Die Restore-Funktionen der Migration
20261123070546 berühren `household_members` nicht.

`/security-check` (26.11.): 0 kritisch/hoch/mittel; 1 niedrig behoben (Sperre in
`invite_member` gegen das Rennen „Eigentümer geht / lädt ein“); Hinweise: „Zurückziehen“ bleibt für
alle Mitglieder (Entscheidung 8); `maps_url` wird nie als Link geöffnet, nur als Text geteilt; der
Pin öffnet nur `www.google.com/maps/search` mit kodierter Suche.

## Umsetzung

- [x] 1. Migration `stores.maps_url` + pgTAP (`db-change`) (AC-003, AC-004)
- [x] 2. Eigentümer: Funktion + Prüfungen + pgTAP (AC-012–AC-015), UI (AC-011)
- [x] 3. Ortsfeld-Baustein, eingesetzt in Restaurant, Aktivität, Markt (AC-001, AC-002)
- [x] 4. Einfügen erkennen (core: Erkennung Link/Adresse, Tests) (AC-005–AC-007)
- [x] 5. Teilen (core: Text je Eintrag, Tests) (AC-008–AC-010); Symbol unter dem Foto (AC-016)
- [x] Nachweis: `pnpm format:check && pnpm check && pnpm build:web` grün;
      `pnpm exec supabase test db`; `/security-check`

## Nachweis

- Rot vor grün: pgTAP `household_owner` (Funktion fehlte) und `store_maps_url` (`invalid_change`,
  Spalte fehlte); Vitest api `commands-stores` (`updateStore`), `households` (`ownerOfHousehold`),
  core `membership` (`householdOwnerId`), `place-input`, `share-text` (Modul fehlte).
- 26.11.: `pnpm format:check && pnpm check` grün, `pnpm build:web` (mit `.env`) grün.
  `pnpm exec supabase test db`: `household_owner` (27), `store_maps_url` (12), `household_rpcs`
  und alle übrigen eigenen grün; rot nur Tests fremder, parallel eingespielter Migrationen
  (`collections` durch 0037, `manage_household`/`schema_lint` durch 0041).
- Dev-Server (Port 8099), Playwright als Enrico und Nadja, 390×844 und 1440×900: AC-001 (Pin öffnet
  `google.com/maps/search/?api=1&query=Bless…`), AC-002, AC-003 (Route erst mit Link, weg ohne),
  AC-005, AC-006 (Adresse in „Adresse“, Cursor in „Karten-Link“), Webadresse → „Webseite“, AC-007,
  AC-010 (ohne `navigator.share` kopiert, „Kopiert“), AC-016 (Symbol unter dem Foto auf allen vier
  Seiten, Tipp kopiert den Text), AC-011 (Nadja: kein „Einladen“, kein
  „Entfernen“, „Eigentümer“ bei Enrico); keine Konsolenfehler. Bilder in `tmp/review-0003/0042/`.
- Nur am iPhone prüfbar: „Einfügen“-Blase von iOS, Teilen-Menü mit Foto, Fokus/Tastatur nach dem
  Einfügen, Rückkehr aus Google Maps in die installierte App.
- e2e: `rundgang-aktivitaeten` an `activity-search-name` angepasst, nicht ausgeführt (die Suite
  setzt die geteilte lokale DB zurück).
- Nach dem Merge von `develop` (0037, 0041): `apply_changes` der Migration lokal neu eingespielt
  (kein Reset); `pnpm exec supabase test db` komplett grün (58 Dateien, 2853 Tests, darunter
  `apply_changes`, `schema_lint`, `sync_pull`, `recipe_page_save`,
  `activity_kinds_and_series`); `pnpm format:check && pnpm check && pnpm build:web` grün.
