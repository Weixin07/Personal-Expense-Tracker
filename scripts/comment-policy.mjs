import { readdirSync, readFileSync, statSync } from 'fs';
import { extname, join, relative, resolve } from 'path';
import { fileURLToPath } from 'url';

/**
 * Mechanical half of the CLAUDE.md comment policy. Catches only the anti-types
 * a machine can see: stock change-narration phrasings, issue-tracker citations,
 * commented-out code, and doc blocks long enough to have left the contract
 * behind. Redundant restatement and decision-defense are invisible here and
 * remain a reading job.
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

export const isCheckable = file => extname(file) in LINE_MARKERS;

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

const SKIP_DIRS = new Set(['node_modules', 'build', '.gradle', '.cxx']);

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
    for (const problem of checkFile(file, readFileSync(file, 'utf8'))) {
      count++;
      console.error(
        `${relative(root, file)}:${problem.line}  ${problem.message}  [${problem.rule}]`,
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
    files = target && isCheckable(target) ? expand([target]) : [];
  } else {
    files = expand(
      targets.length ? targets : ['src', 'scripts', 'android/app/src'],
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
