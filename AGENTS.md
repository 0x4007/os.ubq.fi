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

Notes: tasks may pin versions (e.g., `npm:prettier@^3`). App code should not use `-A`; prefer explicit permissions.

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
