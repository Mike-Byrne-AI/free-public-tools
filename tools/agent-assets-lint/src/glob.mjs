/**
 * A deliberately small glob matcher.
 *
 * Supports exactly what agent-asset layouts need: `*` (one path segment), `**` (any
 * number of segments), and literal text. No braces, no character classes, no negation.
 * Anything else is a literal character, and the README says so - a pattern feature that
 * silently matches nothing would quietly shrink what this tool checks.
 */

const SPECIAL = /[.+?^${}()|[\]\\]/g;

export function globToRegExp(pattern) {
  let source = '';
  let index = 0;
  while (index < pattern.length) {
    if (pattern.startsWith('**/', index)) {
      // Zero or more leading segments.
      source += '(?:[^/]+/)*';
      index += 3;
      continue;
    }
    if (pattern.startsWith('**', index)) {
      source += '.*';
      index += 2;
      continue;
    }
    const character = pattern[index];
    if (character === '*') {
      source += '[^/]*';
      index += 1;
      continue;
    }
    source += character.replace(SPECIAL, '\\$&');
    index += 1;
  }
  return new RegExp(`^${source}$`);
}

/** Match a forward-slash relative path against a glob pattern. */
export function matchesGlob(path, pattern) {
  return globToRegExp(pattern).test(path);
}
