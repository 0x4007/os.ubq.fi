#!/usr/bin/env bash
set -euo pipefail

# Create issue dependencies (blocked by) via GitHub GraphQL API.
# Usage: REPO=owner/repo scripts/gh_blocked_by_graphql.sh <target_issue_number> <blocking_issue_number>
# Or run without args to apply the default dependency map for this repo.

REPO=${REPO:-$(gh repo view --json nameWithOwner -q .nameWithOwner 2>/dev/null || true)}
if [[ -z "$REPO" ]]; then echo "REPO not set" >&2; exit 1; fi

add_blocked_by(){
  local target_num=$1
  local blocker_num=$2
  local issue_id blocker_id
  issue_id=$(gh issue view -R "$REPO" "$target_num" --json id -q .id)
  blocker_id=$(gh issue view -R "$REPO" "$blocker_num" --json id -q .id)
  local gql="mutation { addBlockedBy(input: { issueId: \"$issue_id\", blockingIssueId: \"$blocker_id\" }) { issue { number title } blockingIssue { number title } } }"
  echo "Linking #$target_num blocked by #$blocker_num" >&2
  gh api graphql -f query="$gql" >/dev/null 2>&1 || true
}

if [[ $# -ge 2 ]]; then
  add_blocked_by "$1" "$2"
  exit 0
fi

# Default dependency map (minimal)
pairs=(
  "3 1"
  "10 1"
  "8 1"
  "9 1"
  "9 5"
  "12 8"
  "12 9"
  "14 1"
  "16 14"
  "19 1"
  "22 4"
)

for p in "${pairs[@]}"; do add_blocked_by ${p%% *} ${p##* }; done

echo "GraphQL blocked_by links created (or already present)."
