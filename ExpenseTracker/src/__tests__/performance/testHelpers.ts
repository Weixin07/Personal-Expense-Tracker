/**
 * Performance Testing Helpers
 * Utilities for measuring and validating performance characteristics
 */

export type PerformanceMetrics = {
  duration: number;
  memory?: {
    usedBefore: number;
    usedAfter: number;
    delta: number;
  };
  iterations?: number;
  averageTime?: number;
};

export type PerformanceThresholds = {
  maxDuration?: number;
  maxMemoryDelta?: number;
  minIterationsPerSecond?: number;
};

/**
 * Measure execution time of a function
 */
export const measureTime = async <T>(
  fn: () => T | Promise<T>
): Promise<{ result: T; duration: number }> => {
  const start = performance.now();
  const result = await fn();
  const duration = performance.now() - start;
  return { result, duration };
};

/**
 * Measure memory usage (if available)
 */
export const measureMemory = (): { used: number } | null => {
  if (typeof performance !== 'undefined' && (performance as any).memory) {
    return {
      used: (performance as any).memory.usedJSHeapSize,
    };
  }
  return null;
};

/**
 * Measure both time and memory for a function
 */
export const measurePerformance = async <T>(
  fn: () => T | Promise<T>
): Promise<{ result: T; metrics: PerformanceMetrics }> => {
  const memoryBefore = measureMemory();
  const { result, duration } = await measureTime(fn);
  const memoryAfter = measureMemory();

  const metrics: PerformanceMetrics = {
    duration,
  };

  if (memoryBefore && memoryAfter) {
    metrics.memory = {
      usedBefore: memoryBefore.used,
      usedAfter: memoryAfter.used,
      delta: memoryAfter.used - memoryBefore.used,
    };
  }

  return { result, metrics };
};

/**
 * Run a function multiple times and collect statistics
 */
export const benchmark = async <T>(
  fn: () => T | Promise<T>,
  iterations: number = 100
): Promise<{
  results: T[];
  metrics: PerformanceMetrics & {
    min: number;
    max: number;
    median: number;
    p95: number;
    p99: number;
  };
}> => {
  const results: T[] = [];
  const durations: number[] = [];

  for (let i = 0; i < iterations; i++) {
    const { result, duration } = await measureTime(fn);
    results.push(result);
    durations.push(duration);
  }

  const sorted = [...durations].sort((a, b) => a - b);
  const total = durations.reduce((sum, d) => sum + d, 0);

  return {
    results,
    metrics: {
      duration: total,
      iterations,
      averageTime: total / iterations,
      min: sorted[0],
      max: sorted[sorted.length - 1],
      median: sorted[Math.floor(sorted.length / 2)],
      p95: sorted[Math.floor(sorted.length * 0.95)],
      p99: sorted[Math.floor(sorted.length * 0.99)],
    },
  };
};

/**
 * Assert performance meets thresholds
 */
export const assertPerformance = (
  metrics: PerformanceMetrics,
  thresholds: PerformanceThresholds,
  description: string = 'Performance test'
): void => {
  if (thresholds.maxDuration !== undefined) {
    if (metrics.duration > thresholds.maxDuration) {
      throw new Error(
        `${description}: Duration ${metrics.duration.toFixed(2)}ms exceeds threshold ${thresholds.maxDuration}ms`
      );
    }
  }

  if (thresholds.maxMemoryDelta !== undefined && metrics.memory) {
    if (metrics.memory.delta > thresholds.maxMemoryDelta) {
      throw new Error(
        `${description}: Memory delta ${formatBytes(metrics.memory.delta)} exceeds threshold ${formatBytes(thresholds.maxMemoryDelta)}`
      );
    }
  }

  if (thresholds.minIterationsPerSecond !== undefined && metrics.iterations && metrics.duration) {
    const iterationsPerSecond = (metrics.iterations / metrics.duration) * 1000;
    if (iterationsPerSecond < thresholds.minIterationsPerSecond) {
      throw new Error(
        `${description}: ${iterationsPerSecond.toFixed(2)} iterations/sec is below threshold ${thresholds.minIterationsPerSecond}`
      );
    }
  }
};

/**
 * Format bytes to human-readable string
 */
export const formatBytes = (bytes: number): string => {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${(bytes / Math.pow(k, i)).toFixed(2)} ${sizes[i]}`;
};

/**
 * Format duration to human-readable string
 */
export const formatDuration = (ms: number): string => {
  if (ms < 1000) {
    return `${ms.toFixed(2)}ms`;
  }
  if (ms < 60000) {
    return `${(ms / 1000).toFixed(2)}s`;
  }
  return `${(ms / 60000).toFixed(2)}min`;
};

/**
 * Generate mock expense data for performance testing
 */
export const generateMockExpenses = (count: number) => {
  const categories = ['Food', 'Transport', 'Entertainment', 'Shopping', 'Bills', 'Healthcare'];
  const currencies = ['USD', 'EUR', 'GBP', 'JPY'];
  const descriptions = [
    'Grocery shopping',
    'Gas station',
    'Restaurant',
    'Coffee shop',
    'Cinema tickets',
    'Online purchase',
    'Utility bill',
    'Doctor visit',
  ];

  const expenses = [];
  const startDate = new Date('2020-01-01');
  const endDate = new Date();
  const dateRange = endDate.getTime() - startDate.getTime();

  for (let i = 0; i < count; i++) {
    const date = new Date(startDate.getTime() + Math.random() * dateRange);
    const amount = Math.random() * 500 + 10;
    const currency = currencies[Math.floor(Math.random() * currencies.length)];
    const fxRate = currency === 'USD' ? 1.0 : 0.8 + Math.random() * 0.4;

    expenses.push({
      id: i + 1,
      description: descriptions[Math.floor(Math.random() * descriptions.length)],
      amountNative: parseFloat(amount.toFixed(2)),
      currencyCode: currency,
      fxRateToBase: parseFloat(fxRate.toFixed(6)),
      baseAmount: parseFloat((amount * fxRate).toFixed(6)),
      date: date.toISOString().split('T')[0],
      categoryId: Math.floor(Math.random() * categories.length) + 1,
      notes: Math.random() > 0.5 ? `Note for expense ${i + 1}` : null,
      createdAt: date.toISOString(),
      updatedAt: date.toISOString(),
    });
  }

  return expenses;
};

/**
 * Generate mock categories for performance testing
 */
export const generateMockCategories = () => {
  return [
    { id: 1, name: 'Food', createdAt: '2020-01-01T00:00:00.000Z', updatedAt: '2020-01-01T00:00:00.000Z' },
    { id: 2, name: 'Transport', createdAt: '2020-01-01T00:00:00.000Z', updatedAt: '2020-01-01T00:00:00.000Z' },
    { id: 3, name: 'Entertainment', createdAt: '2020-01-01T00:00:00.000Z', updatedAt: '2020-01-01T00:00:00.000Z' },
    { id: 4, name: 'Shopping', createdAt: '2020-01-01T00:00:00.000Z', updatedAt: '2020-01-01T00:00:00.000Z' },
    { id: 5, name: 'Bills', createdAt: '2020-01-01T00:00:00.000Z', updatedAt: '2020-01-01T00:00:00.000Z' },
    { id: 6, name: 'Healthcare', createdAt: '2020-01-01T00:00:00.000Z', updatedAt: '2020-01-01T00:00:00.000Z' },
  ];
};

/**
 * Wait for a specified duration
 */
export const wait = (ms: number): Promise<void> => {
  return new Promise((resolve) => setTimeout(resolve, ms));
};

/**
 * Run test with timeout
 */
export const withTimeout = async <T>(
  fn: () => Promise<T>,
  timeoutMs: number,
  errorMessage: string = 'Operation timed out'
): Promise<T> => {
  return Promise.race([
    fn(),
    new Promise<T>((_, reject) =>
      setTimeout(() => reject(new Error(errorMessage)), timeoutMs)
    ),
  ]);
};
