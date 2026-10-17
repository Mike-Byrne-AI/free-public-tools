#!/usr/bin/env bash
# The README's Quick start, run for real: a throwaway project with the starter rules passes, then a description
# of 8 characters makes the run fail with exit 1, as it should. From the tool's folder: bash ci/quick-start.sh
# CI runs it on Linux, macOS and Windows (there through Git Bash).
set -euo pipefail
AAL="$PWD"
P="${RUNNER_TEMP:-${TMPDIR:-/tmp}}/aal-quick-start-$$"
mkdir -p "$P/.claude/skills/code-review" "$P/.claude/agents"
printf '# Project\n\nRun the tests before saying done.\n' > "$P/CLAUDE.md"
printf -- '---\nname: code-review\ndescription: Reviews a diff for bugs and missing tests before merge.\n---\n\nReview it.\n' > "$P/.claude/skills/code-review/SKILL.md"
printf -- '---\nname: helper\ndescription: Answers questions about the build scripts.\n---\n\nHelp.\n' > "$P/.claude/agents/helper.md"
cp "$AAL/examples/claude-code-starter.json" "$P/agent-assets.config.json"
cd "$P"
node "$AAL/bin/agent-assets.mjs"
printf -- '---\nname: code-review\ndescription: Reviews.\n---\n' > .claude/skills/code-review/SKILL.md
if node "$AAL/bin/agent-assets.mjs"; then echo "expected a failure on an 8-character description"; exit 1; fi
cd "$AAL"
rm -rf "$P"
echo "quick start: passed, then failed on the short description, as the README says"
