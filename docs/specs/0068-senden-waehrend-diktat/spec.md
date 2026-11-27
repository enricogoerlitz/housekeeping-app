---
status: umgesetzt # entwurf | freigegeben | umgesetzt | verworfen
datum: 2026-11-27
---

# 0068 — Senden während des Diktats

**Quelle:** Enricos Wunsch vom 27.11.2026: „Wo ich der KI etwas sage und diktieren kann, will ich
während des Diktats senden – wie in der Claude-App, mit den letzten Worten.“ Baut auf Spec 0040
(Spracheingabe, AC-008, AC-009, AC-018) und Spec 0062 (Composer, Entscheidung 14) auf.
**Kritischer Pfad:** nein (keine Datenbank-, Rechte- oder Sync-Änderung; gesendet wird über die
vorhandenen Wege).

## Ziel

Ich diktiere meinen Wunsch an die KI und tippe gleich auf Senden – ohne vorher das Mikrofon
auszuschalten und ohne zu warten. Die App hört auf zuzuhören, wartet kurz auf meine letzten Worte
und schickt den ganzen Satz genau einmal ab. Kein Wort geht verloren, nichts geht doppelt raus.

## Nicht-Ziele

- Kein Diktat in der Einkaufsliste (Spec 0003): dort wird nichts an die KI gesendet; sie bekommt
  nur die Wartezeit aus Entscheidung 2.
- Kein neues Mikrofon in Feldern, die heute keins haben (z. B. „Titel“ in „Neu“), und keine
  Spracheingabe in den nativen Apps (Spec 0015 ruht).
- Kein zusätzlicher Senden-Knopf in Feldern, deren Fenster oben eine Hauptaktion hat („Erzeugen“,
  „Vorschlag“): die Hauptaktion ist das Senden (Inhaber 27.11., Spec 0062).
- Kein automatisches Senden, wenn das Diktat von selbst endet oder „Ende“ gesagt wird (Spec 0040,
  AC-018 bleibt: „Ende“ übernimmt nur in das Feld).

## Anforderungen

**REQ-001 — Senden beendet das Diktat und schickt alles.** Tippe ich während des Diktats auf
Senden oder die Hauptaktion des Fensters, endet das Diktat; die App wartet auf das Endergebnis der
letzten Äußerung (höchstens 1,5 s), fügt es an der Cursorstelle ein und sendet den ganzen Text
genau einmal. Quelle: Wunsch 27.11. Offline: nur online (Diktat und KI brauchen Netz).

- AC-001: Angenommen „Neu“ › „KI-Rezept“, das Diktat läuft und das Feld zeigt „Omas Apfelkuchen“ ·
  Wenn ich „Erzeugen“ tippe und danach das Endergebnis „Omas Apfelkuchen mit Streuseln“ kommt ·
  Dann bekommt die KI genau einmal „Omas Apfelkuchen mit Streuseln“
- AC-002: Angenommen im Feld steht getippt „Apfelkuchen“, der Cursor am Ende, und ich diktiere „mit
  Streuseln“ · Wenn ich „Erzeugen“ tippe · Dann bekommt die KI „Apfelkuchen mit Streuseln“
- AC-003: Angenommen das Diktat zeigt „Linsen statt“ und das Endergebnis kommt nicht · Wenn ich
  „Anpassen“ tippe · Dann geht nach 1,5 s „Linsen statt“ raus, ohne Hinweis
- AC-004: Angenommen das Feld ist leer und das Diktat läuft · Dann ist „Erzeugen“ tippbar · Wenn
  ich tippe und das Endergebnis „Pizzateig mit Hefe“ kommt · Dann bekommt die KI „Pizzateig mit
  Hefe“
- AC-005: Angenommen das Feld ist leer und das Diktat hat nichts erkannt · Wenn ich „Erzeugen“ tippe
  · Dann geht nichts raus, das Diktat ist aus, und unter dem Feld steht „Nichts verstanden – sprich
  noch einmal oder tippe.“
- AC-006: Angenommen das Diktat läuft · Wenn ich „Anpassen“ zweimal schnell hintereinander tippe ·
  Dann geht die Anfrage genau einmal raus
- AC-007: Angenommen das Diktat zeigt „Linsen statt“ · Wenn die Spracheingabe beim Abschluss abbricht
  (Netz weg) · Dann geht „Linsen statt“ raus, und ein Hinweis sagt „Die Spracheingabe brach ab –
  gesendet ist, was bis dahin ankam.“
- AC-008: Angenommen ich habe während des Diktats „Anpassen“ getippt und die letzten Worte sind noch
  unterwegs · Wenn ich das Fenster schließe · Dann geht nichts raus, und das Mikrofon ist aus
- AC-009: Angenommen das Mikrofon startet noch (Freigabe-Frage offen) und im Feld steht „Apfelkuchen“
  · Wenn ich „Erzeugen“ tippe · Dann startet das Diktat nicht mehr, und die KI bekommt „Apfelkuchen“
- AC-010: Angenommen das Mikrofon ist verweigert · Dann steht der Hinweis aus Spec 0040, AC-009 unter
  dem Feld, und „Erzeugen“ sendet den getippten Text wie ohne Diktat
- AC-011: Angenommen ich bin offline · Dann gibt es kein Mikrofon, und Senden ist gesperrt mit
  „Offline – zum Bearbeiten brauchst du Netz“ wie bisher

**REQ-002 — Überall gleich.** Jedes KI-Eingabefeld mit Mikrofon sendet nach REQ-001, mit einem
gemeinsamen Ablauf: „Was soll ins Rezept?“ („Erzeugen“ in „Neu“, „Ausfüllen“ in „Mit KI
ausfüllen“), „Was soll anders sein?“ („Vorschlag“ in „Mit KI ändern“), „Was soll noch anders
sein?“ („Anpassen“ im Vorschlag), „Was soll das Bild zeigen?“ („Erzeugen“ im Foto-Fenster), „Was
soll anders sein?“ unter den Fotovorschlägen („Neu generieren“), „Im Web suchen“ („Suchen“) und der
Assistent („Senden“). Quelle: Wunsch 27.11. Offline: nur online.

- AC-012: Angenommen „Mit KI ändern“ ist offen und ich diktiere „Füg eine vegane Variante hinzu“ ·
  Wenn ich „Vorschlag“ tippe · Dann bekommt die KI „Füg eine vegane Variante hinzu“
- AC-013: Angenommen das Foto-Fenster › „KI“ und ich diktiere „Apfelkuchen von oben“ · Wenn ich
  „Erzeugen“ tippe · Dann geht der Bild-Wunsch „Apfelkuchen von oben“ raus
- AC-014: Angenommen „Websuche“ und ich diktiere „Linsensuppe“ · Wenn ich „Suchen“ tippe · Dann sucht
  die App nach „Linsensuppe“

**REQ-003 — Mikrofon und Senden nebeneinander.** Während des Diktats zeigt das Mikrofon seinen
aktiven Zustand, und das Senden daneben (im Composer) bzw. die Hauptaktion bleibt tippbar, auch bei
leerem Feld. Der zweite Tipp aufs Mikrofon und „Ende“ übernehmen wie bisher nur ins Feld. Quelle:
Wunsch 27.11., DESIGN.md „Senden“. Offline: nur online.

- AC-015: Angenommen der Vorschlag ist offen und ich diktiere in „Was soll noch anders sein?“ · Dann
  ist das Mikrofon gefüllt mit dem Namen „Diktat beenden“, und „Anpassen“ rechts daneben ist tippbar
- AC-016: Angenommen das Diktat zeigt „Linsen statt Tofu“ · Wenn ich das Mikrofon noch einmal tippe ·
  Dann steht „Linsen statt Tofu“ im Feld, und nichts geht raus (Spec 0040, AC-008 unverändert)

## Entscheidungen

1. **Ein Ablauf an einer Stelle.** `packages/core/src/prompt-send.ts`: die Zustandsmaschine
   `promptSendStep` (bereit → schließt ab → gesendet) und `finalizeDictation` (Endergebnis oder nach
   1,5 s das Gezeigte). In der App setzt `usePromptDictation` sie um; `DictationField` und der
   Assistent zeigen sie nur an. Gesendet wird erst nach dem Neuzeichnen mit dem eingefügten Text,
   so liest jede vorhandene Sende-Funktion den ganzen Text, ohne umgebaut zu werden.
2. **1,5 s Wartezeit** (`DICTATION_FINALIZE_MS`): Der Dienst liefert das Endergebnis meist in
   unter einer Sekunde; länger wirkt Senden träge. Danach gilt das zuletzt Gezeigte (vorläufige
   Wörter eingeschlossen) – das ist fast immer derselbe Text, darum ohne Hinweis (AC-003). Gilt
   auch für den zweiten Mikrofon-Tipp, „Ende“ und die Einkaufsliste, die bisher ohne Grenze
   warteten.
3. **Abbruch beim Abschluss** (AC-007): gesendet wird, was da ist; der Hinweis kommt als Toast, weil
   manche Fenster nach dem Senden schließen.
4. **Doppelter Tipp** (AC-006): Nach dem ersten Tipp werden weitere ignoriert, bis gesendet ist; der
   Knopf bleibt dabei unverändert, damit nichts flackert (≤ 1,5 s).
5. **Schließen und Reiterwechsel** brechen das Diktat ab und verwerfen ein wartendes Senden
   (AC-008), wie bisher beim Schließen während des Diktats.
6. **Senden beim Starten** (AC-009): Das halb gestartete Diktat wird verworfen, gesendet wird der
   Feldtext – die Person hat noch nichts gesagt.
7. **Assistent:** Diktierte Worte kommen jetzt an die Cursorstelle wie in den anderen Feldern, statt
   den getippten Text zu ersetzen; Senden bleibt während des Diktats tippbar. Der Assistent ist mit
   `features.ai = false` ausgeblendet, darum nur per Typprüfung und Lint geprüft.
8. Tastatur-Senden (Enter, „Senden“ der Tastatur) läuft denselben Weg; während des Diktats ist das
   Feld nur lesbar (Spec 0040, Entscheidung 6), Enter sendet also meist erst danach.

## Daten

Keine Änderung. Gesendet wird derselbe Text wie beim Tippen; der Sprachdienst bekommt wie bisher
nur das Mikrofon. Entfällt: nichts.

## Umsetzung

- [x] 1. `packages/core`: `promptSendStep`, `finalizeDictation`, Tests rot → grün mit falschen Uhren
      (AC-001, AC-003 – AC-009)
- [x] 2. `useDictation`: `stop()` mit Wartezeit und Ergebnisart, `cancel()` auch beim Starten,
      Abbruch beim Abschluss (AC-003, AC-007, AC-009)
- [x] 3. `usePromptDictation` + `DictationField` umgestellt (AC-001, AC-002, AC-004, AC-005,
      AC-010, AC-015, AC-016)
- [x] 4. Felder: KI-Rezept, Mit KI ausfüllen/ändern, Vorschlag-Composer, Foto-Fenster,
      Fotovorschläge, Websuche, Assistent (AC-012 – AC-014)
- [x] 5. e2e `e2e/senden-waehrend-diktat-0068.spec.ts` mit falschem Sprachdienst (`fakeSpeech` mit
      `finalOnStop`: AC-001 – AC-006, AC-012, AC-014 – AC-016)
- [x] Nachweis: `pnpm format:check && pnpm check` grün; Web-Export gebaut; `prompt-send.test.ts`
      erst rot (15/15), dann grün; die e2e-Datei gegen den App-Code von `develop` rot (6 von 7, nur
      AC-016 grün – das Verhalten bleibt), mit dieser Änderung 7/7 grün (lokal, `E2E_SKIP_RESET=1`),
      auch gegen den Dev-Server (React-Warnungen machen den Test rot). `pnpm e2e:dev` ohne
      Datenbank-Reset: kein React-Fehler; rot nur an Stellen, die eine frische Datenbank brauchen
      (Packliste, Zeiten).
      AC-007 – AC-009 sind über die Zustandsmaschine und `finalizeDictation` in `core` geprüft;
      AC-010 und AC-011 sind unverändertes Verhalten (Spec 0040, AC-009; Offline-Sperre); AC-013
      läuft über denselben Ablauf, ohne eigenen e2e-Test. Echte Sprache auf iPhone und Android prüft Enrico (der Simulator hat
      kein Mikrofon).
