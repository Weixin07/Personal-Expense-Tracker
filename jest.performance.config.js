const base = require('./jest.config');

module.exports = {
  ...base,
  testPathIgnorePatterns: ['/node_modules/'],
  testMatch: ['<rootDir>/src/__tests__/performance/transactionSearch.test.ts'],
  coverageThreshold: undefined,
};
