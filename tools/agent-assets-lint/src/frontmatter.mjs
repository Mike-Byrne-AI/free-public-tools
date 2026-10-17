/**
 * Minimal YAML frontmatter reader.
 *
 * This is deliberately not a YAML parser. It answers two questions a linter needs -
 * "is this key present?" and "what is its scalar value?" - and it is written to avoid
 * false negatives: a key whose value is a block list or a folded string still counts as
 * present, because reporting a populated field as missing is the worst outcome here.
 *
 * Where it does read a value, it reads what YAML reads (test/fixtures/frontmatter-vs-pyyaml.json
 * holds the comparison with PyYAML), and where a strict YAML reader would reject the line, the
 * field or a note says so, because some agent tools read such a line and others stop on it.
 */

const DELIMITER = /^---[ \t]*$/;
/** Unquoted, YAML reads these as no value at all. */
const NULLS = new Set(['~', 'null', 'Null', 'NULL']);
const REJECTS = 'so a strict YAML reader rejects the line';
const MISREADS = 'so a strict YAML reader does not read it as plain text';

/**
 * A top-level "key: value" line. The key is a plain YAML scalar (any text that does not start
 * with whitespace or a YAML indicator; "-", "?" and ":" may start it when text follows them
 * directly, as in "-x") or a quoted one. The colon needs a space (or the line's end) after it:
 * "name:deploy" is one plain word to YAML, and Claude Code 2.1.300 read no field from it
 * (checked 2026-10-15).
 */
const KEY = /^(?:"((?:[^"\\]|\\.)*)"|'((?:[^']|'')*)'|((?:[^\s"'#&*!|>%@`,[\]{}?:-]|[?:-](?=\S))[^#:]*?))[ \t]*:(?:([ \t]+)(.*))?$/;
const NO_SPACE = /^(?:[^\s"'#&*!|>%@`,[\]{}?:-]|[?:-](?=\S))[^#:]*:\S/;

/** Index of the quote that closes the quoted text starting at 0, or -1 when the text does not close it. */
function closingQuote(text) {
  const quote = text[0];
  for (let index = 1; index < text.length; index += 1) {
    if (quote === '"' && text[index] === '\\') {
      index += 1; // \" and \\ are escapes, not the end
      continue;
    }
    if (text[index] !== quote) continue;
    if (quote === "'" && text[index + 1] === "'") {
      index += 1; // '' is an escaped quote, not the end
      continue;
    }
    return index;
  }
  return -1;
}

const ESCAPES = {
  0: '\0', a: '\x07', b: '\b', t: '\t', '\t': '\t', n: '\n', v: '\v', f: '\f', r: '\r', e: '\x1b', ' ': ' ',
  '"': '"', '/': '/', '\\': '\\', N: '\u0085', _: ' ', L: ' ', P: ' '
};

/**
 * Double-quoted text with YAML's escapes decoded: \n, \t, \", \\, é and the rest. Claude Code
 * 2.1.300 decodes them too (checked 2026-10-15), so a linter must measure the decoded text. An
 * escape YAML does not define, such as \', is kept as typed and returned as `unknown`.
 */
function decodeEscapes(inside) {
  let unknown;
  const value = inside.replace(/\\(x[0-9A-Fa-f]{2}|u[0-9A-Fa-f]{4}|U[0-9A-Fa-f]{8}|[\s\S])/g, (whole, code) => {
    if (code.length > 1) {
      const point = parseInt(code.slice(1), 16);
      if (point <= 0x10ffff) return String.fromCodePoint(point);
    } else if (Object.hasOwn(ESCAPES, code)) {
      return ESCAPES[code];
    }
    unknown ??= whole;
    return whole;
  });
  return { value, unknown };
}

/** A quoted item as YAML reads it (quotes removed, escapes decoded), or the text as typed. */
function unquote(text) {
  if ((text[0] === '"' || text[0] === "'") && closingQuote(text) === text.length - 1) {
    const inside = text.slice(1, -1);
    return text[0] === '"' ? decodeEscapes(inside).value : inside.replaceAll("''", "'");
  }
  return text;
}

/** True when the text is one whole flow list or map, "[Read, Grep]" or "{a: 1}", which YAML reads as that collection. */
function isFlowCollection(text) {
  const open = [];
  for (let index = 0; index < text.length; index += 1) {
    const character = text[index];
    if (character === '[' || character === '{') open.push(character === '[' ? ']' : '}');
    else if (character === ']' || character === '}') {
      if (open.pop() !== character) return false;
      if (open.length === 0) return index === text.length - 1;
    }
  }
  return false;
}

/** The items of a one-line list or map, "[Read, Grep]" -> ["Read", "Grep"]: split on the commas outside quotes and inner brackets. */
function flowItems(text) {
  const items = [];
  let depth = 0;
  let quote = null;
  let start = 1;
  for (let index = 1; index < text.length - 1; index += 1) {
    const character = text[index];
    if (quote !== null) {
      if (quote === '"' && character === '\\') index += 1;
      else if (character === quote) quote = null;
    } else if (character === '"' || character === "'") {
      quote = character;
    } else if (character === '[' || character === '{') {
      depth += 1;
    } else if (character === ']' || character === '}') {
      depth -= 1;
    } else if (character === ',' && depth === 0) {
      items.push(text.slice(start, index));
      start = index + 1;
    }
  }
  items.push(text.slice(start, text.length - 1));
  return items.map((item) => unquote(item.trim())).filter((item) => item.length > 0);
}

/**
 * Why a strict YAML reader would not read an unquoted value as the plain text this reader takes
 * from it, or null when it would. Some agent tools read "Use when: ..." or "[draft] ..." as text,
 * while a strict reader (PyYAML, for one) stops with an error, so the same file loads in one tool
 * and fails in another.
 */
function strictYamlProblem(plain) {
  if (plain.length === 0 || NULLS.has(plain)) return null;
  const first = plain[0];
  if (first === '[' || first === '{') return `starts with "${first}", ${REJECTS}`; // a whole list or map was read before this
  if ('&!|>'.includes(first)) return `starts with "${first}", ${MISREADS}`; // an anchor, a tag, block text
  if (',]}%@`*'.includes(first)) return `starts with "${first}", ${REJECTS}`;
  if (first === '"' || first === "'") return `starts with a quote it never closes, ${REJECTS}`;
  // "-", "?" and ":" start a plain value only when text follows them directly: "-v" is text, "- v" is not.
  if ('-?:'.includes(first) && (plain.length === 1 || /\s/.test(plain[1]))) {
    return `${plain.length === 1 ? `is only "${first}"` : `starts with "${first} "`}, ${REJECTS}`;
  }
  const colon = /:(\s|$)/.exec(plain);
  if (colon) return `${colon.index === plain.length - 1 ? 'ends with ":"' : 'contains ": "'}, ${REJECTS}`;
  return null;
}

/**
 * An inline value as a YAML reader sees it: quotes removed ('' inside single quotes is one ',
 * escapes inside double quotes decoded), a comment dropped, a one-line list or map read as its
 * items. Outside quotes, a "#" at the start or after a space or tab starts a comment, so an
 * agent reading "Fixes bug #42" gets only "Fixes bug"; the linter must measure the same text.
 * Returns { value }, plus `block: true` for a list or map, plus `yamlProblem` (and `advice`)
 * when a strict YAML reader would reject the line or read something else from it.
 */
function inlineScalar(inline) {
  if (inline[0] === '"' || inline[0] === "'") {
    const close = closingQuote(inline);
    if (close > 0) {
      const inside = inline.slice(1, close);
      const { value, unknown } = inline[0] === '"' ? decodeEscapes(inside) : { value: inside.replaceAll("''", "'") };
      // Text after the closing quote (a comment aside) makes the line invalid YAML. Claude Code 2.1.300 then
      // dropped every value in the block (checked 2026-10-15), so the reader keeps the quoted text and says so.
      const after = inline.slice(close + 1).trim();
      if (after.length > 0 && !after.startsWith('#')) {
        return { value, yamlProblem: `has ${JSON.stringify(after)} after its closing quote, ${REJECTS}`, advice: 'Keep everything inside the quotes.' };
      }
      if (unknown !== undefined) {
        return { value, yamlProblem: `has the escape "${unknown}", which YAML does not define, ${REJECTS}`, advice: 'Double the backslash to keep it as text, or remove it.' };
      }
      return { value };
    }
  }
  const comment = inline.startsWith('#') ? 0 : inline.search(/[ \t]#/);
  const plain = comment === -1 ? inline : inline.slice(0, comment).trimEnd();
  if ((plain[0] === '[' || plain[0] === '{') && isFlowCollection(plain)) return { value: flowItems(plain).join(', '), block: true };
  const yamlProblem = strictYamlProblem(plain);
  return { value: NULLS.has(plain) ? '' : plain, ...(yamlProblem ? { yamlProblem } : {}) };
}

/**
 * Join wrapped lines the way YAML folds them: a space between lines, a blank line kept as a break.
 * Inside double quotes a "\" at the end of a line joins it to the next with nothing between.
 */
function fold(texts, escapedBreaks = false) {
  let value = '';
  let pendingBreaks = 0;
  for (const text of texts) {
    if (text.trim().length === 0) {
      pendingBreaks += 1;
      continue;
    }
    if (value.length > 0) {
      if (escapedBreaks && /(?<!\\)(?:\\\\)*\\$/.test(value)) value = value.slice(0, -1);
      else value += pendingBreaks > 0 ? '\n'.repeat(pendingBreaks) : ' ';
    }
    pendingBreaks = 0;
    value += text.trim();
  }
  return value;
}

/**
 * Join the lines of a ">" block as YAML folds them: a space between lines, a blank line kept as a
 * break, and a more-indented line kept as it is, with a break before and after it.
 */
function foldBlock(texts) {
  let value = '';
  let breaks = 0;
  let previousMore = false;
  let any = false;
  for (const text of texts) {
    if (text.trim().length === 0) {
      breaks += 1;
      continue;
    }
    const more = /^[ \t]/.test(text);
    if (any) value += breaks > 0 || more || previousMore ? '\n'.repeat(breaks + (more || previousMore ? 1 : 0)) : ' ';
    value += text;
    any = true;
    previousMore = more;
    breaks = 0;
  }
  return value;
}

/** The body with its common indent taken off: a mapping indented as a whole ("  name: x" on every line) is valid YAML, and Claude Code reads it. */
function stripCommonIndent(body) {
  const indentOf = (line) => /^[ \t]*/.exec(line)[0].length;
  const indents = body.filter((line) => line.trim().length > 0 && !line.trimStart().startsWith('#')).map(indentOf);
  const common = indents.length > 0 ? Math.min(...indents) : 0;
  return common === 0 ? body : body.map((line) => line.slice(Math.min(common, indentOf(line))));
}

const blank = (line) => line.trim().length === 0;
const comment = (line) => line.trimStart().startsWith('#');
const indented = (line) => /^[ \t]+\S/.test(line);
const hasTab = (text) => text.includes('\t');
const tabIndent = (line) => /^ *\t/.test(line);
/** The text up to and including the whitespace before a "#" comment: a tab inside the comment is fine, one before it is not. */
function beforeComment(text) {
  const hash = /(^|[ \t])#/.exec(text);
  return hash ? text.slice(0, hash.index + 1) : text;
}

/**
 * Returns { present, fields, lineCount, notes }.
 *
 * `fields` maps key -> { value, inline, block, blockScalar?, yamlProblem?, advice? }. `value` is the scalar text
 * for a plain or quoted scalar (wrapped lines joined with spaces) or a `>` / `|` block scalar
 * (folded lines joined with spaces, literal lines joined with newlines, the final line break
 * kept, dropped or multiplied as the `-` / `+` marker says), or the items joined with ", " for a
 * list or map (`block`). `yamlProblem` says why a strict YAML reader would reject the line or
 * read something else from it, e.g. 'contains ": ", so ...'; `advice` is the fix to suggest.
 * `notes` are lines that are not fields but are not blank or comments either ("name:deploy", an
 * indented line under a finished value, loose text), each with why, for a warning.
 */
export function parseFrontmatter(source) {
  const text = source.replace(/^﻿/, '');
  const lines = text.split(/\r\n|\r|\n/);
  if (!DELIMITER.test(lines[0])) return { present: false, fields: new Map(), lineCount: 0 };
  const end = lines.findIndex((line, index) => index > 0 && DELIMITER.test(line));
  if (end === -1) return { present: false, fields: new Map(), lineCount: 0 };

  const body = stripCommonIndent(lines.slice(1, end));
  const fields = new Map();
  const notes = [];
  for (let index = 0; index < body.length; index += 1) {
    const line = body[index];
    if (blank(line) || comment(line)) continue;
    const match = KEY.exec(line);
    if (!match) {
      const shown = JSON.stringify(line.trim());
      if (NO_SPACE.test(line)) notes.push(`line ${shown} has no space after its colon, so it is not a field. Put a space after the colon.`);
      else if (/^[ \t]/.test(line)) notes.push(`line ${shown} is indented but belongs to no field, ${REJECTS}. Remove the indent, or join it to the line above.`);
      else notes.push(`line ${shown} is not a "key: value" field, ${REJECTS}.`);
      continue;
    }
    const key = match[1] !== undefined ? decodeEscapes(match[1]).value : match[2] !== undefined ? match[2].replaceAll("''", "'") : match[3];
    const rest = match[5] ?? '';
    const inline = rest.trim();
    const openQuote = inline[0] === '"' || inline[0] === "'";
    const close = openQuote ? closingQuote(inline) : -1;

    // A tab is text inside quotes and nothing inside a comment; anywhere else YAML forbids it
    // (PyYAML 6.0.3 stops on each shape below, checked 2026-10-15). One problem per field: a
    // problem the value has on its own is reported first.
    let tabProblem = null;
    let unquoted = line.slice(0, line.length - rest.length);
    if (!openQuote) unquoted += beforeComment(inline);
    else if (close > 0) unquoted += beforeComment(inline.slice(close + 1));
    if (hasTab(unquoted)) tabProblem = `has a tab outside quotes, ${REJECTS}`;

    let field;
    // A block-scalar header (">", ">-", "|", "|+", "|2" ...) starts a multi-line string: the text is on
    // the following indented lines, not on this one. The block's indent is the first line's, or the
    // digit in the header; a line indented less ends it.
    const header = /^([|>])([+-]?[1-9]?|[1-9]?[+-]?)(?:[ \t]+#.*)?$/.exec(inline);
    if (header) {
      const chomp = /[+-]/.exec(header[2])?.[0] ?? '';
      let indent = Number(/[1-9]/.exec(header[2])?.[0] ?? 0);
      const raw = [];
      let cursor = index + 1;
      while (cursor < body.length) {
        const next = body[cursor];
        if (!blank(next)) {
          const lead = /^[ \t]*/.exec(next)[0].length;
          if (lead === 0) break;
          indent ||= lead;
          if (lead < indent) break;
        }
        raw.push(next);
        cursor += 1;
      }
      let trailing = 0;
      while (raw.length > 0 && blank(raw[raw.length - 1])) {
        raw.pop();
        trailing += 1;
      }
      if (raw.some(tabIndent)) tabProblem ??= `continues on a line indented with a tab, ${REJECTS}`;
      const texts = raw.map((item) => (blank(item) ? '' : item.slice(indent)));
      const content = header[1] === '|' ? texts.join('\n') : foldBlock(texts);
      // The final line break: one by default, none with "-", all of them with "+" (as YAML chomps).
      const last = content.length > 0 ? 1 : 0;
      const value = chomp === '-' ? content : content + '\n'.repeat(chomp === '+' ? last + trailing : last);
      field = { value, inline: false, block: false, blockScalar: true };
      index = cursor - 1;
    } else if (inline.length > 0) {
      // The value may wrap onto more-indented lines, which YAML joins with spaces: an
      // unclosed quote runs to its closing quote, a plain value stops at a comment.
      const wraps = openQuote ? close === -1 : !/(^|[ \t])#/.test(inline);
      const texts = [inline];
      let cursor = index + 1;
      while (wraps && cursor < body.length && (blank(body[cursor]) || indented(body[cursor]))) {
        if (!openQuote && comment(body[cursor])) break;
        texts.push(body[cursor]);
        cursor += 1;
      }
      if (!openQuote && texts.slice(1).some((item) => hasTab(beforeComment(item)))) tabProblem ??= `continues on a line with a tab, ${REJECTS}`;
      field = { inline: true, block: false, ...inlineScalar(fold(texts, inline[0] === '"')) };
      index = cursor - 1;
    } else {
      // Empty inline value: the value is on the indented lines below. A "- " list or a nested
      // "key: value" map is kept as present but not measured (`block`); other lines are text
      // that wraps, joined as YAML joins it, so every rule applies. Comment lines are skipped.
      const collected = [];
      let cursor = index + 1;
      while (cursor < body.length) {
        const next = body[cursor];
        if (comment(next)) {
          cursor += 1;
          continue;
        }
        if (!blank(next) && !indented(next) && !/^-[ \t]+\S/.test(next)) break;
        collected.push(next);
        cursor += 1;
      }
      const items = collected.map((item) => item.trim()).filter((item) => item.length > 0);
      if (items.length > 0 && (/^-([ \t]|$)/.test(items[0]) || /:([ \t]|$)/.test(items[0]))) {
        if (collected.some(tabIndent)) tabProblem ??= `continues on a line indented with a tab, ${REJECTS}`;
        field = { value: items.map((item) => item.replace(/^-[ \t]*/, '')).join(', '), inline: false, block: true };
      } else {
        const quoted = items[0]?.[0] === '"' || items[0]?.[0] === "'";
        if (!quoted && collected.some((item) => hasTab(beforeComment(item)))) tabProblem ??= `continues on a line with a tab, ${REJECTS}`;
        field = { inline: false, block: false, ...inlineScalar(fold(collected, items[0]?.[0] === '"')) };
      }
      index = cursor - 1;
    }
    if (tabProblem !== null && field.yamlProblem === undefined) Object.assign(field, { yamlProblem: tabProblem, advice: 'Use spaces.' });
    fields.set(key, field);
  }
  return { present: true, fields, lineCount: end + 1, notes };
}

/** Line count that treats a trailing newline as terminating the last line, not starting a new one. */
export function lineCount(source) {
  if (source.length === 0) return 0;
  const normalized = source.replace(/\r\n?/g, '\n');
  const withoutTrailing = normalized.endsWith('\n') ? normalized.slice(0, -1) : normalized;
  return withoutTrailing.split('\n').length;
}
