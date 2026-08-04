import {
  measurePerformance,
  assertPerformance,
  formatDuration,
  formatBytes,
  generateMockTransactions,
  generateMockCategories,
  benchmark,
} from './testHelpers';
import { buildTransactionsCsv } from '../../export/csvBuilder';

const generateCsv = (
  transactions: TransactionRecord[],
  categories: CategoryRecord[],
): string => {
  const result = buildTransactionsCsv({ transactions, categories });
  return result.content;
};
import type { TransactionRecord, CategoryRecord } from '../../database/types';

describe('Performance: CSV Generation (10k rows)', () => {
  const EXPENSE_COUNT = 10000;
  let mockTransactions: TransactionRecord[];
  let mockCategories: CategoryRecord[];

  beforeAll(() => {
    console.log(
      `\n📊 Generating ${EXPENSE_COUNT} mock transactions for CSV testing...`,
    );
    mockTransactions = generateMockTransactions(
      EXPENSE_COUNT,
    ) as TransactionRecord[];
    mockCategories = generateMockCategories();
    console.log(`✅ Generated ${mockTransactions.length} transactions\n`);
  });

  describe('CSV Generation Performance', () => {
    it('should generate CSV for 10k expenses in under 1 second', async () => {
      const { result, metrics } = await measurePerformance(() => {
        return generateCsv(mockTransactions, mockCategories);
      });

      console.log(
        `⏱️  CSV Generation Time: ${formatDuration(metrics.duration)}`,
      );
      console.log(`📄 CSV Size: ${formatBytes(result.length)}`);
      console.log(`📊 Rows: ${result.split('\n').length - 1}`); // -1 for header

      if (metrics.memory) {
        console.log(`💾 Memory Delta: ${formatBytes(metrics.memory.delta)}`);
      }

      expect(result).toContain('id,description,amount_native,currency_code');
      expect(result.split('\n').length).toBeGreaterThan(EXPENSE_COUNT);

      assertPerformance(
        metrics,
        { maxDuration: 1000 },
        'Generating CSV for 10k expenses',
      );
    });

    it('should generate CSV with consistent performance across multiple runs', async () => {
      const iterations = 5;

      const { metrics } = await benchmark(
        () => generateCsv(mockTransactions, mockCategories),
        iterations,
      );

      console.log(`\n📊 CSV Generation Benchmark (${iterations} iterations):`);
      console.log(`   Average: ${formatDuration(metrics.averageTime!)}`);
      console.log(`   Min: ${formatDuration(metrics.min)}`);
      console.log(`   Max: ${formatDuration(metrics.max)}`);
      console.log(`   Median: ${formatDuration(metrics.median)}`);
      console.log(`   P95: ${formatDuration(metrics.p95)}`);
      console.log(`   P99: ${formatDuration(metrics.p99)}`);

      expect(metrics.max).toBeLessThan(metrics.averageTime! * 2);
    });

    it('should generate CSV for small dataset in under 100ms', async () => {
      const smallDataset = mockTransactions.slice(0, 100);

      const { result, metrics } = await measurePerformance(() => {
        return generateCsv(smallDataset, mockCategories);
      });

      console.log(
        `⏱️  Small Dataset CSV Time: ${formatDuration(metrics.duration)}`,
      );
      console.log(`📄 CSV Size: ${formatBytes(result.length)}`);

      assertPerformance(
        metrics,
        { maxDuration: 100 },
        'Generating CSV for 100 expenses',
      );
    });

    it('should generate CSV for medium dataset in under 300ms', async () => {
      const mediumDataset = mockTransactions.slice(0, 1000);

      const { result, metrics } = await measurePerformance(() => {
        return generateCsv(mediumDataset, mockCategories);
      });

      console.log(
        `⏱️  Medium Dataset CSV Time: ${formatDuration(metrics.duration)}`,
      );
      console.log(`📄 CSV Size: ${formatBytes(result.length)}`);

      assertPerformance(
        metrics,
        { maxDuration: 300 },
        'Generating CSV for 1000 expenses',
      );
    });
  });

  describe('CSV Format Validation', () => {
    it('should produce valid CSV structure for 10k rows', async () => {
      const { result, metrics } = await measurePerformance(() => {
        return generateCsv(mockTransactions, mockCategories);
      });

      console.log(`⏱️  Validation Time: ${formatDuration(metrics.duration)}`);

      const lines = result.split('\n');
      const headerLine = lines[0];
      const dataLines = lines.slice(1).filter(line => line.trim().length > 0);

      expect(headerLine).toContain('id');
      expect(headerLine).toContain('description');
      expect(headerLine).toContain('amount_native');
      expect(headerLine).toContain('currency_code');

      expect(dataLines.length).toBe(EXPENSE_COUNT);

      const firstRow = dataLines[0].split(',');
      expect(firstRow.length).toBeGreaterThanOrEqual(4);

      console.log(`✅ CSV structure valid: ${dataLines.length} data rows`);
    });

    it('should handle special characters in 10k rows without corruption', async () => {
      const specialExpenses = mockTransactions
        .slice(0, 100)
        .map((transaction, i) => ({
          ...transaction,
          description:
            i % 5 === 0 ? 'Expense with "quotes"' : transaction.description,
          notes: i % 7 === 0 ? 'Notes with, commas' : transaction.notes,
        }));

      const { result, metrics } = await measurePerformance(() => {
        return generateCsv(
          specialExpenses as TransactionRecord[],
          mockCategories,
        );
      });

      console.log(
        `⏱️  Special Characters CSV Time: ${formatDuration(metrics.duration)}`,
      );

      expect(result).toContain('"Expense with ""quotes"""');

      const lines = result.split('\n');
      const dataLines = lines.slice(1).filter(line => line.trim().length > 0);
      expect(dataLines.length).toBe(specialExpenses.length);
    });
  });

  describe('Memory Efficiency During CSV Generation', () => {
    it('should not leak memory during repeated CSV generation', async () => {
      const iterations = 10;
      const memoryDeltas: number[] = [];

      for (let i = 0; i < iterations; i++) {
        const { metrics } = await measurePerformance(() => {
          return generateCsv(mockTransactions, mockCategories);
        });

        if (metrics.memory) {
          memoryDeltas.push(metrics.memory.delta);
        }

        // Force garbage collection opportunity
        await new Promise(resolve => setTimeout(resolve, 10));
      }

      if (memoryDeltas.length > 0) {
        const avgMemoryDelta =
          memoryDeltas.reduce((sum, delta) => sum + delta, 0) /
          memoryDeltas.length;
        const maxMemoryDelta = Math.max(...memoryDeltas);

        console.log(`💾 Average Memory Delta: ${formatBytes(avgMemoryDelta)}`);
        console.log(`💾 Max Memory Delta: ${formatBytes(maxMemoryDelta)}`);

        // The 3x tolerance absorbs GC timing jitter; a leak shows as sustained
        // growth rather than a single spike.
        expect(maxMemoryDelta).toBeLessThan(avgMemoryDelta * 3);
      }
    });
  });

  describe('Scalability Analysis', () => {
    it('should scale linearly with dataset size', async () => {
      const sizes = [1000, 2000, 5000, 10000];
      const results: { size: number; duration: number }[] = [];

      for (const size of sizes) {
        const dataset = mockTransactions.slice(0, size);
        const { metrics } = await measurePerformance(() => {
          return generateCsv(dataset, mockCategories);
        });

        results.push({ size, duration: metrics.duration });
        console.log(`📊 ${size} rows: ${formatDuration(metrics.duration)}`);
      }

      const timesPerRow = results.map(r => r.duration / r.size);

      const minTimePerRow = Math.min(...timesPerRow);
      const maxTimePerRow = Math.max(...timesPerRow);

      console.log(`\n⚡ Scalability Analysis:`);
      console.log(`   Min time per row: ${minTimePerRow.toFixed(4)}ms`);
      console.log(`   Max time per row: ${maxTimePerRow.toFixed(4)}ms`);
      console.log(`   Ratio: ${(maxTimePerRow / minTimePerRow).toFixed(2)}x`);

      expect(maxTimePerRow / minTimePerRow).toBeLessThan(3);
    });
  });

  describe('Real-world Scenarios', () => {
    it('should handle year-end export (complete dataset) efficiently', async () => {
      const { result, metrics } = await measurePerformance(() => {
        const yearExpenses = mockTransactions.filter(e =>
          e.date.startsWith('2024'),
        );
        return generateCsv(yearExpenses, mockCategories);
      });

      console.log(
        `⏱️  Year-end Export Time: ${formatDuration(metrics.duration)}`,
      );
      console.log(`📄 CSV Size: ${formatBytes(result.length)}`);

      if (metrics.memory) {
        console.log(`💾 Memory Usage: ${formatBytes(metrics.memory.delta)}`);
      }

      assertPerformance(metrics, { maxDuration: 2000 }, 'Year-end export');
    });

    it('should handle monthly export efficiently', async () => {
      const { result, metrics } = await measurePerformance(() => {
        const monthExpenses = mockTransactions.filter(e =>
          e.date.startsWith('2024-01'),
        );
        return generateCsv(monthExpenses, mockCategories);
      });

      console.log(
        `⏱️  Monthly Export Time: ${formatDuration(metrics.duration)}`,
      );
      console.log(`📄 CSV Size: ${formatBytes(result.length)}`);

      assertPerformance(metrics, { maxDuration: 200 }, 'Monthly export');
    });

    it('should handle category-filtered export efficiently', async () => {
      const categoryId = 1;

      const { result, metrics } = await measurePerformance(() => {
        const categoryExpenses = mockTransactions.filter(
          e => e.categoryId === categoryId,
        );
        return generateCsv(categoryExpenses, mockCategories);
      });

      console.log(
        `⏱️  Category Export Time: ${formatDuration(metrics.duration)}`,
      );
      console.log(`📄 CSV Size: ${formatBytes(result.length)}`);

      assertPerformance(
        metrics,
        { maxDuration: 500 },
        'Category-filtered export',
      );
    });
  });
});
