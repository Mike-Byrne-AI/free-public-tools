# Free-Public-Tools

Free tools for AI assistants and coding agents. A new one every week.

Each one started in my own work with AI, and is tested before release.

**Browse them here: https://mike-byrne-ai.github.io/free-public-tools/**

**[How I test them](https://mike-byrne-ai.github.io/free-public-tools/tests/decision-challenge/):** Tools up against plain prompts, on questions from my own projects, across several AI models. Answer keys written before the runs, replies marked without names, every mark published.

**[Free-Public-Lessons](https://mike-byrne-ai.github.io/free-public-lessons/):** Free AI lessons every week.

Each tool has its own page. Copy it in one tap and paste it where it goes: a chat, a chat app's custom
instructions, a `CLAUDE.md` or `AGENTS.md` file, or your coding agent (for a tool made of several
files, Copy gives an install prompt that fetches the folder for you). The page says where each tool
goes, and every tool's folder here has its notes and all its versions.

## What's in this repo

- `tools/<name>/`: one folder per tool. Each holds the tool itself, a `README.md` (what it does,
  why I use it, where it goes, and what's good to know first) and a `tool.json` that the pages are
  built from.
- `docs/`: the pages behind the "Browse them here" link, generated from `tools/`. You don't need to read
  it; each tool's folder has everything.

## License

MIT-0. Use, copy, change and share the tools however you like, with no need to credit anyone.
See `LICENSE`.

Found a problem, or a tool didn't behave the way its README says? Open an issue.
