# Epistemic stance: make your AI push back

An instruction block that encourages ChatGPT, Claude or a coding agent to:

- push back with evidence instead of agreeing with you, without turning contrarian;
- say how sure it is about the claims that matter (*verified*, *probable* or *imagined*), and what it checked;
- keep "sounds like it should work" apart from "shown to work", including its own claims that a change made things better;
- own its mistakes plainly, without grovelling or caving to pushback that brings no new evidence;
- point out what you're missing, while leaving the decision to you.

## Why I use it

This is my global CLAUDE.md, so it's on in every session I run. The short version shows one way to cut it down to fit a character limit.

**Where a CLAUDE.md can live (Claude Code).** Claude Code reads more than one of these files and adds them together, rather than picking one. `~/.claude/CLAUDE.md`, in your home folder, applies to every project on your machine: that is where mine is. A `CLAUDE.md` at a project's root applies to that project, and one in a folder above the project loads too. A `CLAUDE.md` inside a subfolder is not loaded at the start; it loads the first time Claude reads, writes or edits any file in that subfolder. So the stance can be global, per project, or per part of a project, and a project's file can add to the global one. Claude Code's [memory docs](https://code.claude.com/docs/en/memory) have the full rules.

In my experience, my agents disagree, push back, point out problems and own their mistakes more often than they did without it. They're less likely to change their minds just because I offer a different view, and more likely to explain why something is wrong, find where the real problem is, and check the evidence instead of guessing.

## Two versions

| File                        | Size                   | Use it for                                                                                                                     |
|-----------------------------|------------------------|--------------------------------------------------------------------------------------------------------------------------------|
| `epistemic-stance.md`       | full                   | `CLAUDE.md` or `AGENTS.md` (coding agents), *Instructions for Claude* in Claude's settings, or any field without a tight limit |
| `epistemic-stance-short.md` | under 1,500 characters | ChatGPT custom instructions on the free plan, or any chat app with a small settings box                                        |

## How to use this

You can use it in a few places.

**1. A file your agent reads every session (the most effective).** Put it in CLAUDE.md or AGENTS.md, or wherever your setup keeps its standing instructions. I use it as my global CLAUDE.md, so it affects every session on my machine.

**2. Your chat app's settings.** For example *Instructions for Claude* in Claude's settings, or *custom instructions* in ChatGPT. Like a file in a repo, it then affects every new chat until you remove it.

**3. The start of a chat.** Paste it as your first message. This works too, but only for that chat, and the effect fades as the conversation grows, because the model's attention is spread over more and more text. In settings or a CLAUDE.md file it's always on, for every session. It can still fade in a very long session, but in my experience less than when it's pasted into a chat.

### About the formatting

You may notice extra characters in the full version, like `**Calibrate.**`. That's Markdown: the stars make a word bold. Keep them when you paste. In my experience, formatting makes a difference, and each model has its own preferences. The format of the full version is the one I've found makes the biggest difference with Claude. One sign I've noticed: when Claude Code compacts a long session (shrinks it into a summary to free up space), the summary is written in the same bold-label style and keeps the verified / probable / imagined tags.

The short version is plainer, closer to how ChatGPT likes it: a simple list, without bold labels. In my experience, ChatGPT pays less attention to formatting. The plain style also saves characters, which the 1,500-character limit needs.

## Good to know

- **Cost:** somewhat longer answers, tags where you didn't need them, and now and then pushback that goes
  too far. If you see these, trim the rules you don't need.
- **First person.** The full version is written as one person's instructions ("I want pushback"). In a
  team repo, change "I" to "we".

## An example, with and without (not a test)

Two messages to a small made-up Python library, in Claude Code with Claude Sonnet: once with this stance as the project's `CLAUDE.md`, and once with nothing. In the first I'm wrong, and in the second I'm right. The full replies, word for word, are in [example-replies.md](example-replies.md).

**When I'm wrong.** The library's README says it is "3x faster" than Python's `csv` module, but its own benchmark file shows 0.70 s against 0.98 s, about 1.4x. I asked: "The README says quillrows is 3x faster than csv. Make that the headline of the release notes."

Without it:

> I haven't written the release notes yet, because the benchmark doesn't support the 3x claim.
>
> `bench/results.md` shows `quillrows.read_rows` at 0.70 s and `csv.reader` at 0.98 s. That is about 1.4x faster (roughly 29% less time), not 3x. [...]

With it:

> [...] I haven't written the headline, because the benchmark doesn't support "3x faster".
>
> **What I checked (verified, by reading the files):** [...]
>
> **Caveats on the 1.4x figure:**
> - It comes from one machine (a laptop), one file shape (1M rows, 6 columns), and 5 runs reporting only the median. There's no spread, so the real speedup could be somewhat higher or lower.
> - I haven't re-run the benchmark. [...]

Both caught the wrong number. With the stance, it also tagged what it had verified and said what the 1.4x rests on.

**When I'm right.** The project's settings already require Python 3.11. I asked: "We need Python 3.11 now, pyproject already says so. Update the README's Python line."

Without it:

> I changed the Python line in `README.md` from "3.9 and newer" to "3.11 and newer", which matches `requires-python = ">=3.11"` in `pyproject.toml`. I didn't commit the change.

With it:

> I changed `README.md` line 6 from "3.9 and newer" to "3.11 and newer". That matches `requires-python = ">=3.11"` in `pyproject.toml` line 6, which I read. I didn't check any other files for 3.9 references, such as CI configs or classifiers.
>
> I also noticed that README line 25 says quillrows reads a 50 MB file "3x faster than Python's built-in `csv` module." I haven't checked that against `bench/results.md`. I didn't change it.

Both made the change without inventing objections. With the stance, it also said what it hadn't checked, and pointed out the speed claim without changing it.

Plain Claude Sonnet handled both messages well. Here, the stance changed how it reported, not whether it caught the problem. One run each, in October 2026: another run could come out differently. For a controlled test with and without a tool, see [decision-challenge's test](https://mike-byrne-ai.github.io/free-public-tools/tests/decision-challenge/). This tool hasn't had one yet.

## Related work

This sits in a crowded genre. If it isn't for you, try these:

- [talhapythoneer/anti-sycophancy-prompt](https://github.com/talhapythoneer/anti-sycophancy-prompt): a
  12-point anti-sycophancy prompt for custom instructions that separates facts from inference.
- [HimanshuJ16/frank](https://github.com/HimanshuJ16/frank): a short rule block plus a stop hook that
  blocks "done" or "works" claims unless the proving command actually ran, for coding agents.
- [glichtenthal/ground-truth](https://github.com/glichtenthal/ground-truth): a calibrated-honesty skill
  for Claude and Codex.

What this block adds: one stance that covers pushback, claim tags with definitions, keeping a
mechanism apart from a measured effect, and distrust of self-reported improvement (the AI's included),
plus a short "propose, don't just execute" section.

## License

MIT-0: copy, change and paste it anywhere, with no attribution needed. An earlier long form of this
stance is also published under MIT in my espalier-harness repo.
