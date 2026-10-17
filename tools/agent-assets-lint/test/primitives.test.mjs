import assert from 'node:assert/strict';
import test from 'node:test';
import { lineCount, parseFrontmatter } from '../src/frontmatter.mjs';
import { matchesGlob } from '../src/glob.mjs';
import { fileURLToPath } from 'node:url';
import { loadConfig, validateConfig } from '../src/config.mjs';
import { join } from 'node:path';
import { cleanup, makeRepo } from './helpers.mjs';

test('lineCount treats a trailing newline as terminating the last line', () => {
  // The origin script counted a one-line file as two. That off-by-one silently
  // consumed one line of every budget it enforced.
  assert.equal(lineCount(''), 0);
  assert.equal(lineCount('a'), 1);
  assert.equal(lineCount('a\n'), 1);
  assert.equal(lineCount('a\nb\n'), 2);
  assert.equal(lineCount('a\r\nb\r\n'), 2);
  assert.equal(lineCount('a\n\n'), 2);
});

test('frontmatter is read from CRLF files and with a byte-order mark', () => {
  for (const source of [
    '---\nname: a\n---\n\nBody\n',
    '---\r\nname: a\r\n---\r\n\r\nBody\r\n',
    '\uFEFF---\nname: a\n---\n'
  ]) {
    const parsed = parseFrontmatter(source);
    assert.equal(parsed.present, true);
    assert.equal(parsed.fields.get('name').value, 'a');
  }
});

test('frontmatter absent, unterminated, or not at the top is reported as absent', () => {
  assert.equal(parseFrontmatter('# Title\n').present, false);
  assert.equal(parseFrontmatter('---\nname: a\n').present, false);
  assert.equal(parseFrontmatter('Intro\n---\nname: a\n---\n').present, false);
});

test('quoted scalars are unwrapped and comments ignored', () => {
  const parsed = parseFrontmatter('---\n# a comment\nname: "quoted"\nother: \'single\'\n---\n');
  assert.equal(parsed.fields.get('name').value, 'quoted');
  assert.equal(parsed.fields.get('other').value, 'single');
});

test('block and list values are present with their items joined', () => {
  const parsed = parseFrontmatter('---\ntools:\n  - Read\n  - Grep\nname: a\n---\n');
  const tools = parsed.fields.get('tools');
  assert.equal(tools.block, true);
  assert.equal(tools.value, 'Read, Grep');
  // Parsing the block must not swallow the key that follows it.
  assert.equal(parsed.fields.get('name').value, 'a');
});

test('an indented key is not mistaken for a top-level field', () => {
  const parsed = parseFrontmatter('---\nmetadata:\n  name: nested\n---\n');
  assert.equal(parsed.fields.has('name'), false);
  assert.equal(parsed.fields.get('metadata').value, 'name: nested');
});

test('a value containing a colon keeps everything after the first one', () => {
  const parsed = parseFrontmatter('---\ndescription: Use when: you need X\n---\n');
  assert.equal(parsed.fields.get('description').value, 'Use when: you need X');
});

test('inline values are read the way a YAML reader reads them', () => {
  // Expected values come from PyYAML. An agent reading "Fixes bug #42" sees only "Fixes bug",
  // so the linter must measure that, not the whole line.
  const { fields } = parseFrontmatter(
    [
      '---',
      'name: deploy # main skill',
      'description: Fixes bug #42 in the parser',
      "summary: 'it''s fine' # quoted, then a comment",
      'title: "Deploy" # quoted, then a comment',
      'language : C# and F#',
      'note: "keeps # inside quotes"',
      '---'
    ].join('\n')
  );
  assert.equal(fields.get('name').value, 'deploy');
  assert.equal(fields.get('description').value, 'Fixes bug');
  assert.equal(fields.get('summary').value, "it's fine");
  assert.equal(fields.get('title').value, 'Deploy');
  assert.equal(fields.get('language')?.value, 'C# and F#');
  assert.equal(fields.get('note').value, 'keeps # inside quotes');
});

test('a folded block keeps a blank line as a break, and a list may contain blank lines', () => {
  const { fields } = parseFrontmatter(
    ['---', 'description: >', '  First paragraph.', '', '  Second paragraph.', 'tools:', '  - Read', '', '  - Grep', '---'].join(
      '\n'
    )
  );
  assert.equal(fields.get('description').value, 'First paragraph.\nSecond paragraph.\n');
  assert.equal(fields.get('tools').value, 'Read, Grep');
});

test('glob matches one segment with * and any depth with **', () => {
  assert.ok(matchesGlob('core.mdc', '*.mdc'));
  assert.ok(!matchesGlob('nested/core.mdc', '*.mdc'));
  assert.ok(matchesGlob('deploy/SKILL.md', '*/SKILL.md'));
  assert.ok(!matchesGlob('SKILL.md', '*/SKILL.md'));
  assert.ok(matchesGlob('a/b/c.instructions.md', '**/*.instructions.md'));
  assert.ok(matchesGlob('c.instructions.md', '**/*.instructions.md'), '** must also match zero segments');
});

test('glob metacharacters in a pattern are literal, not regex', () => {
  assert.ok(matchesGlob('a.md', 'a.md'));
  assert.ok(!matchesGlob('axmd', 'a.md'), 'the dot must not match any character');
  assert.ok(matchesGlob('a+b.md', 'a+b.md'));
});

const baseConfig = () => ({ checks: [{ id: 'c', path: 'AGENTS.md' }] });

test('a valid config passes', () => {
  assert.doesNotThrow(() => validateConfig(baseConfig()));
});

test('an unknown field fails (the shape is closed)', () => {
  assert.throws(() => validateConfig({ checks: [{ id: 'c', path: 'A.md', maxLine: 5 }] }), /unknown field "maxLine"/);
  assert.throws(() => validateConfig({ schemaVerison: 2, checks: [] }), /unknown top-level field "schemaVerison"/);
});

test('an unknown frontmatter rule fails', () => {
  assert.throws(
    () => validateConfig({ checks: [{ id: 'c', path: 'A.md', frontmatter: { fields: { n: { minLen: 2 } } } }] }),
    /unknown rule "minLen"/
  );
});

test('a check must declare exactly one of path or dir', () => {
  assert.throws(() => validateConfig({ checks: [{ id: 'c' }] }), /exactly one of "path"/);
  assert.throws(() => validateConfig({ checks: [{ id: 'c', path: 'a', dir: 'b' }] }), /exactly one of "path"/);
});

test('family-only options on a single-file check fail loudly', () => {
  assert.throws(
    () => validateConfig({ checks: [{ id: 'c', path: 'A.md', uniqueBy: 'name' }] }),
    /applies to a "dir" family/
  );
});

test('duplicate check ids fail', () => {
  assert.throws(
    () =>
      validateConfig({
        checks: [
          { id: 'c', path: 'a' },
          { id: 'c', path: 'b' }
        ]
      }),
    /duplicate check id/
  );
});

test('an invalid regular expression fails at load, not at match time', () => {
  assert.throws(
    () => validateConfig({ checks: [{ id: 'c', path: 'A.md', frontmatter: { fields: { n: { pattern: '[' } } } }] }),
    /not a valid regular expression/
  );
});

test('paths must be repo-relative and forward-slash', () => {
  for (const path of ['../outside.md', '/etc/passwd', 'C:/x.md', 'a\\b.md']) {
    assert.throws(() => validateConfig({ checks: [{ id: 'c', path }] }), /repo-relative|backslash|may not contain/);
  }
});

test('contradictory bounds fail', () => {
  assert.throws(
    () => validateConfig({ checks: [{ id: 'c', dir: 'd', minCount: 5, maxCount: 2 }] }),
    /"minCount" exceeds "maxCount"/
  );
  assert.throws(
    () =>
      validateConfig({
        checks: [{ id: 'c', path: 'a', frontmatter: { fields: { n: { minLength: 9, maxLength: 2 } } } }]
      }),
    /"minLength" exceeds "maxLength"/
  );
});

test('an unsupported schemaVersion fails', () => {
  assert.throws(() => validateConfig({ schemaVersion: 99, checks: [] }), /Unsupported schemaVersion/);
  // Written as text, it must not read as "Unsupported schemaVersion 1 (expected 1)".
  assert.throws(() => validateConfig({ schemaVersion: '1', checks: [] }), /Unsupported schemaVersion "1" \(expected 1\)/);
});

test('a folded block scalar (>-) is read as one line of joined text, not as the literal ">-"', () => {
  const parsed = parseFrontmatter(
    '---\nname: a\ndescription: >-\n  First line of the text\n  and the second line.\nlicense: MIT\n---\n'
  );
  const description = parsed.fields.get('description');
  assert.equal(description.value, 'First line of the text and the second line.');
  assert.equal(description.block, false);
  // The key after the block is not swallowed.
  assert.equal(parsed.fields.get('license').value, 'MIT');
  // Plain ">" joins the same way and keeps the final line break, as YAML does ("-" drops it).
  const plain = parseFrontmatter('---\ndescription: >\n  one\n  two\n---\n');
  assert.equal(plain.fields.get('description').value, 'one two\n');
});

test('a literal block scalar (|) keeps its newlines, the final one included', () => {
  const parsed = parseFrontmatter('---\ndescription: |\n  line one\n    indented\n  line three\nname: a\n---\n');
  assert.equal(parsed.fields.get('description').value, 'line one\n  indented\nline three\n');
  assert.equal(parsed.fields.get('name').value, 'a');
});

test('block scalars keep, drop or multiply the final line break as YAML chomps (plain, "-", "+")', () => {
  const read = (header, tail = '') => parseFrontmatter(`---\ndescription: ${header}\n  a\n\n${tail}name: x\n---\n`).fields.get('description').value;
  assert.equal(read('|'), 'a\n');
  assert.equal(read('|-'), 'a');
  assert.equal(read('|+'), 'a\n\n');
  assert.equal(read('>'), 'a\n');
  assert.equal(read('>+', '\n'), 'a\n\n\n');
  // "|+" over blank lines only is those line breaks; "|" over nothing is nothing.
  assert.equal(parseFrontmatter('---\ndescription: |+\n\nname: x\n---\n').fields.get('description').value, '\n');
  assert.equal(parseFrontmatter('---\ndescription: |\nname: x\n---\n').fields.get('description').value, '');
});

test('a block indent indicator ("|2") sets the indent, and a more-indented line in a ">" block keeps its break and indent', () => {
  const value = (text) => parseFrontmatter(`---\ndescription: ${text}\n---\n`).fields.get('description').value;
  assert.equal(value('|2\n  a\n   b'), 'a\n b\n');
  assert.equal(value('>1\n  a\n b'), ' a\nb\n');
  assert.equal(value('>\n  a\n    b\n  c'), 'a\n  b\nc\n');
  assert.equal(value('>\n  a\n\n    b\n  c'), 'a\n\n  b\nc\n');
  assert.equal(value('|\n  a  \n  b'), 'a  \nb\n', 'a literal block keeps trailing spaces');
  // A line indented less than the block ends it. That line then belongs to no field, and a note says so.
  const parsed = parseFrontmatter('---\ndescription: |\n    a\n  b\n---\n');
  assert.equal(parsed.fields.get('description').value, 'a\n');
  assert.match(parsed.notes[0], /line "b" is indented but belongs to no field/);
});

test('double-quoted escapes are decoded, as YAML and Claude Code read them; an unknown one is kept and reported', () => {
  const parsed = parseFrontmatter(
    ['---', 'a: "caf\\u00e9 \\U0001F600"', 'b: "tab\\tnew\\nquote\\" back\\\\ slash\\/ sp\\ ace"', "c: \"it\\'s\"", 'd: "\\x4"', "e: 'no \\n escapes'", '---'].join('\n')
  );
  assert.equal(parsed.fields.get('a').value, 'café 😀');
  assert.equal(parsed.fields.get('b').value, 'tab\tnew\nquote" back\\ slash/ sp ace');
  assert.equal(parsed.fields.get('c').value, "it\\'s");
  assert.match(parsed.fields.get('c').yamlProblem, /has the escape "\\'", which YAML does not define, so a strict YAML reader rejects the line/);
  assert.equal(parsed.fields.get('c').advice, 'Double the backslash to keep it as text, or remove it.');
  assert.match(parsed.fields.get('d').yamlProblem, /has the escape "\\x"/);
  assert.equal(parsed.fields.get('e').value, 'no \\n escapes', 'single quotes have no escapes');
});

test('inside double quotes a "\\" at the end of a line joins it to the next, as YAML folds it', () => {
  assert.equal(parseFrontmatter('---\nd: "a\\\n  b"\n---\n').fields.get('d').value, 'ab');
  assert.equal(parseFrontmatter('---\nd: "a \\\n  b"\n---\n').fields.get('d').value, 'a b');
  assert.equal(parseFrontmatter('---\nd: "a\\ b"\n---\n').fields.get('d').value, 'a b');
});

test('a one-line list or map is read as its items, like a "- " list', () => {
  const { fields } = parseFrontmatter(
    ['---', 'tools: [Read, Grep]', "quoted: [\"a, b\", 'it''s', c]", 'nested: [[a, b], c]', 'meta: {a: 1}', 'empty: []', 'notlist: [a] b', '---'].join('\n')
  );
  assert.deepEqual([fields.get('tools').value, fields.get('tools').block], ['Read, Grep', true]);
  assert.equal(fields.get('quoted').value, "a, b, it's, c");
  assert.equal(fields.get('nested').value, '[a, b], c');
  assert.deepEqual([fields.get('meta').value, fields.get('meta').block], ['a: 1', true]);
  assert.deepEqual([fields.get('empty').value, fields.get('empty').block], ['', true]);
  assert.match(fields.get('notlist').yamlProblem, /starts with "\["/);
});

test('a tab outside quotes gets a warning (YAML forbids it there); inside quotes or a comment it is fine', () => {
  const read = (body) => parseFrontmatter(`---\n${body}\n---\n`);
  for (const body of ['name:\tdeploy', 'name\t: x', 'name: a\tb', 'name: deploy\t# note', 'name: [a,\tb]']) {
    assert.match(read(body).fields.get('name').yamlProblem ?? '', /has a tab outside quotes, so a strict YAML reader rejects the line/, body);
  }
  for (const body of ['name: first\n\tsecond', 'name:\n\ttext', 'name: |\n\ta', 'name:\n\t- a', 'name:\n\ta: 1']) {
    assert.match(read(body).fields.get('name').yamlProblem ?? '', /continues on a line (indented )?with a tab/, body);
  }
  for (const body of ['name: "a\tb"', 'name: a # x\ty', 'name: "a\n\tb"', "name: 'a\n\tb'"]) {
    assert.equal(read(body).fields.get('name').yamlProblem, undefined, body);
  }
  assert.equal(read('name:\tdeploy').fields.get('name').advice, 'Use spaces.');
  assert.equal(read('name:\tdeploy').fields.get('name').value, 'deploy');
});

test('a key may be any plain YAML scalar, not only a word: a digit first, dots, spaces, "-x", non-ASCII; a quoted key decodes', () => {
  const { fields, notes } = parseFrontmatter(
    ['---', '1key: a', 'key.sub: b', 'my key: c', '-x: d', '_k: e', 'näme: f', '"na\\"me": g', "'q''k': h", 'name : i', '---'].join('\n')
  );
  assert.deepEqual([...fields.keys()], ['1key', 'key.sub', 'my key', '-x', '_k', 'näme', 'na"me', "q'k", 'name']);
  assert.deepEqual([...fields.values()].map((field) => field.value), ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i']);
  assert.deepEqual(notes, []);
});

test('a line that is not a field gets a note: indented under a finished value, or loose text', () => {
  const notesOf = (body) => parseFrontmatter(`---\n${body}\n---\n`).notes;
  assert.match(
    notesOf('name: "a"\n  b')[0],
    /line "b" is indented but belongs to no field, so a strict YAML reader rejects the line\. Remove the indent, or join it to the line above\./
  );
  assert.match(notesOf('name: a # c\n  b')[0], /is indented but belongs to no field/);
  assert.match(notesOf('description: first\n  # c\n  second')[0], /line "second" is indented/);
  assert.match(notesOf('name: a\nfoo')[0], /line "foo" is not a "key: value" field, so a strict YAML reader rejects the line\./);
  assert.match(notesOf('- a\n- b')[0], /is not a "key: value" field/);
  assert.deepEqual(notesOf('name: a\n\n# c\ndescription: b'), []);
});

test('loadConfig says plainly when the file is missing or is not JSON, and accepts a byte-order mark', async () => {
  // PowerShell 5.1 saves UTF-8 with a byte-order mark; JSON.parse alone would reject that file.
  const cwd = await makeRepo({ 'bad.json': '{ "checks": [', 'bom.json': `${String.fromCharCode(0xfeff)}{ "checks": [] }` });
  try {
    await assert.rejects(loadConfig(join(cwd, 'nope.json')), /Config file not found: .*nope\.json/);
    await assert.rejects(loadConfig(join(cwd, 'bad.json')), /Config file is not valid JSON \(.*bad\.json\)/);
    assert.deepEqual(await loadConfig(join(cwd, 'bom.json')), { checks: [] });
  } finally {
    await cleanup(cwd);
  }
});

test('an empty block scalar yields an empty value', () => {
  const parsed = parseFrontmatter('---\ndescription: >-\nname: a\n---\n');
  assert.equal(parsed.fields.get('description').value, '');
  assert.equal(parsed.fields.get('name').value, 'a');
});

test('"?" in a glob is a literal character, not a regex quantifier', () => {
  assert.ok(matchesGlob('what?.md', 'what?.md'));
  assert.ok(!matchesGlob('wha.md', 'what?.md'), '"t?" must not mean "optional t"');
  assert.ok(!matchesGlob('whatx.md', 'what?.md'), '"?" must not match any single character');
});

test('both example configs load and pass validation', async () => {
  // The README tells people to copy these; a typo in one would otherwise ship unnoticed.
  for (const name of ['claude-code-starter.json', 'agent-assets.config.json']) {
    const config = await loadConfig(fileURLToPath(new URL(`../examples/${name}`, import.meta.url)));
    assert.ok(config.checks.length > 0, name);
  }
});

test('a value YAML reads as no value (a comment, ~, null) is empty, not text', () => {
  // Expected values come from PyYAML, which reads every one of these as None.
  const { fields } = parseFrontmatter(
    [
      '---',
      'description: # TODO: write when to use this skill',
      'a: ~',
      'b: null',
      'c: Null',
      'd: NULL # placeholder',
      'review:',
      '  # TODO: say what this reviews',
      'tools:',
      '  # - WebSearch',
      '  # - Read',
      'quoted: "null"',
      'path: ~/bin',
      '---'
    ].join('\n')
  );
  for (const key of ['description', 'a', 'b', 'c', 'd', 'review', 'tools']) {
    assert.equal(fields.get(key).value, '', key);
    assert.equal(fields.get(key).block, false, key);
  }
  assert.equal(fields.get('quoted').value, 'null', 'a quoted "null" is text');
  assert.equal(fields.get('path').value, '~/bin');
});

test('a value that wraps onto more indented lines is read whole, the way YAML joins it', () => {
  // Expected values come from PyYAML: the lines join with spaces, and a blank line is a line break.
  const { fields } = parseFrontmatter(
    [
      '---',
      'plain: Deploys the app',
      '  to staging.',
      'double: "Deploys the app',
      '  to staging."',
      "single: 'it''s",
      "  fine'",
      'nextLine:',
      '  Deploys the app',
      '',
      '  to staging.',
      'name:',
      '  Totally Wrong Name',
      'afterComment:',
      '  # a note',
      '  real text',
      'stopsAtComment: real text',
      '  # a note',
      'tools:',
      '  - Read',
      '  # - Grep',
      'metadata:',
      '  owner: me',
      'last: x',
      '---'
    ].join('\n')
  );
  const read = (key) => [fields.get(key).value, fields.get(key).block];
  assert.deepEqual(read('plain'), ['Deploys the app to staging.', false]);
  assert.deepEqual(read('double'), ['Deploys the app to staging.', false]);
  assert.deepEqual(read('single'), ["it's fine", false]);
  assert.deepEqual(read('nextLine'), ['Deploys the app\nto staging.', false]);
  assert.deepEqual(read('name'), ['Totally Wrong Name', false]);
  assert.deepEqual(read('afterComment'), ['real text', false]);
  assert.deepEqual(read('stopsAtComment'), ['real text', false]);
  // A "- " list and a nested map are still present, and still not length-checked.
  assert.deepEqual(read('tools'), ['Read', true]);
  assert.deepEqual(read('metadata'), ['owner: me', true]);
  assert.equal(fields.get('last').value, 'x');
});

test('a double-quoted value ends at its closing quote, not at a quote in a comment after it', () => {
  // Expected values come from PyYAML.
  const { fields } = parseFrontmatter(
    [
      '---',
      'description: "Ships it" # see "release notes" in AGENTS.md',
      'escaped: "a \\" b"',
      'backslash: "a\\\\" # "x"',
      '---'
    ].join('\n')
  );
  assert.equal(fields.get('description').value, 'Ships it');
  assert.equal(fields.get('escaped').value, 'a " b');
  assert.equal(fields.get('backslash').value, 'a\\');
});

test('a quoted key is read as that key', () => {
  const { fields } = parseFrontmatter('---\n"name": deploy\n\'description\': Deploys the app.\n---\n');
  assert.equal(fields.get('name')?.value, 'deploy');
  assert.equal(fields.get('description')?.value, 'Deploys the app.');
});

test('a file with old-Mac (CR-only) line endings is counted and read line by line', () => {
  assert.equal(lineCount('a\rb\rc\r'), 3);
  const parsed = parseFrontmatter('---\rname: a\r---\rBody\r');
  assert.equal(parsed.present, true);
  assert.equal(parsed.fields.get('name').value, 'a');
});

test('a match glob that could never match a file fails at load, instead of matching nothing', () => {
  // Matched paths are relative to "dir" and use "/", so none of these can ever match.
  for (const match of ['*\\SKILL.md', './*/SKILL.md', '/*/SKILL.md', '*/SKILL.md/', '../skills/*/SKILL.md']) {
    assert.throws(() => validateConfig({ checks: [{ id: 'c', dir: '.claude/skills', match }] }), /"match"/, match);
  }
  for (const match of ['*/SKILL.md', '**/*.md', '*/**/AGENTS.md', '*.instructions.md']) {
    assert.doesNotThrow(() => validateConfig({ checks: [{ id: 'c', dir: '.', match }] }), match);
  }
});

test('name and uniqueness rules need a frontmatter section, or they would silently do nothing', () => {
  for (const key of ['nameMatchesDirectory', 'uniqueBy']) {
    const check = { id: 's', dir: '.claude/skills', match: '*/SKILL.md', [key]: 'name' };
    assert.throws(() => validateConfig({ checks: [check] }), /needs a "frontmatter" section/, key);
    assert.doesNotThrow(() => validateConfig({ checks: [{ ...check, frontmatter: {} }] }), key);
  }
});

test('a match that starts with its own dir fails at load, and says to write it relative to dir', () => {
  // Matched paths are relative to "dir", so this one looks for .claude/skills/.claude/skills/*/SKILL.md,
  // finds nothing, and passes on 0 files.
  for (const dir of ['.claude/skills', './.claude/skills']) {
    assert.throws(
      () => validateConfig({ checks: [{ id: 'skills', dir, match: '.claude/skills/*/SKILL.md' }] }),
      {
        message:
          'skills: "match" ".claude/skills/*/SKILL.md" starts with its "dir"; write it relative to "dir", as "*/SKILL.md".'
      },
      dir
    );
  }
  // Only the whole folder counts, and dir "." has no folder to repeat.
  for (const [dir, match] of [
    ['skills', 'skills-extra/*.md'],
    ['.', '.claude/skills/*/SKILL.md'],
    ['.claude', 'skills/*/SKILL.md']
  ]) {
    assert.doesNotThrow(() => validateConfig({ checks: [{ id: 'c', dir, match }] }), `${dir} ${match}`);
  }
});

test('a plain value a strict YAML reader rejects or misreads carries the reason; one it reads the same does not', () => {
  // Verdicts come from PyYAML 6.0.3: each flagged value is an error there or loads as something other
  // than this text; each clean one loads as the same text, or as the list, map or nothing expected.
  const flagged = {
    colon: 'Use when: the user asks to deploy',
    endColon: 'Deploys the app when asked:',
    bracket: '[draft] Deploys the app',
    unbalanced: '[Read, Grep',
    brace: '{draft} Deploys',
    closeBracket: '] Deploys',
    star: '*Deploys* the app',
    at: '@team owns this skill',
    backtick: '`deploy` ships the app',
    percent: '%done',
    comma: ', then deploys',
    dash: '- Deploys the app',
    question: '? Deploys the app',
    anchor: '&deploy Deploys the app',
    tag: '!important Deploys the app',
    pipe: '| Deploys the app',
    greater: '> Deploys the app',
    unclosed: '"Deploys the app'
  };
  const clean = {
    list: '[Read, Grep]',
    quotedList: '["Read", "Grep"]',
    map: '{owner: me}',
    listThenComment: '[Read, Grep] # tools',
    doubleQuoted: '"Use when: the user asks"',
    singleQuoted: "'[draft] Deploys the app'",
    url: 'https://example.com/docs',
    time: 'Runs at 10:30 daily',
    language: 'C# and F#',
    comment: 'Fixes bug #42: parser',
    dashWord: '-v prints more',
    middle: 'Reads [a] {b} and a, b, then *c* @d `e` !f &g |h >i %j "k" \'l\' ?m -n',
    apostrophe: "it's fine",
    empty: '# TODO',
    tilde: '~'
  };
  const { fields } = parseFrontmatter(
    [
      '---',
      ...Object.entries({ ...flagged, ...clean }).map(([key, value]) => `${key}: ${value}`),
      'wrapped: Deploys the app',
      '  when: asked',
      'nextLine:',
      '  [draft] Deploys the app',
      'block: >-',
      '  Use when: the user asks',
      'nested:',
      '  owner: me',
      'listed:',
      '  - Read',
      '---'
    ].join('\n')
  );
  for (const key of [...Object.keys(flagged), 'wrapped', 'nextLine']) {
    assert.equal(typeof fields.get(key).yamlProblem, 'string', key);
  }
  for (const key of [...Object.keys(clean), 'block', 'nested', 'listed']) {
    assert.equal(fields.get(key).yamlProblem, undefined, key);
  }
  assert.equal(fields.get('colon').yamlProblem, 'contains ": ", so a strict YAML reader rejects the line');
  assert.equal(fields.get('endColon').yamlProblem, 'ends with ":", so a strict YAML reader rejects the line');
  assert.equal(fields.get('bracket').yamlProblem, 'starts with "[", so a strict YAML reader rejects the line');
  assert.equal(fields.get('anchor').yamlProblem, 'starts with "&", so a strict YAML reader does not read it as plain text');
  assert.equal(fields.get('dash').yamlProblem, 'starts with "- ", so a strict YAML reader rejects the line');
  assert.equal(fields.get('unclosed').yamlProblem, 'starts with a quote it never closes, so a strict YAML reader rejects the line');
  // The value itself is read as before: the reason is extra, not a change in what is measured.
  assert.equal(fields.get('colon').value, 'Use when: the user asks to deploy');
  assert.equal(fields.get('wrapped').value, 'Deploys the app when: asked');
});

test('a mapping indented as a whole is read, as YAML and Claude Code read it', () => {
  // Claude Code 2.1.300 read both fields from this file (checked 2026-10-15); reporting them missing was a false alarm.
  const parsed = parseFrontmatter('---\n  name: indented\n  description: Every key two spaces in.\n---\n');
  assert.equal(parsed.fields.get('name').value, 'indented');
  assert.equal(parsed.fields.get('description').value, 'Every key two spaces in.');
  assert.deepEqual(parsed.notes, []);
});

test('"key:value" with no space after the colon is not a field, and the reader says why', () => {
  // YAML reads "name:deploy" as one plain word, and Claude Code 2.1.300 read no field from it (checked 2026-10-15).
  const parsed = parseFrontmatter('---\nname:deploy\ndescription: Deploys the application to staging.\n---\n');
  assert.equal(parsed.fields.has('name'), false);
  assert.equal(parsed.fields.get('description').value, 'Deploys the application to staging.');
  assert.deepEqual(parsed.notes, ['line "name:deploy" has no space after its colon, so it is not a field. Put a space after the colon.']);
});

test('text after a closing quote keeps the quoted value and carries the reason; a comment there is fine', () => {
  // Claude Code 2.1.300 dropped every value in a block with such a line (checked 2026-10-15).
  const parsed = parseFrontmatter('---\nname: "deploy" junk\nother: "fine" # a comment\n---\n');
  assert.equal(parsed.fields.get('name').value, 'deploy');
  assert.equal(parsed.fields.get('name').yamlProblem, 'has "junk" after its closing quote, so a strict YAML reader rejects the line');
  assert.equal(parsed.fields.get('name').advice, 'Keep everything inside the quotes.');
  assert.equal(parsed.fields.get('other').value, 'fine');
  assert.equal(parsed.fields.get('other').yamlProblem, undefined);
});

test('a "path" or "dir" that ends in "/" fails at load', () => {
  assert.throws(() => validateConfig({ checks: [{ id: 'c', dir: '.claude/skills/' }] }), /ends in "\/"; leave the slash off/);
  assert.throws(() => validateConfig({ checks: [{ id: 'c', path: 'AGENTS.md/' }] }), /ends in "\/"; leave the slash off/);
});
