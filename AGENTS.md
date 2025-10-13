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

**Objective:** Offer opportunities to continuously improve `AGENTS.md` based on user interactions and feedback.

**Trigger:** Upon task completion for any task that involved user feedback provided at any point during the conversation, or involved multiple non-trivial steps (e.g., multiple file edits, complex logic generation).

**Process:**

1. **Offer Reflection:** Ask the user: "Before I complete the task, would you like me to reflect on our interaction and suggest potential improvements to the active `AGENTS.md`?"
2. **Await User Confirmation:** Proceed to completion immediately if the user declines or doesn't respond affirmatively.
3. **If User Confirms:**
   a. **Review Interaction:** Synthesize all feedback provided by the user throughout the entire conversation history for the task. Analyze how this feedback relates to the active `AGENTS.md` and identify areas where modified instructions could have improved the outcome or better aligned with user preferences.
   b. **Identify Active Rules:** List the specific global and workspace `AGENTS.md` files active during the task.
   c. **Formulate & Propose Improvements:** Generate specific, actionable suggestions for improving the _content_ of the relevant active rule files. Prioritize suggestions directly addressing user feedback. Replace file contents when practical, otherwise describe changes clearly.
   d. **Await User Action on Suggestions:** Ask the user if they agree with the proposed improvements and if they'd like me to apply them _now_. Apply changes if approved, then proceed to complete the task.

**Constraint:** Do not offer reflection if:

- No `AGENTS.md` were active.
- The task was very simple and involved no feedback.
