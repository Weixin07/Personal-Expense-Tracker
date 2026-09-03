module.exports = {
  preset: 'react-native',
  // A frame-scale budget needs a process of its own: parallel workers compete
  // for cores, and even a serial run sharing a process with the other
  // performance suites inherits their heap, either of which moves a tight loop
  // past the frame it is asserting. That suite is excluded here and run alone
  // by `jest.performance.config.js`; the others carry budgets loose enough not
  // to care.
  testPathIgnorePatterns: [
    '/node_modules/',
    '<rootDir>/src/__tests__/performance/transactionSearch.test.ts',
  ],
  setupFiles: [
    require.resolve('react-native/jest/setup.js'),
    '<rootDir>/jest.setup.js',
  ],
  transformIgnorePatterns: [
    'node_modules/(?!(?:\\.pnpm/[^/]+/node_modules/)?(?:react-native|@react-native|@react-native-google-signin|@react-native-community|@react-native-vector-icons|@react-navigation|react-native-.*)/)',
  ],
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/src/$1',
  },
  moduleFileExtensions: ['ts', 'tsx', 'js', 'jsx', 'json', 'node'],
  testMatch: ['**/__tests__/**/*.test.(ts|tsx|js)'],
  collectCoverageFrom: [
    'src/**/*.{ts,tsx}',
    '!src/**/*.d.ts',
    '!src/**/__tests__/**',
    // Pure wiring / declarative config — no unit-testable branches.
    '!src/navigation/**',
    '!src/theme/**',
    // Type-only declarations and barrel re-exports.
    '!src/database/types.ts',
    '!src/database/repositories/index.ts',
    '!src/export/index.ts',
    '!src/import/index.ts',
    // Native-module IO bootstrap/wrappers covered by integration, not unit tests.
    '!src/database/index.ts',
    '!src/database/seeding.ts',
  ],
  coverageThreshold: {
    global: { branches: 70, functions: 80, lines: 80, statements: 80 },
    './src/context/AppContext.tsx': {
      branches: 93,
      functions: 95,
      lines: 93,
      statements: 93,
    },
    './src/screens/': {
      branches: 70,
      functions: 80,
      lines: 80,
      statements: 80,
    },
    './src/database/repositories/fundsRepository.ts': {
      branches: 68,
      functions: 95,
      lines: 87,
      statements: 87,
    },
    './src/database/snapshot.ts': {
      branches: 74,
      functions: 95,
      lines: 93,
      statements: 93,
    },
    './src/screens/ManageFundsScreen.tsx': {
      branches: 85,
      functions: 95,
      lines: 94,
      statements: 94,
    },
    './src/components/FundPickerDialog.tsx': {
      branches: 100,
      functions: 92,
      lines: 93,
      statements: 93,
    },
    './src/utils/textSearch.ts': {
      branches: 95,
      functions: 95,
      lines: 95,
      statements: 95,
    },
    './src/utils/transactionFilters.ts': {
      branches: 95,
      functions: 95,
      lines: 95,
      statements: 95,
    },
    './src/utils/fxRates.ts': {
      branches: 95,
      functions: 95,
      lines: 95,
      statements: 95,
    },
    './src/utils/funds.ts': {
      branches: 95,
      functions: 95,
      lines: 95,
      statements: 95,
    },
    './src/utils/fundBalances.ts': {
      branches: 95,
      functions: 95,
      lines: 95,
      statements: 95,
    },
  },
  bail: false,
};
