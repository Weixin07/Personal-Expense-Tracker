import type { ImportPreview, ImportSummary } from '../../import';

/**
 * An empty preview carrying every field, so a test states only what it is about.
 * New `ImportPreview` members are defaulted here instead of in each suite.
 */
export const makeImportPreview = (
  overrides: Partial<ImportPreview> = {},
): ImportPreview => ({
  valid: [],
  invalid: [],
  needsFxRate: [],
  unreadableTimes: [],
  fxReview: [],
  suspectDerivedRates: [],
  currencyReview: [],
  duplicates: [],
  newCategoryNames: [],
  unmappedColumns: [],
  mixedCurrencyWithoutBase: false,
  categorySuggestions: [],
  categoryTypeWidenings: [],
  totalRows: 0,
  inferredDateOrder: null,
  signConventionBypassed: false,
  ...overrides,
});

export const makeImportSummary = (
  overrides: Partial<ImportSummary> = {},
): ImportSummary => ({
  insertedExpenses: 0,
  insertedIncome: 0,
  skippedInvalid: 0,
  skippedNeedsFxRate: 0,
  skippedDuplicates: 0,
  createdCategories: 0,
  seededRates: [],
  ...overrides,
});
