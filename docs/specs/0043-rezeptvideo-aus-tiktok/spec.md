---
status: freigegeben # entwurf | freigegeben | umgesetzt | verworfen
datum: 2026-11-26
---

# 0043 — Rezeptvideo aus TikTok speichern und abspielen

**Quelle:** Enricos Review 0003 vom 26.11.2026 (`tmp/__PROMPTS/0002-REVIEW-2026-11-26-PROMPT.md`,
E-15), Entscheidung 3 der Spec 0040 (Option B als eigener Schritt am Ende von Welle 2). Test am
26.11.: Das Video hinter `https://vm.tiktok.com/ZGdXoJ8Ay/` ließ sich ohne offizielle Schnittstelle
laden (MP4, 95 s, 21,6 MB). **Welle 2.** **Kritischer Pfad:** ja: Migration, neuer Speicher-Bucket,
Edge Function lädt fremde Inhalte, Löschen von Dateien.

## Ziel

Habe ich ein Rezept aus einem TikTok-Video, speichere ich das Video mit einem Tipp im Rezept und
sehe es mir in der App an, auch wenn es auf TikTok verschwindet. Funktioniert der Download nicht,
bleibt der Link, und die App sagt das freundlich.

## Nicht-Ziele

- Keine anderen Plattformen (Instagram, YouTube); nur TikTok-Links.
- Kein Video ohne Netz: Videos werden nicht im lokalen Speicher vorgehalten.
- Kein Schneiden, keine Vorschaubilder aus dem Video (das Foto des Rezepts dient als Standbild).
- Kein Teilen des Videos (Spec 0042 teilt den Link).

## Anforderungen

Haushalt „Enrico & Nadja“, Rezept „Pasta Sorrentina“ mit dem Link `https://vm.tiktok.com/ZGdXoJ8Ay/`.

**REQ-001 — Video speichern.** Hat ein Rezept einen TikTok-Link (auch Kurzlink) und noch kein Video,
zeigt die Zeile des Links „Video speichern“. Die App lädt das Video über den Server in den Speicher
des Haushalts; danach hat das Rezept ein Video. Höchstens ein Video je Rezept. Offline: nur online.

- AC-001: Angenommen „Pasta Sorrentina“ mit dem TikTok-Link · Wenn ich „Video speichern“ tippe · Dann
  zeigt die Zeile „Video wird gespeichert …“ und nach höchstens 90 s steht unter dem Foto das Video
- AC-002: Angenommen TikTok liefert kein Video (Fehler, Sperre, Zeitüberschreitung) · Dann sagt die
  App „Das Video konnte nicht geladen werden. Der Link bleibt erhalten.“, und nichts wird gespeichert
- AC-003: Angenommen das Video ist größer als 50 MB · Dann sagt die App „Das Video ist zu groß (über
  50 MB)“, und nichts wird gespeichert
- AC-004: Angenommen ein Link auf eine andere Seite als TikTok · Dann gibt es kein „Video speichern“,
  und ein direkter Aufruf der Funktion damit wird abgelehnt
- AC-005: Angenommen ein Mitglied eines anderen Haushalts oder abgemeldet ruft die Funktion für
  „Pasta Sorrentina“ auf · Dann wird abgelehnt, und es entsteht keine Datei
- AC-006: Angenommen offline · Dann ist „Video speichern“ deaktiviert mit dem Offline-Hinweis

**REQ-002 — Video abspielen.** Ein gespeichertes Video steht auf der Rezeptseite unter dem Foto im
Hochformat-Rahmen mit Wiedergabe-Knopf, ohne Autoplay und stumm bis zum Tippen; Vollbild über die
Steuerung des Geräts. Auch im Kochmodus erreichbar über „Video“. Offline: nur online.

- AC-007: Angenommen „Pasta Sorrentina“ mit Video · Wenn ich auf Wiedergabe tippe · Dann läuft das
  Video in der Seite, mit Ton
- AC-008: Angenommen offline · Dann zeigt der Rahmen „Video braucht Netz“ statt des Videos

**REQ-003 — Video entfernen.** „Video entfernen“ (mit Nachfrage, Spec 0036) löscht das Video und
seine Datei; der Link bleibt. Wird das Rezept oder der Haushalt gelöscht, verschwinden seine Videos
mit. Offline: nur online.

- AC-009: Angenommen „Pasta Sorrentina“ mit Video · Wenn ich „Video entfernen“ bestätige · Dann ist
  das Video weg, die Datei im Speicher gelöscht, und der Link zeigt wieder „Video speichern“
- AC-010: Angenommen der Haushalt wird gelöscht · Dann sind auch alle Videodateien gelöscht
- AC-011: Angenommen eine Videodatei ohne Verweis von vorgestern · Wenn der nächtliche Aufräum-Lauf
  (Spec 0039) läuft · Dann ist sie gelöscht

## Entscheidungen

1. Enrico, 26.11. (Spec 0040, Entscheidung 3): Video im eigenen Speicher, nur private Nutzung im
   Haushalt; die Quelle ist inoffiziell und kann jederzeit brechen — dann greift AC-002.
2. Eigener privater Bucket `household-videos` (nur `video/mp4`, 50 MB), Pfad
   `<household_id>/recipes/<recipe_id>/<uuid>.mp4`, Storage-RLS wie `household-media`.
3. Neue Edge Function `fetch-video`: nur TikTok-Hosts (Allowlist, über den sicheren Abruf aus
   ADR-0016), löst Kurzlinks auf, liest die Video-Adresse aus der Seite, lädt höchstens 50 MB in
   höchstens 60 s und lädt die Datei **mit dem Schlüssel des Aufrufers** hoch (RLS entscheidet), dann
   setzt sie `recipes.video_path` über `apply_changes`. Kein Server-Schlüssel, kein Kontingent.
4. Abspielen über eine Blob-Adresse (wie Fotos): CSP bekommt `media-src 'self' blob:`; kein Zugriff
   auf fremde Domains aus der App.
5. Der Aufräum-Lauf und das Löschen des Haushalts (Spec 0039, `begin_household_deletion`) schließen
   den neuen Bucket ein.
6. Agent, 26.11. (Bau): `fetch-video` nimmt nur einen TikTok-Link, den das Rezept selbst hat
   (sonst `not_a_tiktok_link`, ohne Abruf), und lädt `playAddr` mit den Cookies der Seite und
   `Referer: https://www.tiktok.com/` (ohne beides antwortet TikTok mit 403, geprüft am
   Beispiel-Link). `fetchPublic` bekommt dafür zusätzliche Kopfzeilen und gibt die Cookies der
   Antworten zurück; beides nur zusammen mit `allowHost` (nur TikTok und seine CDNs).
7. Agent, 26.11. (Bau): Das Video lädt erst beim Tippen auf Wiedergabe (kein Vorladen von 20 MB
   beim Öffnen der Seite) und spielt dann gleich mit Ton; bis dahin zeigt der Rahmen das Foto des
   Rezepts mit dem Wiedergabe-Knopf. `begin_household_deletion` liefert Fotos und Videos; die App
   unterscheidet sie an der Endung `.mp4`. Ein gelöschtes Rezept nimmt sein Video mit, wenn
   „Rückgängig“ abgelaufen ist (wie das Foto), sonst der nächtliche Aufräum-Lauf.
8. OFFEN: Die Sicherung (`.github/workflows/backup.yml`) sichert nur `household-media`, keine
   Videos; `scripts/reset-app-data.mjs` leert nur `household-media` (übrig gebliebene Videos räumt
   der Aufräum-Lauf nach einem Tag ab). Empfehlung: Videos bewusst nicht sichern (bis 50 MB je
   Video, die Quelle bleibt der Link); beim nächsten Reset den Bucket mit leeren. Entscheidung
   Enrico.

## Daten

Migration: Spalte `recipes.video_path text` (Check auf das Pfadmuster, nur bei `kind = 'recipe'`),
Grants, `apply_changes`-Allowlist, Sync, Cache-Version; Bucket `household-videos` mit Policies;
Löschfunktionen und Aufräum-Lauf um den Bucket erweitert. Keine personenbezogenen Daten neu.

## Risiken

| Risiko                                  | Gegenmaßnahme                                  | Test                                 |
| --------------------------------------- | ---------------------------------------------- | ------------------------------------ |
| Funktion lädt beliebige Adressen (SSRF) | nur TikTok-Hosts, sicherer Abruf (ADR-0016)    | Unit-Tests Allowlist + Adressklassen |
| Fremder Haushalt / abgemeldet           | JWT, Mitgliedschaft, Upload mit Aufrufer-RLS   | Test 401/403, pgTAP Storage-Policy   |
| Speicher läuft voll                     | 50 MB je Video, ein Video je Rezept, Aufräumen | AC-003, AC-011                       |
| Datei bleibt beim Löschen liegen        | Löschpfade + Aufräum-Lauf                      | AC-009–AC-011                        |
| TikTok ändert die Seite                 | Fehler sauber gemeldet, Link bleibt            | AC-002                               |
| Cookies/Referer gehen an fremde Hosts   | nur mit `allowHost` (TikTok + CDNs), je Hop    | Unit-Test fetch-public, tiktok       |
| Datei ohne Zeile (Abbruch, Wettlauf)    | Datei sofort wieder gelöscht; sonst Aufräumen  | Unit-Test fetch-video, pgTAP         |

`/security-check` (26.11.): 0 kritisch, 0 hoch, 0 mittel. Niedrig: zwei gleichzeitige Aufrufe
für dasselbe Rezept können eine zweite Datei hinterlassen (der zweite Pfad gewinnt, die erste
Datei räumt der Aufräum-Lauf nach einem Tag ab) — angenommen; eine Rezept-ID ohne UUID-Form gab
500 statt 403 — behoben. Hinweise: kein Kontingent (Entscheidung 3, ein Mitglied kann viele
Rezepte mit Video füllen); bis etwa 100 MB Speicher in der Edge Function beim Zusammensetzen
eines 50-MB-Videos; Sicherung und Reset ohne Videos (Entscheidung 8, OFFEN).

## Umsetzung

- [x] 1. Migration: Spalte, Bucket, Policies, Allowlist, Löschpfade, Aufräum-Lauf (`db-change`, pgTAP)
      (AC-005, AC-009–AC-011)
- [x] 2. `fetch-video` mit TikTok-Auflösung (gemeinsam mit Spec 0040) (AC-001–AC-005)
- [x] 3. App: „Video speichern“ an TikTok-Links, Video-Rahmen, „Video entfernen“, Kochmodus
      (AC-001–AC-009)
- [x] 4. CSP `media-src` + Test in `check-web-export`
- [x] Nachweis: `pnpm format:check && pnpm check && pnpm build:web` grün;
      `pnpm exec supabase test db`; `/security-check`; ein echter Download am Beispiel-Link

**Nachweis (26.11.2026):** `pnpm exec supabase test db` grün (60 Dateien, neu
`recipe_video.test.sql` mit 33 Tests: Bucket, Spalte, Allowlist, fremder Haushalt, abgemeldet,
Storage-Policies, Aufräum-Lauf, Haushalt löschen, `restore_recipe`); `pnpm format:check && pnpm
check && pnpm build:web` grün. **Ein echter Download beweist AC-001:** die App auf dem
Entwicklungsserver (Port 8093) tippte „Video speichern“ an `https://vm.tiktok.com/ZGdXoJ8Ay/`;
der echte Handler von `fetch-video` (unter Node, weil der gemeinsame lokale Edge-Runtime den
Haupt-Checkout bedient) lud die Seite, `playAddr` und das MP4 (21 558 855 Byte, `ftyp`), lud es mit
dem Schlüssel des Aufrufers in `household-videos` und setzte `video_path` über `apply_changes`:
HTTP 200 nach 12,7 s, nach 13 s stand der Rahmen unter dem Foto. Wiedergabe (AC-007): Blob-Adresse,
läuft, nicht stumm, 96 s; offline „Video braucht Netz“ (AC-008); „Video entfernen“ (AC-009):
`video_path` leer, Bucket leer, „Video speichern“ wieder da. Testrezept danach gelöscht.
Bildschirmfotos: Haupt-Checkout `tmp/review-0003/0043/`. Nur am iPhone prüfbar: Ton und Vollbild
in Safari nach dem Laden (die Wiedergabe startet nach dem Download; verweigert Safari das, reicht
ein zweiter Tipp auf die Steuerung).
