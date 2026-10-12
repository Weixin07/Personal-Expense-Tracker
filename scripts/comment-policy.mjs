import { readdirSync, readFileSync, statSync } from 'fs';
import { extname, isAbsolute, join, relative, resolve, sep } from 'path';
import { fileURLToPath } from 'url';

/**
 * Mechanical half of the CLAUDE.md comment policy. Catches only the anti-types
 * a machine can see: stock change-narration phrasings, issue-tracker citations,
 * commented-out code, and doc blocks long enough to have left the contract
 * behind. Redundant restatement and decision-defense are invisible here and
 * remain a reading job. A `.patch` is checked on the lines it adds, under its
 * target file's rules, one hunk at a time, so a doc block is measured only as
 * far as its hunk shows it.
 *
 * Consumed three ways, so the rules exist once: the edit-time hook, the
 * `comment-policy` npm script, and `no-warning-comments` in eslint.config.mjs,
 * which imports NARRATION_TERMS below.
 */

/**
 * Phrases that mark a comment as narrating a change rather than describing the
 * code. Every entry is verified absent from legitimate comments in this tree —
 * single words like "previously" or "no longer" occur in durable prose and
 * cannot be used here.
 */
export const NARRATION_TERMS = [
  'originally',
  'used to be',
  'was previously',
  'no longer needed',
  'before this change',
  'prior to this',
  'the original defect',
  'as requested',
  'per the plan',
  'we decided',
  'this commit',
  'this pr',
  'this change',
  'renamed from',
  'removed the old',
];

/**
 * A doc block longer than this has left the unit's boundary and started
 * narrating its internals. Cut it back, or split the unit it documents.
 */
const MAX_DOC_BLOCK_LINES = 14;

/** Acronyms sharing the shape of a ticket reference. */
const STANDARD_PREFIXES = new Set([
  'ISO',
  'RFC',
  'UTF',
  'SHA',
  'AES',
  'MD',
  'HTTP',
  'HTTPS',
  'SQLITE',
  'UTC',
  'BCP',
  'API',
  'SAF',
]);

const TICKET_PATTERN = /\b([A-Z]{2,})-\d+\b/g;

/**
 * Lines that read as code rather than prose once the comment marker is removed.
 * Deliberately narrow: a trailing `;`, a lone brace, or a statement keyword
 * followed by something. Prose ending in a period never matches.
 */
const COMMENTED_OUT_CODE =
  /^\s*(?:(?:const|let|var|function|class|import|export|return|await|if|for|while|switch)\b.*[;{)]|[\w.$\]]+\s*(?:=|\()[^;]*;|[})\];]+)\s*$/;

const LINE_MARKERS = {
  '.ts': ['//'],
  '.tsx': ['//'],
  '.js': ['//'],
  '.jsx': ['//'],
  '.mjs': ['//'],
  '.cjs': ['//'],
  '.kt': ['//'],
  '.java': ['//'],
  '.gradle': ['//'],
  '.sql': ['--'],
  '.sh': ['#'],
  '.yml': ['#'],
  '.yaml': ['#'],
  '.properties': ['#'],
  '.pro': ['#'],
};

const BLOCK_LANGUAGES = new Set([
  '.ts',
  '.tsx',
  '.js',
  '.jsx',
  '.mjs',
  '.cjs',
  '.kt',
  '.java',
  '.gradle',
]);

const hasCommentRules = file => extname(file) in LINE_MARKERS;

export const isCheckable = file =>
  extname(file) === '.patch' || hasCommentRules(file);

/**
 * Comment lines of a file, each carrying the prose with its marker stripped.
 * A `//` inside a string literal is not distinguished; the cost is a rare false
 * positive, which is preferable to carrying a parser per language.
 */
const commentLines = (file, text) => {
  const ext = extname(file);
  const markers = LINE_MARKERS[ext] ?? [];
  const supportsBlocks = BLOCK_LANGUAGES.has(ext);
  const found = [];
  let inBlock = false;

  text.split('\n').forEach((raw, index) => {
    const line = raw.trim();
    if (inBlock) {
      found.push({ line: index + 1, text: line.replace(/^\*+\s?/, '') });
      if (line.includes('*/')) {
        inBlock = false;
      }
      return;
    }
    if (supportsBlocks && line.startsWith('/*')) {
      found.push({ line: index + 1, text: line.replace(/^\/\*+\s?/, '') });
      inBlock = !line.includes('*/');
      return;
    }
    const marker = markers.find(m => line.startsWith(m));
    if (marker) {
      found.push({ line: index + 1, text: line.slice(marker.length).trim() });
    }
  });

  return found;
};

const docBlocks = (text, supportsBlocks) => {
  if (!supportsBlocks) {
    return [];
  }
  const blocks = [];
  let start = -1;
  text.split('\n').forEach((line, index) => {
    if (start === -1 && /^\s*\/\*\*/.test(line)) {
      start = index;
    }
    if (start !== -1 && line.includes('*/')) {
      blocks.push({ line: start + 1, length: index - start + 1 });
      start = -1;
    }
  });
  return blocks;
};

/** Policy violations in one file, as `{ line, rule, message }`. */
export const checkFile = (file, text) => {
  const problems = [];

  for (const block of docBlocks(text, BLOCK_LANGUAGES.has(extname(file)))) {
    if (block.length > MAX_DOC_BLOCK_LINES) {
      problems.push({
        line: block.line,
        rule: 'doc-block-length',
        message: `doc block is ${block.length} lines (max ${MAX_DOC_BLOCK_LINES}); cut it to the contract or split the unit`,
      });
    }
  }

  for (const { line, text: content } of commentLines(file, text)) {
    const lowered = content.toLowerCase();

    for (const term of NARRATION_TERMS) {
      if (lowered.includes(term)) {
        problems.push({
          line,
          rule: 'change-narration',
          message: `"${term}" narrates a change rather than describing the code (DENY 3/6)`,
        });
      }
    }

    for (const match of content.matchAll(TICKET_PATTERN)) {
      if (!STANDARD_PREFIXES.has(match[1])) {
        problems.push({
          line,
          rule: 'issue-id',
          message: `"${match[0]}" cites an issue tracker (DENY 1)`,
        });
      }
    }

    if (COMMENTED_OUT_CODE.test(content)) {
      problems.push({
        line,
        rule: 'commented-out-code',
        message: 'commented-out code (DENY 5)',
      });
    }
  }

  return problems;
};

/**
 * Hunks of a unified diff, each as its post-image lines tagged with their line
 * in the diff and whether the diff adds them. Hunks of a deleted file, or of a
 * file without comment rules, are left out.
 */
const patchHunks = text => {
  const hunks = [];
  let target = null;
  let hunk = null;

  text.split(/\r?\n/).forEach((raw, index) => {
    if (raw.startsWith('diff --git ')) {
      target = null;
      hunk = null;
    } else if (raw.startsWith('+++ ')) {
      const path = raw.slice(4).trim();
      target = path.startsWith('b/') ? path.slice(2) : null;
      hunk = null;
    } else if (raw.startsWith('@@')) {
      hunk = target && hasCommentRules(target) ? { target, lines: [] } : null;
      if (hunk) {
        hunks.push(hunk);
      }
    } else if (hunk && (raw.startsWith(' ') || raw.startsWith('+'))) {
      hunk.lines.push({
        text: raw.slice(1),
        patchLine: index + 1,
        added: raw.startsWith('+'),
      });
    }
  });

  return hunks;
};

const BLOCK_CONTINUATION = /^\*(?:\s|\/|$)/;

const opensInsideBlock = lines => {
  for (const { text } of lines) {
    const line = text.trim();
    if (line.startsWith('/*')) {
      return false;
    }
    if (BLOCK_CONTINUATION.test(line)) {
      return true;
    }
  }
  return false;
};

/**
 * The added line a problem belongs to, or undefined when it lies wholly on
 * context lines. A doc block belongs to its first added line.
 */
const addedLineOf = (problem, lines) => {
  const start = problem.line - 1;
  if (problem.rule !== 'doc-block-length') {
    return lines[start].added ? lines[start] : undefined;
  }
  const end = start + lines.slice(start).findIndex(l => l.text.includes('*/'));
  return lines.slice(start, end + 1).find(l => l.added);
};

/**
 * Policy violations on the lines a unified diff adds, under each target file's
 * rules, as `{ line, rule, message, target }` with `line` counted in the diff.
 */
export const checkPatch = text =>
  patchHunks(text).flatMap(({ target, lines: hunkLines }) => {
    const lines =
      BLOCK_LANGUAGES.has(extname(target)) && opensInsideBlock(hunkLines)
        ? [{ text: '/*', added: false }, ...hunkLines]
        : hunkLines;
    return checkFile(target, lines.map(l => l.text).join('\n')).flatMap(
      problem => {
        const at = addedLineOf(problem, lines);
        return at ? [{ ...problem, line: at.patchLine, target }] : [];
      },
    );
  });

const REPO_ROOT = fileURLToPath(new URL('..', import.meta.url));

const SKIP_DIRS = new Set(['node_modules', 'build', '.gradle', '.cxx']);

/**
 * Whether the edit hook checks `file`: a checkable file inside `root` and
 * outside every directory under the rule on `SKIP_DIRS`.
 */
export const isHookTarget = (file, root) => {
  const rel = relative(root, resolve(file));
  if (!rel || rel === '..' || rel.startsWith(`..${sep}`) || isAbsolute(rel)) {
    return false;
  }
  return (
    !rel.split(sep).some(segment => SKIP_DIRS.has(segment)) && isCheckable(file)
  );
};

const walk = dir =>
  readdirSync(dir, { withFileTypes: true }).flatMap(entry => {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      return SKIP_DIRS.has(entry.name) ? [] : walk(full);
    }
    // Fixtures hold deliberate violations for the policy's own tests, which
    // pass them as explicit targets.
    if (entry.name.includes('.fixture.')) {
      return [];
    }
    return isCheckable(full) ? [full] : [];
  });

const expand = targets =>
  targets.flatMap(target => {
    const full = resolve(target);
    if (!statSync(full, { throwIfNoEntry: false })) {
      return [];
    }
    return statSync(full).isDirectory()
      ? walk(full)
      : isCheckable(full)
        ? [full]
        : [];
  });

/**
 * Reads the hook payload from stdin and returns the edited file path, or null
 * when the payload names no file. Exits 2 on a violation so the message reaches
 * the agent that made the edit.
 */
const readHookTarget = async () => {
  const chunks = [];
  for await (const chunk of process.stdin) {
    chunks.push(chunk);
  }
  try {
    const payload = JSON.parse(chunks.join('') || '{}');
    return payload?.tool_input?.file_path ?? null;
  } catch {
    return null;
  }
};

const report = files => {
  const root = process.cwd();
  let count = 0;

  for (const file of files) {
    const text = readFileSync(file, 'utf8');
    const problems =
      extname(file) === '.patch' ? checkPatch(text) : checkFile(file, text);
    for (const problem of problems) {
      count++;
      const where = problem.target ? ` (in ${problem.target})` : '';
      console.error(
        `${relative(root, file)}:${problem.line}  ${problem.message}${where}  [${problem.rule}]`,
      );
    }
  }

  return count;
};

const main = async () => {
  const args = process.argv.slice(2);
  const hookMode = args.includes('--hook');
  const targets = args.filter(arg => arg !== '--hook');

  let files;
  if (hookMode) {
    const target = await readHookTarget();
    files = target && isHookTarget(target, REPO_ROOT) ? expand([target]) : [];
  } else {
    files = expand(
      targets.length
        ? targets
        : ['src', 'scripts', 'android/app/src', 'patches'],
    );
  }

  const count = report(files);
  if (count > 0) {
    console.error(
      `\n${count} comment-policy violation${count === 1 ? '' : 's'}. See CLAUDE.md.`,
    );
    process.exit(hookMode ? 2 : 1);
  }
};

// eslint.config.mjs imports NARRATION_TERMS from here, so the CLI must not run
// on import.
if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  main();
}
