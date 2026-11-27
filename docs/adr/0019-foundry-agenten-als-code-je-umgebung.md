---
status: angenommen
datum: 2026-11-27
autor: agent
betrifft:
  [
    0009,
    0014,
    0066,
    foundry,
    supabase/functions/ai-agent,
    .github/workflows/preview.yml,
    .github/workflows/release.yml,
    docs/architecture/betrieb.md,
  ]
---

# ADR-0019 — Foundry-Agenten als Code je Umgebung

## Status

`angenommen` (Enrico, 27.11.2026, Spec 0066)

## Kontext

Der KI-Agent (Spec 0066, ADR-0018) spricht einen Prompt-Agent in Microsoft Foundry an: Modell,
Instruktion, Web-Suche und die Funktion `show_suggestions`. Weitere Agents werden folgen. Gegeben
sind:

- **Pro Anfrage lässt sich ein Agent nicht überschreiben** (Instruktion, Werkzeuge, Modell; PoC):
  Was in Produktion antwortet, ist allein die Agent-Version.
- **Agents verwaltet man nur mit Entra**; der Ressourcen-Key wird dafür abgelehnt (PoC). Die
  Laufzeit der Edge Function nutzt dagegen den Key.
- **Drei Umgebungen** (lokal, Vorschau, Produktion) teilen sich heute ein Foundry-Projekt.
- **Spec 0014, Entscheidung 3:** Jobs mit der Umgebung `production` installieren keine Pakete und
  führen keinen Paket-Code aus; `workflows.test.mjs` prüft das für alle Umgebungs-Jobs.
- Die Foundry-Ressource liegt in einem anderen Entra-Tenant als die Static Web Apps; die
  vorhandene OIDC-Identität der Pipeline reicht nicht hinüber.

## Entscheidung

Jeder Agent ist eine YAML-Datei in `foundry/agents/<name>.yaml` (Schlüssel wie Foundrys YAML einer
Agent-Version, Instruktion als Markdown daneben). Er wird **je Umgebung mit Suffix** angelegt
(`places-agent-local`, `-preview`, `-prod`): lokal per `pnpm foundry:agents:local`, in der Vorschau
von `preview.yml`, in Produktion von `release.yml`, jeweils **vor** dem Deploy der Functions, als
Upsert (neue Version nur bei geänderter Definition). Die Pipeline **pinnt die Version**, die ihr
Upsert nennt, als Function-Secret (`FOUNDRY_PLACES_AGENT_VERSION`); lokal darf sie leer sein (dann
antwortet die neueste). Der Upsert spricht die **REST-API mit einem Entra-Token der Azure CLI**
an: in GitHub per `azure/login` mit OIDC (eigene App-Registrierung im Foundry-Tenant, Rolle
„Foundry User“ auf dem Projekt), lokal mit `az login`.

## Betrachtete Optionen

### Option A — YAML im Repo, Upsert je Umgebung über REST, Version gepinnt (gewählt)

- **Pro:** Was in einer Umgebung antwortet, steht im Repo und ändert sich nur mit dem Lauf, der
  auch die Function ausliefert; ein Klick im Portal ändert die Produktion nicht.
- **Pro:** Die Pipeline führt nur eigenen Code aus (ein gebündeltes Skript ohne Fremdpakete, gebaut
  im Job ohne Umgebung): Entscheidung 3 aus Spec 0014 bleibt wahr.
- **Contra:** Eigener Code für vier REST-Aufrufe (Liste der Versionen, Version anlegen, Agent
  anlegen); bei einer API-Änderung passen wir ihn selbst an.
- **Contra:** Eine zweite Entra-App im Foundry-Tenant mit Föderation je Umgebung (Einrichtung durch
  Enrico).

### Option B — Offizielles SDK `@azure/ai-projects` mit `DefaultAzureCredential`

- **Pro:** Microsoft pflegt die API-Abbildung; Version 2.11.0 kann Agents mit Versionen
  (`agents.createVersion`, `agents.listVersions`), geprüft am 27.11.2026.
- **Contra:** Es zieht rund 60 Pakete (u. a. `openai`, `@azure/storage-blob`) in den Job, der das
  Agent-Token hält. Das bricht Entscheidung 3 aus Spec 0014 (kein Paket-Code in Umgebungs-Jobs);
  ein Bündel davon wäre weiterhin Fremdcode mit Token.
- **Contra:** `DefaultAzureCredential` nahm lokal den falschen Tenant, wenn `az` mehrere Konten
  hält; der Upsert brauchte ohnehin den CLI-Weg mit `--subscription`.

### Option C — `azd ai agent` oder Python `azure-ai-projects` in der Pipeline

- **Pro:** Werkzeug von Microsoft, ohne eigenen Code.
- **Contra:** Installation im Umgebungs-Job (Entscheidung 3), eine weitere Laufzeit (Python) bzw.
  Vorschau-Erweiterung; die Ausgabe ist schwer auf „nur Name und Version“ zu begrenzen.

### Option D — Agent im Portal pflegen, Version per Hand ins Secret

- **Pro:** Kein Code.
- **Contra:** Nicht reproduzierbar, kein Review, Vorschau und Produktion laufen leicht auseinander.

### Option E — Ohne Version ansprechen (immer die neueste)

- **Pro:** Ein Secret weniger.
- **Contra:** Jede neue Version (auch ein Versuch im Portal) geht sofort an alle Haushalte; der PoC
  zeigte, wie leicht Instruktionsänderungen zurückfallen (Haushaltsagent v1 → v3). Lokal ist es
  trotzdem praktisch, deshalb dort erlaubt.

### Option F — Ein zentraler Agent mit Spezialisten (Foundry „connected agents“, A2A)

- **Pro:** Fokussierte Instruktionen je Bereich, unabhängige Versionen der Spezialisten.
- **Contra:** Je Spezialist ein weiterer Modelllauf: mehr Latenz (heute schon 15–25 s) und
  Kosten; schwerer zu debuggen, weil Antworten über mehrere Agents laufen.
- **Entscheidung dazu:** Vorerst ein zentraler Agent mit Werkzeugen (Schritt 2, Spec 0066,
  Entscheidung 14). `places-agent` bleibt eigenständig (eigene YAML, Instruktion, Version), damit er
  später ohne Umbau Spezialist werden kann. Den Wechsel schlagen wir vor, wenn der zentrale Agent
  aufbläht: etwa 15–20 Werkzeuge oder mehr, sich störende Instruktionen verschiedener Bereiche oder
  messbar schlechtere Antworten.
- **Spätere Option, nicht gebaut (Spec 0067):** Ein Orchestrator `household-agent` mit
  Spezialisten als „connected agents“ (in Foundry eingebunden) oder über A2A (eigener Endpunkt je
  Spezialist). Abwägung im Einzelnen:

  | Gesichtspunkt        | Ein Agent mit Werkzeugen (heute)                                       | Orchestrator + Spezialisten                                                                                                                                                                                                                             |
  | -------------------- | ---------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
  | Latenz, Kosten       | ein Modelllauf je Runde                                                | je Spezialist ein weiterer Lauf; Kontingent je Antwort neu bemessen                                                                                                                                                                                     |
  | Instruktionen        | eine, wächst mit jedem Bereich                                         | je Bereich kurz und getrennt versionierbar                                                                                                                                                                                                              |
  | Haushaltsdaten (RLS) | Funktions-Werkzeuge laufen in der Edge Function mit dem JWT der Person | Spezialisten, die Haushaltsdaten brauchen, müssen ihre Funktionsaufrufe ebenfalls an die Edge Function zurückgeben; ob Foundry das für eingebundene Agents durchreicht, ist zu prüfen — sonst nur Spezialisten ohne Haushaltsdaten (wie `places-agent`) |
  | Schrittzeile, Stream | alle Schritte im eigenen Stream                                        | Schritte der Spezialisten sind nur so sichtbar, wie Foundry sie streamt                                                                                                                                                                                 |
  | Fehlersuche          | eine Conversation                                                      | Antwort über mehrere Agents verteilt; Löschen muss jede Antwort jedes Agents erfassen                                                                                                                                                                   |
  | Pipeline             | eine YAML je Agent, Upsert je Umgebung                                 | bleibt gleich; zusätzlich Reihenfolge (Spezialisten vor dem Orchestrator) und gepinnte Versionen der Spezialisten im Orchestrator                                                                                                                       |

  Was Spec 0067 dafür ändern müsste, steht in Spec 0066 unter Entscheidung 18.

## Begründung

Ausschlaggebend ist, dass im Job mit Produktions-Token nur eigener, reviewter Code läuft (Spec
0014, Entscheidung 3). Option B wäre bequemer, verletzt das aber; der REST-Weg ist klein (vier
Aufrufe) und vollständig mit Fake-`fetch` getestet. Das Pinnen der Version folgt aus der
Reproduzierbarkeit: Function und Agent einer Umgebung kommen aus demselben Lauf.

## Konsequenzen

**Positiv:** Ein neuer Agent ist eine YAML-Datei; Vorschau und Produktion bekommen ihn mit dem
nächsten Lauf. Zurück geht es mit der alten Versionsnummer im Secret.

**Negativ:**

- Spec 0014, AC-045 und Entscheidung 8 ändern sich: Die Pipeline setzt neben `ALLOWED_ORIGINS` auch
  `FOUNDRY_PROJECT_ENDPOINT`, `FOUNDRY_PLACES_AGENT` und `FOUNDRY_PLACES_AGENT_VERSION` (keine
  Schlüssel; `FOUNDRY_API_KEY` und `SERPER_API_KEY` setzt weiter Enrico).
- Eine Entra-App mit Rolle „Foundry User“ auf dem Projekt kann dort Agents anlegen und Chats
  lesen; die Föderation bindet sie an die GitHub-Umgebungen `preview` und `production`.
- Fehlt eine Variable oder die Rolle, bricht die Auslieferung mit einer deutschen Meldung ab statt
  still ohne Agent weiterzulaufen.

**Folgearbeiten:** Einrichtung durch Enrico (`docs/architecture/betrieb.md`, „KI-Agent“). Weitere
Agents (Schritt 2) als weitere YAML-Dateien.

## Wann diese Entscheidung neu bewertet wird

- Wenn Spec 0014, Entscheidung 3 fällt oder ein schlankes offizielles Werkzeug ohne
  Fremdabhängigkeiten erscheint.
- Wenn Vorschau und Produktion getrennte Foundry-Projekte bekommen (dann je Umgebung ein Endpoint,
  die Suffixe könnten entfallen).
- Wenn Foundry Agents pro Anfrage überschreibbar macht.
