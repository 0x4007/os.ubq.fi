#!/usr/bin/env bash
set -euo pipefail

# Link GitHub issue dependencies (blocked_by) using the official REST API.
# Requirements: gh CLI authenticated with a token that has Issues:write (fine-grained PAT recommended).
# Usage: REPO=owner/repo scripts/gh_deps.sh

if [[ -z "${REPO:-}" ]]; then
  REPO=$(gh repo view --json nameWithOwner -q .nameWithOwner 2>/dev/null || true)
fi
if [[ -z "$REPO" ]]; then
  echo "REPO not set and could not auto-detect. Export REPO=owner/repo" >&2
  exit 1
fi

echo "Using repo: $REPO" >&2

# Helper: add a blocked_by dependency: target issue is blocked by blocker issue number
add_blocked_by() {
  local target_num=$1
  local blocker_num=$2
  # Check if already present
  local existing
  existing=$(gh api "/repos/$REPO/issues/$target_num/blocked_by" -q '.[].number' 2>/dev/null || true)
  if echo "$existing" | rg -q "^$blocker_num$"; then
    echo "#${target_num} already blocked by #${blocker_num}"; return 0
  fi
  # Lookup REST id for blocker
  local blocker_id
  blocker_id=$(gh api "/repos/$REPO/issues/$blocker_num" -q .id)
  # Post dependency
  if gh api -X POST -H "Accept: application/vnd.github+json" \
    "/repos/$REPO/issues/$target_num/blocked_by" \
    --input - <<<"$(jq -n --argjson id "$blocker_id" '{issue_id: $id}')" >/dev/null 2>&1; then
    echo "#${target_num} now blocked by #${blocker_num}"
  else
    echo "Failed to link: #${target_num} blocked by #${blocker_num} (check token permissions)." >&2
    return 1
  fi
}

# Suggested dependency map (minimal, non-redundant)
# S1
add_blocked_by 3 1   || true   # Filters depends on URL state
add_blocked_by 10 1  || true   # Row deep link depends on URL state

# S2
add_blocked_by 8 1   || true   # Saved Views depends on URL state
add_blocked_by 9 1   || true   # Drill-through depends on URL state
add_blocked_by 9 5   || true   # Drill-through depends on exact relations (if enabled)
add_blocked_by 12 8  || true   # Docs depend on Saved Views
add_blocked_by 12 9  || true   # Docs depend on Drill-through

# S3
add_blocked_by 14 1  || true   # CSV export depends on grid/url state
add_blocked_by 16 14 || true   # Print can follow export polish (optional but helpful)

# S4
add_blocked_by 19 1  || true   # Virtualization depends on base grid/url state
add_blocked_by 22 4  || true   # Micro-interactions refine skeletons from S1

echo "Dependency linking attempted. Review any failures above."

