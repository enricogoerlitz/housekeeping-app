---
status: angenommen
datum: 2026-11-27
autor: agent
betrifft:
  [
    0066,
    0067,
    foundry/agents,
    supabase/functions/ai-agent,
    apps/app/src/features/ai-agent,
    .github/workflows/preview.yml,
    .github/workflows/release.yml,
  ]
---

# ADR-0020 — Ein Agent für den Haushalt

## Status

`angenommen` (Spec 0067, Entscheidung 3; beim Bau von Schritt A am 27.11.2026 umgesetzt). Ändert
Spec 0066, Entscheidung 18 („`places-agent` bleibt eigenständig“). ADR-0019 gilt weiter.

## Kontext

Spec 0066 baute den Recherche-Chat mit dem Foundry-Agent `places-agent` (Restaurants und
Aktivitäten). Spec 0067 macht daraus den Housekeeping-Agent: ein Agent `household-agent` mit
Websuche, den Karten von `show_suggestions` und den Lese-Werkzeugen für Rezepte, Kalender, Liste
usw. Offen war, ob ✨ in „Restaurants“ und „Aktivitäten“ weiter den `places-agent` anspricht.

## Optionen

1. **✨ öffnet den einen Agenten mit dem Badge „Ausgehen“; `places-agent` entfällt.** Ein Verlauf,
   eine Instruktion, ein Upsert; Rückfragen („und koch mir was Ähnliches“) kennen das Restaurant.
   Kosten: die Instruktion des zentralen Agenten trägt auch die Regeln der Ortsrecherche.
2. **Zwei Agenten:** ✨ spricht weiter `places-agent`, ⊞ → „Agent“ den `household-agent`. Zwei
   Instruktionen, zwei Versionen, zwei Verläufe mit verschiedenem Können; die Edge Function müsste
   je Chat wissen, welcher Agent ihn führt.

## Entscheidung

Option 1. `foundry/agents/places-agent.yaml` und `.md` entfallen; die Regeln der Ortsrecherche
stehen in `household-agent.md`. Die Function spricht `FOUNDRY_HOUSEHOLD_AGENT` (gepinnte Version
`FOUNDRY_HOUSEHOLD_AGENT_VERSION`) an; die Pipeline setzt beide aus den Ausgaben ihres Upserts
(`household_agent_name`, `household_agent_version`). ✨ öffnet `/ki-agent` mit `badge=ausgehen`;
die Karten mit Serper-Anreicherung (Spec 0066, Entscheidung 6) bleiben, wie sie sind.

## Folgen

- Bestehende Chats von `places-agent` laufen im selben Foundry-Projekt weiter: Eine Conversation
  nimmt jeden Agenten; die nächste Nachricht beantwortet `household-agent` mit dem alten Verlauf.
- Die Agenten `places-agent-local/-preview/-prod` bleiben in Foundry stehen, werden aber nicht mehr
  aktualisiert. Aufräumen von Hand, sobald keine Vorschau oder Veröffentlichung sie mehr nennt.
- Lokal braucht die `.env` `FOUNDRY_HOUSEHOLD_AGENT=household-agent-local` statt
  `FOUNDRY_PLACES_AGENT`.
- Wird der Agent zu groß (≈ 15–20 Werkzeuge, schlechtere Antworten), gilt ADR-0019, Option F:
  Routing in der Edge Function auf Spezial-Agenten in derselben Conversation.

## Neu prüfen, wenn

Die Bewertung in Spec 0067, Schritt D, zeigt, dass Ortsfragen mit dem zentralen Agenten schlechter
werden als mit dem `places-agent` von Spec 0066.
