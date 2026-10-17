import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { parseFrontmatter } from '../src/frontmatter.mjs';

// What PyYAML read from each case, recorded by test/fixtures/frontmatter-vs-pyyaml.py. The reader is
// not a YAML parser, but where it reads a value it must read what YAML reads, and where YAML stops
// on a line it must say so. Lines a strict reader rejects are "REJECTED": fine when the reader
// warns, a failure when it is silent.
const fixture = JSON.parse(await readFile(new URL('./fixtures/frontmatter-vs-pyyaml.json', import.meta.url), 'utf8'));

/**
 * Where the reader knowingly differs from PyYAML, and why. A case listed here must still differ:
 * when a change makes it agree, the test says to drop it from this list.
 */
const KNOWN = {
  'key-explicit': 'the "? key" then ": value" form is not read; it does not occur in agent files'
};

/** Verdicts that need no entry in KNOWN. */
const ACCEPTABLE = new Set(['AGREE', 'TYPED', 'REJECTED+warn', 'DIFF+warn']);

function verdict(parsed, yaml) {
  const warned = parsed.present && ([...parsed.fields.values()].some((field) => field.yamlProblem !== undefined) || parsed.notes.length > 0);
  if (yaml.status === 'absent') return parsed.present ? 'DIFF: the reader finds frontmatter where PyYAML finds none' : 'AGREE';
  if (yaml.status === 'error') return warned ? 'REJECTED+warn' : `REJECTED-silent: PyYAML stops (${yaml.error}), the reader says nothing`;
  if (!parsed.present) return 'DIFF: PyYAML reads a document, the reader finds no frontmatter';
  const value = yaml.value;
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    return parsed.fields.size === 0 ? 'AGREE' : `DIFF: PyYAML reads no mapping, the reader reads ${[...parsed.fields.keys()].join(', ')}`;
  }
  const expectedKeys = Object.keys(value).sort();
  const keys = [...parsed.fields.keys()].sort();
  if (JSON.stringify(expectedKeys) !== JSON.stringify(keys)) return `DIFF-keys: PyYAML ${JSON.stringify(expectedKeys)}, reader ${JSON.stringify(keys)}`;
  const diffs = [];
  let typed = false;
  for (const [key, expected] of Object.entries(value)) {
    const field = parsed.fields.get(key);
    if (typeof expected === 'string' && /^<\w+ .*>$/.test(expected)) {
      typed = true; // a date or similar, recorded as "<date 2024-01-01>": the reader keeps the text, by design
    } else if (typeof expected === 'string') {
      if (field.value !== expected) diffs.push(`${key}: PyYAML ${JSON.stringify(expected)}, reader ${JSON.stringify(field.value)}`);
    } else if (expected === null) {
      if (field.value !== '') diffs.push(`${key}: PyYAML null, reader ${JSON.stringify(field.value)}`);
    } else if (typeof expected === 'object') {
      // A list or map: present and marked `block`; a list of plain items must also read as those items.
      const scalars = Array.isArray(expected) && expected.every((item) => ['string', 'number', 'boolean'].includes(typeof item));
      if (!field.block) diffs.push(`${key}: PyYAML reads a list or map, the reader reads the text ${JSON.stringify(field.value)}`);
      else if (scalars && field.value !== expected.map(String).join(', ')) diffs.push(`${key}: PyYAML ${JSON.stringify(expected)}, reader ${JSON.stringify(field.value)}`);
    } else {
      typed = true; // true, 1, 1.0, a date: the reader keeps the text as typed, by design
    }
  }
  if (diffs.length > 0) return `${warned ? 'DIFF+warn' : 'DIFF'}: ${diffs.join('; ')}`;
  return typed ? 'TYPED' : 'AGREE';
}

test('the reader agrees with PyYAML on every case, or warns, or the difference is on the known list', (t) => {
  const counts = {};
  const failures = [];
  const stale = [];
  for (const [name, { text, yaml }] of Object.entries(fixture.cases)) {
    const result = verdict(parseFrontmatter(text), yaml);
    const kind = result.split(':')[0];
    counts[kind] = (counts[kind] ?? 0) + 1;
    const fine = ACCEPTABLE.has(kind);
    if (!fine && !(name in KNOWN)) failures.push(`${name}: ${result}\n  text ${JSON.stringify(text)}\n  pyyaml ${JSON.stringify(yaml)}`);
    if (fine && name in KNOWN) stale.push(`${name} now gives ${result}; drop it from KNOWN`);
  }
  for (const name of Object.keys(KNOWN)) assert.ok(name in fixture.cases, `KNOWN names a case that is not in the fixture: ${name}`);
  const summary = Object.entries(counts).map(([kind, count]) => `${kind} ${count}`).join(', ');
  t.diagnostic(`${Object.keys(fixture.cases).length} cases against PyYAML ${fixture.pyyaml}: ${summary}; known differences ${Object.keys(KNOWN).length}`);
  assert.deepEqual(failures, [], `the reader differs from PyYAML without warning:\n${failures.join('\n')}`);
  assert.deepEqual(stale, [], stale.join('\n'));
});
