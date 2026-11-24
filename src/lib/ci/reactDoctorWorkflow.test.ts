import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

const WORKFLOW = readFileSync(
  fileURLToPath(
    new URL('../../../.github/workflows/react-doctor.yml', import.meta.url),
  ),
  'utf8',
);

describe('React Doctor workflow', () => {
  it('installs react-doctor from the lockfile', () => {
    expect(WORKFLOW).toContain('pnpm install --frozen-lockfile');
  });

  it('does not let the action download react-doctor from npm', () => {
    expect(WORKFLOW).not.toMatch(/uses:\s*millionco\/react-doctor@/);
  });

  it('grants the token no write permission', () => {
    expect(WORKFLOW).not.toMatch(/:\s*write\b/);
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
