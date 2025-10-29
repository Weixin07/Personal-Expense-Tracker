/**
 * Performance Test: CSV Generation
 * Tests CSV export performance with 10,000+ rows
 */

import {
  measurePerformance,
  assertPerformance,
  formatDuration,
  formatBytes,
  generateMockExpenses,
  generateMockCategories,
  benchmark,
} from './testHelpers';
import { buildExpensesCsv } from '../../export/csvBuilder';

// Wrapper function to match expected signature
const generateCsv = (expenses: ExpenseRecord[], categories: CategoryRecord[]): string => {
  const result = buildExpensesCsv({ expenses, categories });
  return result.content;
};
import type { ExpenseRecord, CategoryRecord } from '../../database/types';

describe('Performance: CSV Generation (10k rows)', () => {
  const EXPENSE_COUNT = 10000;
  let mockExpenses: ExpenseRecord[];
  let mockCategories: CategoryRecord[];

  beforeAll(() => {
    console.log(`\n📊 Generating ${EXPENSE_COUNT} mock expenses for CSV testing...`);
    mockExpenses = generateMockExpenses(EXPENSE_COUNT) as ExpenseRecord[];
    mockCategories = generateMockCategories();
    console.log(`✅ Generated ${mockExpenses.length} expenses\n`);
  });

  describe('CSV Generation Performance', () => {
    it('should generate CSV for 10k expenses in under 1 second', async () => {
      const { result, metrics } = await measurePerformance(() => {
        return generateCsv(mockExpenses, mockCategories);
      });

      console.log(`⏱️  CSV Generation Time: ${formatDuration(metrics.duration)}`);
      console.log(`📄 CSV Size: ${formatBytes(result.length)}`);
      console.log(`📊 Rows: ${result.split('\n').length - 1}`); // -1 for header

      if (metrics.memory) {
        console.log(`💾 Memory Delta: ${formatBytes(metrics.memory.delta)}`);
      }

      expect(result).toContain('id,description,amount_native,currency_code');
      expect(result.split('\n').length).toBeGreaterThan(EXPENSE_COUNT);

      assertPerformance(
        metrics,
        { maxDuration: 1000 }, // 1 second for 10k rows
        'Generating CSV for 10k expenses'
      );
    });

    it('should generate CSV with consistent performance across multiple runs', async () => {
      const iterations = 5;

      const { metrics } = await benchmark(
        () => generateCsv(mockExpenses, mockCategories),
        iterations
      );

      console.log(`\n📊 CSV Generation Benchmark (${iterations} iterations):`);
      console.log(`   Average: ${formatDuration(metrics.averageTime!)}`);
      console.log(`   Min: ${formatDuration(metrics.min)}`);
      console.log(`   Max: ${formatDuration(metrics.max)}`);
      console.log(`   Median: ${formatDuration(metrics.median)}`);
      console.log(`   P95: ${formatDuration(metrics.p95)}`);
      console.log(`   P99: ${formatDuration(metrics.p99)}`);

      // Performance should be consistent (max shouldn't be more than 2x average)
      expect(metrics.max).toBeLessThan(metrics.averageTime! * 2);
    });

    it('should generate CSV for small dataset in under 100ms', async () => {
      const smallDataset = mockExpenses.slice(0, 100);

      const { result, metrics } = await measurePerformance(() => {
        return generateCsv(smallDataset, mockCategories);
      });

      console.log(`⏱️  Small Dataset CSV Time: ${formatDuration(metrics.duration)}`);
      console.log(`📄 CSV Size: ${formatBytes(result.length)}`);

      assertPerformance(
        metrics,
        { maxDuration: 100 },
        'Generating CSV for 100 expenses'
      );
    });

    it('should generate CSV for medium dataset in under 300ms', async () => {
      const mediumDataset = mockExpenses.slice(0, 1000);

      const { result, metrics } = await measurePerformance(() => {
        return generateCsv(mediumDataset, mockCategories);
      });

      console.log(`⏱️  Medium Dataset CSV Time: ${formatDuration(metrics.duration)}`);
      console.log(`📄 CSV Size: ${formatBytes(result.length)}`);

      assertPerformance(
        metrics,
        { maxDuration: 300 },
        'Generating CSV for 1000 expenses'
      );
    });
  });

  describe('CSV Format Validation', () => {
    it('should produce valid CSV structure for 10k rows', async () => {
      const { result, metrics } = await measurePerformance(() => {
        return generateCsv(mockExpenses, mockCategories);
      });

      console.log(`⏱️  Validation Time: ${formatDuration(metrics.duration)}`);

      const lines = result.split('\n');
      const headerLine = lines[0];
      const dataLines = lines.slice(1).filter((line) => line.trim().length > 0);

      // Validate header
      expect(headerLine).toContain('id');
      expect(headerLine).toContain('description');
      expect(headerLine).toContain('amount_native');
      expect(headerLine).toContain('currency_code');

      // Validate row count
      expect(dataLines.length).toBe(EXPENSE_COUNT);

      // Validate first row structure
      const firstRow = dataLines[0].split(',');
      expect(firstRow.length).toBeGreaterThanOrEqual(4); // At least 4 columns

      console.log(`✅ CSV structure valid: ${dataLines.length} data rows`);
    });

    it('should handle special characters in 10k rows without corruption', async () => {
      // Create expenses with special characters
      const specialExpenses = mockExpenses.slice(0, 100).map((expense, i) => ({
        ...expense,
        description: i % 5 === 0 ? 'Expense with "quotes"' : expense.description,
        notes: i % 7 === 0 ? 'Notes with, commas' : expense.notes,
      }));

      const { result, metrics } = await measurePerformance(() => {
        return generateCsv(specialExpenses as ExpenseRecord[], mockCategories);
      });

      console.log(`⏱️  Special Characters CSV Time: ${formatDuration(metrics.duration)}`);

      // Verify CSV escaping works correctly
      expect(result).toContain('"Expense with ""quotes"""'); // CSV escaping for quotes

      const lines = result.split('\n');
      const dataLines = lines.slice(1).filter((line) => line.trim().length > 0);
      expect(dataLines.length).toBe(specialExpenses.length);
    });
  });

  describe('Memory Efficiency During CSV Generation', () => {
    it('should not leak memory during repeated CSV generation', async () => {
      const iterations = 10;
      const memoryDeltas: number[] = [];

      for (let i = 0; i < iterations; i++) {
        const { metrics } = await measurePerformance(() => {
          return generateCsv(mockExpenses, mockCategories);
        });

        if (metrics.memory) {
          memoryDeltas.push(metrics.memory.delta);
        }

        // Force garbage collection opportunity
        await new Promise((resolve) => setTimeout(resolve, 10));
      }

      if (memoryDeltas.length > 0) {
        const avgMemoryDelta = memoryDeltas.reduce((sum, delta) => sum + delta, 0) / memoryDeltas.length;
        const maxMemoryDelta = Math.max(...memoryDeltas);

        console.log(`💾 Average Memory Delta: ${formatBytes(avgMemoryDelta)}`);
        console.log(`💾 Max Memory Delta: ${formatBytes(maxMemoryDelta)}`);

        // Memory usage should not grow unbounded
        // Max delta shouldn't be more than 3x average (accounts for GC timing)
        expect(maxMemoryDelta).toBeLessThan(avgMemoryDelta * 3);
      }
    });
  });

  describe('Scalability Analysis', () => {
    it('should scale linearly with dataset size', async () => {
      const sizes = [1000, 2000, 5000, 10000];
      const results: { size: number; duration: number }[] = [];

      for (const size of sizes) {
        const dataset = mockExpenses.slice(0, size);
        const { metrics } = await measurePerformance(() => {
          return generateCsv(dataset, mockCategories);
        });

        results.push({ size, duration: metrics.duration });
        console.log(`📊 ${size} rows: ${formatDuration(metrics.duration)}`);
      }

      // Calculate time per row for each size
      const timesPerRow = results.map((r) => r.duration / r.size);

      // Time per row should be relatively consistent (within 2x)
      const minTimePerRow = Math.min(...timesPerRow);
      const maxTimePerRow = Math.max(...timesPerRow);

      console.log(`\n⚡ Scalability Analysis:`);
      console.log(`   Min time per row: ${minTimePerRow.toFixed(4)}ms`);
      console.log(`   Max time per row: ${maxTimePerRow.toFixed(4)}ms`);
      console.log(`   Ratio: ${(maxTimePerRow / minTimePerRow).toFixed(2)}x`);

      // Should scale roughly linearly (max 3x variation acceptable)
      expect(maxTimePerRow / minTimePerRow).toBeLessThan(3);
    });
  });

  describe('Real-world Scenarios', () => {
    it('should handle year-end export (complete dataset) efficiently', async () => {
      const { result, metrics } = await measurePerformance(() => {
        // Simulate exporting all expenses for the year
        const yearExpenses = mockExpenses.filter((e) => e.date.startsWith('2024'));
        return generateCsv(yearExpenses, mockCategories);
      });

      console.log(`⏱️  Year-end Export Time: ${formatDuration(metrics.duration)}`);
      console.log(`📄 CSV Size: ${formatBytes(result.length)}`);

      if (metrics.memory) {
        console.log(`💾 Memory Usage: ${formatBytes(metrics.memory.delta)}`);
      }

      // Year-end export should complete in reasonable time
      assertPerformance(
        metrics,
        { maxDuration: 2000 }, // 2 seconds max for any subset
        'Year-end export'
      );
    });

    it('should handle monthly export efficiently', async () => {
      const { result, metrics } = await measurePerformance(() => {
        // Simulate exporting one month of expenses
        const monthExpenses = mockExpenses.filter((e) => e.date.startsWith('2024-01'));
        return generateCsv(monthExpenses, mockCategories);
      });

      console.log(`⏱️  Monthly Export Time: ${formatDuration(metrics.duration)}`);
      console.log(`📄 CSV Size: ${formatBytes(result.length)}`);

      // Monthly export should be very fast
      assertPerformance(
        metrics,
        { maxDuration: 200 },
        'Monthly export'
      );
    });

    it('should handle category-filtered export efficiently', async () => {
      const categoryId = 1;

      const { result, metrics } = await measurePerformance(() => {
        const categoryExpenses = mockExpenses.filter((e) => e.categoryId === categoryId);
        return generateCsv(categoryExpenses, mockCategories);
      });

      console.log(`⏱️  Category Export Time: ${formatDuration(metrics.duration)}`);
      console.log(`📄 CSV Size: ${formatBytes(result.length)}`);

      assertPerformance(
        metrics,
        { maxDuration: 500 },
        'Category-filtered export'
      );
    });
  });
});
