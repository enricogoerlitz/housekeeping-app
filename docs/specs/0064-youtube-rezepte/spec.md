---
status: freigegeben # entwurf | freigegeben | umgesetzt | verworfen
datum: 2026-11-27
---

# 0064 — Rezepte aus YouTube-Videos

**Quelle:** Enrico, 27.11.2026 („könnten wir auch YouTube supporten, dass der sich von YouTube die
Beschreibung holt? … YouTube-Videos wollen wir NICHT downloaden, d. h. Titel, vollständige
Beschreibung und Vorschaubild“). **Kritischer Pfad:** nein. Der Server ruft fremde Adressen nur
über den vorhandenen SSRF-Schutz (`fetchPublic`) ab, ohne neues Schema und ohne neue Secrets.

## Ziel

Ein YouTube-Link im KI-Feld ergibt ein gutes Rezept. Die KI liest Titel und vollständige
Beschreibung des Videos, das Vorschaubild steht als Foto zur Wahl, und der Link wird am Rezept
gespeichert, wie bei TikTok (Spec 0040, 0043).

## Nicht-Ziele

- **Kein Video-Download:** keine Galerie, kein „Video speichern“, kein Abspielen in der App.
- **Keine Untertitel oder Transkripte**, kein Ton an die KI.
- **Keine YouTube-Data-API und kein API-Schlüssel.**
- **Keine Playlists, Kanäle oder Live-Streams:** nur einzelne Videos und Shorts.
- **Keine YouTube-Treffer in der Websuche:** Die Ausschlussliste der Websuche bleibt (Spec 0049).

## Anforderungen

**REQ-001 — YouTube-Link erkennen.** Ein Link auf ein einzelnes Video wird als YouTube erkannt,
die Video-ID wird gelesen, die Adresse auf `https://www.youtube.com/watch?v=<ID>` vereinheitlicht.
Erkannte Formen: `youtube.com/watch?v=`, `youtu.be/`, `youtube.com/shorts/`, `m.youtube.com`,
`music.youtube.com` ausgenommen. Quelle: Enrico. Offline: nur online (KI).

- AC-001: Angenommen `https://youtu.be/gkgJAPBrwT8?si=x` · Wenn er gelesen wird · Dann ist die ID
  `gkgJAPBrwT8` und die Adresse `https://www.youtube.com/watch?v=gkgJAPBrwT8`
- AC-002: Angenommen `https://www.youtube.com/shorts/SPQiIhwEtzo` · Dann ist er ein YouTube-Video
  mit der ID `SPQiIhwEtzo`
- AC-003 (Rand): Angenommen `https://www.youtube.com/@chefkoch` oder eine Playlist ohne `v=` · Dann
  ist er kein YouTube-Video und wird wie eine normale Seite gelesen

**REQ-002 — Titel, Beschreibung und Vorschaubild lesen.** `ai-recipe-draft` liest für einen
YouTube-Link Titel, die vollständige Beschreibung (`videoDetails.shortDescription` der
Video-Seite, ohne API) und das größte Vorschaubild und gibt sie der KI als Quelle „YouTube“.
Scheitert das Lesen der Video-Seite (Zustimmungsseite, Bot-Prüfung, Zeitlimit, geänderte Seite),
kommen Titel und Vorschaubild aus der offiziellen oEmbed-Schnittstelle, und die KI arbeitet mit
dem Titel und dem übrigen Wunsch. Quelle: Enrico, PoC 27.11. Offline: nur online.

- AC-004: Angenommen eine Video-Seite mit Titel „Lasagne Bolognese - Das Original! | Chefkoch.de“
  und 1025 Zeichen Beschreibung · Wenn der Link gelesen wird · Dann bekommt die KI Titel und die
  ganze Beschreibung, und die Quelle trägt `kind: 'youtube'` und das Vorschaubild als `coverUrl`
- AC-005: Angenommen die Video-Seite enthält keine `videoDetails` (Zustimmungsseite) · Wenn der
  Link gelesen wird · Dann kommen Titel und Vorschaubild aus oEmbed, und es gibt keinen Fehler
- AC-006 (Rand): Angenommen auch oEmbed antwortet nicht · Dann gilt der Link als „nicht lesbar“
  wie heute bei Seiten (Hinweis zu ungelesenen Links, Spec 0049), und die KI arbeitet mit dem übrigen
  Wunsch

**REQ-003 — Rezept-Link aus der Beschreibung.** Enthält die Beschreibung keinen erkennbaren
Zutatenteil, aber einen Link auf eine Rezeptseite, liest der Server höchstens diesen einen Link
zusätzlich (gleicher SSRF-Schutz, gleiche Grenzen wie Seiten). Er zählt nicht gegen die 3 Links
des Nutzers. Quelle: PoC (Chefkoch-Video verweist auf chefkoch.de). Offline: nur online.

- AC-007: Angenommen eine Beschreibung ohne Zutaten mit dem Link
  `http://www.chefkoch.de/rezepte/1112181217260303/Lasagne-Bolognese.html` · Wenn gelesen wird ·
  Dann bekommt die KI zusätzlich den Text dieser Seite
- AC-008 (Rand): Angenommen eine Beschreibung mit Zutaten · Dann wird kein Link daraus geladen

**REQ-004 — Link und Foto am Rezept.** Die normalisierte YouTube-Adresse wird als Link des Rezepts
gespeichert („YouTube“ als Bezeichnung, wenn nichts anderes passt). Das Vorschaubild ist bei
„Foto generieren aus“ das Foto der Quelle („Original“, Spec 0049 REQ-010) und die Vorlage für
„Foto generieren“ (wie das TikTok-Cover). Quelle: Enrico. Offline: nur online.

- AC-009: Angenommen ein Entwurf aus `https://youtu.be/gkgJAPBrwT8` · Wenn ich speichere · Dann hat
  das Rezept den Link `https://www.youtube.com/watch?v=gkgJAPBrwT8`
- AC-010: Angenommen „Foto generieren“ ist aus · Dann wird das Vorschaubild als Foto übernommen

## Entscheidungen

1. **Watch-Seite statt API:** Der PoC vom 27.11. zeigte von einem deutschen Anschluss vollständige
   Beschreibungen ohne Zustimmungsseite (Rick Astley 2376 Zeichen, Chefkoch-Video 1025, Short 2616).
   Ob das vom Supabase-Server aus genauso geht, prüft der Bau auf der Vorschau. Für den Fall, dass
   YouTube dort blockt, gibt es oEmbed als Rückfall (REQ-002).
2. **Vorschaubild:** `maxresdefault`, wenn vorhanden, sonst `hqdefault` aus oEmbed. Es läuft wie das
   TikTok-Cover über den vorhandenen Bild-Abruf (`fetch-image`) und dessen Grenzen.
3. **Grenzen:** Video-Seite höchstens 2,5 MB und 8 s, oEmbed 4 s, Beschreibung höchstens 6000
   Zeichen an die KI.

## Daten

Kein Schema. Neu: die Quellen-Art `youtube` im Vertrag von `ai-recipe-draft` (`_shared/contract`,
`pnpm gen:edge`). Die App akzeptiert sie und zeigt sie wie eine Seite. Es werden keine Daten
gespeichert außer dem Link und dem gewählten Foto des Rezepts.

## Umsetzung

- [x] 1. `_shared/youtube.ts`: Erkennen und Normalisieren (AC-001–003), Lesen mit oEmbed-Rückfall
      (AC-004–006), Rezept-Link aus der Beschreibung (AC-007, AC-008); Deno-Tests mit
      nachgebildeten Antworten (rot zuerst)
- [x] 2. `ai-recipe-draft`: YouTube wie TikTok einbinden, Quelle `youtube` mit `coverUrl`; Vertrag
      und App (AC-009, AC-010)
- [x] 3. e2e mit `page.route`: Link im KI-Feld → Entwurf mit Link und Foto-Wahl „Original“
      (`e2e/rundgang-youtube-0064.spec.ts`, läuft beim Mergen)
- [ ] 4. Auf der Vorschau mit 3 echten Videos prüfen (Video, Short, `youtu.be`), Ergebnis hier
      eintragen
  - **Lokal (27.11., deutscher Anschluss, `readYouTube` aus `_shared/youtube.ts`):** alle drei über
    die Video-Seite gelesen, ohne oEmbed-Rückfall, je 0,8–1 s, Seiten 1,45–1,63 MB.
    `youtu.be/gkgJAPBrwT8` → „Lasagne Bolognese - Das Original! | Chefkoch.de“, 1025 Zeichen,
    kein Zutatenteil, Rezept-Link `https://www.chefkoch.de/rezepte/1112181217260303/…` (AC-007),
    Bild `vi_webp/…/maxresdefault.webp`. `shorts/SPQiIhwEtzo` → „Lasagne in 3 einfachen Schritten“,
    2602 Zeichen, Zutatenteil erkannt („👉 Zutaten:“, „750g Hackfleisch …“), kein Nachladen
    (AC-008), Bild `vi/…/maxresdefault.jpg`. `watch?v=dQw4w9WgXcQ` → Rick Astley, 2375 Zeichen,
    kein Rezept-Link, Bild `maxresdefault.webp`. Die Adresse war jeweils
    `https://www.youtube.com/watch?v=<ID>`.
  - **Vorschau (Supabase-Server):** offen, prüft der Koordinator nach dem Deploy.
- [x] Nachweis: `pnpm format:check && pnpm check && pnpm build:web` grün (27.11., lokal)

## Nachweis

- Rot zuerst: `_shared/youtube.test.ts` scheiterte ohne Modul (kein `youtube.ts`), danach 17/17
  grün; `ai-recipe-draft/handler.test.ts` 4 neue Tests rot (Quelle `page` statt `youtube`, kein
  Rezeptseiten-Text), danach grün; in `core` scheiterten AC-004 (Vertrag ohne `youtube`) und
  AC-009 (Link `youtu.be…` ohne Bezeichnung), danach grün.
- Das größte Vorschaubild ist bei vielen Videos WebP (`vi_webp/…/maxresdefault.webp`); `fetch-image`
  erkennt WebP (`imageTypeOf`), die App verkleinert es wie jedes Foto.
- Die Anweisung an die KI nennt jetzt „TikTok- und YouTube-Texte“ als Quellen; gegen das echte
  Modell nicht geprüft (kein bezahlter Aufruf).
