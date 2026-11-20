---
name: glossary
description: Maintain the project's ubiquitous language in .agents/glossary.md - one entry per domain term with its definition, its identifier in code, and the synonyms that must not be used. Detects when the same concept has acquired several names. Use when a spec introduces a new term, when code and documentation disagree on wording, or when asked about domain vocabulary.
argument-hint: "[term]"
---

# Glossary

**Without a term**, run the drift sweep in *Sweeping for drift* below instead of adding an entry.

Agents invent synonyms. Rechnung, Invoice, Beleg, Faktura — four names, one concept, four sets of
code that do not quite line up. The glossary is a small file with an outsized effect, because
every skill reads it before naming anything.

File: `.agents/glossary.md`.

## Entry format

```markdown
### Rechnung

Eine an einen Kunden gestellte Zahlungsaufforderung über erbrachte Leistungen.
Entsteht aus einem Auftrag, hat genau einen Empfänger und mindestens eine Position.

- **Im Code:** `Invoice` (Klasse), `invoice` (Variable), `invoices` (Tabelle)
- **Nicht verwenden:** Beleg, Faktura, Abrechnung
- **Abgrenzung:** Ein *Angebot* ist noch keine Rechnung. Eine *Gutschrift* ist eine eigene Entität.
- **Siehe auch:** [Rechnungsposition](#rechnungsposition), [Gutschrift](#gutschrift)
```

Every entry carries: what it means, what it is called in code, which words are forbidden for it,
and where it stops. The boundary line is the one people skip and the one that prevents the most
confusion.

## When to add a term

- It appears in a spec and is not obvious to someone new to the domain.
- Two documents or two parts of the code call it differently.
- The business side and the code disagree about what it covers.
- A term looks like an everyday word but means something specific here.

Do not add generic technical vocabulary. `Repository`, `Controller`, `Cache` belong in the code
conventions, not in the domain glossary.

## Procedure

### Adding a term

1. Check whether it already exists under a different name. If it does, that is the more important
   finding: one of the two names has to go.
2. Write the definition from how the business side uses it, not from how the code models it. If
   they differ, that is worth surfacing — usually the model is behind.
3. Fix the code identifier. German domain term, English identifier is the common and workable
   split; whatever the project does, do it consistently.
4. List the synonyms you have seen in this project. Those are the ones that will come back.
5. Draw the boundary: what is *nearly* this, and is not.

### Sweeping for drift

Run over specs, ADRs, UI copy and the code, and look for:

- The same concept under several names.
- One name covering two concepts — worse than the reverse and harder to see.
- A glossary term whose code identifier no longer exists.
- Terms used in specs that are not in the glossary at all.

Report findings as a list with locations, and propose which name wins and why. **Do not rename
code as part of this.** A rename is a `/refactor`, decided separately.

### Keeping it honest

An entry whose code identifier is gone gets corrected or removed. A glossary nobody trusts is
worse than none, because the agent believes it.

## Do not

- Do not fill it with definitions of ordinary words.
- Do not write a definition you inferred without marking it as unverified. Ask instead.
- Do not rename code from here.
- Do not delete a term because it fell out of use. Mark it historical and say what replaced it.
