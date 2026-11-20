---
paths:
  - '.claude/**'
  - 'AGENTS.md'
  - 'CLAUDE.md'
---

# Editing the agent setup

- `AGENTS.md` stays under 150 lines. Anything that applies only to some files becomes a rule here
  with `paths:`; anything that is a multi-step procedure becomes a skill.
- `CLAUDE.md` must keep the line `@AGENTS.md`. Without it Claude Code silently ignores every rule
  in `AGENTS.md`.
- Do not put a `README.md` into `.claude/rules/` or `.claude/agents/`: every Markdown file there
  is loaded as a rule or a subagent.
- Own skills follow the Agent Skills format: a folder with `SKILL.md`, frontmatter `name` and
  `description`; the description says what it does and when to use it. Long reference material
  goes into `references/` next to it. Use the `skill-creator` skill to write or improve one.
- Vendored third-party skills are not edited in place — local edits are lost on update. To change
  one, copy it under a new name and say so.
- Two skills must not cover the same job. Before adding one, check the table in `AGENTS.md`.
- After changing the setup, update the tables in `AGENTS.md` and `README.md`.
