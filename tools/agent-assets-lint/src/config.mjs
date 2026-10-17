/**
 * agent-assets configuration.
 *
 * Every contract is declared here rather than compiled in: which files are canonical,
 * which frontmatter fields each family requires, what the context budgets are. The
 * origin script hard-coded all of it, which is why it could only ever check one repo.
 *
 * The shape is closed - an unknown field is an error, so a typo cannot silently drop a
 * check and leave the report looking clean.
 */
import { readFile } from 'node:fs/promises';

export const SCHEMA_VERSION = 1;

const CHECK_FIELDS = new Set([
  'id',
  'path',
  'dir',
  'match',
  'required',
  'minCount',
  'maxCount',
  'maxLines',
  'requireHeadings',
  'mustReference',
  'frontmatter',
  'nameMatchesDirectory',
  'uniqueBy',
  'description'
]);
const FIELD_RULE_KEYS = new Set(['required', 'pattern', 'minLength', 'maxLength', 'oneOf']);

function fail(message) {
  throw new Error(message);
}

function assertRepoPath(label, path) {
  if (typeof path !== 'string' || path.length === 0) fail(`${label}: path must be a non-empty string.`);
  if (path.includes('\\')) fail(`${label}: "${path}" uses a backslash; use forward-slash repo paths.`);
  if (path.startsWith('/') || /^[A-Za-z]:/.test(path)) fail(`${label}: "${path}" must be repo-relative.`);
  if (path.split('/').includes('..')) fail(`${label}: "${path}" may not contain "..".`);
  if (path.endsWith('/')) fail(`${label}: "${path}" ends in "/"; leave the slash off.`);
}

function validateStringArray(label, key, value) {
  if (!Array.isArray(value) || value.some((item) => typeof item !== 'string' || item.length === 0)) {
    fail(`${label}: "${key}" must be an array of non-empty strings.`);
  }
}

function validateFrontmatter(label, frontmatter) {
  if (typeof frontmatter !== 'object' || frontmatter === null || Array.isArray(frontmatter)) {
    fail(`${label}: "frontmatter" must be an object.`);
  }
  for (const key of Object.keys(frontmatter)) {
    if (key !== 'required' && key !== 'fields') fail(`${label}: unknown frontmatter option "${key}".`);
  }
  if (frontmatter.required !== undefined && typeof frontmatter.required !== 'boolean') {
    fail(`${label}: "frontmatter.required" must be a boolean.`);
  }
  if (frontmatter.fields !== undefined) {
    if (typeof frontmatter.fields !== 'object' || frontmatter.fields === null || Array.isArray(frontmatter.fields)) {
      fail(`${label}: "frontmatter.fields" must be an object of field rules.`);
    }
    for (const [name, rule] of Object.entries(frontmatter.fields)) {
      const where = `${label}.frontmatter.fields.${name}`;
      if (typeof rule !== 'object' || rule === null || Array.isArray(rule)) fail(`${where}: must be an object.`);
      for (const key of Object.keys(rule)) {
        if (!FIELD_RULE_KEYS.has(key)) fail(`${where}: unknown rule "${key}".`);
      }
      if (rule.required !== undefined && typeof rule.required !== 'boolean') {
        fail(`${where}: "required" must be a boolean.`);
      }
      if (rule.pattern !== undefined) {
        if (typeof rule.pattern !== 'string') fail(`${where}: "pattern" must be a string.`);
        try {
          new RegExp(rule.pattern);
        } catch (error) {
          fail(`${where}: "pattern" is not a valid regular expression (${error.message}).`);
        }
      }
      for (const key of ['minLength', 'maxLength']) {
        if (rule[key] !== undefined && (!Number.isInteger(rule[key]) || rule[key] < 0)) {
          fail(`${where}: "${key}" must be a non-negative integer.`);
        }
      }
      if (rule.minLength !== undefined && rule.maxLength !== undefined && rule.minLength > rule.maxLength) {
        fail(`${where}: "minLength" exceeds "maxLength".`);
      }
      if (rule.oneOf !== undefined) validateStringArray(where, 'oneOf', rule.oneOf);
    }
  }
}

export function validateConfig(config) {
  if (typeof config !== 'object' || config === null || !Array.isArray(config.checks)) {
    fail('Config must be an object with a "checks" array.');
  }
  for (const key of Object.keys(config)) {
    if (key !== 'schemaVersion' && key !== 'checks') fail(`Config: unknown top-level field "${key}".`);
  }
  if (config.schemaVersion !== undefined && config.schemaVersion !== SCHEMA_VERSION) {
    fail(`Unsupported schemaVersion ${JSON.stringify(config.schemaVersion)} (expected ${SCHEMA_VERSION}).`);
  }
  const seen = new Set();
  config.checks.forEach((check, position) => {
    const label = check?.id ? `checks.${check.id}` : `checks[${position}]`;
    if (typeof check !== 'object' || check === null) fail(`${label} must be an object.`);
    for (const key of Object.keys(check)) {
      if (!CHECK_FIELDS.has(key)) fail(`${label}: unknown field "${key}".`);
    }
    if (typeof check.id !== 'string' || check.id.length === 0) fail(`${label}: "id" is required.`);
    if (seen.has(check.id)) fail(`${label}: duplicate check id "${check.id}".`);
    seen.add(check.id);

    const isSingle = check.path !== undefined;
    const isFamily = check.dir !== undefined;
    if (isSingle === isFamily) {
      fail(`${check.id}: declare exactly one of "path" (a single file) or "dir" (a family of files).`);
    }
    if (isSingle) {
      assertRepoPath(check.id, check.path);
      for (const key of ['match', 'minCount', 'maxCount', 'nameMatchesDirectory', 'uniqueBy']) {
        if (check[key] !== undefined) fail(`${check.id}: "${key}" applies to a "dir" family, not a single "path".`);
      }
    } else {
      assertRepoPath(check.id, check.dir);
      if (check.match !== undefined && (typeof check.match !== 'string' || check.match.length === 0)) {
        fail(`${check.id}: "match" must be a non-empty glob.`);
      }
      // "match" is tested against forward-slash file paths relative to "dir", so a glob in any of
      // these shapes matches nothing, and the check would pass on 0 files.
      if (check.match !== undefined) {
        const where = `${check.id}: "match" "${check.match}"`;
        if (check.match.includes('\\')) fail(`${where} uses a backslash; use forward slashes.`);
        if (check.match.startsWith('/') || check.match.startsWith('./')) {
          fail(`${where} must be relative to "dir", with no leading "/" or "./".`);
        }
        if (check.match.endsWith('/')) fail(`${where} ends in "/"; it must match files, not folders.`);
        if (check.match.split('/').includes('..')) fail(`${where} may not contain "..".`);
        // A glob that repeats "dir" looks for "dir/dir/...", which is almost never there.
        const folder = check.dir.split('/').filter((segment) => segment !== '' && segment !== '.').join('/');
        if (folder !== '' && check.match.startsWith(`${folder}/`)) {
          fail(`${where} starts with its "dir"; write it relative to "dir", as "${check.match.slice(folder.length + 1)}".`);
        }
      }
      for (const key of ['minCount', 'maxCount']) {
        if (check[key] !== undefined && (!Number.isInteger(check[key]) || check[key] < 0)) {
          fail(`${check.id}: "${key}" must be a non-negative integer.`);
        }
      }
      if (check.minCount !== undefined && check.maxCount !== undefined && check.minCount > check.maxCount) {
        fail(`${check.id}: "minCount" exceeds "maxCount".`);
      }
      if (check.nameMatchesDirectory !== undefined && typeof check.nameMatchesDirectory !== 'string') {
        fail(`${check.id}: "nameMatchesDirectory" must be the frontmatter field name to compare, e.g. "name".`);
      }
      if (check.uniqueBy !== undefined && typeof check.uniqueBy !== 'string') {
        fail(`${check.id}: "uniqueBy" must be a frontmatter field name.`);
      }
      // Both read the parsed frontmatter, which is only read when the check has a "frontmatter"
      // section. Without one they would silently check nothing.
      for (const key of ['nameMatchesDirectory', 'uniqueBy']) {
        if (check[key] !== undefined && check.frontmatter === undefined) {
          fail(`${check.id}: "${key}" reads frontmatter, so the check needs a "frontmatter" section (it can be {}).`);
        }
      }
    }
    if (check.required !== undefined && typeof check.required !== 'boolean') {
      fail(`${check.id}: "required" must be a boolean.`);
    }
    if (check.maxLines !== undefined && (!Number.isInteger(check.maxLines) || check.maxLines <= 0)) {
      fail(`${check.id}: "maxLines" must be a positive integer.`);
    }
    if (check.requireHeadings !== undefined) validateStringArray(check.id, 'requireHeadings', check.requireHeadings);
    if (check.mustReference !== undefined) validateStringArray(check.id, 'mustReference', check.mustReference);
    if (check.description !== undefined && typeof check.description !== 'string') {
      fail(`${check.id}: "description" must be a string.`);
    }
    if (check.frontmatter !== undefined) validateFrontmatter(check.id, check.frontmatter);
  });
  return config;
}

export async function loadConfig(configPath) {
  let source;
  try {
    source = await readFile(configPath, 'utf8');
  } catch {
    fail(`Config file not found: ${configPath}`);
  }
  let config;
  try {
    // Windows PowerShell 5.1 saves UTF-8 with a byte-order mark, which JSON.parse rejects.
    config = JSON.parse(source.replace(/^\uFEFF/, ''));
  } catch (error) {
    fail(`Config file is not valid JSON (${configPath}): ${error.message}`);
  }
  return validateConfig(config);
}
