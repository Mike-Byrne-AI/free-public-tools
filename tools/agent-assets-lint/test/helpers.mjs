import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { runAgentAssets } from '../src/checker.mjs';

export async function makeRepo(files) {
  const dir = await mkdtemp(join(tmpdir(), 'agent-assets-test-'));
  for (const [path, contents] of Object.entries(files)) {
    const target = join(dir, ...path.split('/'));
    await mkdir(dirname(target), { recursive: true });
    await writeFile(target, contents, 'utf8');
  }
  return dir;
}

export async function cleanup(dir) {
  await rm(dir, { recursive: true, force: true, maxRetries: 3 });
}

/** Run one check against a throwaway repo and return its issue list. */
export async function issuesFor(files, check) {
  const root = await makeRepo(files);
  try {
    const report = await runAgentAssets({ root, config: { checks: [check] } });
    return { issues: report.checks[0].issues, report };
  } finally {
    await cleanup(root);
  }
}

export const skill = (name, description, body = 'Body text.') =>
  `---\nname: ${name}\ndescription: ${description}\n---\n\n${body}\n`;
