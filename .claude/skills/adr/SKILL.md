---
name: adr
description: Record an architecture decision in MADR format - context, the options that were genuinely considered with their trade-offs, the decision, its consequences, and what would make it worth revisiting. Assigns the number and updates the index. Use when choosing between technologies or patterns, when deviating from a convention, or when a decision will bind other work.
argument-hint: "[title]"
---

# ADR

**Without a title**, ask what decision is being recorded before you start.

A decision record exists so that a year from now, someone who wants to change this knows what it
was weighed against. It is not documentation of what was built; it is documentation of why the
alternative was rejected.

## When one is warranted

- A choice between technologies, libraries or patterns.
- An interface or data model that other parts will depend on.
- A deliberate deviation from a convention.
- A decision affecting cost, operations or security.
- A decision that is expensive to reverse.

**Not warranted** when the answer follows from the code, or when it only affects the task at
hand — that belongs in the "Offene Fragen" section of the feature's `spec.md`.

If in doubt: would someone reasonable arrive at a different answer? If yes, write it down.

## Procedure

### 1. Number and file

Next free four-digit number in `docs/adr/`, never reused. File `NNNN-kurzer-titel.md`, copied from
`0000-template.md`. Title as a noun phrase describing the subject, not the outcome —
`0004-format-fuer-den-csv-export.md`, not `0004-wir-nehmen-semikolon.md`. The subject stays stable
even if the decision is later revised.

### 2. Context — write this first

The forces that constrain the decision: technical, organisational, temporal, financial. What is
given and not up for debate. What problem prompted this.

Write it so someone who was not there understands the pressure. A decision that looks wrong in
hindsight is usually a decision whose context was not recorded.

### 3. Options — the part that matters

At least two, each one someone could actually have chosen. If you cannot name a second real
option, either there was no decision to record, or you have not looked hard enough.

For each option, trade-offs that are concrete: effort, risk, reversibility, cost, operational
burden, who it affects, what it forecloses. Not "moderner" or "besser".

**No straw men.** An ADR whose alternatives are obviously bad is a rationalisation. Its whole
value comes from having taken the alternatives seriously.

### 4. Decision and rationale

One active sentence. Then: which criterion decided it. Usually one factor outweighs the others —
name it.

### 5. Consequences — including the bad ones

What becomes easier. What becomes harder, and what is being accepted deliberately. Follow-up work
this creates, and where it is tracked.

An ADR with only positive consequences has not been thought through. Every real decision costs
something.

### 6. Revisit criteria

What event or measurement would make this worth looking at again — a load threshold, a version,
a team size, a supplier change. This turns a decision into something maintainable rather than
permanent by default.

### 7. Register

Add a row to the table in `docs/adr/README.md`.

## Revising a decision

Never rewrite an existing ADR. Write a new one that references the old, and set the old one's
status to `abgelöst durch ADR-NNNN`. The history of the reasoning is the point.

## Do not

- Do not write an ADR after the fact to justify a decision that was never weighed. Say instead
  that it was decided implicitly.
- Do not invent alternatives you did not consider.
- Do not write it as a design document. The design goes in the feature's `plan.md`.
- Do not skip the negative consequences.
