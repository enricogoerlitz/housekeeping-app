---
status: angenommen
datum: 2026-11-27
autor: agent
betrifft:
  [
    0008,
    0009,
    0066,
    supabase/functions/ai-agent,
    supabase/migrations,
    apps/app/src/features/ai-agent,
    docs/architecture/betrieb.md,
  ]
---

# ADR-0018 — Inhalt der KI-Agent-Chats und das Lesen ohne Netz

## Status

`angenommen` (Enrico, 27.11.2026, Spec 0066)

## Kontext

Spec 0066 bringt einen Recherche-Chat („KI-Agent“) für Restaurants und Aktivitäten. Er läuft über
einen Prompt-Agent in Microsoft Foundry (Modell `gpt-6.1-terra`, Web-Suche Web IQ, Funktion
`show_suggestions`). Foundry speichert jeden Chat als Conversation mit allen Nachrichten,
Suchschritten und Antworten (PoC `tmp/ki-chat-poc/BERICHT.md`). Dagegen stehen drei Regeln:

- **Regel 4 / ADR-0008:** Die UI liest nur aus dem lokalen Cache; einzige Online-Lesung ist bisher
  die Versionsprüfung.
- **10-security:** Wir speichern so wenig wie möglich; Löschen eines Haushalts löscht alles.
- **ADR-0009:** KI nur serverseitig aus Edge Functions.

Dazu ein Fakt aus dem PoC: Der Ressourcen-Key, mit dem die Laufzeit (Conversations, Responses)
arbeitet, kann alle Conversations des Projekts lesen, auch die anderer Haushalte.

## Entscheidung

Die Seite „KI-Agent“ ist die **zweite Ausnahme von „offline lesbar“**: Den Inhalt eines Chats lädt
sie online über `ai-agent` aus der Foundry-Conversation; im Cache liegt nur die Liste der Chats
(`ai_chats`: Verweise, Titel, Ort, wer, Antwort-IDs). Wie der Foundry-Agent selbst als Code je
Umgebung entsteht, regelt ADR-0019.

## Betrachtete Optionen

### Option A — Inhalt nur in Foundry, Liste im Cache (gewählt)

- **Pro:** Keine zweite Kopie der Chats (Standort, Vorlieben) in Postgres oder auf Geräten; Löschen
  ist ein Weg (Conversation, Antworten, Zeile). Wenig Schema: eine Verweis-Tabelle.
- **Pro:** Der Verlauf (Liste) ist offline sichtbar und haushaltsweit synchron wie alles andere.
- **Contra:** Einen alten Chat öffnet man nur mit Netz; jedes Öffnen kostet einen Foundry-Aufruf
  (Items-API, keine Modellkosten).
- **Contra:** Abhängigkeit von Foundrys Aufbewahrung und Items-Format (in `packages/core`
  gekapselt: `messagesFromItems`).

### Option B — Nachrichten zusätzlich in Postgres speichern und synchronisieren

- **Pro:** Offline lesbar wie alles andere; unabhängig vom Items-Format.
- **Contra:** Chatinhalte (Standorte, Vorlieben, Webtexte) lägen doppelt, auf allen Geräten, und
  müssten mit Foundry konsistent gelöscht werden. Große, wachsende Zeilen im Delta-Sync.
- **Contra:** Widerspricht „wir speichern keine Chats“ aus dem PoC und der Spec.

### Option C — Die letzten Antworten nur lokal auf dem Gerät zwischenspeichern

- **Pro:** Kurzfristig offline lesbar, ohne Server-Schema.
- **Contra:** Inhalt pro Gerät verschieden, beim Abmelden zu löschen, nicht haushaltsweit; die
  anderen Mitglieder sähen ihn trotzdem nur online. Zusätzliche Löschpflicht ohne Nutzen für den
  Hauptfall (Recherche passiert ohnehin online).

## Begründung

Ausschlaggebend ist die Datensparsamkeit: Der Chatinhalt enthält Standorte und Vorlieben, und eine
zweite Kopie bringt Löschpflichten ohne Gegenwert, weil Recherchieren ohnehin Netz braucht.

## Konsequenzen

**Positiv:** Ein Ort für den Inhalt (Foundry), ein Ort für die Zuordnung (unsere Tabelle mit RLS).
Löschen eines Chats oder Haushalts ist vollständig: Conversation, jede Antwort (`resp_…`, sie
überleben das Löschen der Conversation), Zeile; `delete_household` lehnt ab, solange Chats übrig
sind. Die Edge Function ist der einzige Weg zu Foundry und prüft je Aufruf Mitgliedschaft, Zeile im
Haushalt **und** die Metadaten der Conversation (`household_id`), weil der Key alle Chats lesen kann.

**Negativ:**

- Offline zeigt die Seite nur den Verlauf; die Eingabe ist deaktiviert („Offline – zum Recherchieren
  brauchst du Netz“), ein Chat öffnet nicht.
- **Datenschutz:** Suchanfragen gehen an Web IQ außerhalb der Azure-Compliance-Grenze (eigene
  Bedingungen von Bing/Web IQ). Bewusst akzeptiert für einen privaten Haushalt; die Instruktion
  verbietet Personennamen und Koordinaten in Suchbegriffen, Koordinaten gehen gerundet (≈ 100 m) und
  nur je Nachricht an den Agent.
- Foundry hält Chats unbegrenzt, bis wir löschen; ein Haushalt, der außerhalb der App gelöscht wird
  (direkt in der Datenbank), hinterließe Conversations. Die Metadaten (`household_id`) erlauben dann
  ein Aufräumen per Skript.
- Die Laufzeit nutzt den vorhandenen `FOUNDRY_API_KEY`; der Key kann alle Conversations des
  Projekts lesen, deshalb ist unsere Tabelle der einzige Index von Haushalt zu Chat.

**Folgearbeiten:** Schritt 2 (Haushaltsdaten als eigene Werkzeuge der Edge Function, Spec 0066,
Entscheidung 14).

## Wann diese Entscheidung neu bewertet wird

- Wenn Chats offline gelesen werden sollen (Wunsch von Enrico oder häufige Nutzung unterwegs).
- Wenn Foundry das Aufbewahrungs- oder Items-Format ändert oder Agents pro Anfrage
  überschreibbar werden.
- Wenn die Web-IQ-Bedingungen sich ändern oder ein Anbieter innerhalb der Compliance-Grenze die
  Web-Suche übernimmt.
