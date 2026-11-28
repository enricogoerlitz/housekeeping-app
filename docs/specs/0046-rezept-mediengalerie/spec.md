---
status: freigegeben # entwurf | freigegeben | umgesetzt | verworfen
datum: 2026-11-26
---

# 0046 — Rezept-Mediengalerie mit mehreren Videos

**Quelle:** Enricos Vorschau-Feedback vom 26.11.2026 abends zu Spec 0043 („TikTok-Video → super
hässlich auf dem iPhone, alles daran!“): kein Text-Knopf „Video speichern“, sondern ein
Speichern-Symbol an der Link-Zeile mit Nachfrage; das Video nicht unter das Foto, sondern eine
Galerie am Foto mit Punkten zum Wischen, Vorschau im Format des Fotos, abspielen nur im Vollbild;
mehrere Videos je Rezept. **Batch 3.** **Kritischer Pfad:** ja: Migration mit Datenübernahme,
Löschen von Dateien.

## Ziel

Hat ein Rezept ein oder mehrere TikTok-Videos, wische ich am Foto zu ihnen, sehe ein Standbild im
selben Rahmen wie das Foto und spiele ein Video mit einem Tipp im Vollbild ab. Gespeichert wird
ein Video mit dem Symbol an seinem Link, nach einer Rückfrage.

## Nicht-Ziele

- Keine anderen Plattformen als TikTok, kein Video ohne Netz (wie Spec 0043).
- Keine eigene Reihenfolge der Videos: sie stehen in der Reihenfolge des Speicherns.
- Kein Vorschaubild aus dem Video selbst (das ganze Video müsste dafür geladen werden).
- Keine Wiedergabe in der Seite, kein Autoplay in der Galerie.

## Anforderungen

Haushalt „Enrico & Nadja“, Rezept „Pasta Sorrentina“ mit den Links `https://vm.tiktok.com/ZGdXoJ8Ay/`
und `https://www.tiktok.com/@koch/video/1` und einem eigenen Foto.

**REQ-001 — Mehrere Videos je Rezept.** Ein Rezept hat bis zu 10 Videos in der Reihenfolge des
Speicherns, je mit dem Link, von dem es kommt, und seinem Vorschaubild. Ein Video je Link. Das
Video aus Spec 0043 bleibt erhalten. Offline lesend (Speichern und Entfernen nur online).

- AC-001: Angenommen „Pasta Sorrentina“ hat ein Video aus Spec 0043 · Wenn die Migration läuft ·
  Dann hat das Rezept genau dieses Video, mit dem ersten TikTok-Link des Rezepts als Quelle
- AC-002: Angenommen das Video des ersten Links ist gespeichert · Wenn ich das des zweiten speichere
  · Dann zeigt die Galerie Foto, Video 1, Video 2 in dieser Reihenfolge
- AC-003: Angenommen ein Mitglied eines anderen Haushalts oder abgemeldet · Wenn es für „Pasta
  Sorrentina“ ein Video hinzufügt, ein Vorschaubild setzt oder ein Video entfernt · Dann wird
  abgelehnt, und nichts ändert sich
- AC-004: Angenommen ein Eintrag mit fremdem Pfad, an einer Sammlung, ein elftes Video oder ein
  zweites für denselben Link · Dann lehnt die Datenbank ihn ab

**REQ-002 — Speichern am Link.** Rechts in der Zeile eines TikTok-Links ohne gespeichertes Video
steht ein Symbol-Knopf ohne Text („Video speichern“ für Bedienhilfen). Ein Tipp fragt „Video
speichern?“; erst „Speichern“ lädt. Während des Ladens dreht sich an seiner Stelle eine Anzeige;
schlägt es fehl, steht die Meldung aus Spec 0043 unter den Links, und der Knopf versucht es
erneut. Nur online.

- AC-005: Angenommen der erste Link hat noch kein Video · Wenn ich das Symbol tippe · Dann fragt die
  App „Video speichern?“, und „Abbrechen“ lädt nichts
- AC-006: Wenn ich „Speichern“ bestätige · Dann dreht sich in der Zeile die Ladeanzeige, danach ist
  das Video in der Galerie und an diesem Link kein Symbol mehr, am zweiten Link weiter
- AC-007: Angenommen TikTok liefert kein Video · Dann steht unter den Links „Das Video konnte nicht
  geladen werden. Der Link bleibt erhalten.“, das Symbol ist wieder da, und nichts wird gespeichert
- AC-008: Angenommen offline · Dann ist das Symbol deaktiviert mit dem Offline-Hinweis

**REQ-003 — Galerie am Foto.** Das Foto steht zuerst, dann die Videos. Bei mehr als einem Eintrag
stehen Punkte unter dem Bild; auf dem Handy wische ich zur Seite, am Desktop gibt es Pfeile und
die Pfeiltasten. Ein Video zeigt sein Vorschaubild im Rahmen des Fotos (4:3) mit einem
Wiedergabe-Knopf; nichts lädt oder spielt dort. Ohne Foto beginnt die Galerie mit dem ersten
Video; ohne Video bleibt alles wie bisher. Offline lesend: Vorschaubilder liegen wie Fotos auf dem
Gerät.

- AC-009: Angenommen Foto und zwei Videos · Dann zeigt die Galerie das Foto und drei Punkte, der
  erste aktiv · Wenn ich nach links wische oder „Nächstes“ wähle · Dann zeigt sie das Vorschaubild
  des ersten Videos mit Wiedergabe-Knopf, der zweite Punkt aktiv
- AC-010: Angenommen kein Foto und ein Video · Dann zeigt die Galerie gleich sein Vorschaubild, ohne
  Punkte
- AC-011: Angenommen weder Foto noch Video · Dann zeigt die Seite das Foto wie bisher, ohne Punkte
- AC-012: Angenommen beim Speichern hatte TikTok ein Titelbild · Dann ist es das Vorschaubild des
  Videos; ohne Titelbild (auch beim Video aus Spec 0043) zeigt der Rahmen das Foto des Rezepts oder
  eine ruhige Fläche mit Film-Symbol
- AC-020 (neu 27.11., Befund aus Produktion): Angenommen „Pasta Sorrentina“ mit eigenem Foto und
  noch ohne Video · Wenn ich „Video speichern“ bestätige und das Video ankommt · Dann zeigt die
  Galerie sofort das Foto und zwei Punkte, und das Video steht daneben — ohne Neuladen und ohne die
  Seite neu zu öffnen
- AC-021 (neu 27.11., Befund aus Produktion): Angenommen „Pasta Sorrentina“ mit eigenem Foto und
  zwei Videos, zuletzt beim zweiten Video angesehen · Wenn ich das Rezept öffne (auch nach
  Neuladen) · Dann beginnt die Galerie beim Foto, der erste Punkt ist aktiv

**REQ-004 — Abspielen nur im Vollbild.** Der Wiedergabe-Knopf öffnet das Video im Vollbild, lädt es
und spielt es mit Ton; auf dem iPhone im Vollbild-Player des Geräts. Schließen führt zurück zur
Galerie beim selben Video. Im Kochmodus öffnet „Video“ das Vollbild (bei mehreren Videos zuerst
die Wahl). Nur online.

- AC-013: Wenn ich beim ersten Video auf Wiedergabe tippe · Dann öffnet sich das Vollbild, „Video
  wird geladen …“, dann spielt das Video mit Ton
- AC-014: Wenn ich das Vollbild schließe (✕, Escape, „Fertig“ des iPhones) · Dann bin ich in der
  Galerie beim ersten Video, und nichts spielt
- AC-015: Angenommen offline · Dann zeigt das Vorschaubild „Video braucht Netz“ statt des
  Wiedergabe-Knopfs
- AC-016: Angenommen zwei Videos · Wenn ich im Kochmodus „Video“ und dann „Video 2“ wähle · Dann
  spielt das zweite Video im Vollbild

**REQ-005 — Ein Video entfernen.** Jedes Video hat in der Galerie ein Papierkorb-Symbol; nach der
Rückfrage „Video entfernen?“ sind Video, Datei und Vorschaubild weg, und sein Link bietet wieder
das Speichern an. Wird das Rezept gelöscht, gehen alle seine Videos und Vorschaubilder mit (nach
Ablauf von „Rückgängig“); was liegen bleibt, nimmt der nächtliche Aufräum-Lauf. Nur online.

- AC-017: Angenommen zwei Videos · Wenn ich beim ersten „Video entfernen“ bestätige · Dann zeigt die
  Galerie Foto und Video 2, die Dateien des ersten sind gelöscht, und der erste Link zeigt wieder
  das Symbol
- AC-018: Angenommen ein gelöschtes Rezept mit zwei Videos · Wenn „Rückgängig“ abgelaufen ist · Dann
  sind beide Videos und ihre Vorschaubilder gelöscht
- AC-019: Angenommen ein Vorschaubild oder Video ohne Verweis von vorgestern · Wenn der Aufräum-Lauf
  läuft · Dann ist es gelöscht; ein Vorschaubild, auf das ein Video zeigt, bleibt

## Entscheidungen

1. Agent, 26.11. (Bau): `recipes.videos jsonb` (Liste von `{path, url?, poster?}`) statt eigener
   Tabelle: Videos gehören zum Rezept wie seine Links, reisen im Schnappschuss von „Rückgängig“ mit
   und werden mit der Zeile synchronisiert; keine neue Tabelle, keine neue Freigabefläche. Ein
   Check (`private.recipe_videos_valid`) prüft Form, Ordner des Rezepts, höchstens 10, Link und
   Pfad je einmal, nur `kind = 'recipe'`.
2. Agent, 26.11. (Bau): Geschrieben wird `videos` nur über drei RPCs: `add_recipe_video`
   (fetch-video, mit dem Schlüssel des Aufrufers), `set_recipe_video_poster` und
   `remove_recipe_video` (App). Sie laufen als `security definer`, prüfen die Mitgliedschaft
   (`not_member`) und ändern nur das Rezept dieses Haushalts; der Check entscheidet die Form. So
   gibt es keinen Spalten-Grant und keinen direkten Schreibweg (auch nicht über `apply_changes`),
   und jede ändert die Liste atomar: Ein zweites Gerät, das gleichzeitig ein anderes Video
   speichert, verliert nichts.
3. Agent, 26.11. (Bau): Vorschaubild = TikToks Titelbild (`video.cover`, am Beispiel-Link ein JPEG
   1080 × 1920). `fetch-video` gibt dessen Adresse zurück; die App lädt es über `fetch-image`
   (Spec 0039), verkleinert es wie jedes Foto (≤ 1600 px, JPEG) und legt es als Foto unter
   `household-media/<haushalt>/recipes/<rezept>/<uuid>.jpg` ab; danach `set_recipe_video_poster`.
   Schlägt das fehl, bleibt das Video ohne Vorschaubild (AC-012). Vorschaubilder liegen wie Fotos
   auf dem Gerät und zählen im Aufräum-Lauf als benutzt.
4. Agent, 26.11. (Bau): Speicherorte unverändert: Videos in `household-videos` unter
   `<haushalt>/recipes/<rezept>/<uuid>.mp4` (Spec 0043), Vorschaubilder in `household-media` wie
   Fotos. Sicherung (Spec 0048) und Haushalt-Löschen brauchen nichts Neues.
5. Agent, 26.11. (Bau): Expand → migrate → contract (`30-database.md`): Die Migration übernimmt
   `video_path` nach `videos` und leert es; die Spalte bleibt bis zum Contract, nur noch `null`
   erlaubt, weil parallel gebaute Zweige auf der gemeinsamen lokalen Datenbank sie beim Anlegen
   eines Rezepts noch mitsenden. ERLEDIGT (Spec 0053, 26.11.2026): `recipes.video_path` ist
   mit ihren Check-Regeln, dem Allowlist-Eintrag und `private.videos_from_video_path` entfernt,
   seit alle Zweige von Batch 3 auf `develop` sind.
6. Agent, 26.11. (Bau): Galerie als waagerecht seitenweise scrollende Fläche (im Browser
   CSS-Scroll-Snap): das Wischen folgt dem Finger wie im System, und das Wischen zwischen Rezepten
   übernimmt eine Berührung darin nicht (Spec 0029, Entscheidung 8). Pfeile nur bei Zeiger-Geräten,
   Pfeiltasten wenn die Galerie den Fokus hat.
7. Agent, 26.11. (Bau): Vollbild = eigene dunkle Ebene über allem mit dem Video als Blob-Adresse
   (Spec 0043, Entscheidungen 4 und 7). Auf dem iPhone ohne `playsinline`, so spielt Safari im
   eigenen Vollbild-Player; dessen „Fertig“ schließt die Ebene. Verweigert Safari den Start nach
   dem Laden (die Geste ist verbraucht), reicht ein Tipp auf die Wiedergabe.
8. Ersetzt Spec 0043: REQ-001 „Video speichern“ als Text-Knopf und „höchstens ein Video je Rezept“
   (jetzt ein Video je Link, `video_exists` je Link), REQ-002 der Rahmen unter dem Foto mit
   Wiedergabe in der Seite (AC-007) und REQ-003 „Video entfernen“ als Text unter dem Rahmen.
9. Befunde aus Produktion (v2026.11.3, 27.11.2026), AC-020 und AC-021: (a) Nach „Video
   speichern“ blieb der Rahmen weiß mit zwei Punkten, bis die Seite neu geladen bzw. neu geöffnet
   wurde. Ursache: Die Galerie misst ihre Breite mit `onLayout`; react-native-web beobachtet die
   Größe einer Ansicht aber nur, wenn `onLayout` schon beim ersten Anzeigen gesetzt ist. Mit nur
   einem Foto hatte der Rahmen keins, kam das Video dazu, blieb die Breite 0 und die Seiten leer.
   Jetzt misst der Rahmen von Anfang an, auch mit einer Seite. (b) Zwei Wege führten beim Öffnen
   zu einem Video: Das eigene Foto lädt erst nach den Videos vom Gerät, bis dahin begann die
   Galerie mit dem ersten Video, und das davor gesetzte Foto schob es nicht weg (der Browser hält
   beim Scroll-Snap die gezeigte Seite). Und Safari stellt beim Neuladen die Scroll-Stelle des
   Rahmens wieder her — das war der „gemerkte“ Stand (im iPhone-Simulator nachgestellt: neu geladen
   beim zweiten Video). Jetzt hält die Galerie den Platz des Fotos frei, solange es lädt, und sie
   blättert nur, wenn die Person sie berührt, klickt, mit dem Mausrad schiebt oder eine Pfeiltaste
   drückt; jedes andere Scrollen wird zurückgesetzt. Tests: `media-gallery.test.tsx` (rot → grün),
   e2e `rundgang-mediengalerie-0046.spec.ts` (rot → grün), iPhone-Simulator.

## Daten

Migration: Spalte `recipes.videos jsonb not null default '[]'` mit Check (kein Spalten-Grant),
Übernahme aus `video_path` (Quelle: erster TikTok-Link des Rezepts), `video_path` nur noch `null`;
RPCs `add_recipe_video`, `set_recipe_video_poster`, `remove_recipe_video` (security definer mit
Mitgliedsprüfung, nicht für `anon`); `restore_recipe` mit `videos`; Aufräum-Lauf: `video_orphans` und `media_orphans`
lesen `videos`. Sync: Spalte am synchronisierten `recipes`, Cache-Version 22. Keine neuen
personenbezogenen Daten.

## Risiken

| Risiko                                        | Gegenmaßnahme                                       | Test                            |
| --------------------------------------------- | --------------------------------------------------- | ------------------------------- |
| Fremder Haushalt / abgemeldet ändert Videos   | Mitgliedsprüfung in den RPCs, kein `anon`           | pgTAP `recipe_videos.test.sql`  |
| Eintrag zeigt auf fremde Datei                | Check: nur Ordner des Rezepts, `.mp4` / `.jpg`      | pgTAP AC-004                    |
| Video geht bei der Übernahme verloren         | Migration kopiert vor dem Leeren                    | pgTAP AC-001                    |
| Zwei Geräte speichern gleichzeitig            | atomare RPCs statt ganzer Liste                     | pgTAP add/remove                |
| Vorschaubild oder Video bleibt liegen         | Löschpfad der App + Aufräum-Lauf liest `videos`     | pgTAP AC-019, api AC-017/AC-018 |
| Aufräum-Lauf löscht benutztes Vorschaubild    | `media_orphans` prüft `videos` und Schnappschuss    | pgTAP AC-019                    |
| Titelbild-Adresse führt woandershin (SSRF)    | nur TikTok-CDN-Adresse, Abruf über fetch-image      | Unit-Test tiktok, fetch-video   |
| Veraltetes Gerät löscht Dateien eines Videos  | Dateien nur nach Rückgabe von `remove_recipe_video` | api „Risiken: only what …“      |
| Vorschaubild ist zugleich Foto/anderes Poster | RPC lehnt ab; Entfernen prüft Verweise              | pgTAP „Risiken“, api „Risiken“  |

`/security-check` (26.11.): 0 kritisch, 0 hoch, 0 mittel. Zwei Befunde „niedrig“ behoben: (1)
„Video entfernen“ löschte die Dateien nach dem lokalen Stand, auch wenn der Server nichts entfernt
hatte (ein anderes Gerät war schneller oder das Rezept lag in „Rückgängig“) — jetzt nur, was
`remove_recipe_video` zurückgibt; (2) ein direkt gesetztes Vorschaubild konnte das Foto des
Rezepts oder das Poster eines anderen Videos sein und ginge mit dem Video — `set_recipe_video_poster`
lehnt beides ab, und das Entfernen lässt ein noch genanntes Bild liegen. Hinweise:
`add_recipe_video` ist für Mitglieder direkt aufrufbar (nur eigener Rezeptordner, `url` wird nur
verglichen, nie angezeigt); der Check prüft den Objekttyp jetzt vor den Schlüsseln.

## Umsetzung

- [x] 1. Migration, Check, RPCs, Aufräum-Lauf, `restore_recipe` (`db-change`, pgTAP) (AC-001–AC-004,
      AC-019)
- [x] 2. `fetch-video`: Video je Link, `add_recipe_video`, Titelbild-Adresse (AC-002, AC-006, AC-007)
- [x] 3. core/api: `videos`, Vorschaubild speichern, ein Video entfernen, Löschen des Rezepts
      (AC-006, AC-012, AC-017, AC-018)
- [x] 4. ui: Galerie mit Punkten, Pfeilen, Tasten (AC-009–AC-011)
- [x] 5. App: Symbol am Link mit Rückfrage, Video-Kacheln, Vollbild, Entfernen, Kochmodus
      (AC-005–AC-008, AC-012–AC-017)
- [x] Nachweis: `pnpm format:check && pnpm check && pnpm build:web`; `pnpm exec supabase test db`;
      `/security-check`; Bildschirmfotos Handy und Desktop

**Nachweis (26.11.2026):** Tests rot zuerst (pgTAP `recipe_videos.test.sql` ohne Spalte, core
`recipe-video`/`ai-contract`, edge `fetch-video`/`tiktok`, ui `gallery-pages`/`media-gallery`,
api „Risiken“), dann grün. `pnpm exec supabase test db` grün (61 Dateien, neu
`recipe_videos.test.sql` mit 44 Tests: Spalte, drei RPCs, fremder Haushalt, abgemeldet, Check,
Übernahme aus `video_path`, `restore_recipe`, Aufräum-Lauf); die Migration läuft auch als Ganzes
in einer zurückgerollten Transaktion. `pnpm format:check && pnpm check && pnpm build:web` grün.
**Echter Durchlauf** auf dem Entwicklungsserver (Port 8093, `fetch-video` und `fetch-image` des
Zweigs unter Node, weil der gemeinsame Edge-Runtime den Haupt-Checkout bedient): zwei TikTok-Links
gespeichert (HTTP 200 nach 7–12 s), Vorschaubild aus TikToks Titelbild (JPEG über `fetch-image`,
in `household-media`), Galerie Foto → Video 1 → Video 2 mit Punkten, Pfeilen und Pfeiltasten,
Vollbild spielt mit Ton (95 s, nicht stumm), Escape/✕ zurück zur Galerie, offline „Video braucht
Netz“, Kochmodus „Video“ mit Wahl „Video 1/2“, ein Video entfernt (Datei und Poster weg, Link
zeigt wieder das Symbol), Rezept ohne Foto beginnt mit dem Video; beide Testrezepte gelöscht →
nach „Rückgängig“ alle Videos und Poster aus dem Speicher (AC-018). Bildschirmfotos:
Haupt-Checkout `tmp/review-0003/0046/`. **Nur am iPhone prüfbar:** das Wischen der Galerie
(CSS-Scroll-Snap), der Vollbild-Player von iOS (ohne `playsinline`) und ob Safari nach dem Laden
von selbst startet oder einen Tipp auf Wiedergabe braucht; „Fertig“ schließt die Ebene
(`webkitendfullscreen`).

**Nachtrag (26.11.2026, CI):** Auf einer frischen Datenbank lehnte `recipes_videos_valid` den
Seed ab: der Generator schrieb `videos` als leeres Text-Array (`'{}'`). `videos` ist jetzt eine
JSON-Spalte des Generators (`'[]'::jsonb`, Test in `seed-sql.test.ts`). Geprüft ohne Reset der
gemeinsamen Datenbank: der alte Seed scheitert in einer zurückgerollten Transaktion mit genau
diesem Fehler, `seed.sql` und `preview-seed.sql` laufen dort durch (26 Rezepte, alle ohne Videos).
