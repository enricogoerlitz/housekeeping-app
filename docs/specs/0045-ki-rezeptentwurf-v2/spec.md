---
status: freigegeben # entwurf | freigegeben | umgesetzt | verworfen
datum: 2026-11-26
---

# 0045 — KI-Rezeptentwurf v2: Varianten, Beschreibung, Schlagworte, Foto-Ladeanzeige

**Quelle:** Enricos Vorschau-Feedback vom 26.11.2026 abends (Batch 3) zu Spec 0040: „es sollte
auch immer ne Beschreibung kommen und die Schlagwörter … 2 bis max 5“, „er erzeugt keine Varianten
sondern schreibt einfach alle Zutaten roh runter“, „mit wenig Input wie ‚ich will meat ball pasta‘
sollte was Geiles rauskommen“, „nicht leeres Foto anzeigen, sondern eine Animation wie Pochen“,
„statt ‚Keins davon‘ eher ‚Neu generieren‘ und extra Prompt geben können“. Das Feedback ist die
Freigabe. **Kritischer Pfad:** ja: Edge Function mit Daten an Azure (unverändert gegenüber 0040).

## Ziel

Aus einem halben Satz wie „ich will meatball pasta“ entsteht ein vollständiges, gutes Rezept, wie
wir es selbst anlegen würden: Beschreibung, passende Schlagworte aus unseren eigenen, Zutaten in
Gruppen („Für die Bällchen“, „Für die Soße“), echte Varianten (z. B. „Mit Rinderhack“ /
„Vegetarisch“) mit eigenen Zutaten und Schritten, sinnvolle Mengen, Zeit und Portionen. Während
die Fotos entstehen, sieht man, dass etwas passiert, und gefällt keins, lasse ich neu erzeugen und
sage dabei, was anders sein soll.

## Nicht-Ziele

- Keine Vergleichsansicht (Diff) „vorher/nachher“ im Bearbeitungsmodus — kommt mit der
  Websuche-Spec. Der Entwurf bleibt so geformt, dass ein Diff später daraus berechnet werden kann.
- Keine Websuche, kein Chat, kein Speichern ohne „Speichern“ (bleibt wie 0040).
- Keine Änderung an Bildmodell, Stil-Chips und Foto-Fenster-Ablauf außer Ladeanzeige (REQ-005).
- Keine Datenbankänderung.

## Anforderungen

„Entwurf“ = Ergebnis von „Mit KI ausfüllen“ (Spec 0040, REQ-001). Alle KI-Funktionen sind **nur
online**; offline bleiben die Knöpfe deaktiviert mit dem üblichen Hinweis.

**REQ-001 — Immer eine Beschreibung.** Jeder Entwurf bringt eine Beschreibung von 1–3 Sätzen mit,
die im Feld „Beschreibung“ steht. Offline: nur online.

- AC-001: Angenommen Eingabe „ich will meatball pasta“ · Wenn ich „Ausfüllen“ tippe · Dann steht
  im Bearbeitungsmodus unter „Beschreibung“ ein Text
- AC-002: Angenommen das Rezept hat schon die Beschreibung „Omas Rezept“ · Wenn ich auf seiner
  Seite „Ergänzen“ wähle · Dann bleibt „Omas Rezept“ stehen; mit „Ersetzen“ steht die neue da

**REQ-002 — Schlagworte aus unseren.** Die KI bekommt die Schlagworte des Haushalts und wählt 2–5,
bevorzugt vorhandene; neue sind erlaubt. Ein vorhandenes Schlagwort wird in der Schreibweise des
Haushalts übernommen; ein neues trägt im Bearbeitungsmodus den Zusatz „neu“. Offline: nur online.

- AC-003: Angenommen der Haushalt hat das Schlagwort „one pot“ · Wenn der Entwurf „One Pot“ wählt
  · Dann steht „one pot“ im Entwurf, ohne „neu“
- AC-004: Angenommen der Entwurf bringt 7 Schlagworte · Dann stehen die ersten 5 im Entwurf
- AC-005: Angenommen der Entwurf wählt „pasta“, das der Haushalt nicht hat · Dann trägt der Chip
  „pasta“ den Zusatz „neu“

**REQ-003 — Echte Varianten und Gruppen.** Hat ein Gericht naheliegende Varianten (Fleisch und
vegetarisch, verschiedene Beläge, süß oder herzhaft) oder zeigt die Quelle welche, legt der Entwurf
sie als Varianten an: gemeinsame Zutaten ohne Variante, abweichende Zutaten und Schritte je
Variante, die erste ist Standard. Zutaten stehen in Gruppen, wo das Gericht Teile hat. Offline: nur
online.

- AC-006: Angenommen der Entwurf hat die Varianten „Mit Rinderhack“ und „Vegetarisch“ · Dann hat
  der Entwurf diese zwei Varianten, „Mit Rinderhack“ ist Standard, „Rinderhackfleisch“ gehört nur
  zu ihr, „Spaghetti“ zu keiner
- AC-007: Angenommen ein Schritt gehört zur Variante „Vegetarisch“ · Dann ist er im Entwurf dieser
  Variante zugeordnet
- AC-008: Angenommen das Rezept hat schon die Variante „Vegetarisch“ · Wenn „Ergänzen“ eine Zutat
  für „vegetarisch“ bringt · Dann hängt sie an der vorhandenen Variante, es entsteht keine zweite
- AC-009: Angenommen ein Entwurf nennt bei einer Zutat eine Variante, die er nicht anlegt · Dann
  ist die Zutat eine gemeinsame Zutat
- AC-010: Angenommen „Ersetzen“ · Dann ersetzen die Varianten des Entwurfs die alten
- AC-011: Angenommen die Zutat hat die Gruppe „Für die Soße“ · Dann steht sie im Entwurf in dieser
  Gruppe

**REQ-004 — Qualität aus wenig Eingabe.** Der Auftrag an die KI und das Antwortformat sind so
gebaut, dass aus einem halben Satz ein vollständiges Rezept wird (Mengen für die Portionen,
Schritte mit Hitze, Zeit und Erkennungszeichen, Zeiten an Schritten als Timer, Vorlauf wo nötig),
geprüft gegen die echte KI mit fünf Eingaben (Entscheidung 3). Offline: nur online.

- AC-012: Angenommen „ich will meatball pasta“ gegen die echte KI · Dann hat der Entwurf
  Beschreibung, 2–5 Schlagworte, mindestens zwei Zutatengruppen, die Varianten Fleisch und
  vegetarisch und mindestens fünf Schritte
- AC-013: Angenommen ein Schritt sagt „10 Minuten köcheln“ · Wenn die KI dafür einen Timer von 10
  Minuten angibt · Dann hat der Schritt im Entwurf den Timer 10 Minuten
- AC-014: Angenommen die KI liefert ein Feld außerhalb der Grenzen (z. B. 0 Portionen) · Dann sagt
  die App „Die KI ist gerade nicht erreichbar. Deine Eingabe bleibt stehen.“ (wie 0040, AC-005)

**REQ-005 — Fotos pochen, solange sie entstehen.** Während Fotovorschläge (Entwurf) oder Varianten
(Foto-Fenster, Reiter „KI“) erzeugt werden, pochen die drei Kacheln sanft und zeigen ein
KI-Zeichen; bei „Bewegung reduzieren“ stehen sie still. Offline: nur online.

- AC-015: Angenommen „Foto generieren“ an · Wenn der Entwurf offen ist und die Fotos noch entstehen
  · Dann zeigen drei Kacheln die Ladeanzeige „Foto wird erzeugt“
- AC-016: Angenommen „Bewegung reduzieren“ ist an · Dann pocht keine Kachel

**REQ-006 — „Neu generieren“ mit Zusatzwunsch.** Unter den Fotovorschlägen ersetzt „Neu
generieren“ den Knopf „Keins davon“: ein optionales Feld „Was soll anders sein?“ und der Knopf
erzeugen drei neue Vorschläge aus dem Bild-Prompt des Entwurfs plus dem Zusatz. Offline: nur
online.

- AC-017: Angenommen drei Vorschläge sind da · Wenn ich „heller, von oben“ eingebe und „Neu
  generieren“ tippe · Dann geht der Bild-Prompt mit „heller, von oben“ an die KI, und drei
  Kacheln pochen
- AC-018: Angenommen ich habe einen Vorschlag übernommen · Wenn ich „Neu generieren“ tippe · Dann
  bleibt der übernommene Vorschlag das Foto, bis ich einen neuen übernehme
- AC-019: Angenommen Bild-Prompt und Zusatz sind zusammen länger als 1000 Zeichen · Dann wird der
  Zusatz gekürzt, und die Anfrage geht trotzdem raus

## Entscheidungen

1. Agent, 26.11. (Enrico unterwegs, ohne Rückfrage): **Antwortformat** — Varianten als Liste von
   Namen, Zutaten und Schritte tragen den Variantennamen oder keinen (wie das Datenmodell: gemeinsam
   oder je Variante). So bleibt die Kochreihenfolge der Schritte erhalten. Die Zuordnung
   Name → Variante macht die App (`draftToPageInput`). Der Entwurf bleibt namensbasiert, damit ein
   späterer Diff gegen das gespeicherte Rezept ohne Ids rechnen kann.
2. Agent, 26.11.: **Ergänzen** — Beschreibung nur, wenn das Feld leer ist; Varianten mit gleichem
   Namen werden wiederverwendet. **Ersetzen** ersetzt Beschreibung und Varianten mit.
3. Agent, 26.11.: **Prüfung gegen die echte KI** (Enrico: „lokal rumprobieren“): Skript
   `tmp/review-0003/0045/probe.ts` ruft die Funktion mit dem Haushaltskontext aus der lokalen
   Datenbank gegen Foundry auf: „ich will meatball pasta“, „Linsen-Dal“, ein chefkoch-Link,
   „Pizza mit verschiedenen Belägen“, „Pfannkuchen süß oder herzhaft“. Ergebnisse und Vergleich
   der Prompt-Fassungen unter „Nachweis“.
4. Agent, 26.11.: **Schlagworte** — Die KI markiert neue mit `isNew`; maßgeblich für den Zusatz
   „neu“ ist aber der Vergleich mit den Schlagworten des Haushalts in der App (die KI kann sich
   irren). Mehr als 5 werden gekürzt statt abgelehnt.
5. Agent, 26.11.: **Timer und Vorlauf** gehören zu „Schritten“ und „Zeit“ (Enricos Liste) und
   kommen mit (Timer 1–600 Minuten, Vorlauf mit Stunden), wie in unseren eigenen Rezepten.
6. Agent, 26.11.: Das große Foto der Rezeptseite bleibt beim Platzhalter (Spec 0046 baut die
   Fotofläche um); die Ladeanzeige gilt für die drei Kacheln.
7. Agent, 26.11. (beim Bau): `max_output_tokens` 4000 → 12000 (Varianten, Gruppen und längere
   Schritte brauchen 1–2,3 k, der Rest ist Reserve gegen abgeschnittene Antworten); gemessen
   7–15 s je Entwurf. `reasoning.effort = medium` brachte in der Probe nichts und bleibt weg.
8. Agent, 26.11. (beim Bau): „Neu generieren“ steht auch unter der Fehlermeldung, wenn die Fotos
   nicht gelungen sind. Ohne „Keins davon“ bleibt ein nicht übernommener Vorschlag einfach ungenutzt.

## Daten

Keine Schemaänderung. Neuer Vertrag `RecipeDraftSchema` in `packages/core/src/ai-contract.ts`
(Beschreibung, Schlagworte mit `neu`, Varianten, Gruppen, Schritte mit Variante und Timer,
Vorlauf). Neu an Azure: nichts — die Schlagworte gingen schon in 0040 mit.

## Risiken

| Risiko                             | Gegenmaßnahme                                                                                                                 | Test                    |
| ---------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- | ----------------------- |
| Modell liefert Unsinn außerhalb    | zod-Vertrag mit Grenzen vor der App; Fehler wie AC-005 von 0040                                                               | AC-014, Handler-Test    |
| Prompt-Injection aus fremder Seite | unverändert: Seitentext als Daten, strukturierte Ausgabe                                                                      | 0040 AC-007 bleibt grün |
| Abgemeldet / fremder Haushalt      | unverändert: JWT + Mitgliedschaft                                                                                             | 0040 Tests 401/403      |
| Längere Antwort sprengt Zeit       | `max_output_tokens` angehoben, 60-s-Grenze bleibt; Probe misst                                                                | Probe-Zeiten            |
| Mehr Ausgabe kostet mehr           | `/security-check` 26.11. (Hinweis): ≈ 2 k statt 0,7 k Tokens je Entwurf; Grenze bleibt das Azure-Limit (0040, Entscheidung 2) | akzeptiert              |

## Umsetzung

- [x] 1. Vertrag + Zuordnung in core: Beschreibung, Schlagworte, Varianten, Gruppen, Schritte,
      Timer, Vorlauf (`ai-contract.ts`, `recipe-draft.ts`, `page-editor.ts`) (AC-001–AC-011,
      AC-013, AC-014)
- [x] 2. `ai-recipe-draft`: Auftrag und Format neu, Probe gegen Foundry mit fünf Eingaben
      (AC-012)
- [x] 3. UI: pochende Kacheln (`Photo generating`), „Neu generieren“ mit Zusatz, „neu“ an
      Schlagworten (AC-005, AC-015–AC-019)
- [x] Nachweis (26.11.): `pnpm format:check && pnpm check && pnpm build:web` grün (Build mit
      `node scripts/with-env.mjs`). Rot → grün: core `ai-recipes-contract.test.ts`,
      `recipe-draft.test.ts`, `page-editor.test.ts`; ui `display.test.tsx` (AC-015, AC-016); edge
      `ai-recipe-draft/handler.test.ts`; api `ai-recipes.backend.test.ts` (Varianten und Schritt
      je Variante werden mit dem neuen Rezept gespeichert), `transport-supabase.test.ts`.
      Probe gegen Foundry (`tmp/review-0003/0045/`, `ERGEBNIS.md`): fünf Eingaben × fünf Fassungen
      (25 LLM-Aufrufe), 3 FLUX-Aufrufe. Vorher: keine Beschreibung, keine Varianten, 4–6 Schritte,
      „Pfannkuchen süß oder herzhaft“ → nur süß. Nachher: „ich will meatball pasta“ →
      „Spaghetti mit Bällchen in Tomatensoße“, Varianten „Mit Rinderhack“/„Vegetarisch“
      (Linsen-Pilz-Bällchen), Gruppen „Für die Bällchen“/„Für die Soße“/„Zum Servieren“, 23
      Zutaten aus dem Katalog, 10 Schritte mit 7 Timern (AC-012); Pizza mit drei Belag-Varianten
      und selbst gemachtem Teig; Pfannkuchen „Süß“/„Herzhaft“; chefkoch-Link treu mit den
      Portionen der Seite. App auf :8092 mit dieser Antwort und echten FLUX-Fotos über
      Playwright-Routen: pochende Kacheln im Entwurf und im Foto-Fenster, „Neu generieren“ mit
      „heller, von oben“ schickt den Bild-Prompt mit dem Zusatz (AC-017), Bildschirmfotos
      `tmp/review-0003/0045/{phone,desktop}-*.png`. `/security-check`: 0 kritisch/hoch/mittel/
      niedrig, 1 Hinweis (Risiken).
