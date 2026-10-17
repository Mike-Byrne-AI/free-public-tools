/**
 * Lint the instruction files an agent actually reads.
 *
 * Types and tests say nothing about AGENTS.md, CLAUDE.md, .cursor/rules or SKILL.md
 * frontmatter, so those files drift silently: a skill whose name stopped matching its
 * directory, a scoped rule that no longer points at the canonical instructions, a
 * canonical file that quietly grew past the context budget someone set for it.
 */
import { readFile, readdir, realpath, stat } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { validateConfig } from './config.mjs';
import { lineCount, parseFrontmatter } from './frontmatter.mjs';
import { matchesGlob } from './glob.mjs';

export const SCHEMA_VERSION = 1;

/** The file's text, or null when there is no file. Any other read error is thrown, not taken for absence. */
async function readIfPresent(absolute) {
  try {
    return await readFile(absolute, 'utf8');
  } catch (error) {
    if (error.code === 'ENOENT' || error.code === 'ENOTDIR') return null;
    throw error;
  }
}

async function isDirectory(absolute) {
  try {
    return (await stat(absolute)).isDirectory();
  } catch {
    return false;
  }
}

/** The glob a family uses when it has no "match". */
const ALL_FILES = '**/*';

/** Names never walked or inspected, at any depth: dependency trees and git internals (a worktree keeps a ".git" file). */
export const IGNORED_DIRECTORIES = new Set(['node_modules', '.git']);

/**
 * Relative forward-slash paths of every file under `dir`.
 *
 * Symlinked directories are followed. A link that points back at one of its own
 * ancestors is skipped, so a loop cannot recurse forever. Directories named in
 * IGNORED_DIRECTORIES are not entered.
 */
async function walk(root, relativeDir, issue) {
  const out = [];
  const base = resolve(root, relativeDir);
  // Skipping a folder quietly would drop its files from the check and leave the report clean.
  const unreadable = (where, error) => issue(`${where}: folder could not be read (${error.code}).`);
  async function recurse(current, prefix, ancestors) {
    let entries;
    try {
      entries = await readdir(current, { withFileTypes: true });
    } catch (error) {
      unreadable(prefix ? `${relativeDir}/${prefix}` : relativeDir, error);
      return;
    }
    for (const entry of entries) {
      const next = prefix ? `${prefix}/${entry.name}` : entry.name;
      const absolute = join(current, entry.name);
      if (IGNORED_DIRECTORIES.has(entry.name)) continue;
      let isDir = entry.isDirectory();
      if (!isDir && entry.isSymbolicLink()) isDir = await isDirectory(absolute);
      if (!isDir) {
        out.push(next);
        continue;
      }
      let real;
      try {
        real = await realpath(absolute);
      } catch (error) {
        unreadable(`${relativeDir}/${next}`, error);
        continue;
      }
      if (ancestors.has(real)) continue; // symlink loop
      await recurse(absolute, next, new Set([...ancestors, real]));
    }
  }
  let baseReal;
  try {
    baseReal = await realpath(base);
  } catch (error) {
    unreadable(relativeDir, error);
    return out;
  }
  // Every folder above the base is an ancestor too, up to the drive's root: a link to the project root
  // (or higher) is skipped, instead of pulling the whole tree in under the link's name.
  const ancestors = new Set([baseReal]);
  let folder = base;
  while (dirname(folder) !== folder) {
    folder = dirname(folder);
    ancestors.add(await realpath(folder).catch(() => folder));
  }
  await recurse(base, '', ancestors);
  return out.sort();
}

function checkFrontmatterRules(issue, file, parsed, rules) {
  for (const [name, rule] of Object.entries(rules ?? {})) {
    const field = parsed.fields.get(name);
    if (field === undefined) {
      if (rule.required) issue(`${file}: frontmatter is missing required field "${name}".`);
      continue;
    }
    const value = field.value;
    if (rule.required && value.length === 0 && !field.block) {
      issue(`${file}: frontmatter field "${name}" is empty.`);
      continue;
    }
    // Length and pattern rules describe scalars. A block/list value has no meaningful
    // length here, so checking it would invent failures.
    if (field.block) continue;
    if (rule.pattern !== undefined && !new RegExp(rule.pattern).test(value)) {
      issue(`${file}: frontmatter "${name}" (${JSON.stringify(value)}) does not match ${rule.pattern}.`);
    }
    if (rule.minLength !== undefined && value.length < rule.minLength) {
      issue(`${file}: frontmatter "${name}" is ${value.length} characters, below the ${rule.minLength} minimum.`);
    }
    if (rule.maxLength !== undefined && value.length > rule.maxLength) {
      issue(`${file}: frontmatter "${name}" is ${value.length} characters, above the ${rule.maxLength} maximum.`);
    }
    if (rule.oneOf !== undefined && !rule.oneOf.includes(value)) {
      issue(`${file}: frontmatter "${name}" must be one of ${rule.oneOf.join(', ')}.`);
    }
  }
}

/**
 * True when a line of the Markdown is this heading: the same text at the same level, outside fenced
 * code blocks and outside the frontmatter. "## Mission" is not met by "### Mission", by "## Mission
 * statement" or by the text inside a ``` block, all of which a plain substring test would pass.
 */
function hasHeading(source, heading) {
  const wanted = heading.trim().replace(/[ \t]+#+$/, '').trimEnd();
  const lines = source.split(/\r\n|\r|\n/);
  let fence = null;
  for (let index = parseFrontmatter(source).lineCount; index < lines.length; index += 1) {
    const line = lines[index].replace(/^ {0,3}/, ''); // up to three leading spaces still make a heading; four make code
    if (fence !== null) {
      if (line.startsWith(fence) && /^[`~ \t]*$/.test(line.slice(fence.length))) fence = null;
      continue;
    }
    const open = /^(`{3,}|~{3,})/.exec(line);
    if (open) {
      fence = open[1];
      continue;
    }
    const text = line.startsWith('#') ? line.replace(/[ \t]+#+[ \t]*$/, '').trimEnd() : line.trimEnd();
    if (text === wanted) return true;
  }
  return false;
}

async function inspectFile(issue, warn, root, repoPath, check, options = {}) {
  let source;
  try {
    source = await readIfPresent(resolve(root, repoPath));
  } catch (error) {
    // Calling it missing, or skipping it, would hide a file that is there.
    issue(`${repoPath}: file could not be read (${error.code}).`);
    return null;
  }
  if (source === null) {
    issue(`${repoPath}: file is missing.`);
    return null;
  }
  const lines = lineCount(source);
  if (check.maxLines !== undefined && lines > check.maxLines) {
    issue(`${repoPath}: ${lines} lines exceeds its ${check.maxLines}-line context budget.`);
  }
  for (const heading of check.requireHeadings ?? []) {
    if (hasHeading(source, heading)) continue;
    const seen = source.includes(heading) ? ' (the text appears, but not as a heading line of that level outside code blocks)' : '';
    issue(`${repoPath}: missing required heading ${JSON.stringify(heading)}${seen}.`);
  }
  for (const reference of check.mustReference ?? []) {
    if (!source.includes(reference)) issue(`${repoPath}: must reference ${JSON.stringify(reference)}.`);
  }

  let parsed = null;
  if (check.frontmatter) {
    parsed = parseFrontmatter(source);
    if (!parsed.present) {
      if (check.frontmatter.required !== false) issue(`${repoPath}: missing YAML frontmatter.`);
    } else {
      checkFrontmatterRules(issue, repoPath, parsed, check.frontmatter.fields);
      if (options.directoryName && check.nameMatchesDirectory) {
        const field = parsed.fields.get(check.nameMatchesDirectory);
        if (field && field.value !== options.directoryName) {
          issue(
            `${repoPath}: frontmatter "${check.nameMatchesDirectory}" is ${JSON.stringify(field.value)} ` +
              `but its directory is ${JSON.stringify(options.directoryName)}.`
          );
        }
      }
      // A warning, not an issue: the agent tool may read the line fine, but a stricter reader will not.
      for (const [name, field] of parsed.fields) {
        if (field.yamlProblem) warn(`${repoPath}: frontmatter "${name}" ${field.yamlProblem}. ${field.advice ?? 'Put the value in quotes.'}`);
      }
      for (const note of parsed.notes ?? []) warn(`${repoPath}: frontmatter ${note}`);
    }
  }
  return { repoPath, lines, parsed };
}

async function runCheck(root, check, loaded) {
  const issues = [];
  const issue = (message) => issues.push(message);
  const warnings = [];
  const warn = (message) => warnings.push(message);
  const inspected = [];

  if (check.path !== undefined) {
    // A file that is there but cannot be read counts as present, so inspectFile reports it.
    const exists = await readIfPresent(resolve(root, check.path)).then((source) => source !== null, () => true);
    if (!exists) {
      if (check.required !== false) issue(`${check.path}: file is missing.`);
      return {
        id: check.id,
        description: check.description,
        issues,
        warnings,
        files: 0,
        lines: 0,
        skipped: issues.length === 0
      };
    }
    const result = await inspectFile(issue, warn, root, check.path, check);
    if (result) inspected.push(result);
  } else {
    const present = await isDirectory(resolve(root, check.dir));
    if (!present) {
      if (check.required === true) issue(`${check.dir}: required directory is missing.`);
      return {
        id: check.id,
        description: check.description,
        issues,
        warnings,
        files: 0,
        lines: 0,
        skipped: issues.length === 0
      };
    }
    const pattern = check.match ?? ALL_FILES;
    const matched = (await walk(root, check.dir, issue)).filter((relative) => matchesGlob(relative, pattern));
    if (check.minCount !== undefined && matched.length < check.minCount) {
      issue(`${check.dir}: found ${matched.length} file(s) matching ${pattern}, below the ${check.minCount} minimum.`);
    }
    if (check.maxCount !== undefined && matched.length > check.maxCount) {
      issue(`${check.dir}: found ${matched.length} file(s) matching ${pattern}, above the ${check.maxCount} maximum.`);
    }
    for (const relative of matched) {
      // The folder the file is in, which is "dir" itself for a file directly inside it.
      const segments = `${check.dir}/${relative}`.split('/').filter((segment) => segment !== '' && segment !== '.');
      const directoryName = segments.length > 1 ? segments[segments.length - 2] : null;
      const result = await inspectFile(issue, warn, root, `${check.dir}/${relative}`, check, { directoryName });
      if (result) inspected.push(result);
    }
    if (check.uniqueBy) {
      const byValue = new Map();
      for (const item of inspected) {
        const value = item.parsed?.fields.get(check.uniqueBy)?.value;
        if (value === undefined || value.length === 0) continue;
        if (byValue.has(value)) {
          issue(
            `${item.repoPath}: duplicate "${check.uniqueBy}" ${JSON.stringify(value)} (also ${byValue.get(value)}).`
          );
        } else byValue.set(value, item.repoPath);
      }
    }
  }

  for (const item of inspected) {
    // Keyed by the real path, so a file reached through a linked folder is still counted once.
    const absolute = resolve(root, item.repoPath);
    loaded.set(await realpath(absolute).catch(() => absolute), item.lines);
  }
  return {
    id: check.id,
    description: check.description,
    issues,
    warnings,
    files: inspected.length,
    lines: inspected.reduce((total, item) => total + item.lines, 0),
    skipped: false
  };
}

/**
 * Run every configured check and return the report. Never calls process.exit.
 *
 * The report carries a `footprint`: how many instruction files exist and how many lines
 * of them an agent would load. That total is the thing a context budget is about, and
 * no other tool reports it.
 */
export async function runAgentAssets({ root = process.cwd(), config, log } = {}) {
  validateConfig(config);
  const resolvedRoot = resolve(root);
  // A missing root matches nothing, so it would pass: a typo in --root must not turn CI green.
  if (!(await isDirectory(resolvedRoot))) throw new Error(`Root is not a folder: ${resolvedRoot}`);
  const emit = log ?? (() => {});
  const results = [];
  const loaded = new Map(); // every file inspected, once, even when several checks look at it
  const width = Math.max(26, ...config.checks.map((check) => check.id.length)); // the columns stay aligned for long ids

  for (const check of config.checks) {
    const started = performance.now();
    const result = await runCheck(resolvedRoot, check, loaded);
    result.durationMs = Math.round(performance.now() - started);
    results.push(result);
    const marker = result.skipped ? 'SKIP' : result.issues.length === 0 ? 'OK' : 'FAIL';
    let summary = result.skipped ? 'not present' : `${result.files} file(s), ${result.lines} lines`;
    // A family that passes on 0 files matched nothing (a matched file it cannot read is an issue),
    // which is usually a wrong "match" or "dir", so the line says so instead of looking like a pass.
    if (marker === 'OK' && check.dir !== undefined && result.files === 0) {
      summary = `0 file(s) - nothing in ${check.dir} matched ${check.match ?? ALL_FILES}`;
    }
    emit(`${marker.padEnd(5)} ${result.id.padEnd(width)} ${summary}`);
    for (const message of result.issues) emit(`      - ${message}`);
    for (const message of result.warnings) emit(`      warning: ${message}`);
  }

  const issues = results.flatMap((result) => result.issues);
  const warnings = results.flatMap((result) => result.warnings);
  const footprint = {
    files: loaded.size,
    lines: [...loaded.values()].reduce((total, lines) => total + lines, 0)
  };
  const warned = warnings.length === 0 ? '' : ` ${issues.length === 0 ? 'with' : 'and'} ${warnings.length} warning(s)`;
  emit(
    `\nAgent assets: ${issues.length === 0 ? 'valid' : `${issues.length} issue(s)`}${warned} ` +
      `across ${footprint.files} instruction file(s) totalling ${footprint.lines} lines.`
  );
  // Every path missing passes, and a wrong --root looks exactly like that.
  if (results.every((result) => result.skipped)) {
    emit(
      results.length === 0
        ? 'Nothing was checked: the config has no checks.'
        : 'Nothing was checked: every check was skipped. Check --root and the paths in the config.'
    );
  }
  return {
    schemaVersion: SCHEMA_VERSION,
    root: resolvedRoot.split(/[\\/]/).join('/'),
    ok: issues.length === 0,
    footprint,
    checks: results
  };
}
