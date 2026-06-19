module.exports = {
  preset: 'react-native',
  setupFiles: [
    require.resolve('react-native/jest/setup.js'),
    '<rootDir>/jest.setup.js',
  ],
  transformIgnorePatterns: [
    'node_modules/(?!(?:\\.pnpm/[^/]+/node_modules/)?(?:react-native|@react-native|@react-native-community|@react-native-vector-icons|@react-navigation|react-native-.*)/)',
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
    // Native-module IO bootstrap/wrappers covered by integration, not unit tests.
    '!src/database/index.ts',
    '!src/database/seeding.ts',
  ],
  coverageThreshold: {
    global: { branches: 70, functions: 80, lines: 80, statements: 80 },
    './src/context/AppContext.tsx': {
      branches: 70,
      functions: 80,
      lines: 80,
      statements: 80,
    },
    './src/screens/': {
      branches: 70,
      functions: 80,
      lines: 80,
      statements: 80,
    },
  },
  bail: false,
};
