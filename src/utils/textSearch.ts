/**
 * The character bound to SQLite's `ESCAPE` clause. Any statement binding a
 * pattern from `escapeLikePattern` must emit `ESCAPE '<this>'`, or the escape
 * characters are matched literally instead of neutralising the wildcard.
 */
export const LIKE_ESCAPE_CHARACTER = '\\';

/**
 * Wraps `term` as a SQLite `LIKE` pattern matching it anywhere in a value, with
 * `%` and `_` neutralised so they match literally. The result is a bound
 * parameter, never interpolated into SQL.
 *
 * `term` is matched literally: the caller supplies an already-trimmed value.
 */
export const escapeLikePattern = (term: string): string => {
  // The escape character is escaped first. Doing it after `%` and `_` would
  // escape the escapes this function just added, and `50%` would match nothing.
  const escaped = term
    .split(LIKE_ESCAPE_CHARACTER)
    .join(LIKE_ESCAPE_CHARACTER + LIKE_ESCAPE_CHARACTER)
    .split('%')
    .join(`${LIKE_ESCAPE_CHARACTER}%`)
    .split('_')
    .join(`${LIKE_ESCAPE_CHARACTER}_`);
  return `%${escaped}%`;
};

const UPPERCASE_A = 'A'.charCodeAt(0);
const UPPERCASE_Z = 'Z'.charCodeAt(0);
const LOWERCASE_OFFSET = 'a'.charCodeAt(0) - UPPERCASE_A;

/**
 * Folds A–Z only, matching what SQLite's `LIKE` does. `toLowerCase` would fold
 * accented and non-Latin letters too, so a value SQLite treats as unequal would
 * match here — and `matchesQuery` must return the rows `listTransactions`
 * returns for the same term.
 */
const foldAscii = (value: string): string => {
  let folded = '';
  let copiedTo = 0;
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index);
    if (code >= UPPERCASE_A && code <= UPPERCASE_Z) {
      folded +=
        value.slice(copiedTo, index) +
        String.fromCharCode(code + LOWERCASE_OFFSET);
      copiedTo = index + 1;
    }
  }
  return copiedTo === 0 ? value : folded + value.slice(copiedTo);
};

/**
 * True when `term` appears in any of `haystacks`, compared case-insensitively
 * across ASCII letters only. A null haystack never matches, so a column that
 * holds no value is skipped rather than excluding the row.
 *
 * `term` is matched literally, including any whitespace it contains: the caller
 * supplies an already-trimmed value.
 */
export const matchesQuery = (
  haystacks: readonly (string | null)[],
  term: string,
): boolean => {
  const needle = foldAscii(term);
  return haystacks.some(
    haystack => haystack !== null && foldAscii(haystack).includes(needle),
  );
};
