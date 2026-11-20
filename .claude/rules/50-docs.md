---
paths:
  - 'docs/**'
  - '.agents/**'
---

# Documentation

- Documents for people are **German**: specs, plans, ADRs, vision, glossary.
- A feature has exactly two files: `docs/specs/NNNN-slug/spec.md` (what and why) and `plan.md`
  (how, tasks, evidence). Start from `docs/specs/0000-template/`.
- Numbers are four digits, assigned in order, never reused. Specs: `NNNN-slug`. ADRs:
  `NNNN-titel.md` with the subject as a noun phrase, not the outcome.
- Identifiers: `REQ-NNN` per spec, `AC-NNN` per spec, tasks numbered within the plan.
- Acceptance criteria in Gherkin, German keywords (`Angenommen`, `Wenn`, `Dann`, `Und`).
- Use glossary terms. A new domain term goes into `.agents/glossary.md` in the same change.
- Never rewrite an accepted ADR. Write a new one and mark the old one `abgelöst durch ADR-NNNN`.
- Diagrams as Mermaid in Markdown, so they diff and render on GitHub.
- Write for a reader who was not in the conversation. No "as discussed".
