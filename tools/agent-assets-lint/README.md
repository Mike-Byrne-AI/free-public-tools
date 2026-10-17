# agent-assets-lint: check your agent instruction files against your own rules

You write the rules in a small JSON file: how long `CLAUDE.md` may get, which headings `AGENTS.md` must have, that a skill's `name` matches its folder, that every skill has a real description. This tool then checks your instruction files against those rules and tells you which ones broke them. It works on `AGENTS.md`, `CLAUDE.md`, `SKILL.md`, `.claude/agents`, `.cursor/rules` and similar files, needs only Node 22 or newer, and installs nothing.

These files usually have no checks of their own, so they drift: a skill gets renamed and its `name` no longer matches, a `CLAUDE.md` quietly grows to 600 lines, a wrapper file stops pointing at `AGENTS.md`.

## Why I use it

I took it from a lint script in my own monorepo and fixed two bugs from the original along the way; tests cover both now. Before this launch I ran it, read-only, across 81 of my own Claude Code projects: no crashes, at most 0.12 seconds each. It found 30 agent files with no header at all, the part where Claude Code expects each agent's name and description: 28 of them in 7 projects I had copied from an older setup of mine, and a template file in 2 more. It also found a skill whose description sat under the wrong field name.

## When to use it, and when not

Use it for **your own conventions**: line budgets, required headings, "this wrapper must mention `AGENTS.md`", how many skills a folder should have, the total size of everything an agent loads. Run it in CI or before you commit.

Don't use it to check a vendor's own format rules, because it ships none. For those:

- Claude Code has a built-in `claude plugin validate <path>` (add `--strict` to treat warnings as errors). Its help text says it validates a plugin or marketplace manifest, or the skills, agents and commands in a directory (read from `claude plugin validate --help` on Claude Code 2.1.289). I did not test what it covers beyond that.
- [agnix](https://github.com/agent-sh/agnix) is a linter for CLAUDE.md, AGENTS.md, SKILL.md, hooks and MCP files, with editor plugins.
- [skills-ref](https://github.com/agentskills/agentskills/tree/main/skills-ref) is the reference library of the [Agent Skills](https://agentskills.io) spec. Its own README says it is for demonstration, not production.

## Install

It is not on npm. Either:

- download the folder from https://github.com/Mike-Byrne-AI/free-public-tools/tree/main/tools/agent-assets-lint and put it in your repo (for example as `tools/agent-assets-lint/`), or
- ask your coding agent: "copy the `tools/agent-assets-lint` folder from https://github.com/Mike-Byrne-AI/free-public-tools into this repo".

## Quick start

**Try it on the sample first.** The folder ships a tiny made-up project with two planted mistakes. With the folder at `tools/agent-assets-lint/` in your repo:

```bash
cd tools/agent-assets-lint/test/fixtures/sample-project
node ../../../bin/agent-assets.mjs --config ../../../examples/claude-code-starter.json
```

It prints the two problems and exits with code 1; the output is under "A sample run" below.

Then, for a plain Claude Code project, copy `examples/claude-code-starter.json` to `agent-assets.config.json` in your repo root, then run:

```bash
node tools/agent-assets-lint/bin/agent-assets.mjs
```

The starter caps `CLAUDE.md` at 200 lines and each skill at 500 lines. Every `.claude/skills/*/SKILL.md` needs a unique kebab-case `name` of up to 64 characters that matches its folder, plus a `description` of 20 to 1,024 characters. Every `.claude/agents/*.md` needs a kebab-case `name` and a `description` of at least 20 characters. Some of these come from published guidance: Claude Code's docs advise keeping `CLAUDE.md` under 200 lines, and the [Agent Skills spec](https://agentskills.io/specification) sets the skill name rules and the 1,024-character limit, and advises keeping `SKILL.md` under 500 lines. The 20-character minimums, unique names and the kebab-case rule for agent names are my picks (Claude Code's docs require only a name and a description for an agent). Edit any of them. Typical output:

```
OK    claude-md                  1 file(s), 3 lines
FAIL  claude-skills              2 file(s), 16 lines
      - .claude/skills/code-review/SKILL.md: frontmatter "description" is 9 characters, below the 20 minimum.
OK    claude-agents              1 file(s), 7 lines

Agent assets: 1 issue(s) across 4 instruction file(s) totalling 26 lines.
```

`examples/agent-assets.config.json` is a bigger example for a repo with a canonical `AGENTS.md`, thin wrappers for Claude and Copilot, Cursor rules and shared skills (kept in `.agents/skills`, that repo's own choice; Claude Code reads `.claude/skills`). Read it as one possible policy, not a standard.

### In CI

GitHub Actions, with the folder copied into your repo at `tools/agent-assets-lint/`:

```yaml
- uses: actions/checkout@v7
- uses: actions/setup-node@v7
  with:
    node-version: 22
- run: node tools/agent-assets-lint/bin/agent-assets.mjs --config agent-assets.config.json
```

## A sample run

It's ordinary code: the same files always give the same output, so one run shows what it does. This is a small Claude Code project with two planted rule breaks, checked with the starter config (`examples/claude-code-starter.json`):

- `.claude/skills/release-notes/SKILL.md` gives its `name` as `release-note`, which doesn't match its folder.
- `.claude/agents/test-runner.md` has the description "Runs tests.", which is 11 characters, under the starter's 20.

```
OK    claude-md                  1 file(s), 4 lines
FAIL  claude-skills              2 file(s), 16 lines
      - .claude/skills/release-notes/SKILL.md: frontmatter "name" is "release-note" but its directory is "release-notes".
FAIL  claude-agents              1 file(s), 6 lines
      - .claude/agents/test-runner.md: frontmatter "description" is 11 characters, below the 20 minimum.

Agent assets: 2 issue(s) across 4 instruction file(s) totalling 26 lines.
```

It exits with code 1, so a CI step that runs it fails. The project is `test/fixtures/sample-project`, and one of the tool's own tests runs it and compares the output with this block, so the two cannot drift apart.

## Usage

```bash
node bin/agent-assets.mjs                         # uses ./agent-assets.config.json
node bin/agent-assets.mjs --root ../other-repo    # check a different checkout
node bin/agent-assets.mjs --config policy.json    # another config file
node bin/agent-assets.mjs --json                  # machine-readable report
node bin/agent-assets.mjs --version               # the version
```

A value may follow its option or be attached with `=`: `--root ../other-repo` or `--root=../other-repo`. Exit code `0` means clean, `1` means a check reported an issue, `2` means a config or usage error, such as a missing config file or a `--root` that isn't a folder, or a crash. Warnings do not change the exit code. If every check was skipped because nothing it looks for exists, the run passes and the text ends with "Nothing was checked". `--config` resolves against the working directory, not `--root`, so one config can check many checkouts. The report ends with the total footprint: how many instruction files matched and how many lines they add up to, counting each file once even when several checks look at it.

## Config

```json
{
  "schemaVersion": 1,
  "checks": [
    {
      "id": "canonical-instructions",
      "description": "AGENTS.md stays inside its context budget.",
      "path": "AGENTS.md",
      "maxLines": 200,
      "requireHeadings": ["## Mission", "## Repository map"]
    },
    {
      "id": "claude-skills",
      "dir": ".claude/skills",
      "match": "*/SKILL.md",
      "maxLines": 500,
      "minCount": 1,
      "nameMatchesDirectory": "name",
      "uniqueBy": "name",
      "mustReference": ["AGENTS.md"],
      "frontmatter": {
        "fields": {
          "name": { "required": true, "pattern": "^[a-z0-9]+(?:-[a-z0-9]+)*$" },
          "description": { "required": true, "minLength": 20, "maxLength": 1024 }
        }
      }
    }
  ]
}
```

Each check declares exactly one of `path` (a single file) or `dir` (a family of files, filtered by `match`). Both are written relative to the repo, with forward slashes and no trailing slash.

| Field                   | Applies to | Meaning                                                                                                                                                                                                                                                                                                                                                                                               |
|-------------------------|------------|-------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| `required`              | both       | `path`: a missing file is an error unless `false`. `dir`: a missing directory is an error only when `true`.                                                                                                                                                                                                                                                                                           |
| `maxLines`              | both       | Line budget per file. The limit itself is allowed.                                                                                                                                                                                                                                                                                                                                                    |
| `requireHeadings`       | both       | Headings the file must have, each as a heading line of exactly that text and level, outside code blocks (`## Mission` is not met by `### Mission`).                                                                                                                                                                                                                                                   |
| `mustReference`         | both       | Text that must appear, typically the canonical filename (plain substring, see Good to know).                                                                                                                                                                                                                                                                                                          |
| `frontmatter`           | both       | `required` (default `true` when the key is present) and `fields`.                                                                                                                                                                                                                                                                                                                                     |
| `match`                 | `dir`      | Glob: `*` is one path segment, `**` is any depth. Every other character, including `?`, is literal. Write it relative to `dir` with forward slashes: a backslash, a leading `/` or `./`, a trailing `/`, `..`, or a `match` that starts with `dir` itself is a config error. If the folder is there but nothing matches, the check still passes and its line says `nothing in <dir> matched <match>`. |
| `minCount` / `maxCount` | `dir`      | Bounds on how many files match.                                                                                                                                                                                                                                                                                                                                                                       |
| `nameMatchesDirectory`  | `dir`      | Frontmatter field that must equal the name of the folder the file is in, when the file has it (mark the field `required` to demand it). Needs a `frontmatter` section (it can be `{}`).                                                                                                                                                                                                               |
| `uniqueBy`              | `dir`      | Frontmatter field that must be unique across the family. Needs a `frontmatter` section (it can be `{}`).                                                                                                                                                                                                                                                                                              |

Field rules: `required`, `pattern` (regex), `minLength`, `maxLength`, `oneOf`.

The config shape is closed: an unknown field is an error, so a typo cannot silently drop a check.

### How the folder walk works

- A `dir` check looks through all subfolders.
- `node_modules` and `.git` are never entered or inspected, at any depth (a git worktree keeps a `.git` file). This is not configurable.
- Symlinked folders (and Windows junctions) are followed, so a skills folder linked into `.claude/skills` is checked. A link that points back at one of its own parent folders, the project root included, is skipped, so a loop cannot hang the run or pull the whole project in under the link's name. Two links to one folder are two files to a check (so `uniqueBy` reports the pair) and one file to the footprint.
- A file or folder that exists but can't be read is reported as an issue, not skipped.

## Good to know

- **How it is built, and why each piece is there**, the parser, the reader, the tests and the rest, is in [ANATOMY.md](ANATOMY.md).

- **Headings are matched as headings; references are plain substrings.** `requireHeadings: ["## Mission"]` needs a heading line with exactly that text at that level, outside code blocks and the frontmatter, so `### Mission`, `## Mission statement` or the text inside a code block does not count (the issue line says when the text is there but not as a heading). `mustReference: ["AGENTS.md"]` passes on any sentence that mentions `AGENTS.md`, even "do not read AGENTS.md". It checks that the text is there, not that the file is wired up well.

- **It cannot tell you whether your instructions are any good.** Only that a description exists and is long enough, not that it is useful or that an agent will act on it.

- **It cannot tell you whether an agent reads a file.** Which files each tool loads differs by vendor and version; this only looks at files on disk.

- **A green run means the repo matches what you wrote down**, not that you wrote down the right rules.

- **Values a strict YAML reader rejects get a warning.** An unquoted value like `description: Use when: the user asks`, or one that starts with `[draft]`, `*Deploys*`, `@team` or a backtick, loaded fine in Claude Code 2.1.300 (checked 2026-10-15), but a strict reader such as PyYAML stops with an error. In checks with a `frontmatter` section, each such top-level field gets a `warning:` line (and an entry in that check's `warnings` in `--json`) saying to put the value in quotes. Warnings don't fail the check. Valid YAML that isn't text, like `tools: [Read, Grep]`, quoted values and `>` / `|` blocks get none. Two more shapes get a warning because Claude Code 2.1.300 read them differently from how they look (checked 2026-10-15): `name:deploy`, with no space after the colon, is not a field at all (it is reported missing, and the warning says why), and `name: "deploy" junk`, text after a closing quote, made Claude Code drop every value in the block (the reader keeps the quoted text and warns). Four more shapes get one because PyYAML stops on them (checked 2026-10-15; what Claude Code does with these I haven't checked): a tab outside quotes, in the indentation included (inside quotes or a `#` comment a tab is fine); an escape YAML doesn't define, like `\'` in double quotes; an indented line under a value that has already ended, like `name: "a"` with `  b` below it; and a line that isn't a `key: value` field at all. Nested values aren't checked.

- **The frontmatter reader is not a YAML parser.** It understands top-level `key: value` lines (the key may be quoted, or any plain YAML text up to the colon; a block indented as a whole is read too), quoted values (`''` inside single quotes is one quote; inside double quotes `\"`, `\\`, `\n`, `\t`, `\u00e9` and the other YAML escapes are decoded, as Claude Code decodes them (2.1.300 showed `\u2014` as one character, checked 2026-10-15), and a `\` at the end of a line joins it to the next), comments (`name: deploy # note` reads as `deploy`, and a value that is only a comment, `~` or `null` reads as empty, as YAML does), values that wrap onto indented lines or start on the line below the key (joined with spaces, as YAML does, and checked like any other value), list and map values (`tools:` followed by `- item` lines, or `tools: [Read, Grep]` on one line, joined with ", " and not checked for length, `pattern` or `oneOf`) and `>` / `|` block text (`>` folds the lines into one with spaces and keeps a more-indented line on its own, `|` keeps the line breaks; both keep the final line break, as YAML does, drop it after a `-` and keep every trailing blank line after a `+`; a `|2` indent indicator is honoured). Numbers, `true` and dates are kept as the text typed. Anchors, tags, the `? key` form and multi-document files are not understood, and a comment line in the middle of a wrapping value ends the value there. On 207 frontmatter shapes it reads what PyYAML 6.0.3 reads, or warns where PyYAML stops or reads something else, with one known difference (`test/fixtures/frontmatter-vs-pyyaml.json`, rebuilt by the script beside it). When unsure, it leans toward reporting a field as present rather than missing.

- **Tested on** Linux, macOS and Windows with Node 22 and 24, on GitHub Actions on 2026-10-16: its 104 tests (among them 4,000 generated frontmatter blocks the reader must never fall over on, and the PyYAML comparison), the Quick start above and the sample run passed in all 6 setups. Two tests skip on Windows, where a folder or a file cannot be made unreadable; both ran on Linux and macOS. The same run repeats on every push to the repo (its Actions tab), with a floor of 95% of the tool's lines exercised by the tests.

## Related work

- `claude plugin validate`, [agnix](https://github.com/agent-sh/agnix) and [skills-ref](https://github.com/agentskills/agentskills/tree/main/skills-ref), described above, check vendor formats with fixed rules.
- Other AGENTS.md and SKILL.md linters exist; this is a crowded area. What this one adds: you declare the policy yourself (line budgets, required headings, wrapper wiring, family counts, total footprint) and it ships no vendor rules of its own.
## License

License: MIT-0. Use, copy and change it however you like; no credit needed.
