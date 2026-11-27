---
status: umgesetzt
datum: 2026-11-27
---

# 0060 — Dauerposten

**Quelle:** Enrico, 27.11.2026: „Ahh Dauerposten sind geil! Dann kann man jeden Samstag z. B. Cola,
Milch und so einplanen. Gerne mit einbauen!“; Feature-Konzept §2 (Version 1), Feature-Review
`tmp/feature-review/03-ausbau-bestehend.md` #9. **Kritischer Pfad:** ja: Migration, neue
synchronisierte Tabelle, RLS, Sync, Zeitplaner (`pg_cron`), Löschen (mit dem Artikel).

## Ziel

Was jede Woche gebraucht wird (Cola, Milch, Klopapier), legt man einmal als Dauerposten an: Artikel,
Menge, Rhythmus. Am fälligen Tag steht er von selbst auf der Einkaufsliste, auch wenn niemand die App
geöffnet hat, und nie doppelt. Wer vorher einkauft, sieht im Schritt „Aus Kalender …“, was in den
sieben Tagen fällig wird, und kann es gleich mitnehmen.

## Nicht-Ziele

- Kein Rhythmus „jährlich“ und kein Ende („bis …“): wer aufhören will, pausiert oder löscht.
- Kein Nachholen: Ein fälliger Tag, an dem der Zeitplaner nicht lief oder der Dauerposten pausiert
  war, kommt später nicht nach.
- Kein Aussetzen während Reisen (dafür „Pausieren“), kein Verlauf, keine Bestände.
- Kein Dauerposten ohne Artikel und höchstens einer je Artikel (Entscheidung 5).
- Keine neue Offline-Aktion: Dauerposten ändern geht nur online.

## Anforderungen

Beispiele: heute ist **Fr 27.11.2026** (KW 48: 23.–29.11.), Haushalt „Enrico & Nadja“ (Zeitzone
Europe/Berlin), Artikel „Cola“, „Milch“, „Klopapier“.

### Verwalten

**REQ-001 — Seite „Dauerposten“.** Unter „Verwalten“ → „Einkauf“ und über ⋯ → „Dauerposten“ auf der
Liste öffnet sich die Seite „Dauerposten“: je Zeile Artikel mit Menge und Zusatz, Rhythmus und
„nächstes Mal …“ bzw. „pausiert“; „+ Dauerposten“ legt an, ein Tipp auf die Zeile ändert. Das Fenster
hat Artikel, Menge, Zusatz, Rhythmus (wöchentlich an Wochentagen, alle N Wochen; monatlich am Tag X),
„Pausiert“ und „Löschen“. Quelle: Enrico. Offline: offline lesend — Anlegen, Ändern, Pausieren und
Löschen brauchen Netz.

- AC-001: Angenommen keine Dauerposten · Wenn ich „Dauerposten“ öffne · Dann steht „Noch keine
  Dauerposten“ mit „Was ihr regelmäßig braucht, kommt am fälligen Tag von selbst auf die Liste.“ und
  „+ Dauerposten“
- AC-002: Wenn ich „+ Dauerposten“, Artikel „Cola“, Menge „2“, Rhythmus „Wöchentlich“ mit „Sa“ wähle
  und „Speichern“ · Dann steht „Cola 2×“ mit „wöchentlich Sa · nächstes Mal morgen“, auch bei Nadja
- AC-003: Angenommen „Cola 2×“ · Wenn ich sie öffne, „alle 2 Wochen“ wähle und „Speichern“ · Dann
  „alle 2 Wochen Sa · nächstes Mal morgen“, danach am Sa 12.12.
- AC-004: Wenn ich „Milch“, Menge „1 l“, Zusatz „laktosefrei“, „Monatlich“ „am 1.“ speichere · Dann
  „Milch (laktosefrei) 1 l“ mit „monatlich am 1. · nächstes Mal Di 1.12.“
- AC-005: Angenommen „Cola 2×“ · Wenn ich „Pausiert“ einschalte und speichere · Dann steht „pausiert“
  statt „nächstes Mal …“, und am Samstag kommt keine Cola auf die Liste
- AC-006: Angenommen „Cola 2×“ · Wenn ich „Löschen“ tippe · Dann ist die Zeile weg, Hinweis „Cola
  entfernt“ mit „Rückgängig“, das sie mit Rhythmus und Menge zurückholt
- AC-007 (Fehler): Wenn die Menge „viel“ ist · Dann „Menge nicht erkannt – z. B. 500 g oder 2“ und
  „Speichern“ ausgegraut; ohne Wochentag „Wähl mindestens einen Wochentag.“; ohne Artikel ausgegraut
- AC-008 (Rand): Angenommen „Cola“ hat schon einen Dauerposten · Wenn ich im neuen Dauerposten „Cola“
  wähle · Dann „Für Cola gibt es schon einen Dauerposten“ mit „Öffnen ›“, „Speichern“ ausgegraut
- AC-009 (offline): Angenommen offline · Dann ist die Seite zu sehen, „+ Dauerposten“, „Speichern“,
  „Pausiert“ und „Löschen“ sind ausgegraut mit „Offline – zum Bearbeiten brauchst du Netz“

**REQ-002 — „Regelmäßig kaufen“ am Artikel.** Das Fenster eines Artikels zeigt „Regelmäßig kaufen ›“
oder, mit Dauerposten, dessen Rhythmus („Regelmäßig: wöchentlich Sa ›“); beides öffnet das
Dauerposten-Fenster mit diesem Artikel. Ein Artikel mit Dauerposten gilt nicht als „Unbenutzt“.
Quelle: Auftrag. Offline: offline lesend.

- AC-010: Angenommen „Klopapier“ ohne Dauerposten · Wenn ich auf „Artikel“ „Klopapier“ öffne und
  „Regelmäßig kaufen ›“ tippe · Dann öffnet „Neuer Dauerposten“ mit Artikel „Klopapier“
- AC-011: Angenommen „Cola 2×“ wöchentlich Sa · Dann zeigt das Fenster von „Cola“ „Regelmäßig:
  wöchentlich Sa ›“, und „Cola“ steht nicht unter „Unbenutzt“
- AC-012 (Rand): Angenommen „Cola“ hat einen Dauerposten · Wenn ich „Cola“ lösche · Dann nennt die
  Rückfrage „Der Dauerposten wird mit gelöscht.“ und danach ist er weg; „Zusammenführen“ von „Coca
  Cola“ in „Cola“ gibt dessen Dauerposten an „Cola“, wenn „Cola“ keinen hat (sonst bleibt der von „Cola“)

### Auf die Liste

**REQ-003 — Am fälligen Tag von selbst auf der Liste.** Der Server legt jeden aktiven Dauerposten an
seinem fälligen Tag (Zeitzone des Haushalts) als Beitrag mit Herkunft „regelmäßig“ auf die Liste,
nach den Regeln des Hinzufügens (Spec 0025, REQ-013): ein offener Posten des Artikels bekommt den
Beitrag, ein erledigter wird mit nur ihm wieder offen, sonst entsteht ein Posten. Steht der
Dauerposten noch offen auf der Liste (Beitrag „regelmäßig“ von ihm), kommt nichts dazu. Höchstens
einmal je Tag. Quelle: Enrico, Auftrag. Offline: entfällt (Server); das Gerät sieht ihn nach dem
nächsten Abgleich.

- AC-013: Angenommen „Cola 2×“ wöchentlich Sa, Cola nicht auf der Liste · Wenn der Zeitplaner am Sa
  28.11. um 00:05 läuft · Dann steht „Cola 2×“ mit Herkunft „regelmäßig: 2×“ auf der Liste, bei allen
- AC-014: Angenommen der Lauf um 00:05 hat Cola gebracht, Enrico hat sie um 10:00 gekauft und
  „Fertig“ getippt · Wenn der Zeitplaner um 11:05 wieder läuft · Dann kommt keine Cola dazu
- AC-015: Angenommen „Cola 2×“ vom letzten Samstag steht noch offen · Wenn der Lauf am Sa 28.11. ·
  Dann bleibt „Cola 2×“ mit einem Beitrag „regelmäßig“
- AC-016: Angenommen „Milch 1×“ von Hand steht offen, Dauerposten „Milch 1×“ ist heute fällig · Wenn
  der Lauf · Dann „Milch 2×“ mit Herkunft „von Hand: 1× · regelmäßig: 1×“
- AC-017: Angenommen „Cola“ steht erledigt (abgehakt, nicht geleert) · Wenn der Lauf · Dann ist
  „Cola“ wieder offen mit nur „regelmäßig: 2×“
- AC-018 (Rand): Angenommen „Cola“ pausiert, oder alle 2 Wochen ab Sa 28.11. und heute Sa 5.12., oder
  freitags angelegt für Samstag und heute Fr · Wenn der Lauf · Dann kommt nichts auf die Liste
- AC-019 (Rand): Angenommen „Milch“ monatlich am 31. · Dann ist sie am 30.11., 31.12. und 28.2. fällig
  (letzter Tag kürzerer Monate)
- AC-020 (Rand): Angenommen ein Haushalt in „America/New_York“ · Wenn der Lauf am Sa 28.11. um
  02:05 Berliner Zeit (Fr 20:05 dort) · Dann kommt dort nichts, erst nach Mitternacht seiner Zeit

**REQ-004 — Herkunft „regelmäßig“.** In „Posten bearbeiten“ steht der Beitrag als Herkunft
„regelmäßig“ mit Menge und ✕ (Spec 0025, REQ-003); er zählt nicht als Gericht in der Kopfzeile.
Quelle: Spec 0025 (Herkunft). Offline: wie Spec 0025 (✕ nur online).

- AC-021: Angenommen „Milch“ mit „von Hand: 1× · regelmäßig: 1×“ · Dann zeigt „Posten bearbeiten“
  „Von Hand 1“ und die Herkunft „regelmäßig 1× ✕“ · Wenn ✕ · Dann „Milch 1×“ und „regelmäßig entfernt“
  mit „Rückgängig“
- AC-022 (Rand): Angenommen 3 offen, nur aus Dauerposten · Dann heißt die Kopfzeile „3 offen“, nicht
  antippbar

**REQ-005 — „Regelmäßig“ in „Aus Kalender …“.** Schritt 1 zeigt unter „Regelmäßig“ jeden aktiven
Dauerposten, der in den sieben gezeigten Tagen fällig ist, einmal mit dem ersten Tag („Cola 2× ·
Sa 28.11.“), nicht vorausgewählt. Gewählte stehen im Vorratscheck unter „Kommt auf die Liste“ mit
Herkunft „regelmäßig“ (ausgewählt, Menge änderbar) und kommen mit „Übernehmen“ auf die Liste; dieser Tag kommt dann nicht noch einmal
von selbst. Quelle: Auftrag. Offline: lesend; Übernehmen braucht Netz (wie Spec 0025).

- AC-023: Angenommen „Cola 2×“ wöchentlich Sa, „Milch“ monatlich am 1. · Wenn ich „+ Aus Kalender …“
  öffne (27.11.–3.12.) · Dann steht unter „Regelmäßig“ „Cola 2× · Sa 28.11.“ und „Milch 1 l · Di 1.12.“,
  beide nicht ausgewählt
- AC-024: Wenn ich nur „Cola“ wähle · Dann heißt der Knopf „Weiter: 1 Dauerposten“, mit einem Gericht
  „Weiter: 1 Gericht · 1 Dauerposten“ · Wenn „Weiter“ und „Übernehmen“ · Dann steht „Cola 2×“ mit
  „regelmäßig: 2×“ auf der Liste
- AC-025: Angenommen Cola wurde am Fr 27.11. so übernommen und gekauft · Wenn der Lauf am Sa 28.11. ·
  Dann kommt keine Cola; am Sa 5.12. wieder
- AC-026 (Rand): Angenommen „Cola“ steht schon mit „regelmäßig“ offen auf der Liste · Dann steht die
  Zeile mit „steht schon auf der Liste“ und ist nicht wählbar; ein pausierter Dauerposten fehlt
- AC-027 (Rand): Wenn ich › blättere (4.–10.12.) · Dann steht „Cola 2× · Sa 5.12.“; ohne fälligen
  Dauerposten fehlt der Block „Regelmäßig“

### Sicherheit

**REQ-006 — Nur der eigene Haushalt, nur gültige Werte.** Dauerposten gehören zum Haushalt (alle
Mitglieder sehen und ändern sie), RLS wie jede Haushaltstabelle; den Tag des letzten Hinzufügens
schreibt nur der Server. Quelle: Regel 5, `30-database.md`. Offline: entfällt.

- AC-028: Angenommen Ben aus einem fremden Haushalt · Wenn er Dauerposten von „Enrico & Nadja“ liest,
  anlegt, ändert, löscht oder einen in seinen Haushalt verschiebt · Dann sieht er keine Zeile und jede
  Änderung wird abgewiesen; ein Abgemeldeter kann nichts
- AC-029 (Fehler): Angenommen ein Mitglied · Wenn es „jährlich“, Wochentag 8, alle 0 Wochen, Menge 0,
  einen Zusatz über 200 Zeichen, einen Artikel eines fremden Haushalts oder `last_added_on` schickt ·
  Dann wird es abgewiesen
- AC-030 (Fehler): Angenommen ein Beitrag „regelmäßig“ mit einem Tag in drei Wochen oder für den
  Dauerposten eines fremden Haushalts · Wenn er gespeichert wird · Dann ändert sich an keinem
  Dauerposten der Tag des letzten Hinzufügens

## Entscheidungen

1. **Ändert Spec 0025**, Nicht-Ziel „Keine Dauerposten (die nie gebaute Herkunft `recurring`
   entfällt)“ und Daten „Entfällt: Herkunft `recurring`“: Die Herkunft kommt in neuer Form zurück,
   `{kind: 'recurring', recurringItemId, on}`. Glossar „Dauerposten“ und „Herkunft“ werden angepasst.
2. **Eigene Tabelle statt Schalter am Artikel** (Vorschlag im Feature-Review #9): Ein Dauerposten
   braucht Menge, Zusatz und Rhythmus; am Artikel wären das vier Spalten für wenige Artikel.
3. **Serverseitig per `pg_cron`, stündlich (Minute 5)**, Funktion `private.add_due_recurring_items(p_now)`
   (`security definer`, `search_path = ''`). Spec 0051 hat die Push-Zeitpläne entfernt, weil es keinen
   Push mehr gibt (ADR-0017), nicht wegen des Zeitplaners: `pg_cron` läuft weiter für Aufräumjobs und
   `media-orphan-sweep`. Die Alternative „Client legt beim ersten Öffnen an“ verworfen: ohne geöffnete
   App stünde Samstagfrüh nichts auf der Liste, zwei Geräte würden sich überholen, offline ginge es
   nicht. Stündlich statt täglich, damit jede Zeitzone kurz nach Mitternacht drankommt und ein
   ausgefallener Lauf in der nächsten Stunde nachkommt.
4. **Rhythmus = `SeriesRule` der Serien (Spec 0041) ohne „jährlich“**: wöchentlich (Wochentage, alle
   N Wochen, gezählt ab der Woche von `starts_on`) und monatlich (am Tag X, im kürzeren Monat am
   letzten). Die Prüfung `private.is_series_rule` und `matchesRule` in core werden wiederverwendet. Die
   Fälligkeit gibt es dadurch zweimal (core für Anzeige und „Aus Kalender“, SQL für den Zeitplaner;
   ADR-0014 nannte genau das als Nachteil): Sie ist eine Zeile je Art, beide Seiten werden mit
   denselben Beispielen getestet (AC-018, AC-019).
5. **Höchstens ein Dauerposten je Artikel** (eindeutig `(household_id, article_id)`): „Regelmäßig
   kaufen“ am Artikel hat genau ein Ziel; „Milch montags und donnerstags“ geht mit zwei Wochentagen.
6. **„Nicht verdoppeln“** heißt: Hat der offene Posten des Artikels schon einen Beitrag „regelmäßig“
   dieses Dauerpostens, kommt nichts dazu. Andere Herkunft (von Hand, Rezept) wird wie beim Hinzufügen
   zusammengeführt und bleibt als eigene Herkunft sichtbar und per ✕ entfernbar (AC-016, AC-021).
7. **Einmal je Tag** über `last_added_on` am Dauerposten, gesetzt nur vom Server: vom Zeitplaner und
   von einem Trigger, sobald ein Beitrag „regelmäßig“ mit Tag `on` gespeichert wird (auch über
   „Aus Kalender“, AC-025): `last_added_on = greatest(last_added_on, on)`; der Zeitplaner legt nur an,
   wenn `last_added_on` vor heute liegt. Der Trigger nimmt nur Tage von gestern bis in acht Tagen und
   nur Dauerposten des Haushalts des Beitrags (AC-030). Ein früher Tag in „Aus Kalender“ deckt damit
   auch frühere Tage derselben Woche ab — gewollt, man hat ja gerade eingekauft.
8. **`starts_on` = heute** beim Anlegen und bei geändertem Rhythmus; „alle 2 Wochen“ beginnt also in
   dieser Woche. OFFEN: Wer die andere Woche will, wartet eine Woche oder pausiert; eine Wahl „ab …“
   kommt, wenn sie fehlt.
9. **„Aus Kalender“: nicht vorausgewählt**, weil der Dauerposten am Tag ohnehin kommt; man wählt ihn
   nur, wenn man vorher einkauft. „Weiter“ geht auch nur mit Dauerposten.
10. **Löschen mit dem Artikel** (`on delete cascade`, Löschspur über den Trigger); „Rückgängig“ beim
    Artikel holt den Dauerposten nicht zurück (wie Spec 0025, AC-047 den erledigten Posten).
    `merge_articles` gibt den Dauerposten an das Ziel, wenn es keinen hat.
11. **Schreiben über `apply_changes`** (Diff-Weg wie Serien, Spec 0041): eine Zeile, Überlagerung mit
    „Rückgängig“; keine eigene RPC. `CACHE_VERSION` 25 (neue Tabelle; Spec 0059 nimmt 24).
12. Beim Bau: Der Zusatz eines Dauerpostens gilt wie jeder Zusatz für den Posten (Spec 0025,
    Entscheidung 5). Das Fenster nimmt „Rhythmus“ der Serien (`RepeatFields`) mit zwei neuen
    Schaltern: nur „Wöchentlich“/„Monatlich“, ohne „Ende“. Artikel wählt man mit „Suchen oder
    anlegen“ wie bei „+ Neu“ auf „Artikel“; ein neuer Artikel entsteht dabei als eigener Schreibvorgang.
13. Beim Bau: Am Artikel ist „Regelmäßig kaufen“ ein Schritt von „Artikel bearbeiten“ (kein Fenster
    über dem Fenster); auf der Seite „Dauerposten“ ein eigenes Fenster. Der Zeitplaner übergeht
    Haushalte mit einer Zeitzone, die Postgres nicht kennt (Security-Check, siehe Risiken).
14. Durchklick 27.11., D-04: Der Anlegen-Knopf ist `CreateButton` „Dauerposten anlegen“ wie auf
    jeder Seite (Spec 0054, REQ-001; ändert AC-001 „+ Dauerposten“), der leere Zustand ebenso.
    D-05: Die Meldung zur Menge steht unter der Zeile „Menge · Zusatz“ in voller Breite, das Feld
    ist orange umrandet (`TextField invalid`); sie sagt auch ohne gewählten Artikel „Menge nicht
    erkannt …“. I-05: Der Schritt „Regelmäßig kaufen“ am Artikel hat den Fensterkopf aller
    Formulare: „Zurück · Regelmäßig kaufen · Speichern“ (ab Tablet unten), „Löschen“ als letzter
    Knopf im Fenster; jedes Öffnen beginnt mit dem gespeicherten Stand.
15. Nachklick 27.11.: N-10: „Neuer Dauerposten“ und „Regelmäßig kaufen“ legen mit „Anlegen“ an;
    ein bestehender Dauerposten speichert mit „Speichern“. N-11: „Dauerposten anlegen“ steht nur im
    Kopf, der Leerzustand hat keinen zweiten Knopf. iN-02: „Dauerposten anlegen“ öffnet die Tastatur
    im Tipp (`openKeyboardNow`); vorher bekam das Feld den Fokus erst nach dem Hereingleiten, das
    Fenster rückte für eine Tastatur hoch, die nicht kam, und fiel nach 1,5 s zurück.

## Daten

- Neu `public.recurring_items`: `id`, `household_id`, `article_id` (FK im Haushalt, `on delete
cascade`, eindeutig je Haushalt), `count`/`qty`/`unit`/`note` (Prüfungen wie
  `shopping_contributions`), `rule jsonb` (`is_series_rule`, nicht `yearly`), `starts_on date`,
  `paused boolean default false`, `last_added_on date` (nur Server), `created_at`, `updated_at`.
  Grants: `select`, `delete`; `insert`/`update` ohne `last_added_on` und `household_id` im Update;
  `attach_household_policies`, `attach_sync_triggers`, Index `(household_id, updated_at)`.
- `shopping_contributions.source`: Prüfung erlaubt wieder `recurring` mit `recurringItemId` (Text)
  und `on` (Datum). Trigger nach Einfügen setzt `last_added_on` (Entscheidung 7).
- `apply_changes`: `recurring_items` einfügen, ändern (ohne `article_id`), löschen. `sync_pull`:
  `recurring_items`. `merge_articles`: Dauerposten zum Ziel. Neuer Cron-Job
  `add-due-recurring-items` (`5 * * * *`), ohne Secrets und `pg_net`.
- Keine personenbezogenen Daten. Gelesen: Artikel, Posten, Haushalt (Zeitzone).

## Risiken

| Risiko                                                  | Gegenmaßnahme                                                                    | Test                                                |
| ------------------------------------------------------- | -------------------------------------------------------------------------------- | --------------------------------------------------- |
| Fremder Haushalt oder Abgemeldeter liest/ändert         | RLS über `attach_household_policies`, Grants nur `authenticated`, FK im Haushalt | pgTAP `recurring_items.test.sql` (Ben, anon)        |
| Zeitplaner legt doppelt an (stündlich, zwei Läufe)      | `last_added_on` je Tag, Sperre je Artikel, Prüfung „offen mit regelmäßig“        | pgTAP AC-014, AC-015 (zwei Läufe mit `p_now`)       |
| Zeitplaner schreibt in falschen Haushalt / falsche Zone | je Dauerposten sein Haushalt, Tag aus `households.timezone`                      | pgTAP AC-013, AC-020                                |
| Client setzt `last_added_on` und sperrt den Rhythmus    | kein Grant, nicht in der Erlaubnisliste; Trigger nur gestern … +8 Tage           | pgTAP AC-029, AC-030                                |
| Ungültige Regel oder Menge                              | Check-Constraints, `is_series_rule` ohne `yearly`; Zod im Client                 | pgTAP AC-029, core `recurring-items.test.ts` AC-007 |
| Fälligkeit in SQL und core laufen auseinander           | dieselben Beispiele in pgTAP und Vitest                                          | AC-018, AC-019 in beiden                            |
| Artikel löschen/zusammenführen lässt Waisen             | `on delete cascade` mit Löschspur, `merge_articles` verschiebt                   | pgTAP AC-012                                        |
| Gesendete Änderung scheitert                            | Überlagerung zurück, Hinweis „Hat nicht geklappt …“                              | api `commands-recurring.backend.test.ts`            |
| Unbekannte Zeitzone hält den Lauf für alle an           | nur Zonen aus `pg_timezone_names` (behoben nach Security-Check, mittel)          | pgTAP „unknown time zone“                           |
| Mitglied setzt per Beitrag `on` bis +8 Tage voraus      | wirkt nur im eigenen Haushalt, nur nach vorn, begrenzt (Hinweis, bleibt)         | pgTAP AC-030                                        |

## Umsetzung

- [x] 1. core: Typ `RecurringItem`, Fälligkeit, „nächstes Mal“, Zeile, Entwurf prüfen, Block
      „Regelmäßig“, Herkunft „regelmäßig“, „Unbenutzt“ (AC-002–AC-004, AC-007, AC-008, AC-011,
      AC-018, AC-019, AC-021–AC-024, AC-026, AC-027)
- [x] 2. supabase (db-change): Tabelle, Source-Prüfung, Trigger, Zeitplaner, `apply_changes`,
      `sync_pull`, `merge_articles`; pgTAP (AC-012–AC-020, AC-025, AC-028–AC-030)
- [x] 3. api: Tabelle im Sync, Abbildung, Befehle anlegen/ändern/löschen, `CACHE_VERSION` 25
- [x] 4. app: Seite „Dauerposten“ + Fenster, Eintrag unter „Verwalten“ und ⋯ der Liste, Artikel
      (AC-001–AC-012); „Aus Kalender“ und Vorratscheck (AC-023–AC-027)
- [x] 5. e2e `e2e/rundgang-dauerposten.spec.ts` (nur geschrieben, läuft beim Mergen), Glossar,
      `/security-check`
- [x] Nachweis: `pnpm format:check && pnpm check && pnpm build:web` grün,
      `pnpm exec supabase test db` auf eigener Wegwerf-Datenbank

## Nachweis

Stand 27.11.2026, Branch `feat/0060-dauerposten`:

- Rot zuerst: core `recurring-items.test.ts` (Modul fehlte), pgTAP `recurring_items.test.sql` (Tabelle
  fehlte, 0/57 vor der Migration).
- `pnpm format:check && pnpm check`: grün; `pnpm build:web`: grün.
- `pnpm exec supabase test db` auf der Wegwerf-Datenbank `wt-0060` nach `db reset`: PASS (neu
  `recurring_items.test.sql`, 75 Tests; angepasst `sync_pull`, `manage_household`).
- Zeitplaner von Hand in der Wegwerf-Datenbank: „Milch (laktosefrei) 1 l“, heute fällig, kam mit
  „regelmäßig“ zur offenen Milch („von Hand“, „Lasagne (Fr)“); ein zweiter Lauf brachte nichts.
- e2e `rundgang-dauerposten.spec.ts`: nur typgeprüft (läuft beim Mergen, gemeinsame Datenbank).
- Screenshots Desktop 1440 und Handy 390, hell und dunkel: `tmp/review-0004/0060/` im Hauptrepo.
- Security-Check: 0 kritisch/hoch, 1 mittel (unbekannte Zeitzone, behoben), 1 Hinweis (siehe Risiken).
