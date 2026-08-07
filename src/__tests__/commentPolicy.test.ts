import { execFileSync } from 'child_process';
import { join } from 'path';

/**
 * Runs the comment-policy checker over the tree the way CI does. The rules
 * themselves live in scripts/comment-policy.mjs, which the edit-time hook and
 * eslint also consume; this test is the gate that keeps a violation from
 * reaching a commit if the hook was bypassed.
 */
const REPO_ROOT = join(__dirname, '..', '..');
const CHECKER = join(REPO_ROOT, 'scripts', 'comment-policy.mjs');

const run = (args: string[]): { status: number; output: string } => {
  try {
    execFileSync('node', [CHECKER, ...args], {
      cwd: REPO_ROOT,
      encoding: 'utf8',
      stdio: 'pipe',
    });
    return { status: 0, output: '' };
  } catch (error) {
    const failure = error as { status: number; stderr: string };
    return { status: failure.status, output: failure.stderr };
  }
};

describe('comment policy', () => {
  it('passes over the whole tree', () => {
    const { status, output } = run([]);

    expect(output).toBe('');
    expect(status).toBe(0);
  });

  it('flags an issue-tracker citation', () => {
    const { output } = run([
      join(__dirname, 'fixtures', 'violations.fixture.ts'),
    ]);

    expect(output).toContain('issue-id');
  });

  it('flags change narration and commented-out code', () => {
    const { output } = run([
      join(__dirname, 'fixtures', 'violations.fixture.ts'),
    ]);

    expect(output).toContain('change-narration');
    expect(output).toContain('commented-out-code');
  });

  it('leaves durable prose alone', () => {
    const { output } = run([
      join(__dirname, 'fixtures', 'violations.fixture.ts'),
    ]);

    expect(output).not.toContain('fixture.ts:1 ');
  });
});
