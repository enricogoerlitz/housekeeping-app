---
status: angenommen
datum: 2026-11-20
autor: agent
betrifft: []
---

# ADR-0006 — KI-gestützte Arbeitsweise

## Status

`angenommen`

## Kontext

Die App wird überwiegend mit Coding-Agents entwickelt. Damit das zuverlässig klappt, brauchen
Agents feste Leitplanken: was zu bauen ist (Specs), wie gearbeitet wird (Prozess-Skills), wie
es aussehen soll (Design-Skills) und wie der Stack funktioniert (Stack-Skills). Ausgangspunkt war
die Vorlage `agentic-ai-template`, ohne deren Projektmanagement-Teil. Viele beliebte Skills
überschneiden sich; zu viele Skills konkurrieren um Kontext und Auslösung.

## Entscheidung

- **Spec-getrieben:** pro Feature `spec.md` und `plan.md` (statt fünf Dateien in der Vorlage).
  Akzeptanzkriterien in Gherkin, testgetriebene Umsetzung.
- **Superpowers** ist das Prozess-Rückgrat: Brainstorming, Pläne, TDD, Debugging, Umsetzung mit
  Subagents, Prüfung vor „fertig“. Es schreibt in unsere Spec-Ordner.
- **Kuratierte Skills**: eine Auswahl je Aufgabe, keine zwei für denselben Job. Siehe die Tabelle
  in `AGENTS.md`.
- **Eigene Skills** nur für Projektspezifisches: `spec`, `db-change`, `ui-verify`, dazu `adr`,
  `glossary` und `security-check` aus der Vorlage.

## Betrachtete Optionen

### Option A — Superpowers + eigene Projekt-Skills

- **Pro:** erprobter Prozess (über 300 000 GitHub-Sterne). Eigene Skills decken nur, was
  Superpowers nicht weiß: unsere Spec-Form, Datenbank + Sync, Screenshots.
- **Contra:** Superpowers bringt eigene Standardpfade mit; die Überschreibung muss in `AGENTS.md`
  stehen.

### Option B — Vorlage komplett übernehmen (23 Skills)

- **Pro:** bekannt, auf Deutsch durchdacht.
- **Contra:** ausgelegt auf Teams mit Projektleitung (Discovery, Klickdummy, Release, DoR/DoD).
  Viel Kontext für ein Zwei-Personen-Projekt.

### Option C — Matt Pococks oder Addy Osmanis Sammlungen als Prozess

- **Pro:** ebenfalls stark (`grill-with-docs`, `spec-driven-development`).
- **Contra:** Überschneidung mit Superpowers. Beides parallel führt zu konkurrierenden Abläufen.

## Begründung

Ausschlaggebend ist **ein Prozess statt mehrerer konkurrierender**. Superpowers ist der
verbreitetste. Was projektspezifisch ist, bleibt in wenigen eigenen Skills.

## Bewusst nicht aufgenommen

| Skill                         | Grund                                                                                                                       |
| ----------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| Ponytail                      | greift bei jeder Aufgabe, ändert den Antwortstil, konkurriert mit Superpowers. Das Prinzip steht als Regel 7 in `AGENTS.md` |
| Caveman                       | Telegrammstil spart Tokens, schadet aber Erklärungen auf Deutsch                                                            |
| Graphify, Understand-Anything | zum Verstehen großer, fremder Codebasen; hier Greenfield. Neu bewerten, wenn das Repo groß ist                              |
| Taste-Skill                   | zielt auf Landingpages, nicht App-UI                                                                                        |
| Anthropic `frontend-design`   | überschneidet sich mit impeccable                                                                                           |
| Archify                       | Repository nicht mehr auffindbar                                                                                            |

## Konsequenzen

**Positiv:** Jede Aufgabe hat genau einen passenden Skill. Agents finden Specs, Regeln und
Begriffe immer an derselben Stelle.

**Negativ:** Fremde Skills laufen mit vollen Agent-Rechten. Sie werden eingecheckt, per
`skills-lock.json` auf einen Commit festgelegt, und Updates werden vor dem Commit gelesen. Plugins
kommen nur aus offiziellen Marktplätzen oder direkt von den Autoren.

**Folgearbeiten:** Ein Skill `feature-scaffold` entsteht, sobald das erste Feature ein Muster
etabliert hat. Vorher gäbe es nichts, wonach er sich richten könnte.

## Wann diese Entscheidung neu bewertet wird

Wenn ein Skill regelmäßig falsch auslöst oder gar nicht genutzt wird, oder wenn das
Agent-Setup spürbar Kontext frisst (`/context`).
