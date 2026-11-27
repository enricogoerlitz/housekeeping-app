---
status: freigegeben # entwurf | freigegeben | umgesetzt | verworfen
datum: 2026-11-26
---

# 0052 — Bild-Prompt aufbereiten: aus einem kurzen Wunsch drei gute Bilder

**Quelle:** Enrico, 26.11.2026 (Review 0003): „Generell beim Foto-Prompt sollte das LLM den
User-Prompt aufnehmen und in einen besseren Prompt für die Bildgenerierung verwandeln. Aber einmal
für die drei Vorschläge! Nicht zig Calls.“ Gute Bilder auch aus „Frau in Boulderhalle“,
„Eislaufen im Sportforum“ oder „pasta“. Das Feedback ist die Freigabe. **Kritischer Pfad:** ja:
Edge Function `ai-image` schickt Wunsch und Kontext zusätzlich an das Sprachmodell in Azure.

## Ziel

Ich tippe zwei, drei Wörter auf Deutsch, und die drei Bilder zeigen genau das, schön fotografiert
und doch verschieden (Blickwinkel, Bildaufbau, Licht). Ein Rezeptfoto sieht nach Food-Fotografie
aus, ein Restaurant oder eine Aktivität nach einem einladenden echten Ort. Personen sind nur auf
dem Bild, wenn ich welche will. „Neu generieren“ mit „heller und mit Basilikum“ ändert genau das.

## Nicht-Ziele

- Kein Chat, keine Vorschau des aufbereiteten Prompts in der App, kein Bearbeiten davon.
- Kein anderes Bildmodell, keine anderen Stil-Chips, keine Änderung am Ablauf des Foto-Fensters
  oder der Fotovorschläge (Spec 0039, 0040, 0045).
- Kein Kontingent (bleibt wie Spec 0040, Entscheidung 2); keine Datenbankänderung.
- Keine Websuche (Spec 0049 ruft `ai-image` mit Wunsch und Kontext auf, baut aber selbst).

## Anforderungen

„Wunsch“ = der Text im Feld „Was soll das Bild zeigen?“ (Foto-Fenster, Reiter „KI“) bzw. der
Bild-Prompt des Entwurfs (Spec 0045); „Zusatz“ = „Was soll anders sein?“ bei „Neu generieren“.
Alles ist **nur online**; offline bleiben die Knöpfe deaktiviert mit dem üblichen Hinweis.

**REQ-001 — Ein Aufbereitungsschritt für drei Bilder.** `ai-image` macht aus Wunsch, Kontext,
Stil-Chips, Zusatz und dem Hinweis „Aus diesem Foto“ mit **einem** Aufruf des Sprachmodells
drei verschiedene englische Prompts für FLUX.2-pro und erzeugt damit drei Bilder parallel. Jeder
Prompt verbietet Text, Schrift, Logos und Wasserzeichen. Offline: nur online.

- AC-001: Angenommen Wunsch „Frau in Boulderhalle“ für die Aktivität „Bertablock“ · Wenn ich
  „Erzeugen“ tippe · Dann geht genau ein Aufruf an das Sprachmodell und drei an das Bildmodell,
  jeder mit einem anderen der drei Prompts
- AC-002: Angenommen das Rezept „Linsen-Dal“ mit den Hauptzutaten „Rote Linsen“, „Kokosmilch“ und
  Stil „Von oben“ · Wenn ich „von oben, rustikal“ erzeuge · Dann bekommt das Sprachmodell „Rezept“,
  „Linsen-Dal“, beide Zutaten, den Stil und den Wunsch
- AC-003: Angenommen das Sprachmodell liefert einen Prompt ohne Verbot von Text · Dann endet jeder
  Prompt an das Bildmodell trotzdem mit „No text, letters, logos or watermarks.“
- AC-004: Angenommen „Aus diesem Foto“ mit „Text entfernen“ · Dann erfährt das Sprachmodell nur,
  dass es ein Foto gibt (Entscheidung 7), und alle drei Aufrufe des Bildmodells bekommen das Foto
  als Vorlage

**REQ-002 — Nie schlechter als vorher.** Scheitert die Aufbereitung (Fehler, ungültige Antwort,
länger als 6 s), entstehen die drei Bilder aus dem direkten Prompt wie bisher (Spec 0040); die
Antwort ist kein Fehler. Die 30-s-Grenze für die Antwort (Spec 0040, AC-012) zählt ab der Anfrage,
die 45 s je Bild bleiben. Offline: nur online.

- AC-005: Angenommen das Sprachmodell antwortet mit 500 · Wenn ich „Pasta“ erzeuge · Dann kommen
  drei Bilder aus dem direkten Prompt, der „Pasta“ enthält
- AC-006: Angenommen das Sprachmodell antwortet nach 6 s noch nicht · Dann wird es abgebrochen,
  und die Bilder entstehen aus dem direkten Prompt
- AC-007: Angenommen die Aufbereitung dauert 4 s und ein Bild hängt · Dann kommt die Antwort 30 s
  nach der Anfrage mit den zwei fertigen Bildern

**REQ-003 — Kontext aus der App.** Das Foto-Fenster schickt mit, wofür das Bild ist: Rezept
(Titel, bis zu drei Hauptzutaten, Beschreibung), Sammlung (Titel), Restaurant (Name, Küche) oder
Aktivität (Name, Art, Ort, Beschreibung). Die Fotovorschläge des Entwurfs schicken Titel und
Beschreibung des Entwurfs. Offline: nur online.

- AC-008: Angenommen das Restaurant „Mutzenbacher“ mit der Küche „Österreichisch“ · Dann ist der
  Kontext „Restaurant“, „Mutzenbacher“, Kategorie „Österreichisch“
- AC-009: Angenommen die Aktivität „Bertablock“ mit der Art „Bouldern“ und dem Ort „Berta Block
  Boulderhalle“ · Dann ist der Kontext „Aktivität“, „Bertablock“, Kategorie „Bouldern“, Ort
  „Berta Block Boulderhalle“
- AC-010: Angenommen ein Kontext mit unbekannter Art „Hotel“ oder ein Zusatz über 300 Zeichen ·
  Dann antwortet `ai-image` mit 400, und kein Modell wird aufgerufen

**REQ-004 — „Neu generieren“: der Zusatz zählt.** Der Zusatz geht als eigenes Feld an `ai-image`,
das Sprachmodell setzt ihn vor alles andere um; ohne Aufbereitung steht er am Ende des direkten
Prompts. Offline: nur online.

- AC-011: Angenommen Fotovorschläge für „Spaghetti mit Bällchen in Tomatensoße“ · Wenn ich „heller
  und mit Basilikum“ eingebe und „Neu generieren“ tippe · Dann geht der Bild-Prompt des Entwurfs
  als Wunsch und „heller und mit Basilikum“ als Zusatz an `ai-image`
- AC-012: Angenommen der Zusatz „heller und mit Basilikum“ und das Sprachmodell ist nicht
  erreichbar · Dann endet der Wunsch im direkten Prompt mit „heller und mit Basilikum“

**REQ-005 — Qualität aus wenig Eingabe.** Auftrag und Antwortformat sind gegen die echte KI mit
sechs Fällen geprüft (Entscheidung 6): Rezepte als Food-Fotografie, Orte als einladendes echtes
Foto, Personen nur auf Wunsch, die drei Bilder sichtbar verschieden. Offline: nur online.

- AC-013: Angenommen „pasta“ für das Rezept „Spaghetti mit Bällchen in Tomatensoße“ gegen die
  echte KI · Dann zeigen alle drei Bilder Spaghetti mit Bällchen in Tomatensoße, ohne Text und
  ohne Personen, in drei verschiedenen Bildaufbauten
- AC-014: Angenommen „Frau in Boulderhalle“ für die Aktivität „Bertablock“ gegen die echte KI ·
  Dann zeigt jedes Bild eine Frau in einer Boulderhalle

## Entscheidungen

1. Agent, 26.11. (Enrico unterwegs): **Ein Aufruf, strukturierte Antwort** `{ scene, shots: [3] }`
   über die Responses API (`callFoundry`); jeder Prompt ist Szene + eine Einstellung (Blickwinkel,
   Ausschnitt, Licht). Die Szene nur einmal zu schreiben halbiert die Ausgabe (≈ 150 statt ≈ 290
   Tokens). Dazu `reasoning.effort = none` (gleiche Güte, 2,1–3,2 s statt 2,8–4,8 s),
   `max_output_tokens` 600, ein Versuch, 6 s Frist. Danach drei FLUX-Aufrufe parallel wie bisher.
2. Agent, 26.11.: **Auch der Bild-Prompt des Entwurfs wird aufbereitet** (statt ihn direkt zu
   nehmen): sonst bekämen alle drei Vorschläge denselben Prompt und sähen fast gleich aus, und
   der Zusatz von „Neu generieren“ hinge nur hinten dran. Der Entwurf-Prompt ist der Wunsch,
   Titel und Beschreibung des Entwurfs der Kontext.
3. Agent, 26.11.: **Zusatz als eigenes Feld `extra`** (≤ 300 Zeichen, wie das Feld in der App)
   statt an den Prompt gehängt; ersetzt Spec 0045, AC-019 (das Kürzen entfällt, Wunsch ≤ 1000 und
   Zusatz ≤ 300 gehen immer raus). `imagePromptWithExtra` entfällt.
4. Agent, 26.11.: **Vertrag** (`AiImageRequestSchema` in `packages/core/src/ai-contract.ts`),
   abwärtskompatibel, alle neuen Felder optional. Neu: `extra` (≤ 300) und `context` mit `kind`
   (`IMAGE_SUBJECTS`: `recipe`, `collection`, `restaurant`, `activity`), `title` (≤ 200),
   `ingredients` (≤ 8 × 80), `description` (≤ 600), `category` (≤ 80: Küche des Restaurants bzw.
   Art der Aktivität), `place` (≤ 200: Name des Orts). Spec 0049 (Websuche) nutzt dieselben Arten.
   Die Antwort bleibt `{ images, failed }`; die Bausteine je Eintrag stehen in
   `packages/core/src/image-context.ts`.
5. Agent, 26.11.: **Feste Leitplanken im Code**, nicht nur im Auftrag: der Satz aus AC-003 an jedem
   Prompt; bei „Aus diesem Foto“ bekommen alle drei Aufrufe das Foto. Ob Personen aufs Bild
   kommen, entscheidet das Sprachmodell aus dem Wunsch (der direkte Prompt verbietet sie weiter).
6. Agent, 26.11.: **Probe gegen die echte KI** (Skript `tmp/review-0003/0052/probe.ts`, höchstens
   24 FLUX-Aufrufe): „Frau in Boulderhalle“ (Aktivität „Bertablock“), „Eislaufen im Sportforum“
   (Aktivität), „pasta“ (Rezept „Spaghetti mit Bällchen in Tomatensoße“), „gemütlich“
   (Restaurant „Mutzenbacher“, österreichisch), „von oben, rustikal“ (Rezept „Linsen-Dal“) und
   „Neu generieren“ mit „heller und mit Basilikum“; vorher je ein Bild mit dem direkten Prompt.
   Ergebnis in `tmp/review-0003/0052/ERGEBNIS.md`.
7. Agent, 26.11. (beim Bau): **Das Foto von „Aus diesem Foto“ geht nicht an das Sprachmodell**,
   nur der Hinweis, dass es eines gibt. FLUX bekommt das Foto selbst; mit Foto brauchte das
   Sprachmodell in der Probe 4,9 s statt 2,3 s, und die Bearbeitungsanweisung war ohne Foto
   gleich brauchbar („behalte Gericht und Anordnung, entferne Text …“).
8. Agent, 26.11. (beim Bau): Orte werden beschrieben statt benannt („modern indoor bouldering
   gym“ statt „Bertablock“): das Bildmodell kennt die Orte nicht, und Namen locken Schrift ins Bild.

## Daten

Keine Schemaänderung, nichts wird gespeichert. Neu an Azure (Sprachmodell): Wunsch, Zusatz,
Stil-Chips, Kontext (Titel, Hauptzutaten, Beschreibung, Küche/Art, Ortsname) — dieselbe
Azure-Ressource, an die Wunsch und Foto schon gingen; keine Adresse, keine Notiz, kein Foto.

## Risiken

| Risiko                                 | Gegenmaßnahme                                                                                      | Test                 |
| -------------------------------------- | -------------------------------------------------------------------------------------------------- | -------------------- |
| Aufbereitung scheitert oder hängt      | Rückfall auf den direkten Prompt, 6 s Frist, ein Versuch                                           | AC-005, AC-006       |
| Längere Gesamtzeit                     | 30-s-Grenze ab Anfrage; Messung der Aufbereitung                                                   | AC-007, Probe        |
| Modell liefert Unsinn / zu lange Texte | zod-Vertrag (Szene ≤ 1000, genau 3 Einstellungen ≤ 500 Zeichen), sonst Rückfall                    | AC-001, AC-005       |
| Prompt-Injection über den Wunsch       | Wunsch und Kontext als Daten markiert; Ausgabe geht nur an FLUX; Leitplanken im Code               | AC-003, Handler-Test |
| Abgemeldet / fremder Haushalt          | unverändert: JWT + Mitgliedschaft vor jedem Modellaufruf                                           | 401/403-Tests        |
| Ungültige Eingabe                      | zod: unbekannte Art, Zusatz > 300, Zutaten > 8 → 400 vor jedem Aufruf                              | AC-010               |
| Mehr Kosten je Erzeugung               | ein kleiner LLM-Aufruf je Erzeugung; Limit in Azure (Spec 0040, Entscheidung 2)                    | Probe misst Tokens   |
| Beschreibung geht an das Sprachmodell  | `/security-check` 26.11. (Hinweis): Freitext des Haushalts, gekürzt auf 600 Zeichen                | akzeptiert           |
| Fehlkonfiguration fällt nicht auf      | `/security-check` (Hinweis): fehlt das LLM, greift still der Rückfall; Log `image_prompt_fallback` | akzeptiert           |
| Längste Antwortzeit                    | `/security-check` (Hinweis): 6 s + 45 s je Bild = 51 s, die App wartet 55 s                        | akzeptiert           |

## Umsetzung

- [x] 1. Vertrag `AiImageRequestSchema` mit `context` und `extra`; Kontext-Bausteine in core
      (AC-008–AC-010)
- [x] 2. `ai-image`: Aufbereitung (Auftrag, Schema, Leitplanken, Rückfall, Frist) (AC-001–AC-007,
      AC-012)
- [x] 3. App: Foto-Fenster schickt den Kontext, Fotovorschläge Kontext und Zusatz (AC-008, AC-009,
      AC-011)
- [x] 4. Probe gegen Foundry und FLUX (AC-013, AC-014)
- [x] Nachweis (26.11.): `pnpm format:check && pnpm check && pnpm build:web` grün (Build mit
      `node scripts/with-env.mjs`). Rot → grün: core `image-context.test.ts` (AC-002, AC-008–AC-011);
      edge `ai-image/prompts.test.ts`, `ai-image/handler.test.ts` (AC-001, AC-003–AC-007, AC-010,
      AC-012; AC-007 war schon vorher grün und sichert die Zählung ab Anfrage),
      `_shared/foundry.test.ts` (`reasoning.effort`); api `ai-recipes.backend.test.ts` (AC-011).
      `imagePromptWithExtra` samt Tests entfernt (Entscheidung 3). Probe (`tmp/review-0003/0052/`,
      `ERGEBNIS.md`): 23 FLUX-Aufrufe, ≈ 40 LLM-Aufrufe; Aufbereitung 2,1–2,9 s, gesamt 8–9,5 s
      je Erzeugung, ≈ 850 Tokens ein, ≈ 150 aus. Vorher gingen „pasta“ (ohne Bällchen), „von oben,
      rustikal“ (kein Dal), „gemütlich“ (Wohnzimmer) und „Eislaufen im Sportforum“ (leere Halle mit
      Croissants) daneben; nachher treffen alle sechs Fälle (AC-013, AC-014), „Neu generieren“ mit
      „heller und mit Basilikum“ ist sichtbar heller mit Basilikum. App auf :8098 (Playwright,
      Antworten gemockt): Aktivität „Bouldern“ schickt `context` mit Art und Beschreibung, „Neu
      generieren“ schickt `extra` getrennt (AC-009, AC-011). `/security-check`: 0 kritisch/hoch/
      mittel/niedrig, 3 Hinweise (Risiken).
