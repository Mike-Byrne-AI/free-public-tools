import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { cleanup, makeRepo } from './helpers.mjs';

const CLI = fileURLToPath(new URL('../bin/agent-assets.mjs', import.meta.url));

test('an empty --root or --config is a usage error, not the working directory', async () => {
  // An unset CI variable (--root "$REPO") arrives as "", which would quietly check the wrong folder.
  const cwd = await makeRepo({
    'agent-assets.config.json': '{ "checks": [{ "id": "a", "path": "AGENTS.md", "required": false }] }'
  });
  try {
    for (const flag of ['--root', '--config']) {
      const run = spawnSync(process.execPath, [CLI, flag, ''], { cwd, encoding: 'utf8' });
      assert.equal(run.status, 2, `${flag} "": ${run.stdout}${run.stderr}`);
      assert.match(run.stderr, new RegExp(`${flag} requires a value`));
    }
  } finally {
    await cleanup(cwd);
  }
});

const runCli = (cwd, ...args) => spawnSync(process.execPath, [CLI, ...args], { cwd, encoding: 'utf8' });

test('a match that starts with its own dir is a config error (exit 2)', async () => {
  const check = { id: 'skills', dir: '.claude/skills', match: '.claude/skills/*/SKILL.md' };
  const cwd = await makeRepo({ 'agent-assets.config.json': JSON.stringify({ checks: [check] }) });
  try {
    const run = runCli(cwd);
    assert.equal(run.status, 2, `${run.stdout}${run.stderr}`);
    assert.match(run.stderr, /starts with its "dir"; write it relative to "dir", as "\*\/SKILL\.md"/);
  } finally {
    await cleanup(cwd);
  }
});

test('a warning leaves the exit code at 0, in text and in --json', async () => {
  const check = { id: 'skills', dir: '.claude/skills', match: '*/SKILL.md', frontmatter: {} };
  const cwd = await makeRepo({
    'agent-assets.config.json': JSON.stringify({ checks: [check] }),
    '.claude/skills/deploy/SKILL.md': '---\nname: deploy\ndescription: Use when: the user asks.\n---\n'
  });
  try {
    const text = runCli(cwd);
    assert.equal(text.status, 0, `${text.stdout}${text.stderr}`);
    assert.match(text.stdout, /\n {6}warning: \.claude\/skills\/deploy\/SKILL\.md: frontmatter "description" contains ": "/);
    const json = runCli(cwd, '--json');
    assert.equal(json.status, 0, `${json.stdout}${json.stderr}`);
    const report = JSON.parse(json.stdout);
    assert.equal(report.ok, true);
    assert.deepEqual(report.checks[0].issues, []);
    assert.equal(report.checks[0].warnings.length, 1);
  } finally {
    await cleanup(cwd);
  }
});

test('when nothing is present the run passes, and only the text says that nothing was checked', async () => {
  const check = { id: 'claude-md', path: 'CLAUDE.md', required: false };
  const cwd = await makeRepo({ 'agent-assets.config.json': JSON.stringify({ checks: [check] }) });
  try {
    const text = runCli(cwd);
    assert.equal(text.status, 0, `${text.stdout}${text.stderr}`);
    assert.match(text.stdout, /Nothing was checked: every check was skipped\. Check --root and the paths in the config\./);
    const json = runCli(cwd, '--json');
    assert.equal(json.status, 0);
    assert.doesNotMatch(json.stdout, /Nothing was checked/);
    assert.deepEqual(Object.keys(JSON.parse(json.stdout)), ['schemaVersion', 'root', 'ok', 'footprint', 'checks']);
  } finally {
    await cleanup(cwd);
  }
});

test('an option may carry its value with "=", as most tools allow; a flag may not', async () => {
  const cwd = await makeRepo({
    'rules.json': '{ "checks": [{ "id": "a", "path": "AGENTS.md", "required": false }] }',
    'AGENTS.md': '# Mission\n'
  });
  try {
    const spaced = runCli(cwd, '--root', cwd, '--config', 'rules.json', '--json');
    const attached = runCli(cwd, `--root=${cwd}`, '--config=rules.json', '--json');
    assert.equal(attached.status, 0, `${attached.stdout}${attached.stderr}`);
    // The same report either way, apart from each run's own timings.
    const withoutTimings = (out) => JSON.parse(out, (key, value) => (key === 'durationMs' ? undefined : value));
    assert.deepEqual(withoutTimings(attached.stdout), withoutTimings(spaced.stdout));
    const empty = runCli(cwd, '--root=', '--config=rules.json');
    assert.equal(empty.status, 2, `${empty.stdout}${empty.stderr}`);
    assert.match(empty.stderr, /--root requires a value/);
    const flag = runCli(cwd, '--json=1', '--config=rules.json');
    assert.equal(flag.status, 2, `${flag.stdout}${flag.stderr}`);
    assert.match(flag.stderr, /--json takes no value/);
  } finally {
    await cleanup(cwd);
  }
});

test('--version prints the package version and exits 0', async () => {
  const { version } = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'));
  const run = runCli(process.cwd(), '--version');
  assert.equal(run.status, 0, `${run.stdout}${run.stderr}`);
  assert.equal(run.stdout.trim(), `agent-assets ${version}`);
});

test('the library door: package.json points at src/index.mjs, which exports the documented functions', async () => {
  const pkg = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'));
  assert.equal(pkg.exports['.'], './src/index.mjs');
  assert.equal(pkg.bin['agent-assets'], 'bin/agent-assets.mjs');
  const api = await import('../src/index.mjs');
  const functions = ['globToRegExp', 'lineCount', 'loadConfig', 'matchesGlob', 'parseFrontmatter', 'runAgentAssets', 'validateConfig'];
  assert.deepEqual(Object.keys(api).sort(), ['CONFIG_SCHEMA_VERSION', 'SCHEMA_VERSION', ...functions]);
  for (const name of functions) assert.equal(typeof api[name], 'function', name);
  assert.equal(api.SCHEMA_VERSION, 1);
  assert.equal(api.CONFIG_SCHEMA_VERSION, 1);
});

test('--help and -h print the usage and exit 0', () => {
  for (const flag of ['--help', '-h']) {
    const run = runCli(process.cwd(), flag);
    assert.equal(run.status, 0, `${flag}: ${run.stdout}${run.stderr}`);
    assert.match(run.stdout, /--config <path>/, flag);
    assert.match(run.stdout, /--version/, flag);
    assert.match(run.stdout, /Exit code is 1 when any check reports an issue/, flag);
  }
});
