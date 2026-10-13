import { execFileSync, spawnSync } from 'child_process';
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'fs';
import { tmpdir } from 'os';
import { dirname, join } from 'path';
import { pathToFileURL } from 'url';

import { posixShell } from './test-utils/posixShell';

const REPO_ROOT = join(__dirname, '..', '..');
const GUARD = join(REPO_ROOT, 'scripts', 'fix-task-guard.mjs');
const MARKER = join('doc-temp', 'fix-task', '.running');

const BLOCKED: [string, string][] = [
  ['git commit -m x', 'git commit'],
  ['git -C . commit', 'git commit'],
  ['git -c core.editor=true commit --amend', 'git commit'],
  ['pnpm validate && git push', 'git push'],
  ['git status; git stash', 'git stash'],
  ['git reset --hard HEAD', 'git reset'],
  ['git checkout -- README.md', 'git checkout'],
  ['git checkout .', 'git checkout'],
  ['git restore README.md', 'git restore'],
  ['git clean -fd', 'git clean'],
  ['git rebase main', 'git rebase'],
  ['GIT_EDITOR=true git commit', 'git commit'],
  ['git commit -m "fix; thing"', 'git commit'],
];

const ALLOWED = [
  'git status --porcelain',
  'git diff --stat',
  'git log -20 --format="%h|%s"',
  'git show --stat e4761f1',
  'git merge-base --is-ancestor e4761f1 HEAD',
  'git restore --staged README.md',
  'git reset README.md',
  'git checkout main',
  'echo "git commit"',
  'echo git commit',
  'pnpm validate',
];

const verdictsOf = (commands: string[]): (string | null)[] =>
  JSON.parse(
    execFileSync(
      'node',
      [
        '--input-type=module',
        '-e',
        `import { blockedGitCommand } from '${pathToFileURL(GUARD).href}';
         console.log(JSON.stringify(JSON.parse(process.argv[1]).map(blockedGitCommand)));`,
        JSON.stringify(commands),
      ],
      { encoding: 'utf8' },
    ),
  );

type HookSettings = {
  hooks: {
    PreToolUse: { matcher: string; hooks: { command: string }[] }[];
  };
};

const shellHookCommand = (): string => {
  const settings: HookSettings = JSON.parse(
    readFileSync(join(REPO_ROOT, '.claude', 'settings.json'), 'utf8'),
  );
  const entry = settings.hooks.PreToolUse.find(({ matcher }) =>
    matcher.split('|').includes('Bash'),
  );
  if (!entry) {
    throw new Error('no PreToolUse hook matches Bash');
  }
  return entry.hooks[0].command;
};

describe('fix-task guard', () => {
  describe('blockedGitCommand', () => {
    const blocked = verdictsOf(BLOCKED.map(([command]) => command));
    const allowed = verdictsOf(ALLOWED);

    it.each(BLOCKED.map(([command, name], i) => [command, name, i] as const))(
      'blocks %s as %s',
      (_command, name, i) => {
        expect(blocked[i]).toBe(name);
      },
    );

    it.each(ALLOWED.map((command, i) => [command, i] as const))(
      'allows %s',
      (_command, i) => {
        expect(allowed[i]).toBeNull();
      },
    );
  });

  describe('as a hook', () => {
    let root: string;

    const hookRun = (input: string) =>
      spawnSync('node', [GUARD], {
        env: { ...process.env, FIX_TASK_ROOT: root },
        input,
        encoding: 'utf8',
      });

    const payload = (command: string) =>
      JSON.stringify({ tool_input: { command } });

    const startRun = (contents = JSON.stringify({ task: 'FIX-28' })) => {
      mkdirSync(dirname(join(root, MARKER)), { recursive: true });
      writeFileSync(join(root, MARKER), contents);
    };

    beforeEach(() => {
      root = mkdtempSync(join(tmpdir(), 'fix-task-guard-'));
    });

    afterEach(() => {
      rmSync(root, { recursive: true, force: true });
    });

    it('allows a commit when no run is active', () => {
      expect(hookRun(payload('git commit -m x')).status).toBe(0);
    });

    it('blocks a commit during a run and names the task', () => {
      startRun();

      const { status, stderr } = hookRun(payload('git commit -m x'));

      expect(status).toBe(2);
      expect(stderr).toContain('fix-task FIX-28 is running: git commit');
    });

    it('allows a read-only git command during a run', () => {
      startRun();

      expect(hookRun(payload('git status')).status).toBe(0);
    });

    it('blocks an unreadable payload during a run', () => {
      startRun();

      const { status, stderr } = hookRun('not json');

      expect(status).toBe(2);
      expect(stderr).toContain('an unreadable command');
    });

    it('still blocks when the marker itself is unreadable', () => {
      startRun('not json');

      const { status, stderr } = hookRun(payload('git push'));

      expect(status).toBe(2);
      expect(stderr).toContain('fix-task unknown is running: git push');
    });

    it('runs the configured shell hook from a subdirectory', () => {
      startRun();

      const { status, stderr, error } = spawnSync(
        posixShell(),
        ['-c', shellHookCommand()],
        {
          cwd: join(REPO_ROOT, 'src'),
          env: {
            ...process.env,
            CLAUDE_PROJECT_DIR: REPO_ROOT,
            FIX_TASK_ROOT: root,
          },
          input: payload('git commit -m x'),
          encoding: 'utf8',
        },
      );

      expect(error).toBeUndefined();
      expect(status).toBe(2);
      expect(stderr).toContain('git commit');
    });
  });
});
