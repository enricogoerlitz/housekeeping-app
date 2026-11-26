---
status: entwurf # entwurf | freigegeben | umgesetzt | verworfen
datum: 2026-11-26
---

# 0037 — Rezeptseite: ein Bearbeitungsmodus, Sammlungen im Filter, Einkauf mit Personen

**Quelle:** Enricos Review 0003 vom 26.11.2026 (`tmp/__PROMPTS/0002-REVIEW-2026-11-26-PROMPT.md`,
E-04, E-05, E-07, E-09, E-11, E-12, E-17 Schlagwort-Filter). **Welle 2.** **Kritischer Pfad:** ja:
Migration (Dauer an Sammlungen, Entscheidung 2), Sync (Speichern mehrerer Abschnitte in einem
Schritt).

> **Entwurf vor den Entscheidungen.** Die AC werden nach Enricos Wahl der Optionen geschärft.

## Ziel

Die Rezept- und Sammlungsseite ist in Ruhe eine schöne Ansicht ohne Stifte. Ein Stift oben rechts
macht alles bearbeitbar, „Speichern“ oben rechts sichert alles auf einmal. Sammlungen erscheinen in
passenden Filtern, haben eine Dauer, und auf die Einkaufsliste kommt ein Rezept für die gewählte
Zahl Personen. Zutaten eines anderen Rezepts (Pizzateig) lassen sich als Gruppe übernehmen.

## Nicht-Ziele

- Keine KI auf der Seite (Spec 0040 hängt sich in den Bearbeitungsmodus ein).
- Keine Verknüpfung zwischen Rezepten: übernommene Zutaten sind Kopien.
- Kein neues Foto-Fenster (Spec 0039).

## Anforderungen (Entwurf)

**REQ-001 — Ein Bearbeitungsmodus.** Ein Stift oben rechts schaltet die ganze Seite in den
Bearbeitungsmodus; „Speichern“/„Abbrechen“ oben rechts; „+ Zutat“, „+ Rezept“ öffnen im Lesemodus
den Bearbeitungsmodus und gleich das Fenster. Ersetzt den „Abschnitt der Rezeptseite“ (Spec 0008
REQ-007). Offline: offline lesend.

- AC-001: Angenommen „Apfelkuchen“ · Dann gibt es im Lesemodus genau einen Stift (oben rechts)
- AC-002: Angenommen Bearbeitungsmodus, Titel und Zutat geändert · Wenn ich „Speichern“ tippe ·
  Dann sind beide Änderungen in einem Schritt gespeichert, oder bei Fehler keine
- AC-003: Angenommen Bearbeitungsmodus mit Änderungen · Wenn ich die Seite verlasse · Dann fragt die
  App „Änderungen verwerfen?“
- AC-004: Angenommen Nadja ändert dasselbe Rezept auf ihrem Gerät, während ich bearbeite · Wenn ich
  speichere · Dann gilt die Regel aus OFFEN 4

**REQ-002 — Neu-Fenster mit mehr Möglichkeiten.** „Neu → Rezept/Sammlung“ bietet optional Foto,
Zutaten (Einfügen) bzw. Rezepte und „Mit KI ausfüllen“ (Spec 0040); der Name reicht weiterhin.

**REQ-003 — Sammlungen im Filter.** Ernährungsform wird aus dem Inhalt abgeleitet (gibt es schon),
eine leere Sammlung passt zu jedem Filter; Gerichtart/Küche passen, wenn ein enthaltenes Rezept passt.

- AC-005: Angenommen Sammlung „Grillabend“ leer · Wenn ich „vegetarisch“ filtere · Dann steht
  „Grillabend“ in der Liste
- AC-006: Angenommen Sammlung mit „Steak“ und „Salat“ · Wenn ich „vegetarisch“ filtere · Dann fehlt
  sie

**REQ-004 — Dauer an Sammlungen.** Eine Sammlung hat eine eingebbare Dauer; der Dauer-Filter gilt
auch für sie. (OFFEN 2)

**REQ-005 — Auf die Liste für N Personen.** „Auf die Liste“ fragt die Personenzahl (vorbelegt mit
den Portionen des Rezepts bzw. der Sammlung) und rechnet die Mengen um (Rechnung gibt es schon).

- AC-007: Angenommen „Apfelkuchen“ für 2 Portionen mit „200 g Mehl“ · Wenn ich „Auf die Liste“ für
  4 Personen wähle · Dann steht „400 g Mehl“ im Vorratscheck

**REQ-006 — Zutaten aus Rezept übernehmen.** Im Bearbeitungsmodus „Aus Rezept übernehmen“: Rezept
wählen, seine Zutaten kommen als Gruppe mit dem Rezeptnamen dazu, als Kopie.

- AC-008: Angenommen „Pizza Margherita“ ohne Zutaten, „Pizzateig“ mit 4 Zutaten · Wenn ich
  „Pizzateig“ übernehme · Dann stehen 4 Zutaten in der Gruppe „Pizzateig“, und eine spätere Änderung
  an „Pizzateig“ ändert sie nicht

**REQ-007 — Schlagwort-Filter.** Rezepte und Restaurants lassen sich nach Schlagworten filtern, über
ein durchsuchbares Auswahlfeld im Filter.

## Entscheidungen

1. REQ-001 speichert über eine Datenbank-Funktion in einer Transaktion (Regel „Mehrzeilige Aktionen
   sind ein RPC“), nicht über mehrere Abschnitts-Aufrufe.
2. OFFEN: Dauer der Sammlung — A: eingeben (Migration lockert `recipes_kind_fields`) · B: aus den
   Rezepten ableiten (längstes Rezept). Empfehlung A (Enrico will eingeben; ableiten passt nicht zu
   „Menü in Gängen“).
3. OFFEN: Personen-Abfrage als eigener kleiner Schritt vor dem Vorratscheck oder als Stepper oben im
   Vorratscheck. Empfehlung: Stepper im Vorratscheck (ein Fenster weniger).
4. OFFEN: Gleichzeitiges Bearbeiten — A: zuletzt gespeichert gewinnt je Feld (heute je Abschnitt) ·
   B: Hinweis „Nadja hat das Rezept geändert – neu laden?“. Empfehlung A mit Hinweis-Toast.

## Daten

Migration für REQ-004 (Entscheidung 2 A). Sonst bestehende Tabellen `recipes`, `recipe_ingredients`.

## Risiken

| Risiko                                 | Gegenmaßnahme                 | Test                               |
| -------------------------------------- | ----------------------------- | ---------------------------------- |
| Speichern bricht halb ab               | ein RPC, eine Transaktion     | pgTAP: Fehler in Zutat → nichts    |
| Fremder Haushalt speichert Rezept      | RLS/Prüfung im RPC            | pgTAP fremder Haushalt, abgemeldet |
| Sammlung bekommt Rezept-Felder (Küche) | Check nur für `total_minutes` | pgTAP Check                        |

## Umsetzung

Nach den Entscheidungen.
