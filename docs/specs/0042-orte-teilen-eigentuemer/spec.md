---
status: freigegeben # entwurf | freigegeben | umgesetzt | verworfen
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

**REQ-004 — Teilen.** Rezept, Sammlung, Restaurant und Aktivität haben „Teilen“ (Menü „Mehr“ bzw.
Knopf). Geteilt wird über das Teilen-Menü des Geräts ein ohne App lesbarer Text und der App-Link;
am Desktop ohne Teilen-Menü wird der Text kopiert. Quelle: F-09. Offline: offline vollständig.

- AC-008: Angenommen „Apfelkuchen“ für 2 Portionen · Wenn ich „Teilen“ tippe · Dann enthält der Text
  Titel, „2 Portionen“, alle Zutaten mit Mengen, die Schritte und die Links
- AC-009: Angenommen „AMRIT“ · Dann enthält der Text Name, Adresse, Karten-Link und Webseite
- AC-010: Angenommen Desktop ohne Teilen-Menü · Dann ist der Text kopiert und die App sagt „Kopiert“

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

## Daten

Migration: `stores.maps_url` (Grants, Sync-Registrierung, Cache-Version). Geänderte Funktionen
`private.invite_member`, `private.remove_member` (Eigentümer-Prüfung), Hilfsfunktion
`private.household_owner(household_id)`.

## Risiken

| Risiko                                  | Gegenmaßnahme                                  | Test         |
| --------------------------------------- | ---------------------------------------------- | ------------ |
| Mitglied entfernt Eigentümer per API    | Prüfung in `remove_member`                     | pgTAP AC-012 |
| Mitglied lädt per API ein               | Prüfung in `invite_member`                     | pgTAP AC-013 |
| Haushalt ohne Eigentümer nach Verlassen | Eigentümer immer abgeleitet                    | pgTAP AC-014 |
| Fremder Haushalt / abgemeldet           | bestehende Prüfungen                           | pgTAP AC-015 |
| Wiederherstellung ändert Beitrittszeit  | `created_at` bleibt (Migration 20261123070546) | Test Restore |

## Umsetzung

- [ ] 1. Migration `stores.maps_url` + pgTAP (`db-change`) (AC-003, AC-004)
- [ ] 2. Eigentümer: Funktion + Prüfungen + pgTAP (AC-012–AC-015), UI (AC-011)
- [ ] 3. Ortsfeld-Baustein, eingesetzt in Restaurant, Aktivität, Markt (AC-001, AC-002)
- [ ] 4. Einfügen erkennen (core: Erkennung Link/Adresse, Tests) (AC-005–AC-007)
- [ ] 5. Teilen (core: Text je Eintrag, Tests) (AC-008–AC-010)
- [ ] Nachweis: `pnpm format:check && pnpm check && pnpm build:web` grün;
      `pnpm exec supabase test db`; `/security-check`
