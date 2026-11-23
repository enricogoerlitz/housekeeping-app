---
paths:
  - 'docs/**'
  - '.agents/**'
---

# Documentation

- Documents for people are **German**: specs, ADRs, vision, glossary.
- A feature has exactly one file: `docs/specs/NNNN-slug/spec.md` (goal, requirements, decisions,
  data, risks on critical paths, tasks and evidence). Start from `docs/specs/0000-template/`.
  Keep it compact: no repetition, no tables nobody reads. Specs 0001–0018 keep their `plan.md`.
- Numbers are four digits, assigned in order, never reused. Specs: `NNNN-slug`. ADRs:
  `NNNN-titel.md` with the subject as a noun phrase, not the outcome.
- Identifiers: `REQ-NNN` per spec, `AC-NNN` per spec, tasks numbered within the spec.
- Acceptance criteria as one line each with German Gherkin keywords:
  `- AC-001: Angenommen … · Wenn … · Dann … (Und …)` — concrete names, dates and copy in „…“.
- Use glossary terms. A new domain term goes into `.agents/glossary.md` in the same change.
- Never rewrite an accepted ADR. Write a new one and mark the old one `abgelöst durch ADR-NNNN`.
- Diagrams as Mermaid in Markdown, so they diff and render on GitHub.
- Write for a reader who was not in the conversation. No "as discussed".
