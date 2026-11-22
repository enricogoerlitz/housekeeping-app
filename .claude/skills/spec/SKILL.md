---
name: spec
description: Write a compact feature specification in docs/specs/NNNN-slug/spec.md (one file, no separate plan) with requirement ids, one-line testable acceptance criteria in German Gherkin, non-goals, offline behaviour per requirement, decisions, data, risks on critical paths and a task checklist. Assigns the number and registers the spec. Use after an idea has been clarified (e.g. with the brainstorming skill), when someone asks for a spec, requirements or acceptance criteria, or before any feature work starts.
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
`docs/specs/NNNN-<slug>/spec.md` by copying `docs/specs/0000-template/spec.md`. There is no
`plan.md`: tasks and evidence live at the end of the spec.

### 2. Problem, goal, non-goals

In the language of a person using the app. No technology, no solution. **At least two
non-goals** — this is where most misunderstandings die. If you cannot name two, ask.

### 3. Requirements and acceptance criteria

`REQ-NNN` per requirement, one sentence each, with its source and its offline line. Every
requirement gets at least one `AC-NNN`, written on **one line** with German Gherkin keywords:

```markdown
- AC-001: Angenommen „Lasagne“ mit der Zutat „Milch“ steht am Montag im Kalender · Wenn ich
  „Auf die Liste“ wähle · Dann steht „Milch“ mit „1×“ auf der Einkaufsliste
```

A criterion is good when a test can be written from it **without asking a further question**.
Check each: concrete starting state? One action? Observable outcome? Would two developers write
the same test?

**Every requirement needs its failure or edge case**: invalid input, empty state, a second
device changing the same thing, a member of another household.

### 4. Offline behaviour — per requirement

Each requirement says **offline vollständig** (works without network, syncs later), **offline
lesend** (changes need network; say why) or **nur online** (say what the user sees offline).
Conflicts follow `docs/architecture/sync.md`; if no rule fits, that is an open question.

### 5. Decisions, data, risks, tasks

- **Entscheidungen:** numbered, one or two lines each with the reason. A changed acceptance
  criterion of an older spec is named here ("ersetzt Spec 0006, AC-012").
- **Daten:** what is read, written, deleted; schema changes; personal data; what is dropped.
- **Risiken:** only on a critical path (`00-core.md`): a short table risk | countermeasure | test,
  with the negative tests (foreign household, signed out, invalid input, failure path).
- **Umsetzung:** a task checklist referencing the ACs, ending with the evidence commands.

Keep it compact: no repetition, no traceability tables (test names carry the AC id), a text
sketch of at most a few lines only where a layout changes.

### 6. Open questions

Anything unresolved goes under "Entscheidungen" as `OFFEN: …` with the assumption you build on,
or `BLOCKER: …` with options and a recommendation. Do not fill gaps with plausible sentences. The spec stays `entwurf` while a
`BLOCKER` exists.

### 7. Register and report

Add a row to the table in `docs/specs/README.md`. Add new domain terms to `.agents/glossary.md`.
Report in German: number of requirements and criteria, open questions, and the next step
(building from the task checklist, or answering the blockers first).

## Quality bar

| Sign of trouble | What to do |
| --- | --- |
| A criterion says "schnell", "intuitiv", "richtig" | Replace with something observable |
| A requirement has only a happy path | Add the failure or edge case |
| The spec explains code in detail | Keep only decisions; the code shows the rest |
| A term is missing from the glossary | Add it, or use the existing term |
| More than ~15 requirements | Split the feature; it is too big to review |
| You had to invent a number, limit or format | That is a question, not a decision |

## Do not

- Do not drop a `REQ-ID` later. Mark it `verworfen` with a reason; the id stays.
- Do not create a separate `plan.md`; specs 0001–0018 keep theirs as history.
