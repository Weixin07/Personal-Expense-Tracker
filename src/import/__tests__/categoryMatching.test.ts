import {
  areNamesNearDuplicates,
  findNearDuplicateCategory,
} from '../categoryMatching';
import type { CategoryRecord } from '../../database';

const makeCategory = (
  overrides: Partial<CategoryRecord> = {},
): CategoryRecord => ({
  id: 1,
  name: 'Transport',
  type: 'both',
  createdAt: '',
  updatedAt: '',
  ...overrides,
});

describe('areNamesNearDuplicates', () => {
  it('matches a plural against its singular', () => {
    expect(areNamesNearDuplicates('Gift', 'Gifts')).toBe(true);
  });

  it('matches an expanded form against its stem', () => {
    expect(areNamesNearDuplicates('Transportation', 'Transport')).toBe(true);
  });

  it('folds case, spacing and punctuation away, leaving no suggestion to make', () => {
    expect(areNamesNearDuplicates('personal care', 'Personal-Care')).toBe(
      false,
    );
    expect(
      areNamesNearDuplicates('self development', 'Self-Development!'),
    ).toBe(false);
  });

  it('rejects an identical name, which needs no suggestion', () => {
    expect(areNamesNearDuplicates('Salary', 'salary')).toBe(false);
    expect(areNamesNearDuplicates('Education', 'Education')).toBe(false);
  });

  it('rejects short names one edit apart', () => {
    expect(areNamesNearDuplicates('Fees', 'Feed')).toBe(false);
    expect(areNamesNearDuplicates('Bill', 'Bell')).toBe(false);
  });

  it('rejects a short prefix that merely opens a longer word', () => {
    expect(areNamesNearDuplicates('Car', 'Career')).toBe(false);
  });

  it('rejects a prefix whose remainder is a word of its own', () => {
    expect(areNamesNearDuplicates('Invest', 'Investment Income')).toBe(false);
  });

  it('rejects unrelated names of the same length', () => {
    expect(areNamesNearDuplicates('Allowance', 'Insurance')).toBe(false);
    expect(areNamesNearDuplicates('Household', 'Housing')).toBe(false);
  });

  it('matches names within two edits when long enough to be meaningful', () => {
    expect(areNamesNearDuplicates('Groceries', 'Grocerys')).toBe(true);
  });
});

describe('findNearDuplicateCategory', () => {
  const existing = [
    makeCategory({ id: 1, name: 'Transport' }),
    makeCategory({ id: 2, name: 'Gifts' }),
    makeCategory({ id: 3, name: 'Salary', type: 'income' }),
  ];

  it('returns the category an incoming name may be a respelling of', () => {
    expect(findNearDuplicateCategory('Transportation', existing)).toEqual(
      existing[0],
    );
    expect(findNearDuplicateCategory('Gift', existing)).toEqual(existing[1]);
  });

  it('returns null when nothing is close enough', () => {
    expect(findNearDuplicateCategory('Food', existing)).toBeNull();
    expect(findNearDuplicateCategory('Petty cash', existing)).toBeNull();
  });
});
