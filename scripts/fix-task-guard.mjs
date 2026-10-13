import { existsSync, readFileSync } from 'fs';
import { join, resolve } from 'path';
import { fileURLToPath } from 'url';

/**
 * PreToolUse hook for shell tools. While a `/fix-task` run holds its marker,
 * blocks git commands that would commit, publish, or discard the run's working
 * tree, so the run always ends with every change left for the owner to review.
 * With no marker it exits 0 without reading its input.
 */

const ROOT =
  process.env.FIX_TASK_ROOT ?? fileURLToPath(new URL('..', import.meta.url));

export const MARKER = 'doc-temp/fix-task/.running';

const ALWAYS_BLOCKED = new Set(['commit', 'push', 'stash', 'rebase', 'clean']);

const OPTIONS_WITH_VALUE = new Set([
  '-C',
  '-c',
  '--git-dir',
  '--work-tree',
  '--namespace',
]);

const words = segment =>
  (segment.match(/"[^"]*"|'[^']*'|\S+/g) ?? []).map(word =>
    word.replace(/^(["'])(.*)\1$/, '$2'),
  );

const isGit = word => /^git(\.exe)?$/i.test(word.split(/[\\/]/).pop());

const subcommandOf = segmentWords => {
  let i = 0;
  while (i < segmentWords.length && /^\w+=/.test(segmentWords[i])) {
    i++;
  }
  if (!isGit(segmentWords[i] ?? '')) {
    return null;
  }
  i++;
  while (i < segmentWords.length && segmentWords[i].startsWith('-')) {
    i += OPTIONS_WITH_VALUE.has(segmentWords[i]) ? 2 : 1;
  }
  return i < segmentWords.length
    ? { name: segmentWords[i], args: segmentWords.slice(i + 1) }
    : null;
};

const discardsWork = ({ name, args }) => {
  if (ALWAYS_BLOCKED.has(name)) {
    return true;
  }
  switch (name) {
    case 'reset':
      return args.includes('--hard');
    case 'checkout':
      return args.includes('--') || args.includes('.');
    case 'restore':
      return !args.includes('--staged') || args.includes('--worktree');
    default:
      return false;
  }
};

/**
 * The first git subcommand in `command` that a running `/fix-task` must not
 * execute, or null. Every segment between `&&`, `||`, `;`, `|` and newlines is
 * checked. Splitting happens before quotes are read: a quoted `git …` is not a
 * command, but a separator inside quotes can expose one, which then blocks.
 */
export const blockedGitCommand = command => {
  for (const segment of command.split(/&&|\|\||[;|\n]/)) {
    const sub = subcommandOf(words(segment.trim()));
    if (sub && discardsWork(sub)) {
      return `git ${sub.name}`;
    }
  }
  return null;
};

const readPayloadCommand = async () => {
  const chunks = [];
  for await (const chunk of process.stdin) {
    chunks.push(chunk);
  }
  try {
    const command = JSON.parse(chunks.join(''))?.tool_input?.command;
    return typeof command === 'string' ? command : null;
  } catch {
    return null;
  }
};

const runningTask = markerPath => {
  try {
    return JSON.parse(readFileSync(markerPath, 'utf8')).task ?? 'unknown';
  } catch {
    return 'unknown';
  }
};

const main = async () => {
  const markerPath = join(ROOT, MARKER);
  if (!existsSync(markerPath)) {
    return;
  }
  const task = runningTask(markerPath);
  const command = await readPayloadCommand();
  const blocked =
    command === null ? 'an unreadable command' : blockedGitCommand(command);
  if (blocked) {
    console.error(
      `fix-task ${task} is running: ${blocked} is blocked until it ends. ` +
        `Delete ${MARKER} if no run is active.`,
    );
    process.exit(2);
  }
};

if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  main();
}
