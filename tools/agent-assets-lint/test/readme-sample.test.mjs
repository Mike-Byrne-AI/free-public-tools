import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const CLI = fileURLToPath(new URL('../bin/agent-assets.mjs', import.meta.url));
const SAMPLE = fileURLToPath(new URL('./fixtures/sample-project', import.meta.url));
const CONFIG = fileURLToPath(new URL('../examples/claude-code-starter.json', import.meta.url));

// The README's "A sample run" block is a real run of test/fixtures/sample-project with the starter rules.
// This keeps it that way: the block and a live run must match line for line, and the run must exit 1.
test("the README's sample run is a real run: same project, same rules, same output, exit 1", async () => {
  const readme = (await readFile(new URL('../README.md', import.meta.url), 'utf8')).replace(/\r\n/g, '\n');
  const section = readme.split(/^## A sample run$/m)[1]?.split(/^## /m)[0];
  assert.ok(section, 'README.md has a "## A sample run" section');
  const block = /```\n([\s\S]*?)```/.exec(section)?.[1];
  assert.ok(block, 'the section has a fenced block');
  const run = spawnSync(process.execPath, [CLI, '--config', CONFIG], { cwd: SAMPLE, encoding: 'utf8' });
  assert.equal(run.status, 1, `${run.stdout}${run.stderr}`);
  assert.equal(run.stdout.replace(/\r\n/g, '\n').trimEnd(), block.trimEnd());
});
