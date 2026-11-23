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
});
