---
status: freigegeben # entwurf | freigegeben | umgesetzt | verworfen
datum: 2026-11-27
---

# 0065 — KI-Rezept: Foto der Quelle aus der Websuche

**Quelle:** Enrico, 27.11.2026 („im ki-rezept -> bild generieren über websuche“), ausgelegt wie
unter Entscheidung 1. **Kritischer Pfad:** nein. Kein Schema, keine neuen Secrets; der Server
lädt nur die Seiten, die die Websuche ohnehin liest (SSRF-Schutz `fetchPublic`, Spec 0055).

## Ziel

Wer im Fenster „Neu“ auf „KI-Rezept“ oder in „Mit KI ändern“ die Websuche einschaltet, bekommt das
Foto einer gefundenen Rezeptseite, statt auf drei KI-Bilder zu warten. Wie in der Vorschau der
Websuche (Spec 0049, REQ-010) wählt man „Original · KI-Bild · Keins“; hat keine Quelle ein Foto,
macht die KI wie bisher drei Vorschläge. Ohne Websuche bleibt alles wie heute.

## Nicht-Ziele

- **Keine eigene Bildsuche:** kein Bild-Suchdienst, kein zusätzlicher Suchaufruf, kein Abruf
  weiterer Seiten nur für ein Foto.
- **Keine Foto-Vorschau vor dem Erzeugen:** Welche Quelle ein Foto hat, weiß man erst mit der
  Antwort; „KI-Rezept“ öffnet weiter direkt die Bearbeitung (Spec 0062).
- **Die Seite des Fotos wird kein Link des Rezepts** (Entscheidung 5).
- Der Reiter „Websuche“ und seine Treffer-Vorschau bleiben, wie sie sind.

## Schon erledigt

- Die Websuche als Kontext liest bis zu 2 Trefferseiten mit `readPage`, das auch ihr Foto
  (JSON-LD-Bild, sonst `og:image`) bestimmt — es ging bisher verloren
  (`supabase/functions/ai-recipe-draft/handler.ts`, `webContext`).
- Das Foto eines eigenen Links ohne „Foto generieren“ (`draftPagePhotoUrl`, Spec 0049 AC-042) und
  die Foto-Wahl „Original · KI-Bild · Keins“ der Websuche (`web-search-panel.tsx`, Spec 0049
  REQ-010) gibt es; beides wird wiederverwendet.

## Anforderungen

**REQ-001 — Foto der Websuche zurückgeben.** Mit `webQuery` gibt `ai-recipe-draft` das Foto der
ersten gelesenen Trefferseite, die eins hat, als `webPhotoUrl` zurück, sonst das Bild des ersten
Rezept-Treffers, der eins hat; nur `https`. Quelle: Enrico. Offline: nur online (KI, Websuche).

- AC-001: Angenommen die Websuche liest zwei Seiten und nur die zweite hat ein `og:image` · Wenn
  der Entwurf kommt · Dann ist `webPhotoUrl` dieses Foto
- AC-002: Angenommen keine gelesene Seite hat ein Foto, ein Rezept-Treffer bringt aber ein Bild
  mit · Dann ist `webPhotoUrl` dieses Bild
- AC-003 (Rand): Angenommen kein Treffer hat ein `https`-Foto, die Suche ist nicht erreichbar oder
  es gibt keine `webQuery` · Dann fehlt `webPhotoUrl`

**REQ-002 — Foto-Wahl mit Websuche.** Ist „Websuche“ an, steht statt des Schalters „Foto
generieren“ (bzw. des Chips „Bild“ in „Mit KI ändern“) die Foto-Wahl der Websuche „Foto: Original
· KI-Bild · Keins“ mit einem Satz, was die Wahl bewirkt. Vorgabe ist „Original“; hat das Rezept in
„Mit KI ändern“ schon ein Foto, „Keins“ (Entscheidung 4). Websuche aus: Schalter bzw. Chip wie
bisher. Quelle: Enrico. Offline: nur online.

- AC-004: Angenommen „Neu“, Reiter „KI-Rezept“ · Wenn ich „Websuche“ einschalte · Dann steht dort
  „Foto: Original · KI-Bild · Keins“ mit „Original“ gewählt und kein Schalter „Foto generieren“;
  schalte ich sie aus, steht wieder der Schalter da
- AC-005: Angenommen ✨ „Mit KI ändern“ eines Rezepts mit Foto · Wenn ich den Chip „Web“ wähle ·
  Dann ist der Chip „Bild“ weg und die Foto-Wahl zeigt „Keins“

**REQ-003 — Was die Wahl bewirkt.** Quelle: Enrico, Spec 0049 AC-035. Offline: nur online.

- AC-006: Angenommen „Original“ und ein Foto (zuerst das eines eigenen Links, sonst `webPhotoUrl`)
  · Wenn der Entwurf kommt · Dann bekommt das Rezept dieses Foto und die KI macht keine Bilder
- AC-007: Angenommen „Original“ und kein Foto, oder das Foto lässt sich nicht laden · Dann macht
  die KI drei Vorschläge wie mit „Foto generieren“
- AC-008: Angenommen „KI-Bild“ · Dann macht die KI drei Vorschläge und kein Seitenfoto wird
  genommen; „Keins“ · Dann bekommt das Rezept kein Foto, auch nicht das eines eigenen Links
- AC-009: Angenommen Websuche an · Wenn „Erzeugen“ gesendet wird · Dann bittet die App bei
  „Original“ und „KI-Bild“ um einen Bild-Prompt, bei „Keins“ nicht
- AC-010 (Rand): Angenommen Websuche aus · Dann gilt „Foto generieren“ wie bisher, auch das Foto
  eines eigenen Links bei ausgeschaltetem Schalter (Spec 0049, AC-042)

## Entscheidungen

1. OFFEN: Der Rohtext „bild generieren über websuche“ wird als „Foto der Quelle aus der
   vorhandenen Websuche“ gelesen, nicht als eigene Bildsuche oder als KI-Bild nach einem
   Suchtreffer. Gebaut wird diese Auslegung; Enrico bestätigt oder korrigiert sie.
2. Die Wahl fällt vor „Erzeugen“, ohne Zwischenschritt, weil „KI-Rezept“ direkt die Bearbeitung
   öffnet (Spec 0062). „Original“ heißt darum „Foto der Quelle, wenn es eins gibt, sonst KI“ —
   genau wie `effectiveWebPhotoChoice` in der Websuche (Spec 0049, AC-035).
3. Bei „Original“ bestellt die App den Bild-Prompt mit (er kommt im selben Modellaufruf, kostet
   nichts extra); Bilder macht die KI nur, wenn kein Foto da ist.
4. „Mit KI ändern“ eines Rezepts mit Foto startet mit „Keins“, wie der Chip „Bild“ dort aus
   startet (Spec 0055, REQ-005): ein Änderungswunsch tauscht das Foto nicht ungefragt.
5. Die Seite des Fotos wird nicht als Link gespeichert: Das Rezept schreibt die KI aus mehreren
   Treffern, es ist nicht das Rezept dieser Seite. OFFEN, ob Enrico die Fotoquelle als Link möchte.
6. Seitenfoto vor Trefferbild: Die Bilder der Suchtreffer sind oft nur Vorschaubilder.
7. „Keins“ mit Websuche heißt wirklich kein Foto; ohne Websuche bleibt Spec 0049 AC-042
   unverändert.
8. `webPhotoUrl` ist ein neues, optionales Antwortfeld. Eine beim Release noch offene alte App
   lehnt es bei eingeschalteter Websuche ab (strenges Schema) und meldet „nicht erreichbar“, bis
   sie neu lädt — hingenommen wie bei Spec 0055 (`webContext`) und 0064 (`youtube`).

## Daten

Kein Schema. `RecipeDraftReplySchema` bekommt `webPhotoUrl` (optional, `https`). Das Foto wird
über `fetch-image` geladen und erst mit „Speichern“ am Rezept gespeichert (Weg wie Spec 0049).

## Umsetzung

- [x] 1. Vertrag `webPhotoUrl`; `ai-recipe-draft` gibt es zurück (AC-001 – AC-003), Edge-Tests rot → grün
- [x] 2. `draftPhotoPlan` in `core` (AC-006 – AC-010), Vitest rot → grün
- [x] 3. `useAiFill`: Foto-Wahl mit Websuche, Bild-Prompt danach (AC-009); „Neu“ und „Mit KI
      ändern“ nutzen den Plan (AC-006 – AC-008)
- [x] 4. `AiFillFields`: Foto-Wahl der Websuche (wiederverwendet) statt Schalter/Chip (AC-004, AC-005)
- [x] 5. e2e `e2e/ki-rezept-foto-der-quelle-0065.spec.ts` (geschrieben, läuft beim Mergen)
- [ ] Nachweis: `pnpm format:check && pnpm check && pnpm build:web` grün
