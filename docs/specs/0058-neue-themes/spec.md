---
status: umgesetzt
datum: 2026-11-27
---

# 0058 — Neue Themes

**Quelle:** Review 0004, Enrico: „Themes: super! gerne noch paar mehr. In der Auswahl nur 3
zeigen und dann unten Knopf ‚Mehr anzeigen‘, das aktuelle Theme aber immer oben zeigen.“
Entwurf und Paletten: `tmp/feature-review/05-themes.md`, `tmp/feature-review/themes/palettes.mjs`
(Nadja wünscht sich „Wolke“). **Kritischer Pfad:** nein.

## Ziel

Wer die App benutzt, kann aus neun statt drei Themes wählen, darunter „Wolke“ mit rosa
Wolkenhimmel für Nadja. Die Auswahl unter Einstellungen → Darstellung bleibt kurz: drei Themes,
das gewählte zuoberst, der Rest hinter „Mehr anzeigen“. Mehr Themes machen den Start nicht
langsamer.

## Nicht-Ziele

- Keine Änderung an Bedienung, Abläufen oder Layout eines bestehenden Themes (Markthalle, Klar,
  Frisch sehen aus wie bisher).
- Keine Synchronisation des Themes zwischen Geräten; es bleibt je Gerät gespeichert.
- Kein Wolkenhimmel in der nativen App (nur Web, ADR „nur PWA“); kein Bild als Hintergrund.
- Keine eigenen Themes oder Farben, die Nutzende selbst zusammenstellen.

## Anforderungen

### Themes

**REQ-001 — Vier Themes aus dem Entwurf.** Wolke (hell „Wolkenhimmel“, dunkel „Mondnacht“),
Mitternacht, Zitrus und Salbei mit den Farben aus `palettes.mjs`; die Rollen, die der Entwurf nicht
nennt (`shadowRaised`, `due`, `scrim`, `tones.*.fg`, `kinds`), passend ergänzt. Schriften: Nunito
(Wolke), DM Serif Display · Inter (Mitternacht), Outfit (Zitrus), Lora · Work Sans (Salbei).
Offline: offline vollständig (Gerätespeicher, Schriften im App-Paket).

- AC-001: Angenommen das Theme „Wolke“ hell · Wenn die App es lädt · Dann sind `bg` `#F2D3DB`,
  `surface` `#FCEEF1`, `accent` `#5B3B41` und `success` `#9B4D63` wie im Entwurf (dunkel: `bg`
  `#241A1D`, `accent` `#F4B6C4`)
- AC-002: Angenommen jedes der neun Themes, hell und dunkel · Wenn der Kontrast-Test läuft · Dann
  erreichen alle Textpaare 4,5:1 und Haken, Assistent-Knopf, Schalter „aus“ und Kalender-Arten 3:1
- AC-003: Angenommen ein gespeicherter Wert `wolke`, `mitternacht`, `zitrus`, `salbei`,
  `lavendel` oder `espresso` · Wenn die App startet · Dann gilt dieses Theme; ein unbekannter Wert
  fällt weiter auf Markthalle zurück (Spec 0001, AC-047)

**REQ-002 — Zwei eigene Themes.** „Lavendel“ (Violett, luftig, Lexend, rund) und „Espresso“
(dunkel geröstet mit Crema und Karamell, Space Grotesk · Manrope, kantig) mit derselben Methode:
Palette, WCAG-Prüfung, Vorschaubild (`tmp/review-0004/0058/lavendel.png`, `espresso.png`).
Offline: offline vollständig.

- AC-004: Angenommen die Auswahl zeigt alle Themes · Dann stehen „Lavendel“ und „Espresso“ mit je
  einem Satz Beschreibung darin und bestehen AC-002

### Wolke

**REQ-003 — Wolkenhimmel.** Ein Theme kann einen Seitenhintergrund als CSS-Verlauf angeben
(`backdrop`); Wolke hell zeigt rosa Himmel mit weißen Wolken, dunkel einen Mondschimmer oben
rechts. Nur im Web, Karten und Leisten bleiben deckend; Themes ohne `backdrop` bleiben unverändert.
Offline: offline vollständig.

- AC-005: Angenommen das Theme „Wolke“ im Web · Wenn eine Seite offen ist · Dann trägt ihr
  Hintergrund den Verlauf und darunter `bg`; Karten haben `surface`
- AC-006: Angenommen das Theme „Markthalle“ · Wenn eine Seite offen ist · Dann hat sie kein
  Hintergrundbild, nur `bg` (wie bisher)
- AC-007: Angenommen „Wolke“ auf dem Handy · Wenn die Seite unter der Kopfzeile scrollt · Dann
  zeigt die Kopfzeile denselben Himmelausschnitt wie die Seite und verdeckt den Inhalt darunter

**REQ-004 — Blasenform.** Ein Theme kann Icon-Knöpfe und den aktiven Tab als organische Blase
statt als Kreis/Pille zeigen (`shape.bubble`). In Wolke sitzen alle Icon-Knöpfe auf einer hellen
Blase (`surfaceSunken`) und der aktive Tab auf einer Blase in `accentSoft`. Offline: offline
vollständig.

- AC-008: Angenommen das Theme „Wolke“ · Wenn ein Icon-Knopf erscheint · Dann hat er die
  Blasenrundung und die Fläche `surfaceSunken`
- AC-009: Angenommen das Theme „Wolke“ · Wenn der Tab „Liste“ aktiv ist · Dann sind Symbol und Text
  in `accent` eingefärbt, ohne Form drumherum (geändert nach Rückmeldung Enrico, 27.11.2026; vorher
  eine Blase in `accentSoft`)
- AC-010: Angenommen das Theme „Markthalle“ · Wenn ein Icon-Knopf und der aktive Tab erscheinen ·
  Dann sind sie rund bzw. getönt wie bisher, ohne Blase

**REQ-005 — Statusleiste je Theme.** `theme-color` und der Seitengrund vor dem ersten Bild
(`theme-boot.js`) kennen alle neun Themes. Offline: offline vollständig.

- AC-011: Angenommen gespeichert ist „Wolke“ hell · Wenn die App kalt startet · Dann sind
  `theme-color` und der Seitengrund `#F2D3DB`, bevor die App gezeichnet ist

### Schriften

**REQ-006 — Schriften nur bei Bedarf laden.** Beim Start lädt die App nur die Schriften des
gewählten Themes; die eines anderen Themes erst, wenn die Theme-Auswahl es zeigt. Alle Schriften
liegen im App-Paket, nichts wird bei fremden Servern angefragt. Ein Theme-Wechsel baut die App
nicht neu auf. Offline: offline vollständig (der Service Worker hält alle Schriftdateien).

- AC-012: Angenommen das Theme „Klar“ (Systemschrift) · Wenn die App startet · Dann wird keine
  Schriftdatei geladen
- AC-013: Angenommen das Theme „Markthalle“ · Wenn die App startet · Dann werden genau die fünf
  Schnitte von Fraunces und Instrument Sans geladen und keine anderer Themes
- AC-014: Angenommen eine Schrift lässt sich nicht laden · Wenn die App startet · Dann startet sie
  trotzdem mit der Systemschrift
- AC-015: Angenommen die Schriften des gewählten Themes sind geladen · Wenn ein anderes Theme
  gewählt wird · Dann bleibt die App sichtbar und lädt die neuen Schriften nach

### Auswahl

**REQ-007 — Kurze Theme-Auswahl.** Einstellungen → Darstellung zeigt drei Themes, das gewählte
als erstes, dann die übrigen in fester Reihenfolge; darunter „Mehr anzeigen“, das alle zeigt und
zu „Weniger anzeigen“ wird. Gespeichert wird weiter je Gerät. Offline: offline vollständig.

- AC-016: Angenommen gewählt ist „Wolke“ · Wenn ich Darstellung öffne · Dann stehen dort Wolke,
  Markthalle, Klar und der Knopf „Mehr anzeigen“
- AC-017: Angenommen gewählt ist „Markthalle“ · Wenn ich Darstellung öffne · Dann stehen dort
  Markthalle, Klar, Frisch (wie bisher)
- AC-018: Angenommen die Auswahl zeigt drei · Wenn ich „Mehr anzeigen“ tippe · Dann stehen alle
  neun da, das gewählte zuoberst, und der Knopf heißt „Weniger anzeigen“
- AC-019: Angenommen alle neun sind offen · Wenn ich „Lavendel“ wähle · Dann gilt Lavendel sofort,
  die Karte bleibt an ihrem Platz; beim nächsten Öffnen der Einstellungen steht sie oben

**REQ-008 — DESIGN.md.** §2 und §3 nennen die neun Themes mit Charakter, Schrift, Rahmung und
Farben, §4 das Laden der Schriften bei Bedarf, §3 `backdrop` und `shape.bubble`. Offline: —.

## Entscheidungen

1. **Lavendel und Espresso** als zusätzliche Themes: Violett gibt es sonst nicht; Espresso ist das
   zweite „dunkel zuerst“-Theme neben Mitternacht, aber warm und kantig (Radius 8/6, eckige
   Abhakfelder) mit Grotesk-Schrift, und hebt sich so von Markthalle (Serife, Terrakotta, Papier)
   ab. Hell heißt es kühles Milchschaum-Grau mit Espresso-Tinte statt Creme.
2. **Salbei wird gebaut**, obwohl der Entwurf abriet: Enrico will „noch paar mehr“ und hat den
   Auftrag mit allen vier Entwurfs-Themes erteilt.
3. **Reihenfolge der Themes:** Markthalle, Klar, Frisch, Wolke, Mitternacht, Zitrus, Salbei,
   Lavendel, Espresso. Die drei bisherigen bleiben vorn, damit für bestehende Geräte nichts springt.
4. **Gewähltes oben, aber kein Springen:** Die Reihenfolge wird beim Öffnen der Einstellungen
   festgelegt. Wer in der offenen Liste wählt, sieht die Karte nicht unter dem Finger wegspringen;
   beim nächsten Öffnen steht sie oben (AC-019). „Weniger anzeigen“ legt die Reihenfolge neu fest.
5. **Himmel beginnt mit `bg`:** Der Verlauf startet oben in `bg` (`#F2D3DB`) statt in `#F0C9D3`,
   so bleiben `theme-color`, `theme-boot.js` und der Seitengrund eine Farbe je Theme und Modus;
   kein neuer Farbwert für die Statusleiste (ersetzt den Entwurfswert `#F0C9D3`).
6. **Kopfzeile über dem Himmel:** Auf dem Handy liegt die Kopfzeile über dem scrollenden Inhalt
   und braucht eine deckende Fläche. Sie bekommt denselben Verlauf in der Größe des Fensters,
   oben bündig – sie zeigt also genau den Himmelausschnitt dahinter (ohne `background-attachment:
fixed`, das iOS Safari nicht kann).
7. **Blasen auf allen Icon-Knöpfen in Wolke**, wie die Symbole auf Nadjas Startbildschirm; Knöpfe
   ohne Fläche (`plain`) bekommen in Wolke die Blase in `surfaceSunken`. Die Tab-Leiste erhält die
   neue Art `tabActive: 'bubble'`; `shape.bubble` ist optional, alle anderen Themes lassen es weg.
8. **Schriften als Abhängigkeit von `packages/ui`:** Die vorhandenen `@expo-google-fonts/*` hängen
   an `packages/ui` (dort liegt `fonts.ts`). Die neuen kommen ebenso dorthin, in der Version der
   vorhandenen (0.4.x), mit `pnpm --filter @housekeeping/ui add`; `expo install` ist nur für
   native Module nötig, Schriftpakete enthalten nur Dateien.
9. **Laden bei Bedarf über die Vorschau:** Jede Karte der Theme-Auswahl lädt die Schriften ihres
   Themes, sobald sie gezeigt wird; beim Antippen sind sie also schon da. Beim Start wartet die App
   einmal auf die Schriften des gewählten Themes, danach nie mehr (ändert DESIGN.md §4).
10. **Beschreibungen** aus dem Entwurf; Bereichsfarben (`areaTone`) bleiben aus bei allen neuen
    Themes, nur Frisch malt Bereiche (Spec 0005, D4).

## Daten

Gelesen/geschrieben wird nur die Geräte-Einstellung `themeId` (localStorage
`housekeeping.settings.v1`), jetzt mit sechs weiteren erlaubten Werten. Keine Schemaänderung, keine
personenbezogenen Daten.

## Umsetzung

- [x] 1. Tests rot: `contrast.test.ts`, `picker.test.ts` (AC-001 – AC-004, AC-016 – AC-018),
      `font-loading.test.tsx` (AC-012 – AC-015), `shell.test.tsx`/`controls.test.tsx`
      (AC-005 – AC-010), `theme-boot.test.mjs` (AC-011)
- [x] 2. `types.ts` (ThemeId, `backdrop`, `shape.bubble`, `tabActive: 'bubble'`), sechs
      Theme-Dateien, `themeFamilies`, `pickerFamilies`
- [x] 3. Schriften: Pakete, `fonts.ts`, `useThemeFonts`, Start in `_layout.tsx` (AC-012 – AC-015)
- [x] 4. `Screen` (Himmel), `IconButton`, `TabBar` (Blase) (AC-005 – AC-010)
- [x] 5. `theme-boot.js` (AC-011)
- [x] 6. Theme-Auswahl mit „Mehr anzeigen“ (AC-016 – AC-019), e2e `rundgang-themes-0058.spec.ts`
- [x] 7. DESIGN.md §2–§5 (REQ-008)
- [x] Nachweis: `pnpm format:check && pnpm check && pnpm build:web` grün; Screenshots in
      `tmp/review-0004/0058/`

**Nachweis (27.11.2026):** Vor dem Bau rot: 12 Vitest-Fälle in `packages/ui` (u. a. „AC-001:
"Wolke" has the colours of the proposal“, „AC-008: in "Wolke" an icon button sits on a soft
bubble“, „AC-005, AC-007: "Wolke" paints its sky behind the page and the header“; `font-loading`
ohne Modul) und 12 Fälle in `theme-boot.test.mjs`; danach `pnpm check` grün (ui: 97,3 % Zeilen),
`pnpm build:web` grün. Im Dev-Server (390 × 844 und 1440 × 900): Wolke hell und dunkel mit Himmel,
Blasen an Glocke, Stepper und aktivem Tab; die Auswahl lädt mit Wolke gewählt erst 9 Schriftdateien
(Wolke + Markthalle), nach „Mehr anzeigen“ 36. Die e2e-Datei läuft beim Koordinator (DB-Reset).
