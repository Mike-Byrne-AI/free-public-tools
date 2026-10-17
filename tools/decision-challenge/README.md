# Decision challenge: test a choice before you lock it in

Challenge a decision before you lock it in.

A coding agent command, here formatted as a Claude Code slash command, `/decision-challenge`, that pressure-tests one decision before it becomes hard to reverse. Give it a sentence ("poll the API instead of using webhooks", "keep one big config file"). It then:

- finds one concrete decision, and stops if there isn't one (if it picked the decision itself, it asks you to confirm);
- has you set or confirm 4-6 weighted criteria, each with a reason, **before** any alternative is written;
- writes up to two real alternatives, each with a short skeleton, before it scores anything;
- scores every option, and if the current choice comes out ahead on all the important criteria, adds a charitable scoring **beside** the first one, never in place of it;
- ends with **STAY**, **PIVOT** or **SPLIT**, plus one next step. A SPLIT names the experiment that would settle it, with a rough cost.

It has two honest exits: "no concrete decision" and "only one defensible option exists".

## Why I built it

A decision is hardest to question right after you've made it, or right after a result went the way you hoped. That's when it's easiest to stop looking.

## Why I use it

I wrote the first version in March 2026 and later rewrote it for a second project. Most recently I used it on how to publish this very site. It stopped to have me set my criteria first, then kept one half of my plan and came back with PIVOT on the other: my setup needed two separate pushes every week, which could drift out of step. It suggested a one-commit setup, and a cheaper check as the fallback.

## How to use this

**Claude Code.** Save `decision-challenge.md` as `.claude/commands/decision-challenge.md` in a project, or in `~/.claude/commands/` for every project. On the tool's page, **Copy install prompt** asks Claude Code to do this for you. Then type `/decision-challenge <your decision>`.

**GitHub Copilot CLI.** Save the same file, unchanged, as `.claude/skills/decision-challenge/SKILL.md`. On the tool's page, **Copy install prompt (Copilot CLI)** asks Copilot to do this for you. Then type `/decision-challenge <your decision>`.

**Another coding agent.** The file is formatted for Claude Code. If you ask your agent to adapt it, check that it can run the result: in my tests, 5 of 7 models in Copilot installed it in a format Copilot's terminal app doesn't load.

**Let it run on its own (Claude Code).** Installed, it waits for you: in my test, Claude Code never ran it unasked (0 of 12 runs). Add this line to your project's `AGENTS.md`, and it can run it on its own before a big decision, even one it made itself:

```
Before you lock in a decision that would be hard to reverse, run /decision-challenge on it.
```

With that line, Claude Sonnet and Haiku ran it on their own in 8 of 12 runs on the same made-up app (and in 8 of 12 with it in `CLAUDE.md` instead). Not every time: in the other 4, they went ahead without it.

It reads the files the decision depends on, but it is told not to edit them or run anything that changes them unless you ask. Use it just before a hard-to-reverse choice, or right after a result that went the way you hoped. For small, easy-to-undo choices such as naming or style, it says so and asks whether to go on.

## How it differs from a devil's-advocate prompt

Many "argue against this" prompts let the model choose what to argue about and how much each point counts. This one changes three things:

1. **Fixed criteria.** You set or confirm them first, and they don't change afterward. If you skip that step, the run is labelled "criteria chosen by the model" so the result isn't oversold.
2. **Alternatives before scoring.** Every alternative is written before any score exists. The reasoning is that judging options while writing them can quietly weaken them.
3. **SPLIT names an experiment.** "It depends" isn't an allowed ending: you get the one test or prototype that would settle it, with a rough cost.

## Good to know

- **One model plays every part.** It writes the alternatives, scores them and gives the verdict, so the safeguards can turn into ritual. The charitable scores sit beside the originals so you can see how much of a verdict rests on them.
- **Cost:** a few extra minutes, a pause while you set criteria, and a long answer with one or two tables.
- **Safety:** the command asks for no edits and no commands that change anything. Skeletons in its answer are illustrations; review them before you run any of it.

## How it did across AI models

I tested it on six of my own projects: 18 decisions, each set at a real point in a project's history and put to 7 AI models (Claude Opus, Sonnet and Haiku in Claude Code; GPT-5 mini, GPT-6 Luna, MAI-Code 1.1 Flash and Gemini 3.8 Flash in GitHub Copilot). A third of the decisions are good plans the project's own files back, a third are bad plans the files sink, and a third are tough calls where both sides hold up. Most of the good plans and tough calls are choices I actually faced; some of the bad plans I wrote for the test. I wrote every question, its answer key and the marking rules, and committed the plan, before the test began; the few changes made along the way are dated on the test cards, each with its reason. Two AI markers graded every reply without being told which version or model wrote it (though what the user typed shows the version), a third settled their disagreements, and I graded 15 tough-call replies they disagreed on myself, also without names.

Each decision went three ways: the command; a short prompt that asks it to read the project files and end with a verdict; and the plain request with nothing else. Then every version got the same second message: my priorities, ending "Go on." One run each, in October 2026.

- **It never touched my project.** No message asked for an edit, but 21 of 126 runs with the short prompt and 43 with the plain request edited or deleted files already in the project, many of them after offering to make the change. With the command: 0.
- **In real use it got more decisions right:** 70%, against 60% for the short prompt and 51% for the plain request. In real use, a plain request stops at its first answer, while the command stops to ask for your priorities. In Claude Code alone, the short prompt kept up (45 of 54 each); the lead comes from the Copilot models.
- **When the other two also got my priorities and a second turn, both jumped.** The plain request and the short prompt each gained about 12 points, and the short prompt ran neck and neck with the command, scoring higher on some kinds of question (the prompt is below). The command takes two turns by design: it stops to ask for your priorities before it decides, where the other two answer in one. In real use, they stop at that first answer.
- **It costs less than the short prompt given the same second turn**, with fewer tool calls: $0.43 a run³ against $0.54 in Claude Code, and 5.8 Copilot credits against 8.8. In Claude Code, the short prompt's first answer on its own cost about half as much, and got as many decisions right.
- **Where it slips:** it's cautious: sometimes it pushes back on a plan that's actually fine, and sometimes it asks to measure something the project has already measured. Both are on my list for the next version.

|                                                          |             Command | Short prompt | Plain request |
|----------------------------------------------------------|--------------------:|-------------:|--------------:|
| **Real use: the other two stop at their first answer** ¹ |                     |              |               |
| Right overall                                            | **88 of 126 (70%)** |     76 (60%) |      64 (51%) |
| Tough calls                                              |      24 of 42 (57%) |     18 (43%) |      11 (26%) |
| Good plans (say "go ahead")                              |  **33 of 42 (79%)** |     28 (67%) |      27 (64%) |
| Bad plans (catch the flaw)                               |      31 of 42 (74%) |     30 (71%) |      26 (62%) |
| **Same information: every version gets my priorities** ² |                     |              |               |
| Right overall                                            |     87 of 126 (69%) |     91 (72%) |      80 (63%) |
| Tough calls                                              |      24 of 42 (57%) |     23 (55%) |      15 (36%) |
| Good plans                                               |      33 of 42 (79%) |     37 (88%) |      38 (90%) |
| Bad plans                                                |      30 of 42 (71%) |     31 (74%) |      27 (64%) |
| **Every run**                                            |                     |              |               |
| Edited or deleted files already in the project           |        **0 of 126** |           21 |            43 |
| Copilot credits a run ³                                  |                 5.8 |          8.8 |           4.8 |
| Claude Code cost a run ³                                 |               $0.43 |        $0.54 |         $0.34 |

¹ **Real use.** The short prompt and the plain request are marked on their first answer, where a real conversation usually ends; the command is marked on its answer after the priorities it asked for. I chose this way of marking after the runs, once I'd seen the planned way's overall totals but not this way's results. The command's replies are the same in both halves, marked a second time: three of their marks came out differently, two because my own marks count only in the planned way, and one a referee's call.
² **Same information.** Both control groups, the short prompt and the plain request, were given a second turn: my priorities, each marked high, medium or low. Only the command asks for priorities on its own (and offers a draft), so this way favors the other two: in real use, you'd have to plan that second message yourself and send your priorities without being asked.
³ **One run.** One decision, start to finish: both messages, one model. The dollar figure is Claude Code's own estimate at API prices, averaged over three models: for the command, about 4 cents a run with Haiku, 37 with Sonnet and 87 with Opus. On a Claude subscription, which is how I ran the test, you aren't billed per run; it counts toward your plan's usage limits. Copilot credits come from your plan's monthly allowance: for the command, about 1 to 2 a run on most models, and 18 on Gemini 3.8 Flash.

**The short prompt is free.** This is exactly what was tested, in two messages:

1. `Challenge this decision before we lock it in: [your decision]. Read the project files it depends on, and end with a verdict: stay, pivot or split.`
2. Your priorities, each marked HIGH, MEDIUM or LOW.

**Keep in mind:**

- Six projects, one run per model and question, so treat a gap of a few points as noise.
- The decisions come from my own projects, and I wrote the questions. Every question, the evidence behind its answer key, and how each reply was marked are on the [test cards](https://mike-byrne-ai.github.io/free-public-tools/tests/decision-challenge/).

### An earlier, smaller test

Before this, I tested it on one made-up app whose newest decision record proposes polling a payment provider every 5 minutes; the app's own files sink that plan (480 requests an hour against a limit of 100). With the command, Claude Sonnet and Haiku opened the files and found the clash in 3 of 3 runs each; asked in plain words without it, in 0 of 3. Across 10 AI setups, the command's results ranged from 3 of 3 to 0 of 3. One made-up project with a checkable answer: closer to a fact-check than a close call.

## An example, with and without (not a test)

One run each, on the made-up payments app from the earlier test, in Claude Code with Claude Sonnet: once with the command installed and run as `/decision-challenge poll PayStream's API every 5 minutes for payment status instead of using webhooks`, and once as the plain request, "Challenge this decision before we lock it in: poll PayStream's API every 5 minutes for payment status instead of using webhooks." The app's own files sink the plan: 40 merchants, one request each, against a limit of 100 requests an hour. The full replies, word for word, are in [example-replies.md](example-replies.md).

Without it:

> **My recommendation is not to lock in polling-only.** Polling is a reasonable starting point, but I'd use it as a reconciliation backstop, not as the primary mechanism. I haven't looked at the codebase or at PayStream's docs, so I'm assuming a typical payment provider. Check the specifics below against their API. [...]
>
> **Rate limits are a risk.** A burst of orders can push you into throttling, and a throttled poller falls behind exactly when volume is highest. [...]
>
> If you'd like, I can check how payments are currently modeled in this repo to see which option fits.

With it, the first reply:

> [...] **A problem the ADR doesn't mention.** The ADR cites `vendor/paystream-api.md` but doesn't use its rate-limit section:
> - The limit is 100 requests per hour per API key, across all endpoints. The README says one platform key serves all merchants.
> - The endpoint takes one merchant per request, and `config/merchants.json` lists 40 merchants.
> - Polling every 5 minutes therefore costs 40 × 12 = 480 requests per hour, about 4.8 times the limit. [...]
>
> **Step 1: Criteria** (I won't score anything until you confirm) [...]

and, after my priorities, the end of the second:

> [...] **VERDICT:** PIVOT, to B (webhooks plus an hourly reconcile).
> - **CONFIDENCE:** HIGH that 5-minute polling fails. MEDIUM that B is better than A. [...]
>
> **NEXT SMALLEST MOVE:** Read the live PayStream docs, about 30 minutes, to confirm the current rate limit and the webhook signature scheme. [...]

What differed:

- The plain request opened no file, and said so. Its advice is sound for a typical provider and wrong for this app, whose own notes rule out 5-minute polling.
- The command read six files first (the decision record, the provider's API notes, the README, the server code, the merchant list, the deploy config), found the clash by arithmetic, and stopped to ask for priorities before writing anything else. With them, it wrote two alternatives, scored every option, said its fairness check didn't fire, and ended with a verdict and a next step.
- Only the command's first reply ended with a question, so by a rule set before the runs only it got the priorities, as in real use.
- Neither changed a file.

One run each, in October 2026, on the same made-up app as the earlier test: an illustration, not evidence. The six-project test above is the evidence.

## Related work

Challenging a plan is a common idea. Others worth trying:

- [affaan-m/ECC](https://github.com/affaan-m/ECC) (everything-claude-code): the [`council`](https://github.com/affaan-m/ECC/blob/main/skills/council/SKILL.md) skill convenes four voices (Claude plus Skeptic, Pragmatist and Critic subagents) on an ambiguous decision.
- [alirezarezvani/claude-skills](https://github.com/alirezarezvani/claude-skills): the [`challenge`](https://github.com/alirezarezvani/claude-skills/blob/main/c-level-advisor/executive-mentor/skills/challenge/SKILL.md) skill runs a pre-mortem on a plan.
- [JoaquinCampo/agent-debate](https://github.com/JoaquinCampo/agent-debate): a Claude Code plugin for a debate between Claude and Codex.
- Anthropic's [`architecture-critic`](https://github.com/anthropics/claude-plugins-official/blob/main/plugins/code-modernization/agents/architecture-critic.md) agent (code-modernization plugin): a skeptical design review that asks for the simplest design that meets the requirements.

What this one adds: criteria fixed before the options exist, alternatives written before any scoring, expected and charitable scores shown together, and a SPLIT that must name its experiment.

## License

MIT-0: copy, change and use it anywhere, with no attribution needed.
