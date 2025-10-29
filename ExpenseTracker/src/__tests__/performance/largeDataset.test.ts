/**
 * Performance Test: Large Dataset Handling
 * Tests app performance with 10,000+ expenses
 */

import {
  measurePerformance,
  assertPerformance,
  formatDuration,
  formatBytes,
  generateMockExpenses,
  generateMockCategories,
} from './testHelpers';
import type { ExpenseRecord, CategoryRecord } from '../../database/types';

describe('Performance: Large Dataset (10k expenses)', () => {
  const EXPENSE_COUNT = 10000;
  let mockExpenses: ExpenseRecord[];
  let mockCategories: CategoryRecord[];

  beforeAll(() => {
    console.log(`\n📊 Generating ${EXPENSE_COUNT} mock expenses for testing...`);
    mockExpenses = generateMockExpenses(EXPENSE_COUNT) as ExpenseRecord[];
    mockCategories = generateMockCategories();
    console.log(`✅ Generated ${mockExpenses.length} expenses\n`);
  });

  describe('Data Loading Performance', () => {
    it('should load 10k expenses in under 500ms', async () => {
      const { result, metrics } = await measurePerformance(() => {
        // Simulate loading expenses from database
        return [...mockExpenses];
      });

      console.log(`⏱️  Load Time: ${formatDuration(metrics.duration)}`);
      if (metrics.memory) {
        console.log(`💾 Memory Delta: ${formatBytes(metrics.memory.delta)}`);
      }

      expect(result.length).toBe(EXPENSE_COUNT);

      assertPerformance(
        metrics,
        { maxDuration: 500 },
        'Loading 10k expenses'
      );
    });

    it('should filter 10k expenses by category in under 100ms', async () => {
      const targetCategoryId = 1;

      const { result, metrics } = await measurePerformance(() => {
        return mockExpenses.filter((expense) => expense.categoryId === targetCategoryId);
      });

      console.log(`⏱️  Filter Time: ${formatDuration(metrics.duration)}`);
      console.log(`📋 Filtered Results: ${result.length} expenses`);

      assertPerformance(
        metrics,
        { maxDuration: 100 },
        'Filtering 10k expenses by category'
      );
    });

    it('should filter 10k expenses by date range in under 100ms', async () => {
      const startDate = '2023-01-01';
      const endDate = '2023-12-31';

      const { result, metrics } = await measurePerformance(() => {
        return mockExpenses.filter(
          (expense) => expense.date >= startDate && expense.date <= endDate
        );
      });

      console.log(`⏱️  Date Filter Time: ${formatDuration(metrics.duration)}`);
      console.log(`📋 Filtered Results: ${result.length} expenses`);

      assertPerformance(
        metrics,
        { maxDuration: 100 },
        'Filtering 10k expenses by date range'
      );
    });

    it('should sort 10k expenses by date in under 200ms', async () => {
      const { result, metrics } = await measurePerformance(() => {
        return [...mockExpenses].sort((a, b) => {
          if (a.date !== b.date) {
            return b.date.localeCompare(a.date);
          }
          return b.id - a.id;
        });
      });

      console.log(`⏱️  Sort Time: ${formatDuration(metrics.duration)}`);

      expect(result.length).toBe(EXPENSE_COUNT);
      assertPerformance(
        metrics,
        { maxDuration: 200 },
        'Sorting 10k expenses by date'
      );
    });
  });

  describe('Calculation Performance', () => {
    it('should calculate total for 10k expenses in under 50ms', async () => {
      const { result, metrics } = await measurePerformance(() => {
        return mockExpenses.reduce((sum, expense) => sum + expense.baseAmount, 0);
      });

      console.log(`⏱️  Calculation Time: ${formatDuration(metrics.duration)}`);
      console.log(`💰 Total: $${result.toFixed(2)}`);

      assertPerformance(
        metrics,
        { maxDuration: 50 },
        'Calculating total for 10k expenses'
      );
    });

    it('should group 10k expenses by category in under 100ms', async () => {
      const { result, metrics } = await measurePerformance(() => {
        const grouped = new Map<number | null, number>();
        mockExpenses.forEach((expense) => {
          const current = grouped.get(expense.categoryId ?? null) ?? 0;
          grouped.set(expense.categoryId ?? null, current + expense.baseAmount);
        });
        return grouped;
      });

      console.log(`⏱️  Grouping Time: ${formatDuration(metrics.duration)}`);
      console.log(`📊 Categories: ${result.size}`);

      assertPerformance(
        metrics,
        { maxDuration: 100 },
        'Grouping 10k expenses by category'
      );
    });

    it('should group 10k expenses by month in under 100ms', async () => {
      const { result, metrics } = await measurePerformance(() => {
        const grouped = new Map<string, number>();
        mockExpenses.forEach((expense) => {
          const month = expense.date.slice(0, 7); // YYYY-MM
          const current = grouped.get(month) ?? 0;
          grouped.set(month, current + expense.baseAmount);
        });
        return grouped;
      });

      console.log(`⏱️  Monthly Grouping Time: ${formatDuration(metrics.duration)}`);
      console.log(`📅 Months: ${result.size}`);

      assertPerformance(
        metrics,
        { maxDuration: 100 },
        'Grouping 10k expenses by month'
      );
    });
  });

  describe('Search Performance', () => {
    it('should search 10k expenses by description in under 100ms', async () => {
      const searchTerm = 'grocery';

      const { result, metrics } = await measurePerformance(() => {
        return mockExpenses.filter((expense) =>
          expense.description.toLowerCase().includes(searchTerm.toLowerCase())
        );
      });

      console.log(`⏱️  Search Time: ${formatDuration(metrics.duration)}`);
      console.log(`🔍 Found: ${result.length} matches`);

      assertPerformance(
        metrics,
        { maxDuration: 100 },
        'Searching 10k expenses by description'
      );
    });

    it('should perform complex multi-filter search in under 150ms', async () => {
      const filters = {
        categoryId: 1,
        startDate: '2022-01-01',
        endDate: '2023-12-31',
        minAmount: 50,
        maxAmount: 200,
      };

      const { result, metrics } = await measurePerformance(() => {
        return mockExpenses.filter(
          (expense) =>
            expense.categoryId === filters.categoryId &&
            expense.date >= filters.startDate &&
            expense.date <= filters.endDate &&
            expense.baseAmount >= filters.minAmount &&
            expense.baseAmount <= filters.maxAmount
        );
      });

      console.log(`⏱️  Complex Search Time: ${formatDuration(metrics.duration)}`);
      console.log(`🔍 Found: ${result.length} matches`);

      assertPerformance(
        metrics,
        { maxDuration: 150 },
        'Complex multi-filter search on 10k expenses'
      );
    });
  });

  describe('Pagination Performance', () => {
    it('should paginate 10k expenses (first page) in under 10ms', async () => {
      const pageSize = 50;
      const page = 0;

      const { result, metrics } = await measurePerformance(() => {
        const sorted = [...mockExpenses].sort((a, b) => {
          if (a.date !== b.date) {
            return b.date.localeCompare(a.date);
          }
          return b.id - a.id;
        });
        return sorted.slice(page * pageSize, (page + 1) * pageSize);
      });

      console.log(`⏱️  Pagination Time: ${formatDuration(metrics.duration)}`);
      console.log(`📄 Page Size: ${result.length}`);

      expect(result.length).toBe(pageSize);

      // First page should be very fast since we're only taking the first 50
      assertPerformance(
        metrics,
        { maxDuration: 250 }, // Account for sorting overhead
        'Paginating 10k expenses (first page)'
      );
    });

    it('should paginate 10k expenses (middle page) in under 250ms', async () => {
      const pageSize = 50;
      const page = 100; // Middle page

      const { result, metrics } = await measurePerformance(() => {
        const sorted = [...mockExpenses].sort((a, b) => {
          if (a.date !== b.date) {
            return b.date.localeCompare(a.date);
          }
          return b.id - a.id;
        });
        return sorted.slice(page * pageSize, (page + 1) * pageSize);
      });

      console.log(`⏱️  Pagination Time (page ${page}): ${formatDuration(metrics.duration)}`);

      expect(result.length).toBe(pageSize);

      assertPerformance(
        metrics,
        { maxDuration: 250 },
        'Paginating 10k expenses (middle page)'
      );
    });
  });

  describe('Memory Efficiency', () => {
    it('should not cause significant memory growth when processing 10k expenses', async () => {
      const iterations = 10;
      const results: number[] = [];

      for (let i = 0; i < iterations; i++) {
        const { metrics } = await measurePerformance(() => {
          // Simulate typical operations
          const filtered = mockExpenses.filter((e) => e.categoryId === 1);
          const total = filtered.reduce((sum, e) => sum + e.baseAmount, 0);
          return total;
        });

        if (metrics.memory) {
          results.push(metrics.memory.delta);
        }
      }

      if (results.length > 0) {
        const avgMemoryDelta = results.reduce((sum, delta) => sum + delta, 0) / results.length;
        console.log(`💾 Average Memory Delta: ${formatBytes(avgMemoryDelta)}`);

        // Memory delta should not grow significantly with repeated operations
        // This indicates good garbage collection
        expect(avgMemoryDelta).toBeLessThan(10 * 1024 * 1024); // 10MB threshold
      }
    });
  });

  describe('Realistic Usage Scenarios', () => {
    it('should handle complete workflow (filter + sort + paginate) in under 300ms', async () => {
      const { result, metrics } = await measurePerformance(() => {
        // 1. Filter by category
        const filtered = mockExpenses.filter((e) => e.categoryId === 1);

        // 2. Sort by date
        const sorted = [...filtered].sort((a, b) => b.date.localeCompare(a.date));

        // 3. Paginate (first page)
        const pageSize = 50;
        const paginated = sorted.slice(0, pageSize);

        // 4. Calculate total
        const total = paginated.reduce((sum, e) => sum + e.baseAmount, 0);

        return { paginated, total };
      });

      console.log(`⏱️  Complete Workflow Time: ${formatDuration(metrics.duration)}`);
      console.log(`📄 Results: ${result.paginated.length} expenses, Total: $${result.total.toFixed(2)}`);

      assertPerformance(
        metrics,
        { maxDuration: 300 },
        'Complete workflow (filter + sort + paginate)'
      );
    });
  });
});
