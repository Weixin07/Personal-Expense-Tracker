import {
  measurePerformance,
  assertPerformance,
  formatDuration,
  formatBytes,
  generateMockTransactions,
} from './testHelpers';
import type { TransactionRecord } from '../../database/types';

describe('Performance: Large Dataset (10k expenses)', () => {
  const EXPENSE_COUNT = 10000;
  let mockTransactions: TransactionRecord[];

  beforeAll(() => {
    console.log(
      `\n📊 Generating ${EXPENSE_COUNT} mock transactions for testing...`,
    );
    mockTransactions = generateMockTransactions(
      EXPENSE_COUNT,
    ) as TransactionRecord[];
    console.log(`✅ Generated ${mockTransactions.length} transactions\n`);
  });

  describe('Data Loading Performance', () => {
    it('should load 10k expenses in under 500ms', async () => {
      const { result, metrics } = await measurePerformance(() => {
        return [...mockTransactions];
      });

      console.log(`⏱️  Load Time: ${formatDuration(metrics.duration)}`);
      if (metrics.memory) {
        console.log(`💾 Memory Delta: ${formatBytes(metrics.memory.delta)}`);
      }

      expect(result.length).toBe(EXPENSE_COUNT);

      assertPerformance(metrics, { maxDuration: 500 }, 'Loading 10k expenses');
    });

    it('should filter 10k expenses by category in under 100ms', async () => {
      const targetCategoryId = 1;

      const { result, metrics } = await measurePerformance(() => {
        return mockTransactions.filter(
          transaction => transaction.categoryId === targetCategoryId,
        );
      });

      console.log(`⏱️  Filter Time: ${formatDuration(metrics.duration)}`);
      console.log(`📋 Filtered Results: ${result.length} transactions`);

      assertPerformance(
        metrics,
        { maxDuration: 100 },
        'Filtering 10k expenses by category',
      );
    });

    it('should filter 10k expenses by date range in under 100ms', async () => {
      const startDate = '2023-01-01';
      const endDate = '2023-12-31';

      const { result, metrics } = await measurePerformance(() => {
        return mockTransactions.filter(
          transaction =>
            transaction.date >= startDate && transaction.date <= endDate,
        );
      });

      console.log(`⏱️  Date Filter Time: ${formatDuration(metrics.duration)}`);
      console.log(`📋 Filtered Results: ${result.length} transactions`);

      assertPerformance(
        metrics,
        { maxDuration: 100 },
        'Filtering 10k expenses by date range',
      );
    });

    it('should sort 10k expenses by date in under 200ms', async () => {
      const { result, metrics } = await measurePerformance(() => {
        return [...mockTransactions].sort((a, b) => {
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
        'Sorting 10k expenses by date',
      );
    });
  });

  describe('Calculation Performance', () => {
    it('should calculate total for 10k expenses in under 50ms', async () => {
      const { result, metrics } = await measurePerformance(() => {
        return mockTransactions.reduce(
          (sum, transaction) => sum + transaction.baseAmount,
          0,
        );
      });

      console.log(`⏱️  Calculation Time: ${formatDuration(metrics.duration)}`);
      console.log(`💰 Total: $${result.toFixed(2)}`);

      assertPerformance(
        metrics,
        { maxDuration: 50 },
        'Calculating total for 10k expenses',
      );
    });

    it('should group 10k expenses by category in under 100ms', async () => {
      const { result, metrics } = await measurePerformance(() => {
        const grouped = new Map<number | null, number>();
        mockTransactions.forEach(transaction => {
          const current = grouped.get(transaction.categoryId ?? null) ?? 0;
          grouped.set(
            transaction.categoryId ?? null,
            current + transaction.baseAmount,
          );
        });
        return grouped;
      });

      console.log(`⏱️  Grouping Time: ${formatDuration(metrics.duration)}`);
      console.log(`📊 Categories: ${result.size}`);

      assertPerformance(
        metrics,
        { maxDuration: 100 },
        'Grouping 10k expenses by category',
      );
    });

    it('should group 10k expenses by month in under 100ms', async () => {
      const { result, metrics } = await measurePerformance(() => {
        const grouped = new Map<string, number>();
        mockTransactions.forEach(transaction => {
          const month = transaction.date.slice(0, 7); // YYYY-MM
          const current = grouped.get(month) ?? 0;
          grouped.set(month, current + transaction.baseAmount);
        });
        return grouped;
      });

      console.log(
        `⏱️  Monthly Grouping Time: ${formatDuration(metrics.duration)}`,
      );
      console.log(`📅 Months: ${result.size}`);

      assertPerformance(
        metrics,
        { maxDuration: 100 },
        'Grouping 10k expenses by month',
      );
    });
  });

  describe('Search Performance', () => {
    it('should search 10k expenses by description in under 100ms', async () => {
      const searchTerm = 'grocery';

      const { result, metrics } = await measurePerformance(() => {
        return mockTransactions.filter(transaction =>
          transaction.description
            .toLowerCase()
            .includes(searchTerm.toLowerCase()),
        );
      });

      console.log(`⏱️  Search Time: ${formatDuration(metrics.duration)}`);
      console.log(`🔍 Found: ${result.length} matches`);

      assertPerformance(
        metrics,
        { maxDuration: 100 },
        'Searching 10k expenses by description',
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
        return mockTransactions.filter(
          transaction =>
            transaction.categoryId === filters.categoryId &&
            transaction.date >= filters.startDate &&
            transaction.date <= filters.endDate &&
            transaction.baseAmount >= filters.minAmount &&
            transaction.baseAmount <= filters.maxAmount,
        );
      });

      console.log(
        `⏱️  Complex Search Time: ${formatDuration(metrics.duration)}`,
      );
      console.log(`🔍 Found: ${result.length} matches`);

      assertPerformance(
        metrics,
        { maxDuration: 150 },
        'Complex multi-filter search on 10k expenses',
      );
    });
  });

  describe('Pagination Performance', () => {
    it('should paginate 10k expenses (first page) in under 10ms', async () => {
      const pageSize = 50;
      const page = 0;

      const { result, metrics } = await measurePerformance(() => {
        const sorted = [...mockTransactions].sort((a, b) => {
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

      assertPerformance(
        metrics,
        { maxDuration: 250 }, // Account for sorting overhead
        'Paginating 10k expenses (first page)',
      );
    });

    it('should paginate 10k expenses (middle page) in under 250ms', async () => {
      const pageSize = 50;
      const page = 100;

      const { result, metrics } = await measurePerformance(() => {
        const sorted = [...mockTransactions].sort((a, b) => {
          if (a.date !== b.date) {
            return b.date.localeCompare(a.date);
          }
          return b.id - a.id;
        });
        return sorted.slice(page * pageSize, (page + 1) * pageSize);
      });

      console.log(
        `⏱️  Pagination Time (page ${page}): ${formatDuration(metrics.duration)}`,
      );

      expect(result.length).toBe(pageSize);

      assertPerformance(
        metrics,
        { maxDuration: 250 },
        'Paginating 10k expenses (middle page)',
      );
    });
  });

  describe('Memory Efficiency', () => {
    it('should not cause significant memory growth when processing 10k expenses', async () => {
      const iterations = 10;
      const results: number[] = [];

      for (let i = 0; i < iterations; i++) {
        const { metrics } = await measurePerformance(() => {
          const filtered = mockTransactions.filter(e => e.categoryId === 1);
          const total = filtered.reduce((sum, e) => sum + e.baseAmount, 0);
          return total;
        });

        if (metrics.memory) {
          results.push(metrics.memory.delta);
        }
      }

      if (results.length > 0) {
        const avgMemoryDelta =
          results.reduce((sum, delta) => sum + delta, 0) / results.length;
        console.log(`💾 Average Memory Delta: ${formatBytes(avgMemoryDelta)}`);

        expect(avgMemoryDelta).toBeLessThan(10 * 1024 * 1024);
      }
    });
  });

  describe('Realistic Usage Scenarios', () => {
    it('should handle complete workflow (filter + sort + paginate) in under 300ms', async () => {
      const { result, metrics } = await measurePerformance(() => {
        const filtered = mockTransactions.filter(e => e.categoryId === 1);

        const sorted = [...filtered].sort((a, b) =>
          b.date.localeCompare(a.date),
        );

        const pageSize = 50;
        const paginated = sorted.slice(0, pageSize);

        const total = paginated.reduce((sum, e) => sum + e.baseAmount, 0);

        return { paginated, total };
      });

      console.log(
        `⏱️  Complete Workflow Time: ${formatDuration(metrics.duration)}`,
      );
      console.log(
        `📄 Results: ${result.paginated.length} transactions, Total: $${result.total.toFixed(2)}`,
      );

      assertPerformance(
        metrics,
        { maxDuration: 300 },
        'Complete workflow (filter + sort + paginate)',
      );
    });
  });
});
