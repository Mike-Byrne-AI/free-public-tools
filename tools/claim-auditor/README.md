# Claim auditor: check your AI's numbers before you publish

A subagent that checks the claims in your docs before you post them. It reads your README, changelog, benchmark write-up or findings note, lists every number, comparison, mechanism, ranking and frequency, and grades each one:

- **BLOCK**: wrong or unbacked as written (a number that does not reproduce, an "X causes Y" with nothing measuring the link, a prediction edited after the result came in).
- **WARN**: overreaches its evidence (a rate without its count, a metric whose name claims more than it computes, a result from toy test data stated as a general fact), or could not be checked without running something.
- **NIT**: wording invites over-reading, but the evidence is cited.
- **PASS**: recomputed and entitled to its wording. Passes are listed too, so you can see it did not only look at the bad ones.

A row looks like this:

    WARN | README.md:42 | "Cuts errors by 75%" | 3 of 4 runs, one test set | Say "3 of 4 runs on our test set"

It ends with a verdict line and the cheapest check that would change its mind. PASS means "reproduced and proportionate", not "true".

## Why I built it

Write-ups an AI helped draft are full of numbers, comparisons and "X causes Y" sentences that read well and were never rechecked against the data behind them.

## Why I use it

I wrote it to check my own research write-ups before I share them, and later reused it in a second project. When I first tried its checklist on a write-up with a known overclaim, it flagged the overclaim and also found a false clause in my corrected version. Before this launch I ran it on one of these tools' READMEs: nothing was wrong, but it pointed out a line that undersold the tool's rules, and I fixed it.

## How to use this

**Claude Code.** Save the file as `.claude/agents/claim-auditor.md` in your project, or in `~/.claude/agents/` for all your projects. On the tool's page, **Copy install prompt** asks Claude Code to do this for you. If that `agents` folder did not exist when your session started, restart Claude Code once. Then ask something like "use the claim-auditor on the release notes before I post them". It has no `model:` line, so by default it uses your session's model.

**Another coding agent.** Use [claim-auditor-any-agent.md](claim-auditor-any-agent.md) instead: the same instructions without the Claude Code header. Save it in your repo, for example as `prompts/claim-auditor.md`, and ask your agent: "Follow the instructions in prompts/claim-auditor.md to check the claims in README.md before I post it." It runs in your main session rather than as a separate subagent, so a fresh session gives it the cleanest start. I've tested it in GitHub Copilot: see [How it did across AI models](README.md#how-it-did-across-ai-models).

It looks at README*, CHANGELOG*, docs/** and benchmark write-ups, or only the files you name.

## Good to know

- **Cost:** slow on big docs. It stops at about 40 claims and tells you how many it skipped. Expect some false alarms: treat its rows as leads to check, not rulings.
- **Safety:** it has Bash for git history and small sums. Its instructions keep that read-only: safe git flags (some, like `--output`, can write files), no project scripts, nothing long, paid or networked. When a check needs more, it gives you the command to run. This is an instruction, not a setting. For a hard limit, remove `Bash` from the tools line (many numbers will then show as not recomputed) or add Bash deny rules to your permission settings.
- **Scope:** it checks claims, not code. Keep your usual code review.

## How it did across AI models

I tested it on a small made-up Python library whose README had five planted problems: a license that disagrees with the LICENSE file, a Python version the package settings rule out, "all 24 tests pass" when there are 9 tests, "3x faster" when its own benchmark file shows 1.4x, and "memory stays flat" when the code keeps every row in memory. The README and changelog also made true claims, to catch false alarms. Each model got the same request: check the claims in README.md and CHANGELOG.md before I post them. In Claude Code it used this agent; in GitHub Copilot, `claim-auditor-any-agent.md`. Three runs each, in October 2026:

| Model              | Where          | Passed |
|--------------------|----------------|-------:|
| Claude Sonnet 5.5  | Claude Code    | 3 of 3 |
| Claude Haiku 5.5   | Claude Code    | 3 of 3 |
| Claude Opus 5.5    | Claude Code    | 3 of 3 |
| Claude Sonnet 5.5  | GitHub Copilot | 3 of 3 |
| Grok 4.7           | GitHub Copilot | 3 of 3 |
| GPT-6 Luna         | GitHub Copilot | 3 of 3 |
| Gemini 3.8 Flash   | GitHub Copilot | 3 of 3 |
| GPT-5.4 mini       | GitHub Copilot | 2 of 3 |
| MAI-Code 1.1 Flash | GitHub Copilot | 2 of 3 |
| GPT-5.6 Terra      | GitHub Copilot | 1 of 3 |

A pass means it caught all five problems for the right reason, called none of the true claims wrong, and changed no files. No run raised a false alarm. Most missteps were the test count: the model said "all 24 tests pass" needed a test run, instead of counting the 9 tests in the files. In one run, MAI-Code took "check README.md and CHANGELOG.md" to mean it could use only those two files as evidence. The auditor never ran the tests itself, as its instructions say. Opus in Claude Code then ran them on its own after the audit to confirm the failing one.

One made-up project and three runs each: a sign of how each model tends to behave, not a guarantee for your docs.

## An example, with and without (not a test)

The same made-up library as the test above, with the same five planted problems, in Claude Code with Claude Sonnet. With the agent, I asked: "Use the claim-auditor agent to check the claims in README.md and CHANGELOG.md before I publish them." Without it: "Check the claims in README.md and CHANGELOG.md before I publish them." The full replies, word for word, are in [example-replies.md](example-replies.md).

Both found all five. Without the agent:

> I found six README claims that don't hold up, and the CHANGELOG is fine. I read the code, `pyproject.toml`, `LICENSE` and `bench/results.md`, and ran the tests. [...]
>
> I haven't changed any files. Do you want me to apply the README fixes?

With it:

> The claim-auditor's verdict is **BLOCK**: don't publish yet. It found 5 blocking problems, 2 warnings and 3 passes. [...]
> - **Tests (README.md:8):** The README says "All 24 tests pass", but the suite has 9 tests. The auditor didn't run them. By reading the code, `test_strips_spaces_after_commas` should fail, because `_split` doesn't strip spaces. [...]
>
> Running `python -m pytest -q` would settle the test-count row. I haven't run it or edited anything. [...]

What differed:

- The plain request ran the tests, which settled the test count. The auditor is told not to run project scripts, so it worked out the failing test by reading the code and named the command that would settle it.
- The auditor graded every claim, passes included, and ended with one verdict.
- The plain run's first reply ended with a question. By a rule I set before the runs, that meant it got a second message, "Yes, go ahead and finish the check.", and it then edited the README. The auditor's reply didn't end with a question, so it got no second message and changed nothing.

Plain Claude Sonnet did well here too. One run each, in October 2026: another run could come out differently. The test above has more runs, but only with the auditor. For a controlled test with and without a tool, see [decision-challenge's test](https://mike-byrne-ai.github.io/free-public-tools/tests/decision-challenge/).

**How the subagent worked here.** A subagent is a separate Claude Code session that your main session starts for one job. It begins with a fresh, empty context: it sees its own instructions (this file), the task your session hands it and the working directory, not the conversation so far or the files already read. In the example, the auditor opened the README, the changelog, the code, the benchmark file and the tests on its own, and only its report came back. That keeps your main conversation smaller, because the file contents and search results stay in the subagent's context, and it gives the audit a clean start, with no earlier conversation to agree with. (Claude Code's [subagent docs](https://code.claude.com/docs/en/sub-agents) describe this.)

## Related work

- [Pablo-aps/prove-it](https://github.com/Pablo-aps/prove-it): an adversarial verification skill that makes coding agents try to disprove their own "fixed" or "done" claims about bug fixes, tests, CI and deployments. This one checks the sentences in docs you are about to publish.
- [addyosmani/agent-skills](https://github.com/addyosmani/agent-skills): its `doubt-driven-development` skill has a fresh-context reviewer try to disprove non-trivial decisions while you work. This one is a separate pass over finished prose.

What this adds: a fixed 7-item claim checklist, one graded row per claim (passes included), and a rule to hand you the command instead of running anything long or risky.

## License

MIT-0: copy, change and use it anywhere, with no attribution needed.
