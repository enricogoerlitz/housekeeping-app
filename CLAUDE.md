@AGENTS.md

## Claude Code

- Use plan mode for critical paths: authentication, Row Level Security, delta sync and the check
  queue, migrations, data deletion, and infrastructure.
- When something is unclear, use `AskUserQuestion` with 2-4 concrete options, each with pros and
  cons, and mark your recommendation.
- Prefer the `Explore` subagent for broad codebase searches so the main context stays clean.
- Plugins are enabled project-wide in `.claude/settings.json` (Superpowers, Expo, impeccable,
  UI UX Pro Max). On first start Claude Code asks to install them; accept once per machine.
