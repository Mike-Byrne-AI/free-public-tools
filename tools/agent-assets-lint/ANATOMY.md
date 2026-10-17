# How agent-assets is built, and why

A linter sells one thing: trust. So this is a small tool wrapped in a large layer of checks on itself, and this page is the reasoning a reviewer would ask for, piece by piece, in the order a run passes through them. Where a choice could have gone the other way, I say what the other way was and why it lost.

## The shape

```
bin/        the door: what runs when you type the command
src/        the workings, one file per job
examples/   two rules files to start from
test/       the proof, one file per kind of test
```

There are two doors. `bin/agent-assets.mjs` is the one for people, on the command line. `src/index.mjs` is the one for other programs: four lines that re-export the useful functions, so a build script can `import` the checker instead of spawning a process. Both lead to the same rooms, and both are tested.

The tool has no dependencies. Nothing is installed, so nothing can change under it, and a run on a machine with Node 22 or newer is the whole story.

## The door: a hand-written argument parser

The command takes two options and three flags, and the parsing of them is written by hand, in about thirty lines. Node ships a parser (`util.parseArgs`) that would do the same job, and a reviewer is right to ask why it isn't used.

The honest answer is that I am learning tool-building by building, and I wanted to *feel* how an argument parser works from the inside: what a value is, what a flag is, what happens with `--root=` and no value, why `--json=1` must be refused, why an unknown word has to stop the run. Writing it taught me that; importing it would not have.

What that choice costs is small and visible: thirty lines that have to be right, which the CLI tests pin down. What it does: a value may follow its option or be attached with `=`; an empty value is refused, because an unset variable in CI (`--root "$REPO"`) would otherwise quietly mean the working directory; a flag given a value is refused; an unknown argument stops the run with exit code 2. Anything that crashes the program also exits 2, never 1, so CI cannot mistake a crash for "the repo broke a rule".

## The rules file

`src/config.mjs` reads the JSON rules file and refuses anything it does not understand. The shape is closed: an unknown field is an error, not a silent no-op. A typo like `maxLine` would otherwise drop a check and leave the report looking clean, which is the worst thing a linter can do. Every path shape that would match nothing (a backslash, a leading slash, a trailing slash, a `..`, a glob that repeats its own `dir`) is also an error at load, with a message that says what to write instead. Regular expressions and numeric bounds are checked at load too, so a bad rule fails before any file is read.

## The folder walk

`src/checker.mjs` walks each `dir` family. `node_modules` and `.git` are never entered, at any depth, and this is not configurable, because a rule that reached into them would be a mistake every time. Symlinked folders are followed, so a skills folder linked into place is checked, but a link that points back at one of its own parents is skipped, so a loop cannot hang the run or pull the whole project in under the link's name. A file that exists but cannot be read is an issue, not a skip: calling it missing would hide a file that is there.

## The checks

A required heading must be a heading: a line with exactly that text at that level, outside fenced code blocks and outside the frontmatter. `## Mission` is not met by `### Mission`, by `## Mission statement` or by the text inside a code block. The first version used a plain substring test, which passed all three, and the README said so; matching the heading as a heading is what the rule's name promises, so that is what it does now, and the issue line says when the text is there but not as a heading.

A required reference stays a substring. `mustReference: ["AGENTS.md"]` passes on any sentence that mentions the file, including "do not read AGENTS.md". A reference can sit in prose, in inline code or in a link, and guessing its intent would be a worse check than a plain one with its limit written down.

Frontmatter rules (`required`, `pattern`, `minLength`, `maxLength`, `oneOf`) apply to the value an agent would read, which is why the reader below is shaped the way it is. List values are present-or-absent only: a length rule on a list would invent failures.

## The reader

`src/frontmatter.mjs` reads the block between the `---` lines at the top of a Markdown file, and it is written by hand. This is the choice a reviewer will push on hardest, and here the reason is technical, not educational.

A YAML library gives a strict yes or no. The agent tools this linter serves are not strict: Claude Code 2.1.300 loads `description: Use when: the user asks` as text, where a strict reader stops with an error, and it drops a whole block when text follows a closing quote, where a lenient reader would carry on. A linter that uses a strict library would fail files the agent reads fine, and pass nothing it could explain. What this tool needs is a reader with a different contract: read what the agent reads, measure that text, and add a warning wherever a strict reader would stop, so a file that loads in one tool and fails in another gets flagged before it travels. No library offers that contract, so I wrote it, and kept it small: it understands keys, quoted and plain values, comments, wrapped lines, lists, and `|` and `>` blocks, and it leans toward "field present" when unsure, because reporting a populated field as missing is the worst outcome for a linter.

Where it does read a value, it reads what YAML reads. That is not a claim, it is a test: 207 frontmatter shapes, from escapes and tabs to block endings and odd keys, each with what PyYAML 6.0.3 read from it recorded in `test/fixtures/frontmatter-vs-pyyaml.json`. On every one the reader agrees, or warns where PyYAML stops, or keeps a typed value like a date as text on purpose, with one known difference listed with its reason. The README's "Good to know" section carries the full list of what the reader does and does not understand, with the dates on which each Claude Code behaviour was checked.

## The report

The text report is for a person: one line per check, aligned columns, a `- ` line per issue under a failing check, `warning:` lines that never change the exit code, and a footprint line at the end that says how many lines an agent loads in all. The JSON report (`--json`) is for a machine: the same facts under a `schemaVersion`, so a script can depend on its shape and be told when it changes.

Exit codes are the contract with CI: 0 when every check passes, 1 when any check reports an issue, 2 on a usage or configuration error or a crash. Warnings do not count, because a warning is "a stricter reader would object", not "your rule is broken", and a CI gate that fails on advice gets switched off.

## The tests

There are four kinds, and each exists for a reason a reviewer would recognise.

- **Unit tests** (`test/primitives.test.mjs`, `test/checker.test.mjs`): one behaviour per test, with the exact input text and the exact expected value or message. When a bug is found, the case goes in first, fails, and then the fix goes in.
- **CLI tests** (`test/cli.test.mjs`): the door itself, spawned as a process, so exit codes, both option forms, `--version` and the library door are checked the way a user meets them.
- **A fuzz test** (`test/fuzz.test.mjs`): thousands of generated inputs, half random characters and half plausible frontmatter with the mistakes people make, thrown at the reader, the glob matcher and the config validator. None may throw, and each must return the documented shape. The generator uses a fixed seed, so every run is the same and a failure prints the seed and the input, ready to become a unit test. A linter runs on other people's repositories; it must never fall over on odd input.
- **A differential test** (`test/frontmatter-vs-pyyaml.test.mjs`): the reader against a reference reader on a fixed corpus, with results sorted into buckets. A difference fails unless it is on a short known list with a reason, and a known entry that starts agreeing also fails, so the list cannot go stale.

The last two are ordinary practice for anyone who writes a parser, and the suite would be the odd one without them.

One habit sits outside the suite: before and after any change to the reader or the walk, I run the tool read-only over the 355 folders on my machine that hold a `CLAUDE.md` or `AGENTS.md`, with the starter rules, and compare the two tables. A change that touches only what it targets leaves them identical. The one on 2026-10-15 did.

## What is verified where

Every test above, the README's quick start and the sample run ran on Linux, macOS and Windows, each with Node 22 and Node 24, on GitHub Actions on 2026-10-16, and passed in all six. Each Claude Code behaviour the README relies on carries the version and the date it was checked, and the README's "Tested on" line is kept in step with this page.

## What it cannot do

It cannot tell you whether your instructions are any good, only that they are there, long enough, and shaped as you said. It cannot tell you which files an agent actually loads; that differs by vendor and version, and this tool only looks at the disk. A green run means the repository matches what you wrote down, not that you wrote down the right rules.
