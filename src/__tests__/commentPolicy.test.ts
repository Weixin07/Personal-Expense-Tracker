import { execFileSync, spawnSync } from 'child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join, parse } from 'path';
import { pathToFileURL } from 'url';

/**
 * Runs the comment-policy checker over the tree the way CI does. The rules
 * themselves live in scripts/comment-policy.mjs, which the edit-time hook and
 * eslint also consume; this test is the gate that keeps a violation from
 * reaching a commit if the hook was bypassed.
 */
const REPO_ROOT = join(__dirname, '..', '..');
const CHECKER = join(REPO_ROOT, 'scripts', 'comment-policy.mjs');
const FIXTURE_TS = join(__dirname, 'fixtures', 'violations.fixture.ts');
const FIXTURE_PATCH = join(__dirname, 'fixtures', 'violations.fixture.patch');

const run = (
  args: string[],
  input?: string,
): { status: number; output: string } => {
  try {
    execFileSync('node', [CHECKER, ...args], {
      cwd: REPO_ROOT,
      encoding: 'utf8',
      stdio: 'pipe',
      input,
    });
    return { status: 0, output: '' };
  } catch (error) {
    const failure = error as { status: number; stderr: string };
    return { status: failure.status, output: failure.stderr };
  }
};

const hookRun = (filePath: string) =>
  run(['--hook'], JSON.stringify({ tool_input: { file_path: filePath } }));

const isHookTarget = (files: string[]): boolean[] =>
  JSON.parse(
    execFileSync(
      'node',
      [
        '--input-type=module',
        '-e',
        `import { isHookTarget } from '${pathToFileURL(CHECKER).href}';
         const files = JSON.parse(process.argv[2]);
         console.log(JSON.stringify(files.map(f => isHookTarget(f, process.argv[1]))));`,
        REPO_ROOT,
        JSON.stringify(files),
      ],
      { encoding: 'utf8' },
    ),
  );

type HookSettings = {
  hooks: {
    PostToolUse: { matcher: string; hooks: { command: string }[] }[];
  };
};

const editHookCommand = (): string => {
  const settings: HookSettings = JSON.parse(
    readFileSync(join(REPO_ROOT, '.claude', 'settings.json'), 'utf8'),
  );
  const entry = settings.hooks.PostToolUse.find(({ matcher }) =>
    matcher.split('|').includes('Edit'),
  );
  if (!entry) {
    throw new Error('no PostToolUse hook matches Edit');
  }
  return entry.hooks[0].command;
};

const posixShell = (): string => {
  if (process.platform !== 'win32') {
    return 'sh';
  }
  if (process.env.CLAUDE_CODE_GIT_BASH_PATH) {
    return process.env.CLAUDE_CODE_GIT_BASH_PATH;
  }
  const gitCore = execFileSync('git', ['--exec-path'], {
    encoding: 'utf8',
  }).trim();
  return join(gitCore, '..', '..', '..', 'bin', 'bash.exe');
};

const findings = (output: string) =>
  output
    .split('\n')
    .map(line => line.match(/:(\d+) {2}.*\[([\w-]+)\]/))
    .filter((match): match is RegExpMatchArray => match !== null)
    .map(([, line, rule]) => `${line} ${rule}`);

describe('comment policy', () => {
  let scratch: string;

  beforeEach(() => {
    scratch = mkdtempSync(join(tmpdir(), 'comment-policy-'));
  });

  afterEach(() => {
    rmSync(scratch, { recursive: true, force: true });
  });

  it('passes over the whole tree', () => {
    const { status, output } = run([]);

    expect(output).toBe('');
    expect(status).toBe(0);
  });

  it('flags an issue-tracker citation', () => {
    const { output } = run([FIXTURE_TS]);

    expect(output).toContain('issue-id');
  });

  it('flags change narration and commented-out code', () => {
    const { output } = run([FIXTURE_TS]);

    expect(output).toContain('change-narration');
    expect(output).toContain('commented-out-code');
  });

  it('leaves durable prose alone', () => {
    const { output } = run([FIXTURE_TS]);

    expect(output).not.toContain('fixture.ts:1 ');
  });

  describe('edit hook', () => {
    it('lets a hook edit outside the repo pass silently', () => {
      const outside = join(scratch, 'violations.ts');
      writeFileSync(outside, readFileSync(FIXTURE_TS, 'utf8'));

      expect(hookRun(outside)).toEqual({ status: 0, output: '' });
    });

    it('still blocks a hook edit inside the repo', () => {
      const { status, output } = hookRun(FIXTURE_TS);

      expect(status).toBe(2);
      expect(output).toContain('issue-id');
    });

    const HOOK_TARGET_CASES: [string, boolean][] = [
      ['src/a.ts', true],
      ['patches/a.patch', true],
      ['src/a.md', false],
      ['../x.ts', false],
      ['node_modules/.pnpm_patches/p/a.js', false],
      ['android/app/build/x.kt', false],
    ];
    let verdicts: Record<string, boolean>;

    beforeAll(() => {
      const files = HOOK_TARGET_CASES.map(([file]) => file);
      const results = isHookTarget(
        files.map(file => join(REPO_ROOT, ...file.split('/'))),
      );
      verdicts = Object.fromEntries(
        files.map((file, index) => [file, results[index]]),
      );
    });

    it.each(HOOK_TARGET_CASES)(
      'treats %s as a hook target: %s',
      (file, expected) => {
        expect(verdicts[file]).toBe(expected);
      },
    );

    it('runs the configured edit hook from a subdirectory', () => {
      const { status, stderr, error } = spawnSync(
        posixShell(),
        ['-c', editHookCommand()],
        {
          cwd: join(REPO_ROOT, 'src'),
          env: { ...process.env, CLAUDE_PROJECT_DIR: REPO_ROOT },
          input: JSON.stringify({ tool_input: { file_path: FIXTURE_TS } }),
          encoding: 'utf8',
        },
      );

      expect(error).toBeUndefined();
      expect(status).toBe(2);
      expect(stderr).toContain('issue-id');
    });

    (process.platform === 'win32' ? it : it.skip)(
      'skips a file on another drive',
      () => {
        const drive = parse(REPO_ROOT).root.startsWith('Z') ? 'Y:\\' : 'Z:\\';

        expect(isHookTarget([`${drive}a.ts`])).toEqual([false]);
      },
    );
  });

  describe('patches', () => {
    it('reports a violating line a patch adds, at its patch line', () => {
      const { status, output } = run([FIXTURE_PATCH]);

      expect(status).toBe(1);
      expect(output).toContain('violations.fixture.patch:7 ');
      expect(output).toContain('(in sample.ts)');
      expect(findings(output)).toContain('7 issue-id');
    });

    it("leaves a patch's context lines alone", () => {
      const { output } = run([FIXTURE_PATCH]);

      expect(findings(output)).toHaveLength(4);
      expect(output).not.toContain('fixture.patch:8 ');
    });

    it('reads a comment block that opens on a context line', () => {
      const { output } = run([FIXTURE_PATCH]);

      expect(findings(output)).toContain('14 issue-id');
    });

    it('reports a doc block a patch grows past the limit', () => {
      const { output } = run([FIXTURE_PATCH]);

      expect(findings(output)).toContain('30 doc-block-length');
    });

    it('reads an added line inside a block opened above its hunk', () => {
      const { output } = run([FIXTURE_PATCH]);

      expect(findings(output)).toContain('40 issue-id');
    });

    it('leaves code after a block opened above its hunk alone', () => {
      const { output } = run([FIXTURE_PATCH]);

      expect(output).not.toContain('fixture.patch:44 ');
      expect(output).not.toContain('fixture.patch:49 ');
    });

    it('skips patch sections for files without comment rules', () => {
      const { output } = run([FIXTURE_PATCH]);

      expect(output).not.toContain('"PET-1"');
      expect(findings(output)).toHaveLength(4);
    });

    it('parses a CRLF patch the same as LF', () => {
      const lf = readFileSync(FIXTURE_PATCH, 'utf8').replace(/\r\n/g, '\n');
      const crlf = join(scratch, 'crlf.patch');
      writeFileSync(crlf, lf.replace(/\n/g, '\r\n'));

      expect(findings(run([crlf]).output)).toEqual(
        findings(run([FIXTURE_PATCH]).output),
      );
      expect(findings(run([crlf]).output)).toEqual([
        '7 issue-id',
        '14 issue-id',
        '30 doc-block-length',
        '40 issue-id',
      ]);
    });
  });
});
