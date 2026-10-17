/**
 * Every contract this package can express is shown here failing on the violation it
 * targets, and passing on the compliant case. A linter that cannot be shown to fail is
 * indistinguishable from one that checks nothing.
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import { runAgentAssets } from '../src/checker.mjs';
import { loadConfig } from '../src/config.mjs';
import { execFileSync } from 'node:child_process';
import { chmod, mkdir, readdir, readFile, symlink } from 'node:fs/promises';
import { userInfo } from 'node:os';
import { join } from 'node:path';
import { cleanup, issuesFor, makeRepo, skill } from './helpers.mjs';

const CANONICAL = { id: 'canonical', path: 'AGENTS.md' };

test('a missing required file is reported', async () => {
  const { issues, report } = await issuesFor({ 'README.md': 'x\n' }, CANONICAL);
  assert.equal(issues.length, 1);
  assert.match(issues[0], /AGENTS\.md: file is missing/);
  assert.equal(report.checks[0].skipped, false, 'a failed check must not be labelled SKIP');
});

test('an absent file declared required:false is skipped, not an error', async () => {
  const { issues, report } = await issuesFor({ 'README.md': 'x\n' }, { ...CANONICAL, required: false });
  assert.deepEqual(issues, []);
  assert.equal(report.ok, true);
  assert.equal(report.checks[0].skipped, true);
});

test('a config file saved with a byte-order mark still loads', async () => {
  // Windows PowerShell 5.1 writes UTF-8 with a BOM by default, and JSON.parse rejects it.
  const dir = await makeRepo({ 'agent-assets.config.json': '\uFEFF{ "checks": [{ "id": "a", "path": "AGENTS.md" }] }' });
  try {
    const config = await loadConfig(join(dir, 'agent-assets.config.json'));
    assert.equal(config.checks[0].id, 'a');
  } finally {
    await cleanup(dir);
  }
});

test('a root that is not a folder is an error, not a clean pass', async () => {
  const dir = await makeRepo({ 'README.md': 'x\n' });
  try {
    const config = { checks: [{ ...CANONICAL, required: false }] };
    await assert.rejects(runAgentAssets({ root: join(dir, 'no-such-folder'), config }), /Root is not a folder/);
    await assert.rejects(runAgentAssets({ root: join(dir, 'README.md'), config }), /Root is not a folder/);
  } finally {
    await cleanup(dir);
  }
});

test('a file over its context budget is reported with both numbers', async () => {
  const { issues } = await issuesFor({ 'AGENTS.md': 'line\n'.repeat(12) }, { ...CANONICAL, maxLines: 10 });
  assert.equal(issues.length, 1);
  assert.match(issues[0], /12 lines exceeds its 10-line context budget/);
});

test('a file exactly at its budget passes (the boundary is inclusive)', async () => {
  const { issues } = await issuesFor({ 'AGENTS.md': 'line\n'.repeat(10) }, { ...CANONICAL, maxLines: 10 });
  assert.deepEqual(issues, []);
});

test('a missing required heading is reported', async () => {
  const { issues } = await issuesFor(
    { 'AGENTS.md': '# Title\n\n## Mission\n' },
    { ...CANONICAL, requireHeadings: ['## Mission', '## Repository map'] }
  );
  assert.equal(issues.length, 1);
  assert.match(issues[0], /missing required heading "## Repository map"/);
});

test('a required heading must be a heading line of that level, outside code blocks and frontmatter', async () => {
  const rule = { ...CANONICAL, requireHeadings: ['## Mission'] };
  const issuesIn = async (text) => (await issuesFor({ 'AGENTS.md': text }, rule)).issues;
  assert.deepEqual(await issuesIn('# Title\n\n## Mission\n\nText.\n'), []);
  assert.deepEqual(await issuesIn('  ## Mission ##\n'), [], 'up to three leading spaces and closing hashes are still the heading');
  assert.deepEqual(await issuesIn('# Title\r\n\r\n## Mission\r\n'), [], 'CRLF');
  for (const [text, why] of [
    ['# Title\n\n### Mission\n', 'a deeper level'],
    ['# Title\n\n## Mission statement\n', 'a longer heading'],
    ['# Title\n\n```\n## Mission\n```\n', 'inside a code block'],
    ['# Title\n\n~~~md\n## Mission\n~~~\n', 'inside a tilde code block'],
    ['---\n## Mission\n---\n\n# Title\n', 'inside the frontmatter'],
    ['# Title\n\nSee ## Mission below.\n', 'in a sentence'],
    ['    ## Mission\n', 'indented four spaces, which is code']
  ]) {
    const issues = await issuesIn(text);
    assert.equal(issues.length, 1, why);
    assert.match(issues[0], /missing required heading "## Mission"/, why);
  }
  // When the text is there but not as a heading, the message says so, so a file that passed a substring check explains itself.
  assert.match((await issuesIn('```\n## Mission\n```\n'))[0], /the text appears, but not as a heading line of that level outside code blocks/);
  assert.doesNotMatch((await issuesIn('# Title\n'))[0], /the text appears/);
});

test('a wrapper that does not point at the canonical file is reported', async () => {
  const { issues } = await issuesFor(
    { 'CLAUDE.md': 'Do whatever you like.\n' },
    { id: 'wrapper', path: 'CLAUDE.md', mustReference: ['AGENTS.md'] }
  );
  assert.equal(issues.length, 1);
  assert.match(issues[0], /must reference "AGENTS\.md"/);
});

test('missing frontmatter is reported, and tolerated when declared optional', async () => {
  const check = { id: 'rules', dir: '.cursor/rules', match: '*.mdc', frontmatter: { fields: {} } };
  const files = { '.cursor/rules/core.mdc': 'No frontmatter here.\n' };
  const strict = await issuesFor(files, check);
  assert.match(strict.issues[0], /missing YAML frontmatter/);

  const lenient = await issuesFor(files, { ...check, frontmatter: { required: false, fields: {} } });
  assert.deepEqual(lenient.issues, []);
});

test('a missing required frontmatter field is reported', async () => {
  const { issues } = await issuesFor(
    { '.github/instructions/a.instructions.md': '---\ndescription: x\n---\n\nBody\n' },
    {
      id: 'instructions',
      dir: '.github/instructions',
      match: '*.instructions.md',
      frontmatter: { fields: { applyTo: { required: true } } }
    }
  );
  assert.equal(issues.length, 1);
  assert.match(issues[0], /missing required field "applyTo"/);
});

test('a frontmatter value failing its pattern is reported', async () => {
  const { issues } = await issuesFor(
    { '.claude/skills/my-skill/SKILL.md': skill('My_Skill', 'A description long enough to pass.') },
    {
      id: 'skills',
      dir: '.claude/skills',
      match: '*/SKILL.md',
      frontmatter: { fields: { name: { required: true, pattern: '^[a-z0-9]+(?:-[a-z0-9]+)*$' } } }
    }
  );
  assert.ok(issues.some((issue) => /does not match/.test(issue)));
});

test('frontmatter length bounds are reported on both sides', async () => {
  const check = (fields) => ({
    id: 'skills',
    dir: '.claude/skills',
    match: '*/SKILL.md',
    frontmatter: { fields }
  });
  const short = await issuesFor(
    { '.claude/skills/a/SKILL.md': skill('a', 'too short') },
    check({ description: { required: true, minLength: 20 } })
  );
  assert.match(short.issues[0], /below the 20 minimum/);

  const long = await issuesFor(
    { '.claude/skills/a/SKILL.md': skill('a', 'x'.repeat(50)) },
    check({ description: { required: true, maxLength: 20 } })
  );
  assert.match(long.issues[0], /above the 20 maximum/);
});

test('a frontmatter value outside oneOf is reported', async () => {
  const { issues } = await issuesFor(
    { '.cursor/rules/a.mdc': '---\nalwaysApply: maybe\n---\n\nBody\n' },
    {
      id: 'rules',
      dir: '.cursor/rules',
      match: '*.mdc',
      frontmatter: { fields: { alwaysApply: { required: true, oneOf: ['true', 'false'] } } }
    }
  );
  assert.equal(issues.length, 1);
  assert.match(issues[0], /must be one of true, false/);
});

test('a skill name that does not match its directory is reported', async () => {
  const { issues } = await issuesFor(
    { '.claude/skills/deploy-app/SKILL.md': skill('deploy-application', 'A description long enough to pass.') },
    {
      id: 'skills',
      dir: '.claude/skills',
      match: '*/SKILL.md',
      nameMatchesDirectory: 'name',
      frontmatter: { fields: { name: { required: true } } }
    }
  );
  assert.equal(issues.length, 1);
  assert.match(issues[0], /but its directory is "deploy-app"/);
});

test('two skills sharing a name are reported', async () => {
  const { issues } = await issuesFor(
    {
      '.claude/skills/one/SKILL.md': skill('dupe', 'A description long enough to pass.'),
      '.claude/skills/two/SKILL.md': skill('dupe', 'A description long enough to pass.')
    },
    {
      id: 'skills',
      dir: '.claude/skills',
      match: '*/SKILL.md',
      uniqueBy: 'name',
      frontmatter: { fields: { name: { required: true } } }
    }
  );
  assert.ok(issues.some((issue) => /duplicate "name" "dupe"/.test(issue)));
});

test('count floors and ceilings are reported', async () => {
  const files = {
    '.claude/skills/a/SKILL.md': skill('a', 'A description long enough to pass.'),
    '.claude/skills/b/SKILL.md': skill('b', 'A description long enough to pass.')
  };
  const base = { id: 'skills', dir: '.claude/skills', match: '*/SKILL.md' };
  const tooFew = await issuesFor(files, { ...base, minCount: 5 });
  assert.match(tooFew.issues[0], /found 2 file\(s\).*below the 5 minimum/);

  const tooMany = await issuesFor(files, { ...base, maxCount: 1 });
  assert.match(tooMany.issues[0], /found 2 file\(s\).*above the 1 maximum/);
});

test('a required directory that is missing is reported; an optional one is skipped', async () => {
  const base = { id: 'rules', dir: '.cursor/rules', match: '*.mdc' };
  const strict = await issuesFor({ 'README.md': 'x\n' }, { ...base, required: true });
  assert.match(strict.issues[0], /required directory is missing/);
  assert.equal(strict.report.checks[0].skipped, false, 'a failed check must not be labelled SKIP');

  const lenient = await issuesFor({ 'README.md': 'x\n' }, base);
  assert.deepEqual(lenient.issues, []);
  assert.equal(lenient.report.checks[0].skipped, true);
});

test('a list-valued frontmatter field counts as present, not missing', async () => {
  // The origin script's line-regex parser would report this as absent. Reporting a
  // populated field as missing is the worst failure mode for a linter, so it is pinned.
  const { issues } = await issuesFor(
    { '.claude/agents/a.md': '---\nname: a\ntools:\n  - Read\n  - Grep\n---\n\nBody\n' },
    {
      id: 'agents',
      dir: '.claude/agents',
      match: '*.md',
      frontmatter: { fields: { tools: { required: true } } }
    }
  );
  assert.deepEqual(issues, []);
});

test('the report totals the context footprint across every instruction file', async () => {
  const root = await makeRepo({
    'AGENTS.md': 'a\nb\nc\n',
    '.claude/skills/one/SKILL.md': skill('one', 'A description long enough to pass.')
  });
  try {
    const report = await runAgentAssets({
      root,
      config: {
        checks: [
          { id: 'canonical', path: 'AGENTS.md' },
          { id: 'skills', dir: '.claude/skills', match: '*/SKILL.md' }
        ]
      }
    });
    assert.equal(report.footprint.files, 2);
    assert.equal(report.footprint.lines, 3 + 6);
    assert.equal(report.ok, true);
  } finally {
    await cleanup(root);
  }
});

test('nested directories are walked, so a deep rule file is not silently skipped', async () => {
  const { issues, report } = await issuesFor(
    { '.github/instructions/nested/deep/a.instructions.md': '---\ndescription: x\n---\n\nBody\n' },
    {
      id: 'instructions',
      dir: '.github/instructions',
      match: '**/*.instructions.md',
      frontmatter: { fields: { applyTo: { required: true } } }
    }
  );
  assert.equal(report.checks[0].files, 1);
  assert.match(issues[0], /missing required field "applyTo"/);
});

const SKILLS = {
  id: 'skills',
  dir: '.claude/skills',
  match: '*/SKILL.md',
  frontmatter: { fields: { description: { required: true, minLength: 20 } } }
};

test('a required field that is present but empty is reported once, as empty', async () => {
  const { issues } = await issuesFor(
    { '.claude/skills/deploy/SKILL.md': '---\nname: deploy\ndescription:\n---\n\nBody\n' },
    SKILLS
  );
  assert.deepEqual(issues, ['.claude/skills/deploy/SKILL.md: frontmatter field "description" is empty.']);
});

test('a folder that cannot be read is reported, not silently skipped', async (t) => {
  const root = await makeRepo({ '.claude/skills/locked/SKILL.md': skill('locked', 'x') });
  const locked = join(root, '.claude', 'skills', 'locked');
  try {
    await chmod(locked, 0o000);
    if (await readdir(locked).then(() => true, () => false)) {
      t.skip('this environment cannot make an unreadable folder (Windows, or running as root)');
      return;
    }
    const report = await runAgentAssets({ root, config: { checks: [SKILLS] } });
    assert.equal(report.ok, false);
    assert.deepEqual(report.checks[0].issues, ['.claude/skills/locked: folder could not be read (EACCES).']);
  } finally {
    await chmod(locked, 0o755);
    await cleanup(root);
  }
});

test('a skill whose description is a ">-" block scalar passes a minLength rule', async () => {
  const { issues } = await issuesFor(
    {
      '.claude/skills/deploy/SKILL.md':
        '---\nname: deploy\ndescription: >-\n  Deploys the app to staging when asked to ship.\n---\n\nBody\n'
    },
    SKILLS
  );
  assert.deepEqual(issues, []);
});

test('a block-scalar description that is too short is still reported', async () => {
  const { issues } = await issuesFor(
    { '.claude/skills/deploy/SKILL.md': '---\nname: deploy\ndescription: |\n  Short.\n---\n\nBody\n' },
    SKILLS
  );
  assert.equal(issues.length, 1);
  // "Short." and the final line break a "|" block keeps, as a YAML reader reads it.
  assert.match(issues[0], /"description" is 7 characters, below the 20 minimum/);
});

test('node_modules and .git are ignored by default, at any depth', async () => {
  const bad = '---\nname: x\n---\n\nBody\n';
  const { issues, report } = await issuesFor(
    {
      '.claude/skills/ok/SKILL.md': skill('ok', 'A long enough description here.'),
      '.claude/skills/node_modules/SKILL.md': bad,
      '.claude/skills/node_modules/pkg/SKILL.md': bad,
      '.claude/skills/.git/SKILL.md': bad,
      '.claude/skills/ok/node_modules/deep/SKILL.md': bad
    },
    { ...SKILLS, match: '**/SKILL.md' }
  );
  assert.equal(report.checks[0].files, 1);
  assert.deepEqual(issues, []);
});

/** Create a directory link; junctions need no privileges on Windows. Returns false if links are unavailable. */
async function tryLink(target, linkPath) {
  try {
    await symlink(target, linkPath, 'junction');
    return true;
  } catch {
    return false;
  }
}

test('a symlinked skill directory is followed and checked', async (t) => {
  const root = await makeRepo({
    '.agents/skills/deploy/SKILL.md': '---\nname: deploy\ndescription: short\n---\n\nBody\n'
  });
  try {
    await mkdir(join(root, '.claude'), { recursive: true });
    if (!(await tryLink(join(root, '.agents', 'skills'), join(root, '.claude', 'skills')))) {
      t.skip('this environment cannot create directory links');
      return;
    }
    const report = await runAgentAssets({ root, config: { checks: [SKILLS] } });
    assert.equal(report.checks[0].files, 1);
    assert.match(report.checks[0].issues[0], /\.claude\/skills\/deploy\/SKILL\.md.*below the 20 minimum/);
  } finally {
    await cleanup(root);
  }
});

test('a symlink loop does not hang the walk', async (t) => {
  const root = await makeRepo({ '.claude/skills/a/SKILL.md': skill('a', 'A long enough description here.') });
  try {
    if (!(await tryLink(join(root, '.claude', 'skills'), join(root, '.claude', 'skills', 'a', 'loop')))) {
      t.skip('this environment cannot create directory links');
      return;
    }
    const report = await runAgentAssets({ root, config: { checks: [{ ...SKILLS, match: '**/SKILL.md' }] } });
    assert.equal(report.checks[0].files, 1);
  } finally {
    await cleanup(root);
  }
});

test('a description that wraps, or that YAML reads as no value, still gets its rules', async () => {
  const long = 'Deploys the application to staging. '.repeat(40); // 1,440 characters
  const { issues } = await issuesFor(
    {
      '.claude/skills/next-line/SKILL.md': `---\nname: next-line\ndescription:\n  ${long}\n---\n`,
      '.claude/skills/wrapped/SKILL.md': `---\nname: wrapped\ndescription: ${long.slice(0, 72)}\n  ${long.slice(72)}\n---\n`,
      '.claude/skills/todo/SKILL.md': '---\nname: todo\ndescription: # TODO: write when to use this skill\n---\n',
      '.claude/skills/wrong/SKILL.md': '---\nname:\n  Totally Wrong Name\ndescription: Deploys the app to staging.\n---\n'
    },
    {
      id: 'skills',
      dir: '.claude/skills',
      match: '*/SKILL.md',
      frontmatter: {
        fields: {
          name: { required: true, pattern: '^[a-z0-9]+(?:-[a-z0-9]+)*$' },
          description: { required: true, minLength: 20, maxLength: 1024 }
        }
      }
    }
  );
  assert.deepEqual(issues, [
    '.claude/skills/next-line/SKILL.md: frontmatter "description" is 1439 characters, above the 1024 maximum.',
    '.claude/skills/todo/SKILL.md: frontmatter field "description" is empty.',
    '.claude/skills/wrapped/SKILL.md: frontmatter "description" is 1439 characters, above the 1024 maximum.',
    '.claude/skills/wrong/SKILL.md: frontmatter "name" ("Totally Wrong Name") does not match ^[a-z0-9]+(?:-[a-z0-9]+)*$.'
  ]);
});

/** Deny reading `path` (icacls on Windows, chmod elsewhere). Returns an undo function, or null if it had no effect. */
async function denyRead(path) {
  if (process.platform === 'win32') {
    const user = userInfo().username;
    try {
      execFileSync('icacls', [path, '/deny', `${user}:(R)`], { stdio: 'ignore' });
    } catch {
      return null;
    }
    const undo = () => execFileSync('icacls', [path, '/remove:d', user], { stdio: 'ignore' });
    if (await readFile(path).then(() => true, () => false)) {
      undo();
      return null;
    }
    return undo;
  }
  await chmod(path, 0o000);
  const undo = () => chmod(path, 0o644);
  if (await readFile(path).then(() => true, () => false)) {
    await undo();
    return null; // running as root
  }
  return undo;
}

test('a file that is there but cannot be read is reported, not skipped as absent', async (t) => {
  const root = await makeRepo({ 'CLAUDE.md': 'line\n'.repeat(300) });
  const undo = await denyRead(join(root, 'CLAUDE.md'));
  try {
    if (!undo) {
      t.skip('this environment cannot make an unreadable file');
      return;
    }
    const check = { id: 'claude-md', path: 'CLAUDE.md', required: false };
    const report = await runAgentAssets({ root, config: { checks: [check] } });
    assert.equal(report.ok, false);
    assert.equal(report.checks[0].skipped, false);
    assert.match(report.checks[0].issues[0], /^CLAUDE\.md: file could not be read \((EPERM|EACCES)\)\.$/);
  } finally {
    if (undo) await undo();
    await cleanup(root);
  }
});

test('nameMatchesDirectory also compares a file directly inside "dir" with that folder', async () => {
  const { issues } = await issuesFor(
    { '.claude/skills/review/SKILL.md': skill('totally-different', 'A description long enough to pass.') },
    {
      id: 'review-skill',
      dir: '.claude/skills/review',
      match: 'SKILL.md',
      nameMatchesDirectory: 'name',
      frontmatter: { fields: { name: { required: true } } }
    }
  );
  assert.deepEqual(issues, [
    '.claude/skills/review/SKILL.md: frontmatter "name" is "totally-different" but its directory is "review".'
  ]);
});

test('the footprint counts a file reached through a linked folder once', async (t) => {
  const root = await makeRepo({ '.agents/skills/deploy/SKILL.md': skill('deploy', 'A description long enough to pass.') });
  try {
    await mkdir(join(root, '.claude'), { recursive: true });
    if (!(await tryLink(join(root, '.agents', 'skills'), join(root, '.claude', 'skills')))) {
      t.skip('this environment cannot create directory links');
      return;
    }
    const checks = [
      { id: 'canonical', dir: '.agents/skills', match: '*/SKILL.md' },
      { id: 'claude', dir: '.claude/skills', match: '*/SKILL.md' }
    ];
    const report = await runAgentAssets({ root, config: { checks } });
    assert.equal(report.checks[1].files, 1);
    assert.deepEqual(report.footprint, { files: 1, lines: 6 });
  } finally {
    await cleanup(root);
  }
});

test('the footprint counts each file once, even when two checks look at it', async () => {
  const { report } = await issuesFor({ 'CLAUDE.md': 'line\n'.repeat(10) }, { id: 'root', path: 'CLAUDE.md' });
  assert.deepEqual(report.footprint, { files: 1, lines: 10 });
  const root = await makeRepo({ 'CLAUDE.md': 'line\n'.repeat(10) });
  try {
    const checks = [{ id: 'root', path: 'CLAUDE.md' }, { id: 'all', dir: '.', match: '**/CLAUDE.md' }];
    const twice = await runAgentAssets({ root, config: { checks } });
    assert.equal(twice.checks[0].lines, 10);
    assert.equal(twice.checks[1].lines, 10);
    assert.deepEqual(twice.footprint, { files: 1, lines: 10 });
  } finally {
    await cleanup(root);
  }
});

/** Run checks against a throwaway repo, keeping the text lines a terminal would show. */
async function runLogged(files, checks) {
  const root = await makeRepo(files);
  const lines = [];
  try {
    const report = await runAgentAssets({ root, config: { checks }, log: (line) => lines.push(line) });
    return { report, lines };
  } finally {
    await cleanup(root);
  }
}

test('a family whose folder is there but matched nothing says so on its OK line', async () => {
  // A wrong "match" finds 0 files and passes, so the line must not look like a normal pass.
  const { report, lines } = await runLogged({ '.claude/skills/deploy/README.md': 'Not a skill.\n', 'AGENTS.md': 'a\n' }, [
    SKILLS,
    CANONICAL
  ]);
  assert.deepEqual(lines.slice(0, 2), [
    `OK    ${'skills'.padEnd(26)} 0 file(s) - nothing in .claude/skills matched */SKILL.md`,
    `OK    ${'canonical'.padEnd(26)} 1 file(s), 1 lines`
  ]);
  // Text only: the check still passes and its report entry is the usual one.
  assert.equal(report.ok, true);
  assert.equal(report.checks[0].files, 0);
  assert.equal(report.checks[0].skipped, false);
});

test('a run where every check was skipped says that nothing was checked', async () => {
  const optional = [
    { id: 'claude-md', path: 'CLAUDE.md', required: false },
    { id: 'skills', dir: '.claude/skills', match: '*/SKILL.md' }
  ];
  const none = await runLogged({ 'README.md': 'x\n' }, optional);
  assert.equal(none.report.ok, true);
  assert.deepEqual(none.lines.slice(-2), [
    '\nAgent assets: valid across 0 instruction file(s) totalling 0 lines.',
    'Nothing was checked: every check was skipped. Check --root and the paths in the config.'
  ]);
  // One check that ran is enough to drop the note.
  const some = await runLogged({ 'CLAUDE.md': 'x\n' }, optional);
  assert.ok(!some.lines.some((line) => line.startsWith('Nothing was checked')), some.lines.join('\n'));
  // A config with no checks also checks nothing, and is not "every check was skipped".
  const empty = await runLogged({ 'README.md': 'x\n' }, []);
  assert.equal(empty.lines.at(-1), 'Nothing was checked: the config has no checks.');
});

test('every check result has the same fields in the report, warnings included', async () => {
  const { report } = await runLogged({ 'AGENTS.md': 'a\n', '.claude/skills/a/SKILL.md': skill('a', 'A long enough description.') }, [
    CANONICAL,
    SKILLS,
    { id: 'rules', dir: '.cursor/rules', match: '*.mdc' }
  ]);
  for (const result of report.checks) {
    assert.deepEqual(
      Object.keys(result),
      ['id', 'description', 'issues', 'warnings', 'files', 'lines', 'skipped', 'durationMs'],
      result.id
    );
    assert.deepEqual(result.warnings, [], result.id);
  }
  assert.deepEqual(Object.keys(report), ['schemaVersion', 'root', 'ok', 'footprint', 'checks']);
});

test('a frontmatter value a strict YAML reader rejects is a warning: shown, counted, and the check still passes', async () => {
  const files = {
    '.claude/skills/deploy/SKILL.md': skill('deploy', 'Use when: the user asks to ship the app.'),
    '.claude/skills/review/SKILL.md': skill('review', '"Use when: the user asks for a review."')
  };
  const message =
    '.claude/skills/deploy/SKILL.md: frontmatter "description" contains ": ", ' +
    'so a strict YAML reader rejects the line. Put the value in quotes.';
  const { report, lines } = await runLogged(files, [SKILLS]);
  assert.equal(report.ok, true);
  assert.deepEqual(report.checks[0].issues, []);
  assert.deepEqual(report.checks[0].warnings, [message]);
  assert.deepEqual(lines, [
    `OK    ${'skills'.padEnd(26)} 2 file(s), 12 lines`,
    `      warning: ${message}`,
    '\nAgent assets: valid with 1 warning(s) across 2 instruction file(s) totalling 12 lines.'
  ]);

  // Issues come first under the check, then warnings; the closing line counts both.
  const both = await runLogged({ ...files, '.claude/skills/short/SKILL.md': skill('short', 'Short: yes') }, [SKILLS]);
  assert.equal(both.report.ok, false);
  assert.deepEqual(both.lines.slice(1, 4), [
    '      - .claude/skills/short/SKILL.md: frontmatter "description" is 10 characters, below the 20 minimum.',
    `      warning: ${message}`,
    `      warning: ${message.replaceAll('deploy', 'short')}`
  ]);
  assert.equal(
    both.lines.at(-1),
    '\nAgent assets: 1 issue(s) and 2 warning(s) across 3 instruction file(s) totalling 18 lines.'
  );

  // A check with no "frontmatter" section does not read frontmatter, so it has nothing to warn about.
  const unread = await runLogged(files, [{ id: 'skills', dir: '.claude/skills', match: '*/SKILL.md' }]);
  assert.deepEqual(unread.report.checks[0].warnings, []);
});

test('a dangling link inside a family folder is reported as a missing file, not skipped', async (t) => {
  const root = await makeRepo({ '.claude/skills/real/SKILL.md': skill('real', 'A long enough description here.') });
  try {
    await mkdir(join(root, '.claude', 'skills', 'ghost'), { recursive: true });
    if (!(await tryLink(join(root, 'nowhere'), join(root, '.claude', 'skills', 'ghost', 'SKILL.md')))) {
      t.skip('this environment cannot create links');
      return;
    }
    const report = await runAgentAssets({ root, config: { checks: [{ id: 'skills', dir: '.claude/skills', match: '*/SKILL.md', frontmatter: {} }] } });
    assert.deepEqual(report.checks[0].issues, ['.claude/skills/ghost/SKILL.md: file is missing.']);
    assert.equal(report.checks[0].files, 1, 'the ghost is an issue, not a file that was read');
  } finally {
    await cleanup(root);
  }
});

test('a ".git" file, as a git worktree keeps, is left alone like the ".git" folder', async () => {
  const { issues, report } = await issuesFor(
    { '.git': 'gitdir: ../main/.git/worktrees/x\n', 'AGENTS.md': '# Mission\n' },
    { id: 'all', dir: '.', requireHeadings: ['# Mission'] }
  );
  assert.deepEqual(issues, []);
  assert.equal(report.checks[0].files, 1);
});

test('a link to the project root is skipped, not walked in under the link', async (t) => {
  const root = await makeRepo({ '.claude/skills/a/SKILL.md': skill('a', 'A long enough description here.'), 'README.md': '# top\n' });
  try {
    if (!(await tryLink(root, join(root, '.claude', 'skills', 'up')))) {
      t.skip('this environment cannot create directory links');
      return;
    }
    const report = await runAgentAssets({ root, config: { checks: [{ id: 'reach', dir: '.claude/skills', match: '**/*.md' }] } });
    // Before the fix, README.md came back as ".claude/skills/up/README.md".
    assert.equal(report.checks[0].files, 1);
  } finally {
    await cleanup(root);
  }
});

test('"key:value" with no space after the colon is a missing field, with a warning that says why', async () => {
  const { issues, report } = await issuesFor(
    { '.claude/skills/deploy/SKILL.md': '---\nname:deploy\ndescription: Deploys the application to staging.\n---\n' },
    { ...SKILLS, frontmatter: { fields: { name: { required: true }, description: { required: true, minLength: 20 } } } }
  );
  assert.deepEqual(issues, ['.claude/skills/deploy/SKILL.md: frontmatter is missing required field "name".']);
  assert.deepEqual(report.checks[0].warnings, [
    '.claude/skills/deploy/SKILL.md: frontmatter line "name:deploy" has no space after its colon, so it is not a field. Put a space after the colon.'
  ]);
});

test('text after a closing quote is a warning with its own advice', async () => {
  const { issues, report } = await issuesFor(
    { '.claude/skills/deploy/SKILL.md': '---\nname: "deploy" junk here\ndescription: Deploys the application to staging.\n---\n' },
    { ...SKILLS, frontmatter: { fields: { name: { required: true }, description: { required: true, minLength: 20 } } } }
  );
  assert.deepEqual(issues, []);
  assert.deepEqual(report.checks[0].warnings, [
    '.claude/skills/deploy/SKILL.md: frontmatter "name" has "junk here" after its closing quote, so a strict YAML reader rejects the line. Keep everything inside the quotes.'
  ]);
});

test('a check id longer than the column keeps the summaries aligned', async () => {
  const root = await makeRepo({ 'AGENTS.md': '# Mission\n' });
  try {
    const lines = [];
    await runAgentAssets({
      root,
      config: { checks: [{ id: 'a', path: 'AGENTS.md' }, { id: 'copilot-scoped-instructions', path: 'AGENTS.md' }] },
      log: (line) => lines.push(line)
    });
    assert.equal(lines[0].indexOf('1 file(s)'), lines[1].indexOf('1 file(s)'));
  } finally {
    await cleanup(root);
  }
});
