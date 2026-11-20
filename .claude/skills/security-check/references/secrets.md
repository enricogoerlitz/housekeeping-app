# Secrets and configuration

## Finding them

Patterns worth scanning a diff for — in source, tests, fixtures, configuration, comments,
notebooks, CI definitions, container files and documentation:

- Assignments to names containing `secret`, `token`, `password`, `passwd`, `apikey`, `api_key`,
  `access_key`, `private_key`, `credential`, `auth`.
- Known shapes: `AKIA…`, `ghp_…`, `github_pat_…`, `sk-…`, `xox[baprs]-…`, `AIza…`,
  `-----BEGIN … PRIVATE KEY-----`, a JWT with a real payload.
- A connection string with a password in it: `postgres://user:pass@host`, `mongodb+srv://…`.
- A long high-entropy string with no explanation next to it.
- `.env`, `.pem`, `.key`, `.p12`, `.pfx`, `.keystore`, `credentials.json`, `kubeconfig` appearing
  in the diff at all.

A value that is obviously a placeholder (`xxx`, `changeme`, `your-token-here`) is not a finding.
A value that merely looks like a test key still is — test keys reach production more often than
anyone admits.

## Handling

- Configuration comes from the environment or a secret store, never from a committed file.
- A missing required value fails loudly at startup. A hardcoded fallback is worse than a crash,
  because it works.
- `.env.example` holds names, never values.
- Never log, echo, print or include a secret in an error message — not even truncated. A prefix is
  often enough to identify which key leaked and where it came from.
- Never pass a secret as a command-line argument; other processes can read it.
- Never bake a secret into a container image or a build artefact.

## Rotation

If a secret was exposed — committed, logged, sent anywhere — removing it from the current code is
not the fix. It is in the history and possibly in a cache. Say plainly in the report:

1. Which credential, and where it was exposed.
2. That it must be rotated, not just removed.
3. What access it grants, so someone can judge the blast radius.

## In this template

- The agent never reads `.env`. To use environment values it loads them into the process in one
  shell call — `set -a; . ./.env; set +a; <command>` — so the values reach the process, not the
  transcript.
- `.gitignore` covers `.env*`, key material and `tmp/`. Check it was not weakened.
