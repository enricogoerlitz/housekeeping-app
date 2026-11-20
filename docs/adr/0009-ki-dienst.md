---
status: angenommen
datum: 2026-11-20
autor: agent
betrifft: []
---

# ADR-0009 — KI-Dienst

## Status

`angenommen`

## Kontext

Geplant sind KI-Funktionen, etwa Rezept-Import per Link oder Foto und Spracheingabe. Es besteht
bereits ein Zugang zu **Microsoft Foundry**. Dort sind ein Sprachmodell (LLM) und ein
Speech-to-Text-Modell bereitgestellt bzw. geplant. Die App selbst darf keine geheimen Schlüssel
enthalten (`.claude/rules/10-security.md`).

## Entscheidung

KI-Aufrufe laufen über **Microsoft Foundry**, und zwar **ausschließlich serverseitig aus Supabase
Edge Functions**.

- **LLM:** Foundry-Deployment über die OpenAI-kompatible v1-API (Responses API). Ansprechbar mit
  dem offiziellen OpenAI-SDK, Basis-URL `https://<resource>.services.ai.azure.com/openai/v1`.
- **Speech-to-Text:** MAI-Transcribe-2 (allgemein verfügbar, 60 Sprachen, dateibasiert). Als
  Ausweichlösung dient Azure Speech, falls Deutsch-Qualität oder API nicht passen.
- **Modellnamen sind Konfiguration** (`OPENAI_LLM_MODEL`, `OPENAI_STT_MODEL`), nie im Code
  festgeschrieben.
- **Schlüssel** liegen lokal in `.env` und in Produktion als Supabase-Secrets, nie in
  `EXPO_PUBLIC_*`-Variablen.

## Betrachtete Optionen

Die Wahl von Foundry als Anbieter wurde **gesetzt** (vorhandener Zugang). Andere Anbieter wurden
nicht abgewogen.

Abgewogen wurde, **wo** die Aufrufe stattfinden:

### Option A — Serverseitig in Supabase Edge Functions

- **Pro:** Der Schlüssel bleibt auf dem Server. Eingaben werden dort validiert und begrenzt, und
  RLS bzw. Haushaltszugehörigkeit lassen sich prüfen, bevor Kosten entstehen.
- **Contra:** etwas mehr Latenz; eine Edge Function je KI-Funktion.

### Option B — Direkt aus der App

- **Pro:** einfacher.
- **Contra:** Der Schlüssel stünde im App-Bundle, also für jeden lesbar. Damit wären unbegrenzte
  Kosten möglich. Ausgeschlossen.

## Begründung

Ausschlaggebend ist, dass **kein Schlüssel in die App** gelangt.

## Konsequenzen

**Positiv:** kein neuer Dienst, weil Foundry schon da ist. OpenAI-kompatibel, also austauschbar
gegen jeden Anbieter mit derselben API.

**Negativ:**

- KI-Funktionen brauchen Netz. Das passt dazu, dass Schreiben ohnehin online passiert (ADR-0008).
- Rezepttexte, Fotos und Audio verlassen Supabase und gehen an Azure.
- Kosten fallen je Nutzung an. Edge Functions begrenzen Eingabegröße und Häufigkeit.

**Folgearbeiten:** Die erste Spec mit KI-Funktion legt die Edge Function, die Secrets und die
Limits an.

## Wann diese Entscheidung neu bewertet wird

Wenn sich der Foundry-Zugang ändert, die Kosten spürbar werden, oder die deutsche
Transkriptionsqualität nicht reicht.

## Nachtrag 2026-11-20 — Streaming-Transkription und Variablennamen

- **Speech-to-Text ist `MAI-Transcribe-2-Streaming`** statt der dateibasierten Variante: Der Text
  erscheint schon während des Sprechens. Das Modell ist ein Speech-Modell in Foundry und braucht
  **kein eigenes Deployment**. Angesprochen wird es über das Azure Speech SDK
  (`wss://<region>.stt.speech.microsoft.com/speech/universal/v2`, Modellname in der Konfiguration).
  Die Ressource muss in einer Region liegen, die das Modell unterstützt. Deutsch ist laut
  Hersteller über die automatische Spracherkennung abgedeckt; das wird beim ersten Einsatz getestet.
- **Der Schlüssel bleibt serverseitig:** Eine Edge Function tauscht den Foundry-Schlüssel gegen ein
  kurzlebiges Speech-Token (ca. 10 Minuten). Damit streamt der Browser das Mikrofon direkt zu Azure.
- **Ein Schlüssel für alles:** Der „API key“ der Foundry-Ressource gilt für LLM und Speech.
- **Variablennamen** heißen `FOUNDRY_*` statt `OPENAI_*` (siehe `.env.example`). Das OpenAI-SDK
  bekommt Basis-URL und Schlüssel explizit übergeben.

## Nachtrag 2026-11-20 — Ergebnis des Verbindungstests

Getestet mit einer deutschen Testaufnahme (16 kHz, mono) gegen die Foundry-Ressource in
`westeurope`:

| Prüfung | Ergebnis |
| --- | --- |
| LLM über die Responses API, Freitext | ✅ deutsche Antwort in ca. 2,5 s |
| LLM mit strukturierter Ausgabe (JSON-Schema) | ✅ „zwei Liter Milch, sechs Eier, ein Vollkornbrot“ → drei Posten mit Zusatz |
| `mai-transcribe-2-streaming` in `westeurope` | ❌ „requested speech model is not enabled“, weil die Region nicht unterstützt wird |
| Azure Speech Standardmodell, `de-DE`, Streaming | ✅ erstes Zwischenergebnis nach ca. 0,5 s, Endergebnis fehlerfrei |
| Kurzlebiges Speech-Token, ausgestellt mit dem Ressourcenschlüssel (Browser-Ablauf) | ✅ |

**Folge:** Standard für Speech-to-Text ist das **Azure-Speech-Standardmodell mit `de-DE`**
(allgemein verfügbar, in der vorhandenen Ressource). MAI-Transcribe-2-Streaming bleibt eine
Option über `FOUNDRY_STT_MODEL`. Dafür bräuchte es eine Ressource in einer unterstützten Region,
die nächste in der EU ist `swedencentral`. Der Code bleibt derselbe.

Beim Test brachen Verbindungen zu Azure gelegentlich schon beim TLS-Aufbau ab (`ECONNRESET`).
KI-Aufrufe bekommen deshalb Wiederholungsversuche mit Backoff, wie alle Netzaufrufe.
