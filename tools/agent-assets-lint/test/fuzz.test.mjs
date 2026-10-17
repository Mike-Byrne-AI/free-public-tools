import assert from 'node:assert/strict';
import test from 'node:test';
import { validateConfig } from '../src/config.mjs';
import { lineCount, parseFrontmatter } from '../src/frontmatter.mjs';
import { globToRegExp, matchesGlob } from '../src/glob.mjs';

// The tool runs on other people's repos, so its readers must never fall over on odd input. These
// tests throw thousands of generated inputs at them. A fixed seed makes every run the same, and a
// failure prints the seed, the case number and the input, so it can be turned into a plain test.

function random(seed) {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const pick = (next, items) => items[Math.floor(next() * items.length)];
const some = (next, items, most) => Array.from({ length: 1 + Math.floor(next() * most) }, () => pick(next, items));

const PIECES = [
  'name', 'description', 'tools', ': ', ':', ' ', '  ', '\t', '\n', '\r\n', '\r', '"', "'", '#', '- ', '-', '|', '>',
  '|-', '>+', '|2', '[', ']', '{', '}', ',', '\\', '\\"', '\\u00e9', '\\UFFFFFFFF', '\\x4', "''", '&a', '*a', '!tag', '%', '@', '`', '?', '~',
  'null', 'café', '🚀', '﻿', '---', '...', 'Use when: x', '0x1A', '1_000', '2024-01-01', 'a'
];

/** Random characters, mostly wrapped in frontmatter delimiters. */
function noise(next) {
  let text = next() < 0.9 ? '---\n' : '';
  text += some(next, PIECES, 30).join('');
  if (next() < 0.9) text += '\n---\nBody\n';
  return text;
}

const VALUES = [
  'deploy', '"quoted"', "'single'", '"unclosed', '', '~', '|', '>-', '|+', '|2', '[Read, Grep]', '{a: 1}', '[a] b',
  'Use when: x', 'a # comment', '#tag', '&anchor x', '*ref', '!!str 1', '"a\\nb"', '"it\\\'s"', 'a\tb', '-', '- x', '? x',
  ': x', 'café', '🚀 launch', '"quoted" junk', 'x:y', 'true', '12:30'
];
const FOLLOWERS = ['  continued', '', '  - item', '- item', '  # note', '\tx', '  "q"', '    deep: 1', '  b: c', 'loose text', '   ', '  more # c'];

/** Lines that look like frontmatter, with the mistakes people make. */
function shaped(next) {
  const lines = [];
  for (let count = 1 + Math.floor(next() * 6); count > 0; count -= 1) {
    const key = pick(next, ['name', 'description', 'tools', 'model', 'my-key', '"q"', 'x_y', '1key', 'key.sub', 'my key']);
    const separator = pick(next, [': ', ': ', ': ', ':', ':\t', ' : ', ':  ']);
    lines.push(`${pick(next, ['', '', '', '  ', '\t'])}${key}${separator}${pick(next, VALUES)}`);
    while (next() < 0.4) lines.push(pick(next, FOLLOWERS));
  }
  return `---\n${lines.join(pick(next, ['\n', '\n', '\r\n']))}\n---\n`;
}

test('the frontmatter reader never throws and always returns the documented shape', () => {
  const seed = 20261015;
  const next = random(seed);
  for (let index = 0; index < 4000; index += 1) {
    const text = index % 2 === 0 ? noise(next) : shaped(next);
    const where = `seed ${seed}, case ${index}, input ${JSON.stringify(text)}`;
    let parsed;
    try {
      parsed = parseFrontmatter(text);
      lineCount(text);
    } catch (error) {
      assert.fail(`${where}\n${error.stack}`);
    }
    assert.equal(typeof parsed.present, 'boolean', where);
    assert.ok(parsed.fields instanceof Map, where);
    assert.ok(Number.isInteger(parsed.lineCount) && parsed.lineCount >= 0, where);
    if (!parsed.present) {
      assert.equal(parsed.fields.size, 0, where);
      continue;
    }
    assert.ok(parsed.lineCount >= 2, where);
    assert.ok(Array.isArray(parsed.notes) && parsed.notes.every((note) => typeof note === 'string'), where);
    for (const [key, field] of parsed.fields) {
      const label = `${where}, field ${JSON.stringify(key)}`;
      assert.ok(typeof key === 'string' && key.length > 0, label);
      assert.equal(typeof field.value, 'string', label);
      assert.equal(typeof field.inline, 'boolean', label);
      assert.equal(typeof field.block, 'boolean', label);
      if (field.yamlProblem !== undefined) assert.equal(typeof field.yamlProblem, 'string', label);
      if (field.advice !== undefined) assert.equal(typeof field.advice, 'string', label);
    }
  }
});

test('the glob matcher never throws, on any pattern or path', () => {
  const seed = 7;
  const next = random(seed);
  const GLOB = ['*', '**', '/', 'a', 'SKILL.md', '.', '(', ')', '[', ']', '{', '}', '+', '?', '^', '$', '|', '\\', ' ', 'é', '**/'];
  const PATH = ['a', 'b', '/', '.', 'SKILL.md', '..', ' ', 'é', '(', '*'];
  for (let index = 0; index < 3000; index += 1) {
    // Short on purpose: nested "**" groups backtrack polynomially, and the point here is "no throw".
    const pattern = some(next, GLOB, 6).join('');
    const path = some(next, PATH, 8).join('');
    const where = `seed ${seed}, case ${index}, pattern ${JSON.stringify(pattern)}, path ${JSON.stringify(path)}`;
    let result;
    try {
      assert.ok(globToRegExp(pattern) instanceof RegExp, where);
      result = matchesGlob(path, pattern);
    } catch (error) {
      assert.fail(`${where}\n${error.stack}`);
    }
    assert.equal(typeof result, 'boolean', where);
  }
});

test('a mangled config fails with a plain message, never a crash inside the validator', () => {
  const seed = 42;
  const next = random(seed);
  const base = {
    schemaVersion: 1,
    checks: [
      { id: 'a', path: 'AGENTS.md', maxLines: 10, requireHeadings: ['# A'], mustReference: ['x'], required: false, description: 'd' },
      {
        id: 'b',
        dir: '.claude/skills',
        match: '*/SKILL.md',
        minCount: 1,
        maxCount: 9,
        nameMatchesDirectory: 'name',
        uniqueBy: 'name',
        frontmatter: {
          required: true,
          fields: { name: { required: true, pattern: '^[a-z]+$', minLength: 1, maxLength: 64, oneOf: ['x'] } }
        }
      }
    ]
  };
  const JUNK = [null, undefined, 0, -1, 1.5, 2, '', 'x', [], {}, true, false, '..', '/a', 'a\\b', '(', '*/', './x', 'a/', ['x'], [1], { a: 1 }];
  const mutate = (node) => {
    const keys = Object.keys(node);
    if (keys.length === 0) return;
    const key = pick(next, keys);
    const roll = next();
    if (roll < 0.5 && node[key] !== null && typeof node[key] === 'object') mutate(node[key]);
    else if (roll < 0.85) node[key] = structuredClone(pick(next, JUNK));
    else if (roll < 0.95) delete node[key];
    else node[pick(next, ['extra', 'Path', 'match', 'frontmatter', 'required', 'fields', 'pattern'])] = structuredClone(pick(next, JUNK));
  };
  for (let index = 0; index < 2000; index += 1) {
    const config = structuredClone(base);
    for (let edits = 1 + Math.floor(next() * 3); edits > 0; edits -= 1) mutate(config);
    const where = `seed ${seed}, case ${index}, config ${JSON.stringify(config)}`;
    try {
      validateConfig(config);
    } catch (error) {
      // The validator's own errors are plain Errors with a message that names the field. A TypeError
      // would mean it tripped over the shape before it could say what was wrong.
      assert.equal(error.constructor, Error, `${where}\n${error.stack}`);
      assert.ok(error.message.length > 0, where);
    }
  }
});
