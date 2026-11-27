---
status: freigegeben
datum: 2026-11-27
---

# 0066 — KI-Agent: Recherche-Chat für Restaurants und Aktivitäten (Schritt 1)

**Quelle:** Enrico, 27.11.2026: PoC „KI-Chat“ (`tmp/ki-chat-poc/BERICHT.md`, `BERICHT-2.md`), Gemini-Inspiration
(`tmp/ki-chat-poc/inspo-gemini.md`) und das UI-Konzept
[KI-Chat – UI-Konzept](https://claude.ai/artifact/Gn7ANMtnC25unGLYpqwNqD) (Design-Referenz; gewählt: Einstieg B,
Antwort A). **Kritischer Pfad:** ja: Migration, neue synchronisierte Tabelle, RLS, Löschen (Chat und Haushalt),
externer Dienst mit Kosten (Foundry, Web IQ, Serper), Standortdaten, Infrastruktur (Foundry-Agent).

## Ziel

Wer essen gehen oder etwas unternehmen will, fragt in eigenen Worten („romantisch in Mitte, einer isst Fleisch, die
andere vegetarisch“) und bekommt nach 15–25 Sekunden eine kurze Antwort mit echten Orten als Karten: Foto, Sterne,
Preis, Öffnungsstatus, ein Satz, warum es passt, „Google Maps“ und „Speichern“. Gespeichert wird ein Ort mit einem
Tipp als Restaurant oder Aktivität. Rückfragen („eher was mit Terrasse“) beziehen sich auf die Vorschläge davor.
Alle Mitglieder sehen die Recherchen des Haushalts im Verlauf und können sie fortsetzen.

## Nicht-Ziele

- Keine Haushaltsdaten für den Agent in Schritt 1 (Rezepte, Kalender, Liste): das ist Schritt 2 (Entscheidung 14).
- Keine Rezeptideen, kein Planen, kein Anlegen außer „Speichern“ eines vorgeschlagenen Orts.
- Kein Modus-Schalter und keine Textvorschläge auf der leeren Startseite.
- Kein Chatinhalt in unserer Datenbank oder im Cache; offline gibt es nur den Verlauf (ADR-0018).
- Keine Galerie mehrerer Fotos, kein Speichern des Kartenfotos am Ort.
- Kein Reverse-Geocoding: der Gerätestandort heißt „Aktueller Standort“.
- Keine neue Navigation: Tab-Leiste und Seitenleiste bleiben, wie sie sind.

## Anforderungen

### Einstieg und Seite

**REQ-001 — ✨ im Kopf.** Im Kopf von „Essen“ (Ansicht „Restaurants“) und von „Aktivitäten“ steht links neben „+“ ein
Symbolknopf ✨ „KI-Agent“; er öffnet die eigene Seite „KI-Agent“ (Route `/ki-agent`, kein Fenster). „Zurück“ führt
dorthin, wo sie geöffnet wurde. Quelle: Konzept Einstieg B. Offline: offline lesend (die Seite öffnet, siehe REQ-012).

- AC-001: Angenommen Enrico ist auf „Essen“ in der Ansicht „Restaurants“ · Wenn er ✨ „KI-Agent“ tippt · Dann öffnet
  die Seite „KI-Agent“ mit „‹ Essen“ · Und „‹ Essen“ führt zurück zu „Restaurants“
- AC-002: Angenommen Enrico ist auf „Aktivitäten“ · Wenn er ✨ tippt und dann „‹ Aktivitäten“ · Dann steht er wieder
  auf „Aktivitäten“
- AC-003: Angenommen die Ansicht „Rezepte“ ist offen · Dann steht im Kopf kein ✨ (nur bei Restaurants)

**REQ-002 — Startseite und Eingabe.** Die leere Seite zeigt groß „KI-Agent“ mit dem Untertitel „Restaurants und
Aktivitäten, mit Websuche“ und oben rechts „Verlauf“; im Gespräch zeigt der Kopf „KI-Agent“ und darunter den Titel des
Chats. Unten fest (Handy und Desktop) steht die Eingabe: ein rundes Feld „Wonach sucht ihr?“ (im Gespräch
„Nachfragen …“) mit Mikrofon (Diktat wie in „Was soll noch anders sein?“) und Senden, darüber links der Ort-Chip
(„Hier · Zu Fuß“ bzw. „<Ort> · <Umkreis>“). Auf dem Handy blendet die Seite die Tab-Leiste aus (wie der Kochmodus);
Tastatur und Eingabe bewegen sich in einem Zug. Quelle: Konzept „KI-Agent – Start“, „Desktop“. Offline: siehe REQ-012.

- AC-004: Angenommen die Seite ist leer · Dann stehen „KI-Agent“, „Restaurants und Aktivitäten, mit Websuche“, der
  Ort-Chip und das Feld „Wonach sucht ihr?“ da · Und es gibt keine Vorschlagstexte
- AC-005: Angenommen das Feld ist leer oder enthält nur Leerzeichen · Dann ist „Senden“ deaktiviert
- AC-006: Angenommen eine Nachricht hat 2000 Zeichen · Wenn Enrico weitertippt · Dann kommt kein Zeichen dazu

### Ort

**REQ-003 — Standard: aktueller Standort.** Ohne gewählten Ort gilt der Gerätestandort (Browser-Geolocation). Die
Berechtigung fragt der Browser beim ersten Senden. Koordinaten gehen auf 3 Nachkommastellen gerundet (≈ 100 m) nur mit
der jeweiligen Nachricht an den Agent und werden nirgends gespeichert. Ohne Berechtigung oder ohne Standort öffnet
sich „In der Nähe von“ mit dem Hinweis „Standort nicht verfügbar – wähle einen Ort.“ und die Nachricht wartet.
Quelle: Enrico. Offline: nur online (Senden braucht Netz).

- AC-007: Angenommen der Browser liefert 52.510612, 13.459487 · Wenn Enrico „Pizza“ sendet · Dann enthält der
  Kontextblock „Koordinaten: 52.511, 13.459“ und „Bezugspunkt: Aktueller Standort“
- AC-008: Angenommen der Browser verweigert den Standort · Wenn Enrico sendet · Dann öffnet „In der Nähe von“ mit
  „Standort nicht verfügbar – wähle einen Ort.“ · Und nichts wird gesendet, der Text bleibt im Feld

**REQ-004 — „In der Nähe von“.** Der Ort-Chip öffnet das Fenster „In der Nähe von“: „Aktueller Standort“; ein Feld
„Adresse oder Google Maps Link“ (ein Maps-Link wird wie im Ortsfeld erkannt, ein Kurzlink über `resolve-maps-link`
aufgelöst; sonst gilt der Text als Ort ohne Koordinaten); „Aus euren Reisen“ (laufende und kommende Reisen mit Notiz,
Entscheidung 9); „Zuletzt“ (die letzten 5 gewählten Orte, nur auf diesem Gerät, beim Abmelden gelöscht); „Umkreis“
mit „Zu Fuß“ (1,5 km), „Öffis“ (5 km), „Auto“ (15 km), „Ganze Stadt“. Der Ort gilt für die nächsten Nachrichten; im
Chat-Verlauf steht nur seine Bezeichnung. Quelle: Konzept „Ort festlegen“. Offline: offline lesend.

- AC-009: Angenommen Enrico fügt „https://www.google.com/maps/place/Katz+Orange/@52.5313,13.3977,17z“ ein · Wenn er
  „Übernehmen“ tippt · Dann zeigt der Chip „Katz Orange · Zu Fuß“ · Und der Kontext enthält „Koordinaten: 52.531, 13.398“
- AC-010: Angenommen Enrico tippt „Kreuzberg, Graefekiez“ · Wenn er übernimmt · Dann zeigt der Chip „Kreuzberg,
  Graefekiez · Zu Fuß“ · Und der Kontext hat keine Koordinatenzeile
- AC-011: Angenommen die Reise 3.–7. Dez. hat die Notiz „London“ · Dann steht unter „Aus euren Reisen“ „London“ mit
  „3.–7. Dez.“ · Und eine vergangene Reise oder eine ohne Notiz steht dort nicht
- AC-012: Angenommen Enrico wählt „Öffis“ · Dann zeigt der Chip „… · Öffis“ · Und der Kontext enthält „Umkreis: 5 km“
  · Und bei „Ganze Stadt“ „Umkreis: ganze Stadt“
- AC-013: Angenommen 6 Orte wurden nacheinander gewählt · Dann stehen unter „Zuletzt“ die letzten 5, der neueste oben,
  ohne Dopplung · Und nach dem Abmelden ist „Zuletzt“ leer

### Recherche

**REQ-005 — Senden und Fortschritt.** Senden zeigt die Nachricht als Blase rechts. Darunter erscheint eine
Schrittzeile („Sucht im Web · 6 Quellen“, aufklappbar mit den Suchbegriffen), dann der Antworttext Stück für Stück;
sobald der Agent Karten baut, stehen zwei Platzhalterkarten da („Vorschläge werden geladen · dauert meist 15–25
Sekunden“). Statt „Senden“ steht „Recherche anhalten“: es bricht ab, Gezeigtes bleibt, darunter „Angehalten.“. Die
Schrittzeile ist ein allgemeiner Baustein für Werkzeug-Schritte (Schritt 2, Entscheidung 14). Quelle: Konzept
„recherchiert“. Offline: nur online.

- AC-014: Angenommen der Agent sucht zweimal im Web mit zusammen 6 Quellen · Dann steht „Sucht im Web · 6 Quellen“ ·
  Und aufgeklappt stehen beide Suchbegriffe
- AC-015: Angenommen die Antwort streamt · Wenn Enrico „Recherche anhalten“ tippt · Dann endet die Antwort mit
  „Angehalten.“ · Und „Senden“ ist wieder da · Und die nächste Nachricht im selben Chat wird angenommen
- AC-016: Angenommen der Text enthält Zitat-Marken (`cite…`) · Dann zeigt die App sie nie; die Quellen stehen
  als Domain-Chips („falstaff.com“) unter der Antwort

**REQ-006 — Karten.** Die Vorschläge stehen als waagrechtes Karussell (Variante A): je Karte ein Foto (Google-Maps-Foto
über `fetch-image`, nie gespeichert; ohne Foto ein Platzhalter), Name, „★ 4,5 · €€€ · Gourmet“, Öffnungsstatus, 1–2
Sätze, warum es passt, „Google Maps“ und „Speichern“. Sterne, Bewertungszahl, Foto, Koordinaten und der Maps-Link
stammen nur aus der Anreicherung über die Serper-Maps-Suche (`cid`-Link), nie vom Agent; ohne Treffer fehlen Sterne
und „Google Maps“. Folgefragen des Agents (`follow_ups`, höchstens 3) stehen als Chips unter der Antwort; ein Tipp
sendet sie. Quelle: Konzept Antwort A, PoC Datenqualität. Offline: nur online.

- AC-017: Angenommen der Agent schlägt „Crackers“ vor und Serper findet „Crackers“ mit 4,5 (1457) und `cid` 123 ·
  Dann zeigt die Karte „★ 4,5“ · Und „Google Maps“ öffnet „https://maps.google.com/?cid=123“
- AC-018: Angenommen Serper findet zum Vorschlag „Nomad“ keinen Ort mit passendem Namen · Dann zeigt die Karte keine
  Sterne und kein „Google Maps“ · Und einen Foto-Platzhalter
- AC-019: Angenommen der Agent liefert Karten, deren Argumente das Schema verletzen (kein Name, `http:`-Website) · Dann
  fällt die Karte weg bzw. die Website ist leer · Und der Text bleibt
- AC-020: Angenommen die Antwort hat die Folgefrage „Eher mit Terrasse?“ · Wenn Enrico den Chip tippt · Dann geht
  „Eher mit Terrasse?“ als neue Nachricht in denselben Chat

**REQ-007 — Speichern.** „Speichern“ legt den Ort über den normalen Schreibweg an: eine Karte `restaurant` als
Restaurant (Name, Adresse, Koordinaten, Google-Maps-Link, Küche = Art, Preisniveau, Website), eine Karte `activity`
als Aktivität (Name, Beschreibung = warum, Ortsname, Adresse, Koordinaten, Link, Website; die Art nur, wenn der Haushalt
eine gleichnamige hat). Danach heißt der Knopf „Gespeichert“; ein Tipp öffnet den Ort. Gibt es den Ort schon (gleicher
Maps-Link oder Name), heißt der Knopf gleich „Gespeichert“ und öffnet den vorhandenen. Quelle: Konzept Antwort A.
Offline: nur online („Speichern“ deaktiviert mit Offline-Hinweis).

- AC-021: Angenommen die Karte „Katz Orange“ (restaurant, „Deutsch“, €€€, cid 77) · Wenn Enrico „Speichern“ tippt ·
  Dann gibt es das Restaurant „Katz Orange“ mit Küche „Deutsch“, Preisniveau 3 und dem Maps-Link · Und die Karte zeigt
  „Gespeichert“
- AC-022: Angenommen das Restaurant „Katz Orange“ ist schon gespeichert · Dann zeigt seine Karte gleich „Gespeichert“
  · Und ein Tipp öffnet „Katz Orange“, ein zweites wird nicht angelegt
- AC-023: Angenommen die Karte „Computerspielemuseum“ ist eine Aktivität · Wenn Enrico speichert · Dann gibt es die
  Aktivität mit der Beschreibung aus „warum“

### Verlauf

**REQ-008 — Chats des Haushalts.** „Verlauf“ zeigt die Chats des aktiven Haushalts aus dem Cache, neueste oben: Titel,
Ort, Datum, wer ihn gestartet hat. Jedes Mitglied öffnet und setzt jeden Chat fort. Der Titel ist der Titel der ersten
Karten („Samstag in Kreuzberg“) oder sonst der Anfang der ersten Nachricht (höchstens 60 Zeichen). Ein geöffneter Chat
lädt seine Nachrichten online aus Foundry (Entscheidung 6), ohne den Kontextblock. Quelle: Konzept „Verlauf“.
Offline: offline lesend (Liste ja, Öffnen braucht Netz).

- AC-024: Angenommen Nadja hat „Brunch mit Kinderwagen“ gestartet · Wenn Enrico „Verlauf“ öffnet · Dann steht
  „Brunch mit Kinderwagen“ mit „Friedrichshain · Mo · Nadja“
- AC-025: Angenommen Enrico öffnet diesen Chat · Dann stehen Nadjas Nachrichten, die Antworten und ihre Karten
  (mit Sternen und Maps-Link aus der damaligen Anreicherung) da · Und keine Zeile „[KONTEXT]“
- AC-026: Angenommen ein Mitglied des Haushalts „WG Kreuzberg“ · Dann sieht es keinen Chat von „Enrico & Nadja“ · Und
  ein Aufruf mit dessen Chat-ID wird mit 403 abgelehnt
- AC-027: Angenommen es gibt noch keinen Chat · Dann zeigt „Verlauf“ „Noch keine Recherchen“

**REQ-009 — Löschen.** Wischen nach links oder ⋯ → „Löschen“ fragt „Chat löschen?“; „Löschen“ löscht die
Foundry-Conversation, jede gespeicherte Antwort (`resp_…`, sie überleben das Löschen der Conversation) und dann
unsere Zeile. Scheitert Foundry, bleibt der Chat mit dem Hinweis „Löschen hat nicht geklappt – bitte noch einmal.“
Quelle: PoC Löschen. Offline: nur online.

- AC-028: Angenommen ein Chat mit 2 Antworten · Wenn Enrico ihn löscht · Dann gehen 2 × `DELETE /responses/…`, 1 ×
  `DELETE /conversations/…` und danach `delete_ai_chat` · Und der Chat fehlt im Verlauf aller Mitglieder
- AC-029: Angenommen Foundry antwortet beim Löschen der Conversation mit 500 · Dann bleibt die Zeile · Und der
  Hinweis erscheint
- AC-030: Angenommen eine gespeicherte Antwort-ID gehört zu einer anderen Conversation · Dann wird sie nicht gelöscht

**REQ-010 — Haushalt löschen.** „Haushalt endgültig löschen“ löscht vorher alle Chats des Haushalts wie in REQ-009;
`delete_household` lehnt mit `ai_chats_remaining` ab, solange einer übrig ist. Quelle: 10-security „Löschen löscht
alles“. Offline: nur online (wie bisher).

- AC-031: Angenommen der Haushalt hat 2 Chats · Wenn Enrico ihn endgültig löscht · Dann sind beide in Foundry gelöscht,
  bevor `delete_household` läuft
- AC-032: Angenommen ein Chat existiert noch · Wenn `delete_household` läuft · Dann scheitert es mit
  `ai_chats_remaining`

### Server und Daten

**REQ-011 — Edge Function `ai-agent`.** Eine Function mit vier Aktionen (`send`, `load`, `delete`, `purge`): CORS,
Anmeldung, Mitglied des Haushalts, Chat gehört dem Haushalt (unsere Zeile **und** die Metadaten der Conversation),
Nachricht ≤ 2000 Zeichen, höchstens 20 Antworten je Chat, KI-Kontingent 5 je Antwort (`consume_ai_quota`). `send`
streamt SSE; nach jedem Aufruf von `show_suggestions` hängt sie das `function_call_output` an (sonst lehnt Foundry die
nächste Nachricht ab). Rohantworten von Foundry (sie enthalten den Systemprompt) gehen nie an die App; Logs nennen nur
Grund und Status. Quelle: PoC Anbindung. Offline: —.

- AC-033: Angenommen ein Aufruf ohne Anmeldung · Dann 401 · Und ein Mitglied eines fremden Haushalts mit fremder
  `householdId` bekommt 403
- AC-034: Angenommen die Zeile verweist auf eine Conversation, deren Metadaten einen anderen Haushalt nennen · Dann 403
  · Und Foundry bekommt keine Nachricht
- AC-035: Angenommen der Chat hat 20 Antworten · Wenn Enrico sendet · Dann 409 `chat_too_long` · Und die App sagt
  „Dieser Chat ist lang geworden – starte einen neuen.“
- AC-036: Angenommen das KI-Kontingent ist aufgebraucht · Dann 429 · Und die App sagt „Für heute ist das
  KI-Kontingent aufgebraucht“
- AC-037: Angenommen Foundry ruft `show_suggestions` auf · Dann hängt die Function genau ein `function_call_output` je
  `call_id` an · Und der gestreamte Text enthält weder `instructions` noch Zitat-Marken
- AC-038: Angenommen die vorige Antwort wurde abgebrochen und ließ einen offenen `function_call` · Wenn die nächste
  Nachricht kommt · Dann schließt die Function ihn zuerst mit „shown“

**REQ-012 — Online-Seite (ADR-0018).** Die Seite ist die zweite Ausnahme von „offline lesbar“: offline zeigt sie den
Verlauf aus dem Cache, die Eingabe ist deaktiviert mit „Offline – zum Recherchieren brauchst du Netz“, ein Chat öffnet
nicht („Offline – den Chat lädst du mit Netz.“). Quelle: Enrico. Offline: wie beschrieben.

- AC-039: Angenommen das Gerät ist offline · Wenn Enrico „KI-Agent“ öffnet · Dann sind Feld und Senden deaktiviert mit
  dem Hinweis · Und „Verlauf“ zeigt die Chats

**REQ-013 — Tabelle `ai_chats`.** Nur Verweise: Haushalt, Conversation-ID (eindeutig), Titel, Ortsbezeichnung,
gestartet von, Antwort-IDs, Zeitstempel; RLS, synchronisiert, nur über RPCs geschrieben. Der Chatinhalt liegt nur in
Foundry. Quelle: PoC Offene Frage 3. Offline: offline lesend.

- AC-040: Angenommen ein Mitglied · Dann kann es die Chats seines Haushalts lesen, aber weder einfügen, ändern noch
  löschen außer über `create_ai_chat`, `record_ai_chat_turn`, `delete_ai_chat` · Und `anon` kann nichts
- AC-041: Angenommen eine zweite Zeile mit derselben `conversation_id` · Dann lehnt die Datenbank sie ab

**REQ-014 — Agent als Code je Umgebung (ADR-0019).** Der Agent `places-agent` (Modell `gpt-6.1-terra`, reasoning
`low`, Web-Suche, Funktion `show_suggestions` strict) steht in `foundry/agents/places-agent.yaml` (Instruktion in
`places-agent.md`) und wird je Umgebung als `places-agent-local`, `-preview`, `-prod` angelegt: lokal mit
`pnpm foundry:agents:local`, in `preview.yml` und `release.yml` vor dem Deploy der Functions. Die Pipeline pinnt die
genannte Version als `FOUNDRY_PLACES_AGENT_VERSION`; fehlt ihre Konfiguration, bricht sie mit deutscher Meldung ab.
Quelle: Enrico, 27.11.2026. Offline: —.

- AC-042: Angenommen die Definition ist unverändert · Wenn der Upsert erneut läuft · Dann legt er keine neue Version
  an und nennt „places-agent-local Version 1 (unverändert)“
- AC-043: Angenommen die Instruktion ändert sich · Wenn `preview.yml` läuft · Dann entsteht eine neue Version von
  `places-agent-preview` vor „Functions“, und „Secrets der Functions“ setzt genau diese Nummer
- AC-044: Angenommen `FOUNDRY_AZURE_CLIENT_ID` fehlt in der Umgebung `production` · Wenn `release.yml` läuft · Dann
  bricht „Foundry-Konfiguration vorhanden“ mit „Variable FOUNDRY_AZURE_CLIENT_ID der Umgebung production fehlt …“ ab
- AC-045: Angenommen die Anmeldung scheitert mit 401 · Dann nennt der Upsert nur „HTTP 401“ und die Rolle „Foundry
  User“, nie das Token

## Entscheidungen

Entschieden von Enrico am 27.11.2026:

1. Ein Recherche-Chat für Restaurants **und** Aktivitäten mit einem Foundry-Agent ohne Modus (auf Basis von
   `places-research-agent-preview`), Modell `gpt-6.1-terra`, Werkzeuge Web-Suche (Web IQ) und `show_suggestions`
   (strict, `kind` restaurant|activity). Keine Haushaltsdaten in Schritt 1.
2. Einstieg ✨ im Kopf von „Restaurants“ und „Aktivitäten“ neben „+“ (Variante B); Navigation unverändert.
3. Eigene Seite (Route, kein Fenster), Kopf wie in REQ-002, „Zurück“ dorthin, woher man kam, „Verlauf“-Knopf, keine
   Textvorschläge auf der leeren Seite.
4. Eingabe fest unten (Handy und Desktop), Mikrofon wie im Diktatfeld, Ort-Chip darüber links.
5. Ort: Gerätestandort als Standard, Fenster „In der Nähe von“ wie in REQ-004; Koordinaten nur im `[KONTEXT]`-Block
   der Nachricht (Instruktionen pro Anfrage lehnt Foundry ab, PoC).
6. Arbeiten: Schrittzeile aus den Stream-Ereignissen, streamender Text, Kartenplatzhalter, Anhalten. Antwort:
   Text plus Karussell (Variante A), ein Foto aus Serper über `fetch-image`, Sterne und `cid`-Link nur aus der
   Anreicherung. „Speichern“ über den normalen Schreibweg. Folgefragen nur, wenn der Agent sie liefert.
7. Verlauf gehört dem Haushalt; Löschen löscht Conversation, Antworten und Zeile.
8. Online-Seite als Ausnahme (ADR-0018); Agent-Definition ist Infrastruktur, je Umgebung mit Suffix und gepinnter
   Version (ADR-0019, Entscheidung 17).

Beim Bauen entschieden:

9. **Reisen haben kein Ziel-Feld.** „Aus euren Reisen“ nimmt die Notiz einer laufenden oder kommenden Reise als Ort
   (ohne Koordinaten, der Agent sucht dort). Ein Zielfeld an Reisen wäre eine eigene Spec. OFFEN: Reicht Enrico die
   Notiz, oder braucht die Reise ein Ziel?
10. **Verlauf der Nachrichten über die Items-API.** `load` liest `GET /conversations/{id}/items` (aufsteigend, Seiten zu
    100, höchstens 5 Seiten) und baut daraus in `packages/core` die Nachrichten: der erste Textteil jeder
    Nutzernachricht (`[KONTEXT]`) fällt weg, Karten kommen aus den Argumenten von `show_suggestions`, ihre Anreicherung
    aus dem `function_call_output` (Entscheidung 11). Kein eigener Speicher.
11. **Anreicherung im Funktions-Ergebnis.** Das `function_call_output` ist nicht nur „shown“, sondern
    `{"shown":true,"places":[{index, maps_url, rating, rating_count, image_url, lat, lng}]}`. So zeigt ein später
    geöffneter Chat dieselben Sterne und Links, ohne Serper erneut zu fragen, und der Agent kennt sie bei Rückfragen.
12. **Streaming über `functions.invoke`.** supabase-js gibt bei `text/event-stream` die rohe `Response` zurück und
    nimmt ein `signal`; die App liest SSE (`data: {json}`) mit dem Parser aus `packages/core`. Funktioniert im Browser
    ohne eigenen `fetch` mit Token.
13. **Grenzen:** Nachricht 2000 Zeichen, 20 Antworten je Chat (danach neuer Chat; der Verlauf wird sonst langsam und
    teuer, PoC Lauf 07: 51k Input-Tokens), 5 Einheiten des KI-Kontingents je Antwort (200/Tag → 40 Recherchen je
    Person und Tag, ≈ 5–10 ct je Runde), Gesamtzeit 120 s, Anreicherung 1 Serper-Anfrage je Karte (höchstens 8), Titel
    60 Zeichen, Ortsbezeichnung 120.
14. **Schritt 2, entschieden (Enrico, 27.11.2026; nicht gebaut):** Haushaltsdaten bekommt der Agent über **eigene
    Client-Funktions-Werkzeuge (Option A)**, die die Edge Function mit dem JWT der Person ausführt (RLS gilt); der Agent
    hält nie Zugangsdaten; kein Agent-Konto, kein OpenAPI-, kein MCP-Werkzeug. Die Werkzeuge haben reiche, sparsame
    Parameter: Suche (Text), Filter (z. B. Gang, Küche, Schlagworte, Art, Zeitraum, „zuletzt gekocht vor“), Sortierung,
    Seiten (`limit` + Cursor/Offset, Gesamtzahl in der Antwort), optional die Felder; Hunderte Zeilen nur auf
    ausdrücklichen Wunsch, sonst kleine Seiten. Dazu billige **Übersichts-Werkzeuge**, die alle Werte einer Spalte ohne
    Seiten liefern (alle Artikelnamen des Katalogs, alle Schlagworte, alle Küchen). Schreibt der Agent ein Rezept, nutzt
    er Katalog-Artikel und schlägt neue nur vor, wenn nichts passt, nie Beinahe-Dubletten („Karotte“/„Karotten“); das
    Abgleichen läuft über die vorhandene Artikel-Normalisierung in `packages/core` (wie der KI-Rezeptentwurf,
    `recipe-draft` / `article-catalog`), neue Artikel bleiben Vorschläge, die die Person bestätigt. Werkzeug-Aufrufe
    zeigt der Chat offen in derselben Schrittzeile wie die Websuche („Liest eure Rezepte · Suche „Curry“ · 20 von 143“).
    Vorbereitet in Schritt 1: die Edge Function führt Funktionsaufrufe über eine Werkzeugliste aus (UI-Werkzeuge
    schließen mit „shown“, Daten-Werkzeuge liefern ein Ergebnis und lösen eine weitere Runde aus, höchstens 4), die
    Schrittzeile ist ein allgemeiner Baustein (`AgentStep` mit `kind`, `label`, `detail`, `count`).
15. Der Ort-Chip zeigt den Umkreis; Standard „Zu Fuß“. Die Zeit im Kontext ist die Zeit des Geräts in seiner Zeitzone.
16. Kein Hinweis auf Web IQ in der Seite in Schritt 1 außer der Unterzeile „mit Websuche“; die Datenschutz-Einordnung
    (Suchanfragen verlassen die Azure-Grenze) steht in ADR-0018. OFFEN: Soll ein ausdrücklicher Hinweis „Suche läuft
    über Microsoft Web IQ“ in die Seite?
17. **Foundry-Agenten als Code je Umgebung (Enrico, 27.11.2026; ADR-0019):** YAML in `foundry/agents/` (Schlüssel wie
    Foundrys YAML einer Agent-Version, Instruktion als Markdown daneben), Suffix `-local`/`-preview`/`-prod`, Upsert
    lokal per `pnpm foundry:agents:local`, in Vorschau und Veröffentlichung vor „Functions“. **Version gepinnt:** Die
    Pipeline setzt die Nummer ihres eigenen Upserts als Secret (Foundry nimmt `agent_reference` mit `version`); lokal
    ist sie leer = neueste. **REST statt SDK:** `@azure/ai-projects` 2.11.0 kann Agent-Versionen, zieht aber ~60
    Pakete in den Job mit dem Agent-Token; Spec 0014, Entscheidung 3 verbietet Paket-Code dort. Deshalb baut der Job
    ohne Umgebung ein Bündel aus eigenem Code (`@housekeeping/foundry`, nur Node-Importe, Test prüft das), der
    Umgebungs-Job führt es nach `azure/login` (OIDC) aus; das Token kommt von `az account get-access-token`.
    **Identität:** eigene App-Registrierung im Foundry-Tenant (die SWA-Identität liegt in einem anderen Tenant), Rolle
    „Foundry User“ auf dem Projekt; Einrichtung in `docs/architecture/betrieb.md`. **Ändert Spec 0014, AC-045 und
    Entscheidung 8:** Die Pipeline setzt neben `ALLOWED_ORIGINS` auch `FOUNDRY_PROJECT_ENDPOINT`,
    `FOUNDRY_PLACES_AGENT`, `FOUNDRY_PLACES_AGENT_VERSION` (keine Schlüssel; `FOUNDRY_API_KEY`, `SERPER_API_KEY` bleiben
    Enricos).
18. **Ein zentraler Agent statt Spezialisten (Enrico, 27.11.2026):** Foundry „connected agents“/A2A wurden abgewogen
    (fokussierte Instruktionen, eigene Versionen gegen einen Modelllauf mehr je Spezialist, mehr Latenz und Kosten,
    schwereres Debugging; ADR-0019, Option F). Vorerst ein Agent mit Werkzeugen; `places-agent` bleibt eigenständig
    (eigene YAML, Instruktion, Version), damit er später ohne Umbau Spezialist eines zentralen Agents werden kann
    (Spec 0067). Den Wechsel schlagen wir vor, wenn der zentrale Agent aufbläht (≈ 15–20+ Werkzeuge, sich störende
    Instruktionen, messbar schlechtere Antworten).

## Daten

- **Neu:** `public.ai_chats` (`id`, `household_id`, `conversation_id` eindeutig, `title`, `place_label`,
  `created_by` → `profiles` `on delete set null`, `response_ids text[]` ≤ 100, `created_at`, `updated_at`); RLS
  über `attach_household_policies`, Grant nur `select`, Sync-Trigger, Index `(household_id, updated_at)`, in `sync_pull`.
  RPCs `create_ai_chat`, `record_ai_chat_turn`, `delete_ai_chat` (security definer, Mitglied geprüft).
  `delete_household` lehnt mit `ai_chats_remaining` ab. Cache-Version 26. Additiv.
- **Foundry:** Conversation mit Metadaten `{household_id, app}`; Items enthalten Nachrichten mit Kontextblock (Ort,
  Koordinaten, Zeit), Suchschritte, Antworten, Kartenargumente und Anreicherung. Gelöscht mit dem Chat.
- **Gerät:** „Zuletzt“ (5 Orte) im `localStorage`, beim Abmelden gelöscht.
- **Personenbezug:** Standort nur je Nachricht (gerundet), gespeichert nur als Bezeichnung in `place_label`; Name der
  Person nur als `created_by`.

## Risiken

| Risiko                                                                                          | Gegenmaßnahme                                                                                                 | Test                                              |
| ----------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- | ------------------------------------------------- |
| Fremder Haushalt oder Abgemeldeter liest Chats                                                  | RLS, Grant nur `select`, `anon` nichts                                                                        | pgTAP `ai_chats.test.sql`                         |
| Der Foundry-Schlüssel listet **alle** Conversations: eine `conv_…`-ID vom Client ist Behauptung | Function prüft Mitglied, Zeile im Haushalt **und** Conversation-Metadaten; `conversation_id` global eindeutig | edge `ai-agent/handler.test.ts` AC-033/034, pgTAP |
| Gefälschte Antwort-IDs löschen fremde Antworten                                                 | vor `DELETE /responses/{id}` gehört die Antwort zur Conversation des Chats                                    | edge AC-030                                       |
| Kosten laufen weg (Web IQ, Tokens)                                                              | 5 Kontingent-Einheiten je Antwort, 20 Antworten je Chat, 120 s, Serper ≤ 8                                    | edge AC-035/036                                   |
| Systemprompt oder Rohdaten gelangen in die App                                                  | nur eigene, mit Zod geprüfte Ereignisse; Karten-Argumente validiert, https-Links, Längen                      | edge AC-037, core `ai-agent.test.ts` AC-019       |
| Prompt-Injection über Webseiten                                                                 | Karten sind Daten, Speichern erst auf Tipp über den Schreibweg; Maps-Link nur aus Serper                      | core AC-017/018                                   |
| Standort landet dauerhaft in Foundry                                                            | gerundet, nur je Nachricht; Löschen löscht Conversation **und** Antworten; Haushalt löschen löscht Chats      | edge AC-028, api AC-031, pgTAP AC-032             |
| Abgebrochene Antwort blockiert den Chat (offener `function_call`)                               | vor jeder Nachricht offene Aufrufe schließen                                                                  | edge AC-038                                       |
| Fehlerpfad Foundry/Serper                                                                       | `ai_unavailable` im Stream, Karten ohne Anreicherung, Löschen bleibt wiederholbar                             | edge, api                                         |
| Suchanfragen verlassen die Azure-Compliance-Grenze (Web IQ)                                     | bewusst akzeptiert (ADR-0018), Agent-Instruktion: keine persönlichen Daten in Suchbegriffen                   | —                                                 |

## Umsetzung

- [ ] 1. Spec, ADR-0018, Glossar, `docs/ARTIFACTS.md`, `docs/specs/README.md`
- [ ] 2. core `ai-agent.ts`: Kontextblock, Umkreis, Zitat-Filter, SSE-Parser, Kartenschema, Anreicherung,
      Items → Nachrichten, Titel, „Zuletzt“ (AC-007, 009–013, 016–019, 025) — rot zuerst
- [ ] 3. Migration `ai_chats` + RPCs + `sync_pull` + `delete_household`, pgTAP (AC-026, 032, 040, 041)
- [ ] 4. api: Tabelle registrieren, Cache 26, `sendAgentMessage`/`loadAgentChat`/`deleteAgentChat`, Haushalt
      löschen (AC-031)
- [ ] 5. Edge Function `ai-agent` mit Tests (AC-028–030, 033–038)
- [ ] 6. `foundry/agents/places-agent.yaml`, Paket `@housekeeping/foundry` (Upsert, Tests), Schritte in `preview.yml`
      und `release.yml` mit `workflows.test.mjs`, `betrieb.md` (AC-042 bis AC-045)
- [ ] 7. App: ✨, Seite, Eingabe, Ort-Fenster, Karten, Verlauf, Offline (AC-001–006, 008, 014, 015, 020–024, 027, 039)
- [ ] 8. e2e `rundgang-ki-agent.spec.ts` (Function per `page.route` nachgebildet)
- [ ] 9. Screenshots (Desktop, Handy), iPhone-Simulator, `/security-check`, höchstens 5 echte Foundry-Läufe
- [ ] Nachweis: `pnpm format:check && pnpm check && pnpm build:web` grün, `pnpm exec supabase test db` grün

## Nachweis

(wird beim Abschluss ergänzt)
