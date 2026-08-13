import type { CategoryRecord } from '../database';

/**
 * Case, spacing and punctuation all differ between an exported category name and
 * the same name typed into the app, without meaning a different category.
 */
const foldName = (value: string): string =>
  value.toLowerCase().replace(/[^a-z0-9]/g, '');

/**
 * How much longer the fuller spelling of a name may run before a shared prefix
 * stops being evidence of the same category. Sized to admit an inflected or
 * expanded form (`Transport` → `Transportation`) and little else.
 */
const MAX_PREFIX_GAP = 6;

/**
 * Shortest prefix that carries enough meaning to match on. Below this a prefix
 * is a coincidence: `Car` opens `Career` without naming the same thing.
 */
const MIN_PREFIX_LENGTH = 4;

const MAX_EDIT_DISTANCE = 2;

/**
 * Shortest name a small edit distance may be trusted on. Two edits separate a
 * quarter of a four-letter word, which is why `Fees` and `Feed` must not match.
 */
const MIN_EDIT_DISTANCE_LENGTH = 5;

const editDistance = (a: string, b: string): number => {
  let previous = Array.from({ length: b.length + 1 }, (_, index) => index);

  for (let row = 1; row <= a.length; row += 1) {
    const current = [row];
    for (let column = 1; column <= b.length; column += 1) {
      const substitution =
        previous[column - 1] + (a[row - 1] === b[column - 1] ? 0 : 1);
      current[column] = Math.min(
        previous[column] + 1,
        current[column - 1] + 1,
        substitution,
      );
    }
    previous = current;
  }

  return previous[b.length];
};

/**
 * Whether two category names are close enough to be one category spelled two
 * ways. Deliberately conservative: a missed match costs a duplicate category the
 * user can merge by hand, while a false match, once accepted, files transactions
 * under a category that was never theirs. Identical names return false — they
 * need no suggestion, since the importer already reuses an exact match.
 */
export const areNamesNearDuplicates = (a: string, b: string): boolean => {
  const left = foldName(a);
  const right = foldName(b);
  if (!left || !right || left === right) {
    return false;
  }

  const [shorter, longer] =
    left.length <= right.length ? [left, right] : [right, left];

  if (
    shorter.length >= MIN_PREFIX_LENGTH &&
    longer.startsWith(shorter) &&
    longer.length - shorter.length <= MAX_PREFIX_GAP
  ) {
    return true;
  }

  return (
    shorter.length >= MIN_EDIT_DISTANCE_LENGTH &&
    editDistance(left, right) <= MAX_EDIT_DISTANCE
  );
};

/**
 * The first existing category an incoming name may be a respelling of, or null
 * when none is close enough.
 */
export const findNearDuplicateCategory = (
  name: string,
  existing: readonly CategoryRecord[],
): CategoryRecord | null =>
  existing.find(category => areNamesNearDuplicates(name, category.name)) ??
  null;
