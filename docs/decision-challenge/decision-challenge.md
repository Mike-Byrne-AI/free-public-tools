---
description: Challenge a decision before you lock it in. Fixed criteria first, alternatives before scoring, verdict STAY / PIVOT / SPLIT.
argument-hint: "[the decision to challenge, in one sentence]"
---

Challenge one decision before it becomes hard to reverse. Read the project files it depends on. Do not edit files, run code, or run commands that change anything unless the user asks.

Decision to challenge: $ARGUMENTS

## Step 0 - Find the target
Use the argument above. If it is empty, use the newest entry in the project's decision log or ADR folder, then the current conversation. Then find where the decision is written down (a decision log or ADR, docs, or code), and read it and the files its reasons cite: what they say is the evidence for every later step. If the target did not come from the argument, state it and get the user's confirmation before going on (if you cannot ask, say it is unconfirmed). If you cannot name one concrete decision, say "no concrete decision" and stop. Never invent a target. If the decision is cheap and easy to reverse, say so and ask whether to continue.

State:
- CURRENT APPROACH: one sentence
- REASONING: 2-3 sentences taken from the source, not reconstructed
- LOCK STATUS: locked / proposed / assumed / implicit

## Step 1 - Fix the criteria before any alternative exists
Ask the user to supply or confirm 4-6 criteria, each with a weight (HIGH / MEDIUM / LOW) and a one-line reason. Offer a draft if they have none. Wait for the answer, show the final list, and do not change it afterward.
If the user declines, or you cannot ask, choose the criteria yourself and label the whole run "criteria chosen by the model". Say that this weakens the fairness check.

## Step 2 - Write the alternatives (no scoring yet)
Write two alternatives, each structurally different from the current approach. A different constant or setting is a sweep, not an alternative. Each must be something you could defend if forced to ship it; if you would be embarrassed to see it picked, it is a strawman, so replace it.

Per alternative:
- ALTERNATIVE: a concrete name
- CORE DIFFERENCE: one sentence
- SKELETON: 10-20 lines of pseudocode, or a file/command flow, showing the difference
- BUYS / COSTS: 1-2 sentences each

If only one defensible alternative exists, write it and say the second slot is empty. If none exists, say "only one defensible option exists", explain why in 3-5 sentences, name the strongest objection to the current approach, and stop. Never pad with a strawman.

## Step 3 - Score
Only now score every option against the fixed criteria: STRONG / ADEQUATE / WEAK, one sentence per cell. Label the table EXPECTED CASE.

Fairness check: if the current approach is at least as strong as every alternative on every HIGH criterion, suspect you weakened the alternatives. Add a CHARITABLE CASE table that scores every option, the current one included, at its best defensible case. Show it beside the expected-case table; never replace the original scores. If the check does not trigger, say so in one line.

## Step 4 - Verdict
- VERDICT: STAY / PIVOT / SPLIT
- CONFIDENCE: HIGH / MEDIUM / LOW
- EVIDENCE: FACT (measured) / INFERENCE / SPECULATION
- REASONING: 3-5 sentences, HIGH criteria first. Say which conclusions rest only on charitable scores.

Then:
- STAY: name the strongest argument against the current approach and why it still loses. "STAY with more confidence" is a valid result.
- PIVOT: say what the original reasoning missed, and list what already assumes the old approach.
- SPLIT: do not fall back on the current approach because information is missing. Name the one experiment, measurement or prototype that would settle it, and its rough cost.

End with NEXT SMALLEST MOVE: one bounded action.

Keep it tight: one sentence per table cell, no prose beyond these fields. The final call is the user's.
