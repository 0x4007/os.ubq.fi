# Repository Guidelines

This repository is a pure Deno TypeScript dashboard. Use Deno tooling and keep changes small, focused, and well‑tested.

## Project Structure & Module Organization

- `src/` application code (TS/TSX). Group by feature (`src/features/*`) and shared modules under `src/lib/`.
- `tests/` mirrors `src/` (same paths/filenames where possible).
- `public/` static assets (icons, images, fonts). Served at `/`.
- `docs/` short ADRs, architecture notes, usage guides.
- `deno.json` config (tasks, imports, compilerOptions). Optional `import_map.json`.

Example:

```
src/
  server.ts
  features/
tests/
public/
docs/
deno.json
```

## Build, Test, and Development Commands

Use `deno.json` tasks (examples to add). Do not use `deno fmt`; Prettier is the only formatter:

```
deno task dev        # run locally with watch: deno run --watch --allow-* src/server.ts
deno task test       # run tests: deno test --coverage=coverage
deno task coverage   # lcov/html report: deno coverage coverage --lcov > coverage.lcov
deno task fmt        # format via Prettier: deno run -A npm:prettier . --write
deno task lint       # ESLint: deno run -A npm:eslint --ext .ts,.tsx .
deno task knip       # dead code/unused exports: deno run -A npm:knip
```

Default start (agents): prefer `deno task dev` for foreground development, or `deno task dev:daemon` to run in the background with hot‑reload. Use `start`/`start:daemon` only for non‑watch, one‑shot runs.

Notes: tasks may pin versions (e.g., `npm:prettier@^3`). App code should not use `-A`; prefer explicit permissions.

## Background Run (Preferred: dev instance)

Use this when you want the UI up in the background. For development, prefer the dev instance (hot‑reload). For one‑shot, non‑watch runs, use the start instance.

- `deno task dev:daemon` — Preferred default for agents; hot‑reload watch (client+server) in background
- `deno task stop:dev` — stop the background hot‑reload task
- `deno task start:daemon` — one‑shot build + server in background (auto‑fallback 8000→8001)
- `deno task stop:daemon` — stop the one‑shot background server (`PORT` must match; defaults 8000)

```
# Prereq: Deno >= 2.5 installed
# Picks 8000 unless busy, then falls back to 8001
PORT=${PORT:-8000}; if lsof -i :$PORT -sTCP:LISTEN >/dev/null 2>&1; then PORT=${PORT_FALLBACK:-8001}; fi; \
mkdir -p logs && deno task build:client && \
nohup deno run --allow-net --allow-read=public --allow-env src/server.ts \
  > "logs/ui-$PORT.log" 2>&1 & echo $! > "logs/ui-$PORT.pid" && \
sleep 0.8 && echo "UI: http://localhost:$PORT  PID: $(cat logs/ui-$PORT.pid)" && \
curl -fsS "http://localhost:$PORT/api/health" || (echo "Health check failed"; exit 1)
```

- Stop: `kill $(cat logs/ui-$PORT.pid)`
- Logs: `tail -f logs/ui-$PORT.log`
- Health: `curl -sS http://localhost:$PORT/api/health`
- Static index: `curl -sS http://localhost:$PORT | head -n1`

Tips

- Configure `PORT` before running `start:daemon`; if busy, it falls back to `PORT_FALLBACK` (default 8001).
- PID files live in `logs/ui-$PORT.pid` and `logs/dev.pid`; logs in `logs/ui-$PORT.log` and `logs/dev.log`.

For hot‑reload in the background (watch build + server), use the preferred dev task above or:

```
nohup deno task dev > logs/dev.log 2>&1 & echo $! > logs/dev.pid
# stop: kill $(cat logs/dev.pid); tail -f logs/dev.log
```

## Coding Style & Naming Conventions

- TypeScript strict mode; ESM imports. Use explicit extensions or import map aliases.
- Indentation 2 spaces; max line length 100; LF endings.
- Files/dirs: kebab-case; classes/types: PascalCase; variables/functions: camelCase; constants: UPPER_SNAKE_CASE.
- Tools: Prettier (only) for formatting, ESLint (`@typescript-eslint`) for rules, Knip for unused code. Run `deno task fmt && deno task lint && deno task knip` before pushing.
- Editors: set default formatter to Prettier (VSCode workspace config provided). Never run `deno fmt`.

## Testing Guidelines

- Use `deno test` and `std/assert` utilities. Tests live in `tests/` mirroring `src/`.
- Naming: `*.test.ts` or `*_test.ts`. Keep tests deterministic (no network by default).
- Coverage target ≥80% on PRs. Generate reports with `deno task coverage`.

## Commit & Pull Request Guidelines

- Conventional Commits: `feat`, `fix`, `docs`, `test`, `refactor`, `chore`, `ci` (use scopes, e.g., `feat(ui): add card`).
- PRs: small and focused; include description, linked issues, and UI screenshots when relevant.
- All checks must pass (lint/format/tests/knip). Update docs when behavior changes.

## Security & Configuration Tips

- Do not commit secrets. Provide `.env.example`; load via `std/dotenv` in dev.
- Use least privileges: run app with only needed flags (`--allow-net`, `--allow-read` for `public/`).
- Prefer import maps for stable module aliases; pin external versions.

## Agent-Specific Instructions

- Keep patches surgical; avoid unrelated refactors. Prefer `deno task` for all workflows.
- If unsure, verify with a quick search, then run `deno task lint`, `fmt`, `knip`, and `test` before submitting.

# Self-Improving Reflection

(Reference: `codex resume 0199dcc0-678b-7bc1-a36e-a623a825bcd4`)

**Objective:** Encode durable preferences in `AGENTS.md` only when they surface through real corrections, reducing noise while improving future runs.

**Trigger (Stricter):** Invoke this flow only when both are true:

- The agent made a non-trivial incorrect assumption that influenced the work (e.g., chose a tool/approach the user rejected, misinterpreted constraints, or defaulted to a policy the user overrode), and
- The user explicitly corrected or adjusted the agent’s behavior with an additional input during the task.

Helpful signals (examples, not exhaustive):

- “Don’t use X; use Y instead.”
- “Avoid JS sources; compile TS only.”
- “No network calls in tests.”
- “Prefer library A over B for <reason>.”

Out-of-scope signals (do not trigger):

- Typos, minor style nits, or one-off preferences that are unlikely to generalize.
- Routine Q&A or clarifications that didn’t correct an earlier assumption.

**Process:**

1. **Offer Addendum Prompt (conditional):** If the stricter trigger is met, ask: “You corrected an earlier assumption I made about <short summary>. Would you like me to draft an addendum to the active `AGENTS.md` to capture this rule for future tasks?”
2. **Await User Confirmation:** If the user declines or doesn’t affirm, proceed without proposing changes.
3. **If User Confirms:**
   a. **Review Interaction:** Summarize the assumption, the user’s correction, and the desired rule.
   b. **Identify Active Rules:** List the active global and workspace `AGENTS.md` files.
   c. **Propose Addendum:** Provide concrete edits to the most relevant `AGENTS.md` (project root by default). Prefer a small “Agent Behavior Addendum” subsection with clear, actionable bullets. Keep scope local to this repo unless the user requests updating global defaults.
   d. **Apply on Approval:** If the user agrees, apply the changes and proceed to task completion.

**Constraints:**

- Do not offer the addendum prompt unless both stricter trigger conditions are satisfied.
- Do not propose changes for transient or user-specific preferences without confirmation they should be codified.
- Skip if no `AGENTS.md` is active.

## Implementation Heuristics (Make It Work)

To ensure the stricter trigger is reliably detectable, follow these steps:

1. Assumption log (1–3 bullets)

   - When you create your initial plan/design, add a tiny "Assumptions" snippet to your next message listing key choices that could be corrected (e.g., tool, framework, runtime, permissions). Example: "Assume bundler=esbuild; allow JS in public/; tests offline only."

2. Detect explicit corrections (pattern + change-of-direction)

   - After each user reply, scan for contradictions to any logged assumption.
   - Treat as a correction if the message contains any of these near a tool/approach (case-insensitive):
     - Keywords: "don’t", "do not", "avoid", "instead", "rather", "switch", "replace", "drop", "no <X>", "use <Y> not <X>", "prefer <Y>", "must", "require".
     - Structures: "Use X instead of Y", "Don’t use X", "Avoid X; use Y", "Only Y is allowed".
   - Heuristic: if you materially change your plan/code in response, mark it as a correction even if wording is soft.

3. Set a one-time session flag

   - On first detected correction, set REFLECT_FLAG=true and capture a one-liner: "Assumption corrected: <from> → <to> (<reason if given>)." Ask at most once per task.

4. Conditional final prompt

   - At completion, if REFLECT_FLAG is true, ask: "You corrected an earlier assumption I made about <summary>. Would you like me to draft an addendum to the active `AGENTS.md` to capture this rule for future tasks?"

5. Manual overrides

   - Always trigger if the user says: "reflect now", "update agents.md", "codify this", or "add this to rules".

6. Guardrails
   - Don’t trigger for typos, style nits, or non-generalizable one-offs. Don’t re-ask within the same task once you’ve asked.

## Auto-Learning Mode (Default: On)

Goal: When you are corrected, persist the corrected rule so future sessions don’t repeat the mistake.

Behavior

- On first detected correction in a task, immediately persist a durable rule to this repo’s `AGENTS.md` without asking. Show a brief note that a rule was added. Do not prompt unless scope is ambiguous.
- If the user’s wording includes "temporary", "one-off", "just for now", or "experiment", do not persist.
- If the user says the rule should apply across repositories (keywords: "always", "all repos", "global", "default everywhere"), propose updating the global `~/.codex/AGENTS.md` instead; only proceed there with explicit confirmation.

Precedence & Scope

- Repo rules override generic defaults for this repo. Global rules apply elsewhere unless overridden by a repo rule.
- If both a global and repo rule conflict, prefer the repo rule and inform the user briefly.

Storage Format (machine-parseable)

Add or update a single fenced YAML block under a heading named exactly `Agent Behavior Memory`. Create the section if missing.

````
## Agent Behavior Memory

```yaml
memory:
  - id: <slug>
    rule: <imperative, unambiguous instruction>
    scope: repo | global
    added: YYYY-MM-DD
    rationale: <short reason or user quote>
    tags: [build, testing, security]
````

````

Rules
- `id`: stable slug (lowercase, kebab-case). Use first 5–7 words of `rule`, normalized.
- Dedup: if an entry with the same `id` exists, update it in place (merge fields, refresh `added`).
- Keep rules concise and testable: avoid vague language like "prefer" without a concrete action.

Examples
- id: no-js-sources
  rule: "Do not commit JS sources; compile TS to JS into public/assets/ via esbuild."
  scope: repo
  rationale: "User correction during session on 2025-10-16."
  tags: [build, frontend]

Start-of-Task Behavior
- Before planning, scan `Agent Behavior Memory` and treat `rule` entries as binding within their scope. Reflect them in your initial assumptions snippet.

## Agent Behavior Memory

```yaml
memory:
  - id: no-js-sources
    rule: Do not commit JS sources; compile TS to JS into public/assets/ via esbuild.
    scope: repo
    added: 2025-10-16
    rationale: Debugging locally; persist this rule here only.
    tags: [build, frontend]
````
