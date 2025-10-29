# Test Coverage Report

**Generated:** January 2025
**Current Coverage:** 19.93% → Target: 80%+

## 📊 Current Coverage Status

### ✅ High Coverage Modules (>90%)

| Module | Coverage | Status |
|--------|----------|--------|
| `src/utils/` | 96.96% | ✅ Excellent |
| `src/utils/date.ts` | 100% | ✅ Complete |
| `src/utils/formatting.ts` | 100% | ✅ Complete |
| `src/utils/math.ts` | 100% | ✅ Complete |
| `src/utils/validation.ts` | 94.02% | ✅ Excellent |
| `src/screens/expenseFormUtils.ts` | 96.22% | ✅ Excellent |
| `src/screens/homeUtils.ts` | 100% | ✅ Complete |
| `src/export/csvBuilder.ts` | 97.43% | ✅ Excellent |
| `src/security/googleAuth.ts` | 94.82% | ✅ Excellent |

### ⚠️ Medium Coverage Modules (50-90%)

| Module | Coverage | Status |
|--------|----------|--------|
| `src/security/googleConfig.ts` | 87.50% | ⚠️ Good |

### ❌ Low/Zero Coverage Modules (<50%)

| Module | Coverage | Status | Priority |
|--------|----------|--------|----------|
| `src/context/AppContext.tsx` | 0% | ❌ Critical | **HIGH** |
| `src/database/repositories/*.ts` | 0% | ❌ Critical | **HIGH** |
| `src/database/migrations.ts` | 0% | ❌ Important | **MEDIUM** |
| `src/screens/*.tsx` (all screen components) | 0% | ❌ Important | **MEDIUM** |
| `src/export/driveUploader.ts` | 0% | ❌ Important | **MEDIUM** |
| `src/components/*.tsx` | 0% | ❌ Low | **LOW** |
| `src/navigation/AppNavigator.tsx` | 0% | ❌ Low | **LOW** |

---

## 🎯 Roadmap to 80% Coverage

### Phase 1: Core Business Logic (Est. Coverage: +20%)

**Priority: CRITICAL**
**Estimated Effort:** 3-4 days

#### 1.1 AppContext Tests
- **File:** `src/context/__tests__/AppContext.test.tsx`
- **Focus:**
  - Reducer logic (all action types)
  - State initialization
  - Memoized selectors (filteredExpenses, totals, hasActiveFilters)
  - Error handling
- **Challenges:** Large file (~1000 lines), requires mocking SQLite, NetInfo, AppState
- **Impact:** +5-8% coverage

#### 1.2 Database Repositories Tests
- **Files:**
  - `src/database/repositories/__tests__/expensesRepository.test.ts`
  - `src/database/repositories/__tests__/categoriesRepository.test.ts`
  - `src/database/repositories/__tests__/settingsRepository.test.ts`
  - `src/database/repositories/__tests__/exportQueueRepository.test.ts`
- **Focus:**
  - CRUD operations (create, read, update, delete)
  - Query filters (date range, category, pagination)
  - Error handling (not found, constraint violations)
  - Transaction behavior
- **Challenges:** Requires SQLite mock or in-memory database
- **Impact:** +8-12% coverage

### Phase 2: Integration Tests (Est. Coverage: +15%)

**Priority: HIGH**
**Estimated Effort:** 2-3 days

#### 2.1 Database Integration
- **File:** `src/database/__tests__/database.integration.test.ts`
- **Focus:**
  - Database initialization
  - Migration system (v1-v4)
  - Seeding (default categories)
  - Foreign key constraints
  - Transaction rollback
- **Impact:** +3-5% coverage

#### 2.2 Export Flow Integration
- **File:** `src/export/__tests__/driveUploader.test.ts`
- **Focus:**
  - OAuth token refresh
  - Folder creation/verification
  - File upload (multipart)
  - Error handling (401, 403, network errors)
  - Retry logic
- **Challenges:** Requires mocking Google Drive API
- **Impact:** +3-5% coverage

#### 2.3 Export Queue Manager
- **File:** `src/export/__tests__/exportQueueManager.test.ts`
- **Focus:**
  - CSV generation
  - SAF directory selection
  - File persistence
  - Queue item creation
- **Impact:** +1-2% coverage

### Phase 3: Component Tests (Est. Coverage: +25%)

**Priority: MEDIUM**
**Estimated Effort:** 4-5 days

#### 3.1 Screen Component Tests
Use **React Native Testing Library** (`@testing-library/react-native`)

**HomeScreen Tests**
- **File:** `src/screens/__tests__/HomeScreen.test.tsx`
- **Focus:**
  - Expense list rendering
  - Filter interactions (date preset, category picker)
  - Total calculation display
  - Pull-to-refresh
  - Navigation to AddExpenseScreen
- **Impact:** +3-4% coverage

**AddExpenseScreen Tests**
- **File:** `src/screens/__tests__/AddExpenseScreen.test.tsx`
- **Focus:**
  - Form validation (inline errors)
  - Currency/category pickers
  - Base amount computation
  - Save/update/delete actions
- **Impact:** +3-4% coverage

**SettingsScreen Tests**
- **File:** `src/screens/__tests__/SettingsScreen.test.tsx`
- **Focus:**
  - Base currency change
  - Biometric toggle
  - Drive folder configuration
  - Manual upload trigger
- **Impact:** +2-3% coverage

**ManageCategoriesScreen Tests**
- **File:** `src/screens/__tests__/ManageCategoriesScreen.test.tsx`
- **Focus:**
  - Category CRUD dialogs
  - Duplicate name validation
  - Usage count display
- **Impact:** +2-3% coverage

**ExportQueueScreen Tests**
- **File:** `src/screens/__tests__/ExportQueueScreen.test.tsx`
- **Focus:**
  - Queue item list
  - Retry failed uploads
  - Clear completed items
- **Impact:** +2-3% coverage

#### 3.2 Reusable Component Tests
- **CategoryPickerDialog Tests**
- **CurrencyPickerDialog Tests**
- **Impact:** +1-2% coverage each

### Phase 4: Security & Storage (Est. Coverage: +10%)

**Priority: LOW**
**Estimated Effort:** 1-2 days

#### 4.1 Biometric Lock
- **File:** `src/security/__tests__/AppLock.test.ts`
- **Focus:**
  - Authentication flow
  - Timeout behavior (5 min)
  - Enable/disable toggle
- **Impact:** +1-2% coverage

#### 4.2 Storage Access
- **File:** `src/security/__tests__/storageAccess.test.ts`
- **Focus:**
  - SAF directory picker
  - Persistent URI permissions
  - File read/write/delete
- **Challenges:** Requires mocking `react-native-saf-x`
- **Impact:** +1-2% coverage

### Phase 5: Remaining Modules (Est. Coverage: +5%)

**Priority: LOW**
**Estimated Effort:** 1 day

- Navigation tests
- Theme tests
- Constants tests
- Type definition tests (if applicable)

---

## 🛠️ Implementation Guide

### Test Infrastructure Setup

#### 1. Install Additional Testing Dependencies

```bash
pnpm add -D @testing-library/react-native @testing-library/jest-native
```

#### 2. Update `jest.setup.js`

Add React Native Testing Library matchers:

```javascript
import '@testing-library/jest-native/extend-expect';
```

#### 3. Create Test Utilities

**File:** `src/__tests__/testUtils.tsx`

```typescript
import React from 'react';
import { render } from '@testing-library/react-native';
import { ExpenseDataProvider } from '../context/AppContext';

export const renderWithProviders = (
  ui: React.ReactElement,
  options?: any,
) => {
  return render(
    <ExpenseDataProvider>{ui}</ExpenseDataProvider>,
    options,
  );
};
```

#### 4. SQLite Test Database Setup

**File:** `src/database/__tests__/testDatabase.ts`

```typescript
import SQLite from 'react-native-sqlite-storage';
import { initializeDatabase } from '../database';

export const createTestDatabase = async () => {
  const db = await SQLite.openDatabase({
    name: ':memory:', // In-memory database for tests
    location: 'default',
  });
  await initializeDatabase(db);
  return db;
};

export const cleanupTestDatabase = async (db: any) => {
  await db.close();
};
```

---

## 📋 Testing Checklist

### Critical Modules (Must Test for 80% Coverage)

- [ ] **AppContext.tsx** - Reducer and selectors
- [ ] **expensesRepository.ts** - Full CRUD
- [ ] **categoriesRepository.ts** - Full CRUD
- [ ] **settingsRepository.ts** - Key-value operations
- [ ] **exportQueueRepository.ts** - Queue management
- [ ] **HomeScreen.tsx** - Filtering and list rendering
- [ ] **AddExpenseScreen.tsx** - Form validation and submission
- [ ] **driveUploader.ts** - Upload flow and error handling
- [ ] **migrations.ts** - Schema migrations

### Important Modules (Should Test)

- [ ] **SettingsScreen.tsx** - Settings changes
- [ ] **ManageCategoriesScreen.tsx** - Category management
- [ ] **ExportQueueScreen.tsx** - Queue operations
- [ ] **database.ts** - Initialization
- [ ] **seeding.ts** - Default data
- [ ] **storageAccess.ts** - SAF operations
- [ ] **AppLock.ts** - Biometric authentication

### Nice-to-Have Modules (Low Priority)

- [ ] **CategoryPickerDialog.tsx** - UI interaction
- [ ] **CurrencyPickerDialog.tsx** - UI interaction
- [ ] **AppNavigator.tsx** - Navigation flow
- [ ] **exportQueueManager.ts** - Manager operations

---

## 🚀 Quick Wins (Easiest to Test)

Already completed (Phase 0):

1. ✅ **date.ts** - Pure functions, no dependencies
2. ✅ **formatting.ts** - Pure functions, no dependencies
3. ✅ **math.ts** - Pure functions, no dependencies
4. ✅ **homeUtils.ts** - Date presets and formatting

Next quick wins:

5. **currencyOptions.ts** - Static data manipulation (10 min)
6. **defaultCategories.ts** - Constant array (5 min)
7. **exportQueueManager.ts** - Simple manager functions (30 min)

---

## 📈 Coverage Goals by Phase

| Phase | Description | Target Coverage | Cumulative |
|-------|-------------|-----------------|------------|
| 0 | ✅ Utilities (completed) | +4.6% | 19.93% |
| 1 | Core Business Logic | +20% | ~40% |
| 2 | Integration Tests | +15% | ~55% |
| 3 | Component Tests | +25% | ~80% |
| 4 | Security & Storage | +10% | ~90% |
| 5 | Remaining Modules | +5% | ~95% |

---

## 🔍 Testing Best Practices

### 1. Test Structure (AAA Pattern)

```typescript
describe('Feature', () => {
  it('should behave correctly', () => {
    // Arrange
    const input = 'test';

    // Act
    const result = myFunction(input);

    // Assert
    expect(result).toBe('expected');
  });
});
```

### 2. Mock External Dependencies

```typescript
jest.mock('react-native-sqlite-storage', () => ({
  openDatabase: jest.fn(() => ({
    executeSql: jest.fn((sql, params) => Promise.resolve([{ rows: { length: 0, item: () => ({}) } }])),
  })),
}));
```

### 3. Use Descriptive Test Names

```typescript
// ❌ Bad
it('should work', () => { ... });

// ✅ Good
it('should return null when parsing invalid British date format', () => { ... });
```

### 4. Test Edge Cases

- Empty inputs
- Null/undefined values
- Boundary conditions (min/max)
- Error states
- Network failures (for async operations)

### 5. Avoid Test Interdependence

Each test should be independent and not rely on the state from previous tests.

```typescript
// ✅ Good - Each test creates its own data
beforeEach(() => {
  testData = createTestData();
});

afterEach(() => {
  cleanupTestData();
});
```

---

## 🎯 Success Metrics

### Code Coverage Targets

- **Line Coverage:** >80%
- **Branch Coverage:** >75%
- **Function Coverage:** >80%
- **Statement Coverage:** >80%

### Test Quality Metrics

- **Test-to-Code Ratio:** At least 1:1 (1 line of test per 1 line of code)
- **Average Test Execution Time:** <10s for unit tests, <30s for integration tests
- **Flaky Tests:** 0% (all tests should be deterministic)
- **Code Review:** 100% of tests reviewed before merge

---

## 📚 Resources

### Documentation

- [Jest Documentation](https://jestjs.io/docs/getting-started)
- [React Native Testing Library](https://callstack.github.io/react-native-testing-library/)
- [Testing Best Practices](https://kentcdodds.com/blog/common-mistakes-with-react-testing-library)

### Example Test Suites

Look at existing tests for patterns:

- `src/utils/__tests__/validation.test.ts` - Pure function testing
- `src/export/__tests__/csvBuilder.test.ts` - Data transformation testing
- `src/screens/__tests__/expenseFormUtils.test.ts` - Form validation testing
- `src/security/__tests__/googleAuth.integration.test.ts` - Integration testing

---

## ✅ Current Status Summary

### What's Been Achieved

1. ✅ **Fixed critical bugs in source code:**
   - Fixed regex syntax error in `date.ts` (line 40)

2. ✅ **Created comprehensive test suites:**
   - `src/utils/__tests__/formatting.test.ts` (16 tests, 100% coverage)
   - `src/utils/__tests__/date.test.ts` (27 tests, 100% coverage)
   - `src/utils/__tests__/math.test.ts` (28 tests, 100% coverage)
   - `src/screens/__tests__/homeUtils.test.ts` (22 tests, 100% coverage)

3. ✅ **Achieved near-perfect utility function coverage:**
   - Utils folder: 96.96% coverage
   - All critical date, formatting, and math utilities: 100% coverage

4. ✅ **Improved overall coverage:**
   - Before: 15.33%
   - After: 19.93%
   - Improvement: +30% relative increase

### What Remains

To reach 80% coverage, the following high-impact modules need comprehensive test suites:

1. **AppContext.tsx** (~1000 lines, 0% coverage)
2. **Database repositories** (4 files, ~450 lines, 0% coverage)
3. **Screen components** (5 files, ~1000 lines, 0% coverage)
4. **Integration tests** (database, export flow, OAuth)

**Estimated effort to 80%:** 10-15 days of focused testing work

---

## 🚦 Next Steps

### Immediate Actions (Today)

1. ✅ Review this test coverage report
2. ✅ Run `pnpm test -- --coverage` to verify current state
3. ✅ Prioritize which modules to test first based on business criticality

### Short-Term (This Week)

1. Set up React Native Testing Library
2. Create test database utilities
3. Write AppContext tests (highest impact)
4. Write database repository tests

### Long-Term (This Month)

1. Complete Phase 1-3 testing
2. Set up CI/CD with coverage gates (fail if <80%)
3. Add coverage badges to README
4. Establish testing standards for new code

---

**Report Generated:** January 2025
**Test Framework:** Jest 29
**Test Runner:** pnpm test
**Coverage Tool:** Jest built-in coverage (Istanbul)
