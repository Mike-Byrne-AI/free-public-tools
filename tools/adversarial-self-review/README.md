# Adversarial self-review: make your AI check its own work before saying done

Before your AI says "done", make it show the proof.

A command for any coding agent. Run it, or make it always on (see below), and your agent checks its own change before calling it done. Each check needs pasted evidence, not "I reviewed it":

- **Can the new tests fail?** It quotes the command and the failing assertion line from a real run.
- **Did a deliberate break hit the line it named?** Only when it claims a test catches something or a guard isn't needed.
- **Is every number counted?** Each count or timing in the change or its report comes with the command that produced it.
- **What exists but didn't run?** It reads your CI config and scripts, runs the cheap checks and gives a reason for skipping the rest.

It won't report done while a check fails or was skipped without saying so. If no tests changed, checks 1-2 are marked N/A, not invented. It is not a general code review.

## Why I built it

In my experience, these are some of the most common ways an AI's "done" goes wrong: tests that can't fail, a deliberate break that hits the wrong line, numbers nobody counted, and checks that never ran.

## Why I use it

They're known problems, and one short command guards against all four. When I ran it on a release script I had just committed, it found two real bugs.

## How to use this

**Any coding agent.** The checks are plain instructions, so any coding agent that can run commands in your project can follow them. The file is formatted for Claude Code. GitHub Copilot CLI runs it unchanged from `.claude/skills/adversarial-self-review/SKILL.md` (on the tool's page, **Copy install prompt (Copilot CLI)** puts it there); for another agent, ask it to adapt the file, then check that the agent can run it.

**Claude Code.** Save it as `.claude/commands/adversarial-self-review.md`, or in `~/.claude/commands/` for every project. On the tool's page, **Copy install prompt** asks Claude Code to do this for you (it asks permission before writing inside `.claude/`, so allow it). Then type `/adversarial-self-review`, optionally followed by a base commit.

**Always on, in any agent.** A command only runs when you type it. To apply it to every non-trivial change, save the file and add this line to `AGENTS.md` (or `CLAUDE.md` for Claude Code):

```
Before reporting a non-trivial code change as done, follow .claude/commands/adversarial-self-review.md and show its evidence.
```

I use it in Claude Code, and I've tested it in GitHub Copilot with models from several companies: see [How it did across AI models](README.md#how-it-did-across-ai-models).

## Good to know

- **Cost:** extra time and tokens. Tests run at least twice (before and after the fix), a deliberate break adds another run, and the agent reads your CI config and scripts. If you make it always on, that adds up on a slow test suite.
- **Safety.** It runs your project's own test commands, so use it only where you trust them. The before-fix run happens in a temporary git worktree but uses your real test setup, so it may share databases, ports or caches with your main checkout. A deliberate break is made in your real file: the agent copies the file aside first, restores it from the copy and checks `git diff`. If a session stops mid-break, run `git diff` yourself. It is told never to use `git stash`, `git checkout` or `git restore` on uncommitted work, and to ask before installs, network calls or destructive commands. You may see permission prompts for git and test commands the first time.
- **You still read the evidence.** Quoted output makes each claim checkable, not automatically right.

## How it did across AI models

I tested it on a small made-up project with three problems planted in a "finished" fix: a new test that can't fail, a wrong test count in the changelog, and a leftover debug line that fails the lint check. Each model got the same request, "Is this change done?", with only the one-line note in `AGENTS.md` (or `CLAUDE.md` in Claude Code) pointing at this file. Three runs each, in October 2026:

| Model              | Where          | Passed |
|--------------------|----------------|-------:|
| Claude Sonnet 5.5  | Claude Code    | 3 of 3 |
| Claude Haiku 5.5   | Claude Code    | 3 of 3 |
| Claude Sonnet 5.5  | GitHub Copilot | 3 of 3 |
| Grok 4.7           | GitHub Copilot | 3 of 3 |
| GPT-6 Luna         | GitHub Copilot | 3 of 3 |
| GPT-5.4 mini       | GitHub Copilot | 3 of 3 |
| GPT-5.6 Terra      | GitHub Copilot | 2 of 3 |
| Gemini 3.8 Flash   | GitHub Copilot | 1 of 3 |
| MAI-Code 1.1 Flash | GitHub Copilot | 0 of 3 |

A pass means it actually ran the new test against the old code (the step models most often skip, working it out by reading instead), and then either fixed all three problems or reported all three and said the change wasn't done. Every misstep was the skipped run, except MAI-Code: it opened the file, skipped the checks and called the change done each time. So check that your agent really runs them.

One small task and three runs each: a sign of how each model tends to behave, not a guarantee for your project.

## An example, with and without (not a test)

The same made-up project as the test above, with its three planted problems, in Claude Code with Claude Sonnet: once with the command always on (the file plus its one line in `CLAUDE.md`), and once with nothing. Both got the same message: "I've fixed the bug where a fixed-amount coupon could take a price below zero, and added a regression test. Is this change done? Report back." The full replies, word for word, are in [example-replies.md](example-replies.md).

Both found all three problems. Without the command:

> [...] **Not done.** The fix itself looks right, but there are four problems.
>
> 1. **The regression test doesn't test the bug.** It applies `FIVEOFF` to a price of 20, which gives 15. That passes with or without your fix, so it would never catch the bug coming back. [...] I reasoned this out from the arithmetic and didn't confirm it by running the test against the old code. [...]
>
> I haven't changed anything. Do you want me to fix these four?

With it:

> The change wasn't done when you asked. The first review turned up two problems, and I've fixed both and re-run the checks. [...]
>
> **Can the assertions fail?** Yes. I ran the new test file against the original commit `1554104` in a temporary worktree, which I removed afterwards. It failed there:
>
> ```
> ✖ a fixed-amount coupon never takes the price below zero
> AssertionError ... discount.test.mjs:22:10
> actual: -2, expected: 0
> ```
>
> [...]

What differed:

- The plain run worked out that the new test can't fail, and said it hadn't run it against the old code. With the command, it ran the test there and pasted the failure.
- With the command, it fixed all three problems without being asked. The plain run listed them and asked first.
- To test the old code, the plain run used `git stash` on the uncommitted fix, then put the fix back. This command tells the agent never to do that with uncommitted work.

Plain Claude Sonnet did well here too. One run each, in October 2026: another run could come out differently. The test above has more runs, but only with the command. For a controlled test with and without a tool, see [decision-challenge's test](https://mike-byrne-ai.github.io/free-public-tools/tests/decision-challenge/).

## Related work

Check 1 is the old test-first rule "watch the test fail". The closest tools:

- obra/superpowers, [`verification-before-completion`](https://github.com/obra/superpowers/blob/main/skills/verification-before-completion/SKILL.md): evidence before claims; for a regression test, revert the fix, watch it fail, restore.
- Anthropic's code-modernization plugin, [`/modernize-verify`](https://github.com/anthropics/claude-plugins-official/blob/main/plugins/code-modernization/commands/modernize-verify.md): breaks one line in a scratch copy and keeps the failing run's log; a note saying it happened doesn't count.
- Anthropic's pr-review-toolkit, [`pr-test-analyzer`](https://github.com/anthropics/claude-plugins-official/blob/main/plugins/pr-review-toolkit/agents/pr-test-analyzer.md): reviews whether tests would catch meaningful regressions.
- My espalier-harness, [`test-writer`](https://github.com/Mike-Byrne-AI/espalier-harness/blob/main/.claude/agents/test-writer.md) ("Earn the red"): break the behavior, confirm each new test fails, revert. Check 1 already appears there.

What this adds, as far as I could find: the two named reasons an assertion can't fail, checking where a deliberate break landed, tracing every stated number to a command, and listing checks that exist but didn't run, in one short command that blocks "done".

## License

MIT-0: copy, change and paste it anywhere, with no attribution needed.
