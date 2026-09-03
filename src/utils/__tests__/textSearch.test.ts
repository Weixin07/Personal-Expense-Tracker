import {
  LIKE_ESCAPE_CHARACTER,
  escapeLikePattern,
  matchesQuery,
} from '../textSearch';

describe('escapeLikePattern', () => {
  it('wraps the term so it matches anywhere in a value', () => {
    expect(escapeLikePattern('coffee')).toBe('%coffee%');
  });

  it('neutralises the wildcards so they match literally', () => {
    expect(escapeLikePattern('50%')).toBe('%50\\%%');
    expect(escapeLikePattern('a_b')).toBe('%a\\_b%');
  });

  it('escapes the escape character before the wildcards it introduces', () => {
    expect(escapeLikePattern('a\\b')).toBe('%a\\\\b%');
    // Were the order reversed, the escape added for `%` would itself be escaped
    // and the pattern would stop matching a literal per cent sign.
    expect(escapeLikePattern('\\%')).toBe('%\\\\\\%%');
  });

  it('leaves an already-trimmed term untouched, and does not trim', () => {
    expect(escapeLikePattern('  coffee  ')).toBe('%  coffee  %');
  });

  it('exposes the escape character the ESCAPE clause must name', () => {
    expect(LIKE_ESCAPE_CHARACTER).toBe('\\');
  });
});

describe('matchesQuery', () => {
  it('matches any of the given values', () => {
    expect(matchesQuery(['Tesco', 'Weekly shop', null], 'shop')).toBe(true);
    expect(matchesQuery(['Tesco', 'Weekly shop', null], 'petrol')).toBe(false);
  });

  it('matches a substring rather than a whole value', () => {
    expect(matchesQuery(['Coffee shop'], 'ffee sh')).toBe(true);
  });

  it('ignores case for ASCII letters', () => {
    expect(matchesQuery(['COSTA'], 'costa')).toBe(true);
    expect(matchesQuery(['costa'], 'COSTA')).toBe(true);
  });

  it('does not fold non-ASCII letters, matching what SQLite LIKE does', () => {
    expect(matchesQuery(['CAFÉ'], 'café')).toBe(false);
    expect(matchesQuery(['CAFÉ'], 'CAFÉ')).toBe(true);
  });

  it('skips a null value rather than excluding the row', () => {
    expect(matchesQuery([null, 'Tesco'], 'tesco')).toBe(true);
    expect(matchesQuery([null], 'tesco')).toBe(false);
  });

  it('treats a multi-word term as one literal substring', () => {
    expect(matchesQuery(['Costa coffee run'], 'costa coffee')).toBe(true);
    expect(matchesQuery(['Costa run, coffee later'], 'costa coffee')).toBe(
      false,
    );
  });

  it('does not collapse internal whitespace', () => {
    expect(matchesQuery(['costa  coffee'], 'costa  coffee')).toBe(true);
    expect(matchesQuery(['costa coffee'], 'costa  coffee')).toBe(false);
  });

  it('does not trim, leaving that to the caller', () => {
    expect(matchesQuery(['coffee'], ' coffee')).toBe(false);
    expect(matchesQuery([' coffee'], ' coffee')).toBe(true);
  });

  it('matches everything on an empty term, which is why blanks never reach it', () => {
    expect(escapeLikePattern('')).toBe('%%');
    expect(matchesQuery(['anything'], '')).toBe(true);
    expect(matchesQuery([null], '')).toBe(false);
  });
});
