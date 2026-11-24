import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

const WORKFLOW = readFileSync(
  fileURLToPath(
    new URL('../../../.github/workflows/react-doctor.yml', import.meta.url),
  ),
  'utf8',
);

const WRITE_SCOPE = /^\s*[\w-]+:\s*write\b/gm;

const jobBlock = (jobId: string) => {
  const jobs = WORKFLOW.slice(WORKFLOW.indexOf('\njobs:\n'));
  const block = jobs.match(
    new RegExp(`\\n  ${jobId}:\\n([\\s\\S]*?)(?=\\n  [\\w-]+:\\n|$)`),
  )?.[1];
  if (!block) throw new Error(`No ${jobId} job in react-doctor.yml`);
  return block;
};

const writeScopes = (text: string) =>
  (text.match(WRITE_SCOPE) ?? []).map(scope => scope.trim()).sort();

describe('React Doctor workflow', () => {
  it('installs react-doctor from the lockfile', () => {
    expect(WORKFLOW).toContain('pnpm install --frozen-lockfile');
  });

  it('does not let the action download react-doctor from npm', () => {
    expect(WORKFLOW).not.toMatch(/uses:\s*millionco\/react-doctor@/);
  });

  it('grants nothing at the workflow level', () => {
    expect(WORKFLOW).toMatch(/^permissions: \{\}$/m);
  });

  it('scans with a read-only token', () => {
    const analyze = jobBlock('analyze');
    expect(analyze).toContain('pnpm react-doctor');
    expect(analyze).toMatch(/permissions:\n\s+contents: read\n/);
    expect(writeScopes(analyze)).toEqual([]);
  });

  it('keeps the write scopes on the reporting job only', () => {
    expect(writeScopes(jobBlock('report'))).toEqual([
      'pull-requests: write',
      'statuses: write',
    ]);
    expect(writeScopes(WORKFLOW)).toEqual(writeScopes(jobBlock('report')));
  });

  it('never checks out or runs project code in the reporting job', () => {
    const report = jobBlock('report');
    expect(report).not.toContain('actions/checkout');
    expect(report).not.toMatch(/\bpnpm\b|\bnode\b/);
  });

  it('skips the reporting job for fork pull requests', () => {
    expect(jobBlock('report')).toContain(
      'github.event.pull_request.head.repo.full_name == github.repository',
    );
  });

  it('pins every action to a full commit SHA', () => {
    const actions = [...WORKFLOW.matchAll(/^\s*(?:- )?uses:\s*(\S+)/gm)].map(
      ([, action]) => action,
    );
    expect(actions.length).toBeGreaterThan(0);
    for (const action of actions) {
      expect(action).toMatch(/@[0-9a-f]{40}$/);
    }
  });
});
