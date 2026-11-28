---
status: freigegeben
datum: 2026-11-28
---

# 0070 — Erleben: Rezepte, Restaurants, Aktivitäten und eine Auswahl an einem Ort

**Quelle:** Review 0003 nach v2026.11.4 (`tmp/__REVEWS/0003/REVIEW.md`), freigegeben von Enrico am 28.11.2026.
**Kritischer Pfad:** ja: neue Tabelle für die Auswahl (RLS, Sync).

## Ziel

Rezepte, Restaurants und Aktivitäten sind das, was Enrico und Nadja immer wieder durchstöbern. Sie stehen künftig
gemeinsam unter „Erleben“, lassen sich gleich durchsuchen, filtern und zufällig mischen, und was gefällt, landet mit
einem Tipp auf einer gemeinsamen Auswahl für die Planung.

## Nicht-Ziele

- Keine Änderung an Kalender, Liste und Haushalt.
- Märkte, Artikel und Reisetaschen bleiben unter Verwalten.
- Keine Kurzlinks (Review: kein Gewinn ohne eigene kurze Domain).

## Anforderungen

**REQ-001 — „Erleben“ statt „Essen“.** Der Tab heißt „Erleben“ mit den Reitern Rezepte · Restaurants · Aktivitäten ·
Auswahl. Aktivitäten ziehen aus Verwalten hierher (Verwalten verlinkt nicht mehr doppelt). Offline: lesend.

- AC-001: Angenommen Handy · Wenn Enrico „Erleben“ öffnet · Dann sieht er die vier Reiter und kann zwischen ihnen
  wischen

**REQ-002 — Auswahl.** Jede Rezept-, Restaurant- und Aktivitätszeile/-kachel hat oben rechts neben Herz (und
Lesezeichen) ein drittes Symbol „Auswahl“; ein Tipp setzt oder entfernt. Der Reiter „Auswahl“ zeigt alles gemischt,
„Auswahl leeren“ mit Rückgängig. Gemeinsam für den Haushalt. Offline: lesend (Setzen braucht Netz, wie Herz).

- AC-002: Angenommen Enrico wischt durch Rezepte · Wenn er bei „Lasagne“ auf Auswahl tippt · Dann steht Lasagne
  sofort im Reiter Auswahl, auch bei Nadja nach dem Sync
- AC-003: Angenommen 5 Einträge in der Auswahl · Wenn Enrico „Auswahl leeren“ tippt · Dann ist sie leer und
  „Rückgängig“ holt alle 5 zurück

**REQ-003 — Zufall überall.** Restaurants und Aktivitäten bekommen die Sortierung „Zufall“ mit „Neu mischen“ wie
Rezepte.

**REQ-004 — Filter.** Jede Liste filtert nach „In Auswahl“. Aktivitäten zusätzlich nach Art (inkl. „ohne Art“).
Am Desktop versteht die Suchleiste Filter-Wörter wie Gmail („küche:deutsch“, „art:kultur“) mit Vorschlägen beim
Tippen; am Handy bleiben die Chips.

- AC-004: Angenommen Desktop · Wenn Enrico „küche:deu“ tippt · Dann schlägt die Suche „Küche: Deutsch“ vor und setzt
  den Filter als Chip
- AC-006: Angenommen Desktop, Rezepte, Filterbereich ausgeklappt und höher als das Fenster · Wenn Enrico scrollt · Dann
  lässt sich der ganze Filterbereich scrollen, bis „Schlagworte“, „Zeit“ und „Bewertung“ erreichbar sind (heute nicht scrollbar)

**REQ-005 — Wischen zwischen Rezepten mit Vorschau.** Auf einer Rezeptseite am Handy zeigt das Wischen nach links/
rechts das nächste Rezept schon während der Bewegung (wie die Tabs von „Erleben“).

**REQ-006 — Karten mit Beschreibung.** Rezeptkarten (Kacheln) zeigen die ersten zwei Zeilen der Beschreibung; Titel
lassen sich am Desktop auf der Detailseite markieren und kopieren.

**REQ-007 — Links zur App öffnen die installierte App (Android).** Ein Link auf `house.kuschel-nest.de` (z. B. aus
WhatsApp oder einer geteilten Nachricht) öffnet am Handy die installierte App statt des Browsers. Android: über
`launch_handler`/Link-Handling im Web-App-Manifest. iOS lässt das für Web-Apps nicht zu – dort öffnet weiter Safari (Review Z. 12).

- AC-005: Angenommen Android mit installierter App · Wenn Nadja einen geteilten Rezept-Link antippt · Dann öffnet die
  App direkt auf dem Rezept

## Entscheidungen

1. Name „Erleben“ (Enrico, 28.11.2026).
2. Auswahl ist vorläufig und gemeinsam; sie ersetzt weder Favorit (persönlich) noch Gemerkt (Aktivitäten).
3. Gmail-Filter nur am Desktop; Handy behält Chips.

## Daten

Neue Tabelle `selection_items` (household_id, kind recipe|restaurant|activity, item_id, added_by, created_at,
updated_at) mit RLS, Grants, pgTAP-Isolation, Delete-Trigger und Sync-Registrierung (Skill `db-change`).

## Risiken

| Risiko                                    | Gegenmaßnahme                                                | Test                               |
| ----------------------------------------- | ------------------------------------------------------------ | ---------------------------------- |
| Fremder Haushalt sieht/ändert die Auswahl | RLS je Haushalt                                              | pgTAP fremder Haushalt, abgemeldet |
| Auswahl zeigt gelöschte Einträge          | Einträge ohne Ziel fallen heraus, beim Löschen mit entfernen | Unit + pgTAP                       |

## Umsetzung

- [ ] 1. Tab „Erleben“ mit vier Reitern, Aktivitäten umziehen (AC-001)
- [ ] 2. Tabelle `selection_items`, Symbol „Auswahl“, Reiter Auswahl, leeren + Rückgängig (AC-002, AC-003)
- [ ] 3. Zufall für Restaurants und Aktivitäten
- [ ] 4. Filter „In Auswahl“, Art bei Aktivitäten, Gmail-Filter am Desktop, ausgeklappte Filter scrollbar (AC-004, AC-006)
- [ ] 5. Wischen zwischen Rezepten mit Vorschau
- [ ] 6. Beschreibung auf Kacheln, Titel kopierbar
- [ ] 7. Links öffnen die installierte App unter Android (AC-005)
- [ ] Nachweis: `pnpm format:check && pnpm check && pnpm build:web`, pgTAP grün; e2e und Security-Check vor dem Release
