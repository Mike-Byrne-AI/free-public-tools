#!/usr/bin/env node
/**
 * agent-assets — lint the instruction files agents read.
 *
 * Usage:
 *   agent-assets [--config agent-assets.config.json] [--root .] [--json]
 */
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { loadConfig } from '../src/config.mjs';
import { runAgentAssets } from '../src/checker.mjs';

const HELP = `agent-assets — lint the instruction files agents read.

  --config <path>   config file (default: agent-assets.config.json)
  --root <path>     repository root to check (default: .)
  --json            emit the machine-readable report
  --version         print the version
  -h, --help        show this help

A value may follow its option or be attached with "=": --root ../repo or --root=../repo.

Exit code is 1 when any check reports an issue (warnings do not count), 2 on a usage or configuration error.`;

function parseArgs(argv) {
  const options = { config: 'agent-assets.config.json', root: '.', json: false };
  for (let index = 0; index < argv.length; index += 1) {
    // "--root=." carries its value in the same word, as most command-line tools allow.
    const eq = argv[index].startsWith('--') ? argv[index].indexOf('=') : -1;
    const arg = eq > 0 ? argv[index].slice(0, eq) : argv[index];
    const attached = eq > 0 ? argv[index].slice(eq + 1) : undefined;
    const next = () => {
      const value = attached ?? argv[index + 1];
      // "" (an unset variable in CI, say) would quietly mean the working directory.
      if (value === undefined || value === '') throw new Error(`${arg} requires a value.`);
      if (attached === undefined) index += 1;
      return value;
    };
    const flag = () => {
      if (attached !== undefined) throw new Error(`${arg} takes no value.`);
      return true;
    };
    if (arg === '--config') options.config = next();
    else if (arg === '--root') options.root = next();
    else if (arg === '--json') options.json = flag();
    else if (arg === '--version') options.version = flag();
    else if (arg === '--help' || arg === '-h') options.help = flag();
    else throw new Error(`Unknown argument: ${argv[index]}`);
  }
  return options;
}

async function main() {
  let options;
  try {
    options = parseArgs(process.argv.slice(2));
  } catch (error) {
    console.error(error.message);
    process.exitCode = 2;
    return;
  }
  if (options.help) {
    console.log(HELP);
    return;
  }
  if (options.version) {
    const pkg = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'));
    console.log(`agent-assets ${pkg.version}`);
    return;
  }

  const root = resolve(options.root);
  let report;
  try {
    // Resolved against the working directory, not --root: the config describes the
    // contracts and usually lives with the tooling, while --root is the tree under
    // inspection. Tying them together makes checking another checkout impossible.
    const config = await loadConfig(resolve(options.config));
    report = await runAgentAssets({ root, config, log: options.json ? undefined : console.log });
  } catch (error) {
    console.error(`agent-assets failed: ${error.message}`);
    process.exitCode = 2;
    return;
  }

  if (options.json) console.log(JSON.stringify(report, null, 2));
  process.exitCode = report.ok ? 0 : 1;
}

try {
  await main();
} catch (error) {
  // Anything main() did not expect. Exit 2, so a crash never reads as "the repo failed a rule" (exit 1) in CI.
  console.error(`agent-assets crashed: ${error?.stack ?? error}`);
  process.exitCode = 2;
}
