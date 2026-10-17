# Claim auditor: the example's full replies

The full replies behind the README's "An example, with and without (not a test)", word for word. Claude Sonnet in Claude Code, one run each, in October 2026.
The project is the made-up Python library from the README's test, with the same five planted problems: the license, the Python version, "all 24 tests pass", "3x faster" and "memory stays flat".

A rule set before the runs: if a first reply ended with a question, that side got a second message, "Yes, go ahead and finish the check." Only the run without the agent ended with one.

**Without it, my message:** Check the claims in README.md and CHANGELOG.md before I publish them.

**With it, my message:** Use the claim-auditor agent to check the claims in README.md and CHANGELOG.md before I publish them.

### Without it

**Message 1:** Check the claims in README.md and CHANGELOG.md before I publish them.

> I found six README claims that don't hold up, and the CHANGELOG is fine. I read the code, `pyproject.toml`, `LICENSE` and `bench/results.md`, and ran the tests.
>
> **README.md**
>
> | Claim | Finding |
> |---|---|
> | License: MIT | Wrong. `LICENSE` and `pyproject.toml` both say GPL-3.0. |
> | Python 3.9 and newer | Wrong. `pyproject.toml` has `requires-python = ">=3.11"`, so pip will refuse to install on 3.9 or 3.10. The code only uses features from 3.8, so you may want to lower the pin instead. |
> | No dependencies | Correct. `dependencies = []`, and the code imports nothing outside the standard library. |
> | All 24 tests pass | Wrong. There are 9 tests, and 1 fails: `test_strips_spaces_after_commas`. `read_rows("a, b")` returns `['a', ' b']`, not `['a', 'b']`. |
> | 3x faster than `csv` on a 50 MB file | Wrong. `bench/results.md` shows 0.70 s against 0.98 s, which is about 1.4x. The benchmark script isn't in the repo, so I couldn't re-run it. |
> | Memory use stays flat however big the file is | Wrong. The file is read in 64 KB chunks, but `read_rows` collects every row into one list and returns it, so memory grows with file size. |
> | `read_rows` handles quoted fields with commas, such as `"Smith, Jane",42` | Correct for a quoted field on a single line. A quoted field that contains a newline gets split across rows, though. The README doesn't claim to handle that case. |
>
> **CHANGELOG.md**
> - The versions and contents match the code: 1.2.0 adds `write_rows`, and 1.1.0 has `read_rows` with quoted commas. `pyproject.toml` and `__init__.py` both say 1.2.0.
> - I couldn't check the dates (2026-09-12 and 2026-09-30). The repo has a single commit, dated today.
> - The failing whitespace-stripping test suggests a feature that was planned but isn't implemented. Check that neither file advertises it.
>
> **Suggested fixes**
> - Change the license line to GPL-3.0, or change the license files if you meant MIT.
> - Make the Python version agree between the README and `pyproject.toml`.
> - Either fix the whitespace behavior or drop that test, then state the real test count.
> - Say "about 1.4x faster" in the speed claim.
> - Remove the flat-memory claim, or make `read_rows` a generator.
>
> I haven't changed any files. Do you want me to apply the README fixes?

**Message 2:** Yes, go ahead and finish the check.

> I edited `README.md` so it matches the repo. I didn't commit anything or touch any other file.
>
> - **License:** now says GPL-3.0, matching `LICENSE` and `pyproject.toml`. If you meant MIT, the license files need changing instead.
> - **Python:** now says 3.11 and newer, matching `pyproject.toml`. The code only needs 3.8 features, so you could lower the pin in `pyproject.toml` instead.
> - **Tests line:** removed. The "24 tests pass" claim was false, because there are 9 tests and 1 fails. Add a count back once you've settled the failing test.
> - **Speed:** now says about 1.4x faster (0.70 s vs 0.98 s), as `bench/results.md` shows.
> - **Flat memory:** removed, because `read_rows` holds every row in memory.
>
> I left the bugs in the code alone. `a, b` still returns `' b'` and the whitespace test still fails, and a quoted field containing a newline still splits across rows. You'll need to decide how to handle those before publishing.
>
> `CHANGELOG.md` needed no changes. I couldn't verify its release dates.

Files it changed: `.pytest_cache/.gitignore`, `.pytest_cache/CACHEDIR.TAG`, `.pytest_cache/README.md`, `.pytest_cache/v/cache/lastfailed`, `.pytest_cache/v/cache/nodeids`, `README.md` (the README after message 2; `.pytest_cache` is what running the tests leaves behind).

### With it

> The claim-auditor's verdict is **BLOCK**: don't publish yet. It found 5 blocking problems, 2 warnings and 3 passes.
>
> **Blocking**
> - **License (README.md:5):** The README says MIT, but `pyproject.toml:7` says `GPL-3.0-only` and `LICENSE` is the GPL text. Change the README, or relicense everywhere.
> - **Python version (README.md:6):** The README says "3.9 and newer", but `requires-python` is `>=3.11`. Pip would refuse to install it on 3.9 or 3.10.
> - **Tests (README.md:8):** The README says "All 24 tests pass", but the suite has 9 tests. The auditor didn't run them. By reading the code, `test_strips_spaces_after_commas` should fail, because `_split` doesn't strip spaces.
> - **Speed (README.md:25):** The README says "3x faster than `csv`", but `bench/results.md` shows 0.70 s against 0.98 s, which is about 1.4x. The auditor suggests saying "about 1.4x faster" and adding the conditions: one laptop, Python 3.12, median of 5 runs.
> - **Memory (README.md:27):** The README says 64 KB chunks keep memory flat. But `read_rows` collects every row into a list, so memory grows with file size, and nothing measures memory.
>
> **Warnings**
> - **Benchmark scope:** The benchmark covers one machine and one file shape, and the script isn't in the repo, so nobody can reproduce it.
> - **Changelog dates:** The dates (2026-09-30, 2026-09-12) and "First release" can't be checked, because the repo has a single commit.
>
> **Passed**
> - The README's "no dependencies" claim.
> - The quoted-comma handling in `read_rows`.
> - The changelog's 1.2.0 `write_rows` entry.
>
> Running `python -m pytest -q` would settle the test-count row. I haven't run it or edited anything. I can run the tests and apply the fixes to the README if you want.

Files it changed: none.

## How the subagent worked here

A subagent is a separate Claude Code session that your main session starts for one job. It begins with a fresh, empty context: it sees its own instructions (the claim-auditor file), the task your session hands it and the working directory, not the conversation so far or the files already read. Here the auditor opened the README, the changelog, the code, the benchmark file and the tests on its own, and only the report above came back to the main session. That keeps the main conversation smaller, because the file contents and search results stay in the subagent's context, and it gives the audit a clean start, with no earlier conversation to agree with. (Claude Code's [subagent docs](https://code.claude.com/docs/en/sub-agents) describe this.)

These are examples, not a test: another run could come out differently.
