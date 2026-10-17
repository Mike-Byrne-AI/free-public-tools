---
description: Check your own change before reporting it done. Four checks, each with quoted evidence.
argument-hint: "[base commit]"
---

Before you report this change as done, run these four checks. Each needs evidence you can paste. "Reviewed" is not evidence: if you cannot show it, the check has not run.

This is not a general code review. The checks target failure types seen in practice; the effect of this check is unmeasured. Treat review findings, yours or a subagent's, as hypotheses: re-check the cited lines.

**Base:** the commit given with the command ("$ARGUMENTS"); if none, HEAD when your change is uncommitted, or the commit before your first one if you committed it.

**Scope:** if no tests or assertions changed, write "checks 1-2: N/A" and do not invent evidence. If only docs, comments or formatting changed, run check 3 alone and say so.

1. **Can each new or changed assertion fail?** Two things stop one failing: an earlier assertion in the same test fails first, so this one never runs where it matters; or the setup never creates the case, or the code returns before reaching it. Evidence: the command you ran and the failing assertion line, quoted from its output. A sentence saying it failed does not count, and neither does an import or setup error. Reading the code and concluding it can't fail is not evidence: run it. Get it one of two ways:
   - Before the fix: `git worktree add <new temp dir> <base>`, copy in the new or changed test files and any fixtures they need, run them there, then `git worktree remove --force <that dir>`. If dependencies are missing, say so and ask before installing. After an interrupted run, check `git worktree list`.
   - After the fix: save the output of `git diff`, copy the code file aside, make one small break in it, run the tests, copy the file back, and confirm `git diff` matches what you saved.
   Never use `git stash`, or `git checkout` or `git restore` on a file holding uncommitted work.

2. **Did the break land where you said?** Only when you claim a test catches something, or that a guard is redundant. A failing test does not prove you hit the intended line; a passing one does not prove the guard is unneeded. Evidence: the `git diff` showing the break, and the run output.

3. **Is every number counted?** For each count, total, size, timing or test tally stated as fact in the diff, comments or your report: the command that produced it, or the correction. A stale count reads like evidence and is not.

4. **What was available but not run?** Read the CI config and package or build scripts; name what you read. Run the cheap, safe ones (lint, type check). List the rest, grouped, with a reason for each.

Do not report done while any check fails, or while one was skipped without saying so (check 4 blocks only on a skip with no reason). Fix and re-run once; if it still fails, stop and report it. If a step needs a command you are not already permitted to run (installs, network, deploys, migrations, anything destructive or costly), stop and ask.

End with one line per check: its evidence or N/A, and anything left open.
