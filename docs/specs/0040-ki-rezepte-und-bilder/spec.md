---
status: entwurf # entwurf | freigegeben | umgesetzt | verworfen
datum: 2026-11-26
---

# 0040 — KI: Rezepte ausfüllen, Bilder erzeugen und bearbeiten

**Quelle:** Enricos Review 0003 vom 26.11.2026 (`tmp/__PROMPTS/0002-REVIEW-2026-11-26-PROMPT.md`,
KI-01 bis KI-04, E-15). Bildmodell FLUX.2-pro von Enrico in Foundry bereitgestellt. Probe vom
26.11.: `tmp/review-0003/recherche.md`. **Welle 2.** **Kritischer Pfad:** ja: Edge Functions mit
Abruf fremder Seiten, Kontingent (Migration), Daten an Azure.

> **Entwurf vor den Entscheidungen.**

## Ziel

Ein Rezept anzulegen kostet nur noch einen Satz, ein Foto oder einen Link: Ich diktiere oder tippe
„Omas Apfelkuchen wie auf chefkoch.de/…“, hänge ein Foto der Kochbuchseite an, und die KI füllt
Titel, Portionen, Zeit, Zutaten aus unserem Artikel-Katalog, Schritte und ein passendes Foto vor.
Ich prüfe alles im Bearbeitungsmodus und speichere. Fotos lasse ich in drei Varianten erzeugen oder
ein vorhandenes Foto (z. B. ein TikTok-Bildschirmfoto mit Text) sauber neu machen.

## Nicht-Ziele

- Keine KI bei Restaurants, Aktivitäten, Einkauf, Haushalt (außer Bild erzeugen im Foto-Fenster).
- Kein automatisches Speichern: Die KI füllt nur einen Entwurf.
- Kein Chat-Assistent (der bestehende bleibt aus, siehe OFFEN 1).

## Anforderungen (Entwurf)

**REQ-001 — Rezept aus Eingabe.** Freitext (≤ 2000 Zeichen), bis zu 3 Links und bis zu 4 Fotos
(aufnehmen oder wählen). Links werden erkannt und als „chefkoch.de wird gelesen …“ angezeigt.
Ergebnis landet als Entwurf im Bearbeitungsmodus (Spec 0037). Nur online.

- AC-001: Angenommen „Neu → Rezept“, Eingabe „Apfelkuchen für 4 wie bei Oma, mit Streuseln“ · Wenn
  ich „Mit KI ausfüllen“ tippe · Dann ist nach höchstens 30 s ein Entwurf mit Titel, 4 Portionen,
  Zutaten und Schritten offen, nichts ist gespeichert
- AC-002: Angenommen der Haushalt hat den Artikel „Weizenmehl Type 405“ · Wenn der Entwurf Mehl
  braucht · Dann verwendet er „Weizenmehl Type 405“, und Zutaten ohne passenden Artikel sind als
  „neu“ markiert
- AC-003: Angenommen ein Foto einer Kochbuchseite · Dann stehen deren Zutaten und Schritte im Entwurf
- AC-004: Angenommen ein Link ist nicht erreichbar · Dann sagt die App „chefkoch.de konnte nicht
  gelesen werden“ und arbeitet mit dem Rest weiter
- AC-005: Angenommen das Tageskontingent ist aufgebraucht · Dann sagt die App das, ohne Aufruf

**REQ-002 — Spracheingabe.** Jedes KI-Eingabefeld hat ein Mikrofon (bestehende Spracheingabe).

**REQ-003 — „Foto generieren“.** Schalter im KI-Fenster, standardmäßig an: Die KI schreibt einen
Bild-Prompt, und die Varianten aus REQ-004 erscheinen nach dem Entwurf.

**REQ-004 — Bild erzeugen (3 Varianten).** Im Foto-Fenster (Spec 0039) Reiter „KI“: Prompt (vorbelegt
aus Titel und Zutaten) und Stil-Chips („Hochglanz“, „Rustikal“, „Von oben“, „Nah“). Drei Varianten;
annehmen, mit geändertem Text neu erzeugen, oder abbrechen. Gespeichert wird nur die angenommene.

- AC-006: Angenommen „Apfelkuchen“ · Wenn ich „Erzeugen“ tippe · Dann sehe ich nach höchstens 30 s
  drei Bilder, und im Speicher liegt noch keines
- AC-007: Angenommen ich wähle das zweite · Dann ist es das Foto des Rezepts

**REQ-005 — Foto bearbeiten.** Reiter „KI“ mit vorhandenem Foto: „Aus diesem Foto“ + Prompt (z. B.
„Text entfernen, sauberes Food-Foto“) → drei Varianten wie REQ-004.

**REQ-006 — TikTok-Link.** Siehe OFFEN 3.

## Entscheidungen

1. Entschieden (Enrico, 26.11.): Heute ist die KI ganz aus (`features.ai = false`). Nur die neuen Funktionen (Rezept ausfüllen, Bilder, Diktat dafür) werden eingeschaltet;
   Assistent und KI-Suche bleiben aus.
2. Ablauf serverseitig (ADR-0009, neues ADR „Bildmodell und Abruf fremder Seiten“):
   - `ai-recipe-draft`: Fotos werden vorher in einen Eingangsordner des Haushalts hochgeladen (Body
     ≤ 64 KB bleibt), die Funktion liest sie unter RLS, lädt Links (gleiche Schutzregeln wie
     `fetch-image`, HTML → Text, ≤ 2 MB), gibt Haushaltskontext mit (Artikelnamen + Synonyme,
     Einheiten, Küchen, Gerichtarten, Schlagworte) und verlangt strukturierte Ausgabe (zod). Danach
     werden die Eingangsfotos gelöscht.
   - `ai-image`: 3 FLUX.2-pro-Aufrufe parallel (≈ 10 s, ≈ 9–14 ct), Antwort als Bilddaten an die
     App; Speichern erst bei Annahme über den normalen Foto-Weg.
3. Entschieden (Enrico, 26.11., E-15 TikTok): Test am 26.11.: Video über den Link ladbar (MP4, 95 s, 21,6 MB), ohne
   offizielle Schnittstelle. A: nur Link + KI liest die Beschreibung, Video öffnet TikTok · B: Video
   in eigenem Speicher-Bucket (bis 50 MB), Abspielen in der App; kann jederzeit brechen, Speicher
   ~20 MB je Video, nur private Nutzung · Gebaut wird A zuerst, B als eigener Schritt am Ende
   von Welle 2.
4. OFFEN: Kontingent je Person und Tag — Vorschlag: 30 Rezept-Entwürfe, 30 Bilder (= 10 Runden).
   Kosten bei Vollauslastung ≈ 1 € je Person und Tag; realistisch Cent-Beträge.

## Daten

Neue Kontingent-Art `image` (Migration `consume_ai_quota`). Eingangsfotos kurzzeitig im Bucket
(`<household>/ai-inputs/…`). Rezepttext, Fotos und Haushaltskontext gehen an Azure (wie ADR-0009).

## Risiken

| Risiko                             | Gegenmaßnahme                                                         | Test                         |
| ---------------------------------- | --------------------------------------------------------------------- | ---------------------------- |
| SSRF über Rezept-Links             | wie Spec 0039 Entscheidung 1                                          | Unit-Tests Adressklassen     |
| Prompt-Injection aus fremder Seite | Seitentext nur als Daten, strukturierte Ausgabe, kein Werkzeugzugriff | Test mit „ignoriere …“-Seite |
| Kosten laufen weg                  | Kontingent je Person, Grenzen in der Funktion                         | pgTAP Kontingent             |
| Fremder Haushalt / abgemeldet      | JWT, Haushaltsprüfung, RLS beim Foto-Lesen                            | Test 401/403                 |
| Eingangsfotos bleiben liegen       | Löschen nach Aufruf + Aufräum-Job (Spec 0039)                         | Test                         |

## Umsetzung

Nach den Entscheidungen.
