---
name: security-check
description: Review code or a diff against an OWASP-based checklist covering injection, access control, authentication and sessions, secrets, data privacy, dependencies and frontend storage. Reports every finding with location, why it is risky, a concrete fix and a severity - it reports, it never blocks and never silently changes code. Use before finishing a task, during review, when touching authentication, permissions, data handling or external input, or when asked to check security.
argument-hint: "[path|diff]"
---

# Security check

A review, not a gate. It finds problems and explains the fix. Nothing here stops work — deciding
what to fix is a human decision informed by this report.

Named `security-check` rather than `security-review` on purpose: a project skill replaces a
built-in one of the same name, and the built-in `/security-review` is worth keeping as a second
opinion.

## Scope

- No argument → the working-tree diff against the base branch.
- A path → that file or directory.
- `diff` → staged and unstaged changes.

For a diff, also read enough surrounding code to judge it. A line looks fine until you see that
the caller passes user input.

## Procedure

### 1. Understand the change

What does this code do, what data flows through it, and where does that data come from? Every
finding below depends on knowing which inputs are attacker-controlled.

Map the trust boundaries: HTTP request, uploaded file, message queue, external API response,
database row written by someone else, environment, CLI argument. Anything crossing one is hostile
until validated.

### 2. Work the checklist

Load only the reference files relevant to the code in front of you — they exist so this file stays
short:

| Reference | Read it when the code involves |
| --- | --- |
| `references/owasp-web.md` | HTTP handlers, HTML rendering, queries, outbound requests, redirects |
| `references/access-control.md` | Any resource lookup, roles, tenancy, ownership |
| `references/auth-session.md` | Login, logout, tokens, sessions, password handling, MFA |
| `references/secrets.md` | Configuration, credentials, keys, anything read from the environment |
| `references/data-privacy.md` | Personal data, logging, exports, retention, deletion |
| `references/dependencies.md` | A changed lock file, a new package, a version bump |
| `references/frontend.md` | Browser code, storage, DOM manipulation, third-party scripts |

Always run the baseline in `.claude/rules/10-security.md` regardless of which references apply.

### 3. Judge each finding

Severity is about consequence and reachability, not category:

| Severity | Meaning |
| --- | --- |
| `kritisch` | Reachable by an unauthenticated attacker, leads to data loss, data exposure or takeover |
| `hoch` | Reachable by an authenticated attacker, or exposes personal data |
| `mittel` | Requires unusual conditions, or weakens defence in depth |
| `niedrig` | Hardening, best practice, no concrete exploit path |
| `hinweis` | Worth knowing, not a defect |

**Do not report a category without a path.** "Uses SQL" is not a finding. "Line 42 concatenates
`req.query.sort` into an ORDER BY clause, so a crafted sort parameter changes the query" is.

If you are unsure whether input is attacker-controlled, say so and mark it `mittel` with the
uncertainty named. Do not inflate and do not hide.

### 4. Report

Per finding, in German:

```
[hoch] Unparametrisierte Query in der Rechnungssuche
  Ort:      src/invoices/repository.ts:42
  Problem:  `req.query.sort` wird direkt in die ORDER-BY-Klausel eingesetzt.
            Ein präpariertes sort-Argument verändert die Abfrage.
  Angriff:  GET /invoices?sort=id;DROP TABLE...
  Fix:      Allowlist der erlaubten Sortierspalten, Eingabe dagegen prüfen,
            dann den geprüften Bezeichner einsetzen.
  Bezug:    .claude/rules/10-security.md — Injection
```

End with a short summary: counts by severity, and the one thing to fix first.

If there is nothing to report, say so plainly and name what you checked. "Keine Befunde" without
scope is not useful.

### 5. Hand over

Findings go into the "Nachweis" section of the feature's `plan.md` when this runs as part of a
feature review. Otherwise report them and
offer to fix — as a separate, agreed step.

## Do not

- Do not change code as part of the check. Report, then fix if asked.
- Do not report a finding you cannot locate at a file and line.
- Do not pad the report with generic advice that is not about this code.
- Do not stay silent about a finding because fixing it is inconvenient.
- Do not treat a finding as a reason to abandon the task.
