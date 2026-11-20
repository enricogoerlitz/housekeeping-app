---
name: spec
description: Write a feature specification in docs/specs/NNNN-slug/spec.md with requirement ids, testable acceptance criteria in Gherkin, non-goals and an explicit offline behaviour section. Assigns the number and registers the spec. Use after an idea has been clarified (e.g. with the brainstorming skill), when someone asks for a spec, requirements or acceptance criteria, or before any feature work starts.
argument-hint: "[slug]"
---

# Spec

Turns an agreed idea into a document that a developer, an agent and a test read the same way.
The spec is the maintained artefact; code is reconciled against it. Write it in German.

## Inputs

| Source | What you take from it |
| --- | --- |
| The conversation / brainstorming result | Problem, scope, decisions already made |
| `docs/product/vision.md` | Product direction and domain guidelines that already apply |
| `.agents/glossary.md` | The vocabulary you must use |
| `docs/adr/` | Decisions you must not contradict |
| `docs/architecture/sync.md` | What offline behaviour is possible and how conflicts resolve |
| Existing specs and code | What already exists, so the spec fits reality |

If the idea has not been clarified yet, run the `brainstorming` skill first. A spec written from a
one-line request only looks like agreement.

## Procedure

### 1. Number and folder

Take the next free four-digit number in `docs/specs/`, never reuse one. Create
`docs/specs/NNNN-<slug>/` by copying `docs/specs/0000-template/` (both files).

### 2. Problem, goal, non-goals

In the language of a person using the app. No technology, no solution. **At least two
non-goals** — this is where most misunderstandings die. If you cannot name two, ask.

### 3. Requirements and acceptance criteria

`REQ-NNN` per requirement, one sentence each. Every requirement gets at least one `AC-NNN` in
Gherkin with German keywords:

```gherkin
Angenommen  ein Rezept "Lasagne" mit der Zutat "Milch", Einkaufsregel "1×"
Und         die Lasagne ist für Montag im Wochenplan eingetragen
Wenn        ich die Einkaufsliste aus dem Wochenplan erzeuge
Dann        steht "Milch" mit dem Zusatz "1×" auf der Standardliste
```

A criterion is good when a test can be written from it **without asking a further question**.
Check each: concrete starting state? One action? Observable outcome? Would two developers write
the same test?

**Every requirement needs its failure or edge case**: invalid input, empty state, a second
device changing the same thing, a member of another household.

### 4. Offline behaviour — mandatory section

For each requirement, state one of:

- **offline vollständig** — works without network, syncs later (the default for daily use);
- **offline lesend** — readable offline, changes need network (say why);
- **nur online** — e.g. sign-in, invitations (say what the user sees offline).

And name the conflict case: what happens when two devices change the same thing offline? Use the
rules in `docs/architecture/sync.md`; if none fits, that is an open question.

### 5. Platforms and data

Which platforms need special treatment (iPad layout, web, Android back button). Which data is
read, written, deleted; whether personal data is involved. No table design — that is the plan's
job.

### 6. Open questions

Anything unresolved goes under "Offene Fragen" with options and a recommendation, marked
`BLOCKER` or `OFFEN`. Do not fill gaps with plausible sentences. The spec stays `entwurf` while a
`BLOCKER` exists.

### 7. Register and report

Add a row to the table in `docs/specs/README.md`. Add new domain terms to `.agents/glossary.md`.
Report in German: number of requirements and criteria, open questions, and the next step
(`writing-plans` for `plan.md`, or answering the blockers first).

## Quality bar

| Sign of trouble | What to do |
| --- | --- |
| A criterion says "schnell", "intuitiv", "richtig" | Replace with something observable |
| A requirement has only a happy path | Add the failure or edge case |
| The spec explains how it is built | Move it to `plan.md` |
| A term is missing from the glossary | Add it, or use the existing term |
| More than ~10 requirements | Split the feature; it is too big to review |
| You had to invent a number, limit or format | That is a question, not a decision |

## Do not

- Do not drop a `REQ-ID` later. Mark it `verworfen` with a reason; the id stays.
- Do not write spec and plan in one document. They change at different speeds.
