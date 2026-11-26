---
status: entwurf # entwurf | freigegeben | umgesetzt | verworfen
datum: 2026-11-26
---

# 0042 — Orte, Einfügen, Teilen und Eigentümer des Haushalts

**Quelle:** Enricos Review 0003 vom 26.11.2026 (`tmp/__PROMPTS/0002-REVIEW-2026-11-26-PROMPT.md`,
F-04, F-05, F-06, F-09, V-01). **Welle 2.** **Kritischer Pfad:** ja: Migration, RLS/Berechtigungen
(Eigentümer), Löschen von Mitgliedern.

> **Entwurf vor den Entscheidungen.**

## Ziel

Einen Ort trage ich ohne Hin- und Herspringen ein: Name, ein Pin-Knopf öffnet Google Maps mit der
Suche, und ein kopierter Link oder eine Adresse landet mit einem Tipp im richtigen Feld. Märkte haben
auch einen Karten-Link. Rezepte, Restaurants und Aktivitäten kann ich teilen. Nur der Eigentümer
des Haushalts lädt ein und entfernt Mitglieder.

## Nicht-Ziele

- Keine automatische Ortssuche über eine Karten-Schnittstelle (kostet, braucht Schlüssel).
- Kein öffentlicher Link für Nicht-Mitglieder (Teilen schickt Text, siehe OFFEN 3).
- Keine Rollen außer „Eigentümer“ und „Mitglied“.

## Anforderungen (Entwurf)

**REQ-001 — Ortsfeld überall gleich** (Restaurant, Aktivität, Markt): optional Name oben, Feld
„Karten-Link“, rechts Pin-Knopf → Google Maps mit Suche nach Name (+ Adresse).
**REQ-002 — Märkte mit Karten-Link** (Migration `stores.maps_url`).
**REQ-003 — Einfügen erkennen.** Siehe OFFEN 2.
**REQ-004 — Teilen** über das Teilen-Menü des Geräts.
**REQ-005 — Eigentümer.** Das am längsten beigetretene Mitglied ist Eigentümer; nur es lädt ein und
entfernt; verlässt es den Haushalt, wird das nächstälteste Eigentümer.

- AC-001: Angenommen Enrico (beigetreten 20.11.) und Nadja (21.11.) · Wenn Nadja „Enrico entfernen“
  sucht · Dann gibt es den Knopf nicht, und der Aufruf direkt an den Server wird abgelehnt
- AC-002: Angenommen Enrico verlässt den Haushalt · Dann ist Nadja Eigentümerin und kann einladen

## Entscheidungen

1. OFFEN (REQ-005): A: Eigentümer abgeleitet = ältestes Mitglied nach Beitritt (keine neue Spalte,
   genau deine Regel) · B: Spalte `owner_id`, übertragbar per Knopf. Empfehlung A: einfach, keine
   Übergabe-Oberfläche; Gleichstand nach Mitglieds-ID entschieden.
2. OFFEN (REQ-003): Automatisches Lesen der Zwischenablage beim Antippen eines Feldes erlaubt iOS
   nicht (nur nach Tippen auf „Einfügen“ in der iOS-Blase). Vorschlag: Knopf „Einfügen“ im Ortsfeld
   (ein Tipp + iOS-Bestätigung): erkennt Karten-Link, Webadresse oder Adresse, füllt das passende
   Feld und springt ins nächste. Gleiches beim normalen Einfügen in ein beliebiges Feld.
3. OFFEN (REQ-004): Was wird geteilt? Empfehlung: Text, der ohne App lesbar ist — Rezept: Titel,
   Portionen, Zutaten, Schritte, Links; Restaurant/Aktivität: Name, Adresse, Karten-Link, Webseite —
   plus App-Link für Haushaltsmitglieder. Foto teilen, wenn das Gerät Dateien teilen kann.

## Daten

`stores.maps_url` (Migration, Grants, Sync). REQ-005 ändert `private.invite_member`,
`private.remove_member`, Verlassen/Konto löschen; keine neue Spalte bei A.

## Risiken

| Risiko                                  | Gegenmaßnahme                                              | Test                                    |
| --------------------------------------- | ---------------------------------------------------------- | --------------------------------------- |
| Mitglied entfernt Eigentümer per API    | Prüfung in `remove_member`                                 | pgTAP: Nicht-Eigentümer → Fehler        |
| Haushalt ohne Eigentümer nach Verlassen | Eigentümer ist immer abgeleitet                            | pgTAP: Eigentümer verlässt → Nachfolger |
| Fremder Haushalt / abgemeldet lädt ein  | bestehende Prüfungen                                       | pgTAP                                   |
| Wiederherstellung ändert Beitrittszeit  | `created_at` bleibt bei Restore (Migration 20261123070546) | Test Restore                            |

## Umsetzung

Nach den Entscheidungen.
