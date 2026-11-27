# Specs

Ein Ordner je Feature: `NNNN-slug/spec.md` – eine kompakte Datei mit Ziel, Anforderungen, Entscheidungen, Daten, Risiken (nur kritische Pfade), Aufgaben und Nachweis. Specs 0001–0018 haben noch ein getrenntes `plan.md` (wie, Aufgaben,
Nachweis). Neue Specs entstehen mit dem `spec`-Skill aus der Vorlage `0000-template/`.

Ablauf und Regeln: siehe `AGENTS.md`, Abschnitt „Workflow per feature“.

| Nr.                                                         | Feature                                                                | Status      |
| ----------------------------------------------------------- | ---------------------------------------------------------------------- | ----------- |
| [0001](0001-design-und-frontend-dummy/spec.md)              | Design-Fundament und Frontend mit Beispieldaten                        | freigegeben |
| [0002](0002-restaurants/spec.md)                            | Restaurants                                                            | freigegeben |
| [0003](0003-backend-anmeldung-sync-ki/spec.md)              | Echtes Backend: Anmeldung, Daten, Sync und KI                          | umgesetzt   |
| [0004](0004-aktivitaeten/spec.md)                           | Aktivitäten und eigene Fotos                                           | umgesetzt   |
| [0005](0005-globale-muster-navigation/spec.md)              | Globale Muster und Navigation                                          | freigegeben |
| [0006](0006-eine-einkaufsliste/spec.md)                     | Eine Einkaufsliste                                                     | umgesetzt   |
| [0007](0007-artikel-katalog-stammdaten/spec.md)             | Artikel-Katalog und Stammdaten                                         | umgesetzt   |
| [0008](0008-essen-rezept-editor/spec.md)                    | Essen und Rezept-Editor                                                | umgesetzt   |
| [0009](0009-sammlungen/spec.md)                             | Sammlungen                                                             | umgesetzt   |
| [0010](0010-kalender-abwesenheiten/spec.md)                 | Kalender und Abwesenheiten                                             | freigegeben |
| [0011](0011-heute-haushalt/spec.md)                         | Übersicht und Haushalt                                                 | umgesetzt   |
| [0012](0012-reisetaschen/spec.md)                           | Reisetaschen                                                           | umgesetzt   |
| [0013](0013-benachrichtigungen/spec.md)                     | Benachrichtigungen (Web Push abgelöst durch 0051)                      | umgesetzt   |
| [0014](0014-betrieb-ci-cd-release/spec.md)                  | Betrieb: Branching, CI/CD und Release (Welle 6, nach 0013)             | freigegeben |
| [0015](0015-native-apps-anmeldung-speicher/spec.md)         | Native Apps (geparkt, nur PWA)                                         | entwurf     |
| [0016](0016-kalender-direkt-bedienen/spec.md)               | Kalender direkt bedienen: Ziehen, Tages-Fenster, Reisen                | freigegeben |
| [0017](0017-erinnerungen-an-eintraegen/spec.md)             | Erinnerungen an Kalendereinträgen                                      | freigegeben |
| [0018](0018-logikfehler-welle-1/spec.md)                    | Fehler aus dem Logik-Review, Welle 1                                   | freigegeben |
| [0019](0019-bedienung-und-adresse/spec.md)                  | Bedienung überall und Zustand in der Adresse                           | freigegeben |
| [0020](0020-uebersicht-sieben-tage/spec.md)                 | Übersicht: sieben Tage ab gestern                                      | umgesetzt   |
| [0021](0021-kalender-und-eintraege/spec.md)                 | Kalender am Desktop und Einträge vollständig bearbeiten                | freigegeben |
| [0022](0022-reisen-und-reisetaschen/spec.md)                | Reisen im Kalender, Reisetaschen und Packlisten                        | freigegeben |
| [0023](0023-rezepte-und-kochmodus/spec.md)                  | Rezepte bearbeiten, Kochmodus neu, Starter-Rezepte entfernt            | umgesetzt   |
| [0024](0024-restaurants-und-aktivitaeten/spec.md)           | Restaurants und Aktivitäten verwalten                                  | freigegeben |
| [0025](0025-einkauf/spec.md)                                | Einkauf: Liste, Einkaufen, Artikel und Märkte                          | freigegeben |
| [0026](0026-haushaltsaufgaben-und-reisen/spec.md)           | Haushaltsaufgaben: Termine, Später, Nachtragen und Reisen              | umgesetzt   |
| [0027](0027-verwalten-und-konto/spec.md)                    | Verwalten und Konto: Einladungen, Profil, Haushalt, Benachrichtigungen | freigegeben |
| [0028](0028-aufraeumen-und-v1/spec.md)                      | Aufräumen und erste produktive Version                                 | freigegeben |
| [0029](0029-handy-feinschliff/spec.md)                      | Handy-Feinschliff: Fenster, Abstand unten, Wischen, Route              | freigegeben |
| [0030](0030-review-0002/spec.md)                            | Review 0002: Kalender, Reisen und Handy-Feinschliff                    | freigegeben |
| [0031](0031-ultracode-code-review/spec.md)                  | Ultracode-Code-Review: sauber für die erste produktive Version         | umgesetzt   |
| [0032](0032-handy-tastatur-und-fenster/spec.md)             | Handy: Tastatur und Fenster                                            | freigegeben |
| [0033](0033-handy-fenster-tastatur-fotos/spec.md)           | Handy: Fenster, Tastatur und Fotos                                     | freigegeben |
| [0034](0034-handy-seitenwechsel-und-wischen/spec.md)        | Handy: Seitenwechsel, Laden und Wischen                                | freigegeben |
| [0035](0035-kalender-und-uebersicht-feinschliff/spec.md)    | Kalender und Übersicht: Fehler und Feinschliff                         | freigegeben |
| [0036](0036-essen-und-formulare-fehler/spec.md)             | Essen und Formulare: Fehler und Bedienung                              | freigegeben |
| [0037](0037-rezeptseite-bearbeiten-und-filter/spec.md)      | Rezeptseite: Bearbeitungsmodus, Sammlungen im Filter, Personen         | umgesetzt   |
| [0038](0038-ansicht-kacheln-und-liste/spec.md)              | Ansicht wählen: Kacheln oder Liste                                     | freigegeben |
| [0039](0039-foto-fenster/spec.md)                           | Foto-Fenster: wählen, ziehen, einfügen, Bildadresse, Kamera            | freigegeben |
| [0040](0040-ki-rezepte-und-bilder/spec.md)                  | KI: Rezepte ausfüllen, Bilder erzeugen und bearbeiten                  | freigegeben |
| [0041](0041-aktivitaeten-arten-rhythmus-merken/spec.md)     | Aktivitäten: Arten, Rhythmus, Merken, Personen                         | freigegeben |
| [0042](0042-orte-teilen-eigentuemer/spec.md)                | Orte, Einfügen, Teilen und Eigentümer                                  | freigegeben |
| [0043](0043-rezeptvideo-aus-tiktok/spec.md)                 | Rezeptvideo aus TikTok speichern und abspielen                         | freigegeben |
| [0044](0044-tastatur-und-fenster-iphone/spec.md)            | Tastatur und Fenster auf dem iPhone                                    | freigegeben |
| [0045](0045-ki-rezeptentwurf-v2/spec.md)                    | KI-Rezeptentwurf v2: Varianten, Beschreibung, Schlagworte, Foto-Laden  | freigegeben |
| [0046](0046-rezept-mediengalerie/spec.md)                   | Rezept-Mediengalerie mit mehreren Videos                               | freigegeben |
| [0047](0047-feinschliff-teilen-foto-links-kalender/spec.md) | Feinschliff: Teilen, Foto-Fenster, „+ Link“, Foto im Plan-Eintrag      | freigegeben |
| [0048](0048-sicherung-ohne-videos/spec.md)                  | Sicherung ohne Videos                                                  | freigegeben |
| [0049](0049-websuche-und-aenderungsansicht/spec.md)         | Websuche und Änderungsansicht                                          | freigegeben |
| [0050](0050-zutaten-vorschlaege-beim-einfuegen/spec.md)     | Zutaten einfügen: Vorschläge beim Tippen und Vorschau                  | freigegeben |
| [0051](0051-mitteilungen-in-der-app-statt-push/spec.md)     | Mitteilungen in der App statt Push                                     | freigegeben |
| [0052](0052-bildprompt-aufbereitung/spec.md)                | Bild-Prompt aufbereiten: aus einem kurzen Wunsch drei gute Bilder      | freigegeben |
| [0053](0053-aufraeumen-batch-3/spec.md)                     | Aufräumen nach Batch 3                                                 | freigegeben |
| [0054](0054-einheitliche-bedienmuster/spec.md)              | Einheitliche Bedienmuster                                              | umgesetzt   |
| [0055](0055-ki-fenster-v3/spec.md)                          | KI-Fenster v3: Tastatur, Wischen, Prompt mit Websuche, Nachbessern     | umgesetzt   |
| [0056](0056-rezeptseite-und-kochmodus/spec.md)              | Rezeptseite und Kochmodus                                              | umgesetzt   |
| [0057](0057-uebersicht-und-navigation/spec.md)              | Übersicht und Feinschliff der Navigation                               | umgesetzt   |
| [0058](0058-neue-themes/spec.md)                            | Neue Themes                                                            | umgesetzt   |
| [0059](0059-nichts-verpassen/spec.md)                       | Nichts verpassen: .ics, Vorwarnung, Packen am Vorabend                 | umgesetzt   |
| [0060](0060-dauerposten/spec.md)                            | Dauerposten                                                            | umgesetzt   |
| [0061](0061-unfertige-rezepte-ausarbeiten/spec.md)          | Unfertige Rezepte nacheinander ausarbeiten                             | umgesetzt   |
| [0062](0062-rezept-anlegen-und-ki-aendern/spec.md)          | Rezept anlegen und mit KI ändern                                       | umgesetzt   |
| [0063](0063-vorschlaege-beim-planen/spec.md)                | Vorschläge beim Planen                                                 | umgesetzt   |
| [0064](0064-youtube-rezepte/spec.md)                        | Rezepte aus YouTube-Videos                                             | freigegeben |
| [0065](0065-ki-rezept-foto-der-quelle/spec.md)              | KI-Rezept: Foto der Quelle aus der Websuche                            | freigegeben |
| [0067](0067-housekeeping-agent/spec.md)                     | Housekeeping-Agent: ein zentraler KI-Agent für den ganzen Haushalt     | freigegeben |
| [0068](0068-senden-waehrend-diktat/spec.md)                 | Senden während des Diktats                                             | umgesetzt   |

## Welle 2 (0019–0028): Bau-Reihenfolge und Regeln

Stand 23.11.2026: 0019–0032 sind gebaut; die erste produktive Version v2026.11.2 ist veröffentlicht
(Spec 0028, Weg D; offen nur der Wiederherstellungstest). Nächste Schritte: [../handover/2026-11-23-copilot.md](../handover/2026-11-23-copilot.md).
Die Spec-Status oben sind die Front-Matter-Werte; „freigegeben“ bei 0019–0030 heißt nur, dass der
Status dort noch nicht auf „umgesetzt“ gesetzt wurde. Quelle der Wünsche:
`docs/product/review-enrico-2026-11-22.md` (ER-01–ER-36) und
`docs/product/review-logik-und-bedienung.md`. Bei Widerspruch gilt Enricos Review.

Die folgende Bau-Reihenfolge und die Regeln sind die ursprüngliche Planung der Welle.

**Reihenfolge** (Gruppen parallel, je Spec ein Branch `feat/NNNN-slug` und eine PR):

1. 0019 (Adress-Parameter, ui-Grundlagen) · 0022 (zuerst die Umbenennung `absences` → `trips`,
   `trip_members`) · 0027 ohne REQ-009 (zuerst die Uhrzeit-Auswahl „Stunde“/„Minute“).
2. 0021 (nach 0019, 0022 und der Uhrzeit-Auswahl) · 0023 (nach 0019; legt `private.is_web_url`,
   den gemeinsamen Lösch-Hinweis und das gemeinsame Einplanen-Fenster an) · 0025 (nach 0019; ihr
   Listen-Schema vor 0021 REQ-007 mergen).
3. 0020 (nach 0021) · 0024 (nach 0021 und 0023) · 0026 (nach 0022; `daily_summary_body` nach
   0020/0021).
4. 0027 REQ-009 (nach 0026), danach 0028.

**Nacheinander mergen**, weil mehrere Specs dieselben Stellen ändern: die Positivliste in
`apply_changes`, `private.daily_summary_body`, `chore_reminder_candidates`,
`add-entry-sheet.tsx`/`entry-sheet.tsx`, `plan-recipe-sheet.tsx`, `kinds-section.tsx`,
`CACHE_VERSION`, die Parameterliste in `packages/core`.

**Regeln dieser Welle**

- Erste produktiv genutzte Version: sauberes Zielschema ohne Rücksicht auf v2026.11.1, keine
  Übergangslösungen, keine Weiterleitungen alter Adressen. Neue Migrationsdateien sind erlaubt;
  0028 fasst sie zu einer neuen Basis zusammen und setzt die Produktion zu einem von Enrico
  bestätigten Zeitpunkt frisch auf.
- Je Spec: Unit- und pgTAP-Tests rot zuerst, `pnpm format:check && pnpm check && pnpm build:web`.
  Neue e2e-Tests nur typprüfen; die volle e2e-Suite läuft einmal in 0028.
- `/security-check` und `spec-auditor` nur bei kritischen Pfaden; `/ui-verify` einmal in 0028.
- Lokale Datenbank nur mit `pnpm db:reset` zurücksetzen (lädt `DEV_OWNER_EMAIL` wieder ein).
- Enricos nächstes Review kommt erst, wenn die Welle in der Vorschau läuft; die Vorschau startet
  nur von Hand (`gh workflow run preview.yml --ref develop`).
