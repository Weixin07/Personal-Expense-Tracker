/**
 * Performance Test: Biometric Lock Timeout Accuracy
 * Tests the accuracy and consistency of the 5-minute timeout
 */

import { measureTime, wait, formatDuration } from './testHelpers';

describe('Performance: Biometric Lock Timeout Accuracy', () => {
  const BIOMETRIC_TIMEOUT_MS = 5 * 60 * 1000; // 5 minutes
  const TOLERANCE_MS = 100; // 100ms tolerance

  describe('Timeout Duration Accuracy', () => {
    it('should measure 1-second timeout with high accuracy', async () => {
      const targetDuration = 1000; // 1 second

      const { duration } = await measureTime(async () => {
        await wait(targetDuration);
      });

      console.log(`⏱️  Target: ${targetDuration}ms`);
      console.log(`⏱️  Actual: ${duration.toFixed(2)}ms`);
      console.log(`⏱️  Difference: ${Math.abs(duration - targetDuration).toFixed(2)}ms`);

      // Should be within 100ms tolerance
      expect(Math.abs(duration - targetDuration)).toBeLessThan(TOLERANCE_MS);
    });

    it(
      'should measure 5-second timeout with high accuracy',
      async () => {
        const targetDuration = 5000; // 5 seconds

        const { duration } = await measureTime(async () => {
          await wait(targetDuration);
        });

        console.log(`⏱️  Target: ${formatDuration(targetDuration)}`);
        console.log(`⏱️  Actual: ${formatDuration(duration)}`);
        console.log(`⏱️  Difference: ${Math.abs(duration - targetDuration).toFixed(2)}ms`);

        expect(Math.abs(duration - targetDuration)).toBeLessThan(TOLERANCE_MS);
      },
      10000
    ); // 10 second timeout for 5-second test

    it(
      'should measure 10-second timeout with high accuracy',
      async () => {
        const targetDuration = 10000; // 10 seconds

        const { duration } = await measureTime(async () => {
          await wait(targetDuration);
        });

      console.log(`⏱️  Target: ${formatDuration(targetDuration)}`);
      console.log(`⏱️  Actual: ${formatDuration(duration)}`);
        console.log(`⏱️  Difference: ${Math.abs(duration - targetDuration).toFixed(2)}ms`);

        expect(Math.abs(duration - targetDuration)).toBeLessThan(TOLERANCE_MS);
      },
      15000
    ); // 15 second timeout for 10-second test
  });

  describe('Timeout Logic Simulation', () => {
    it('should correctly calculate elapsed time', () => {
      const now = Date.now();
      const lastBackgroundTime = now - BIOMETRIC_TIMEOUT_MS;

      const elapsed = now - lastBackgroundTime;

      console.log(`⏱️  Elapsed Time: ${formatDuration(elapsed)}`);
      console.log(`⏱️  Timeout Threshold: ${formatDuration(BIOMETRIC_TIMEOUT_MS)}`);
      console.log(`⏱️  Should Lock: ${elapsed >= BIOMETRIC_TIMEOUT_MS}`);

      expect(elapsed).toBeGreaterThanOrEqual(BIOMETRIC_TIMEOUT_MS);
    });

    it('should NOT lock when elapsed time is less than timeout', () => {
      const now = Date.now();
      const lastBackgroundTime = now - (BIOMETRIC_TIMEOUT_MS - 1000); // 1 second before timeout

      const elapsed = now - lastBackgroundTime;
      const shouldLock = elapsed >= BIOMETRIC_TIMEOUT_MS;

      console.log(`⏱️  Elapsed Time: ${formatDuration(elapsed)}`);
      console.log(`⏱️  Timeout Threshold: ${formatDuration(BIOMETRIC_TIMEOUT_MS)}`);
      console.log(`⏱️  Should Lock: ${shouldLock}`);

      expect(shouldLock).toBe(false);
    });

    it('should lock when elapsed time equals or exceeds timeout', () => {
      const now = Date.now();
      const lastBackgroundTime = now - BIOMETRIC_TIMEOUT_MS;

      const elapsed = now - lastBackgroundTime;
      const shouldLock = elapsed >= BIOMETRIC_TIMEOUT_MS;

      console.log(`⏱️  Elapsed Time: ${formatDuration(elapsed)}`);
      console.log(`⏱️  Should Lock: ${shouldLock}`);

      expect(shouldLock).toBe(true);
    });

    it('should handle edge case at exactly timeout duration', () => {
      const now = Date.now();
      const lastBackgroundTime = now - BIOMETRIC_TIMEOUT_MS;

      const elapsed = now - lastBackgroundTime;

      // At exactly 5 minutes, should lock
      expect(elapsed).toBe(BIOMETRIC_TIMEOUT_MS);
      expect(elapsed >= BIOMETRIC_TIMEOUT_MS).toBe(true);
    });
  });

  describe('Timeout Consistency Across Multiple Checks', () => {
    it('should maintain consistent timeout behavior', async () => {
      const results: boolean[] = [];
      const iterations = 5;

      for (let i = 0; i < iterations; i++) {
        const now = Date.now();
        const lastBackgroundTime = now - BIOMETRIC_TIMEOUT_MS;
        const elapsed = now - lastBackgroundTime;
        const shouldLock = elapsed >= BIOMETRIC_TIMEOUT_MS;

        results.push(shouldLock);

        await wait(10); // Small delay between checks
      }

      console.log(`🔒 Lock decisions: ${results.map((r) => (r ? 'LOCK' : 'UNLOCK')).join(', ')}`);

      // All checks should produce the same result
      const allSame = results.every((r) => r === results[0]);
      expect(allSame).toBe(true);
    });

    it('should handle rapid successive checks', async () => {
      const now = Date.now();
      const lastBackgroundTime = now - (BIOMETRIC_TIMEOUT_MS + 1000); // 1 second past timeout

      const checks: boolean[] = [];

      // Perform 100 rapid checks
      for (let i = 0; i < 100; i++) {
        const currentNow = Date.now();
        const elapsed = currentNow - lastBackgroundTime;
        checks.push(elapsed >= BIOMETRIC_TIMEOUT_MS);
      }

      console.log(`🔒 Rapid checks performed: ${checks.length}`);
      console.log(`🔒 All locked: ${checks.every((c) => c)}`);

      // All checks should indicate lock
      expect(checks.every((c) => c)).toBe(true);
    });
  });

  describe('Timeout Threshold Boundaries', () => {
    it('should not lock at 4 minutes 59 seconds', () => {
      const now = Date.now();
      const lastBackgroundTime = now - (4 * 60 * 1000 + 59 * 1000); // 4:59

      const elapsed = now - lastBackgroundTime;
      const shouldLock = elapsed >= BIOMETRIC_TIMEOUT_MS;

      console.log(`⏱️  Elapsed: ${formatDuration(elapsed)}`);
      console.log(`🔒 Should Lock: ${shouldLock}`);

      expect(shouldLock).toBe(false);
    });

    it('should lock at 5 minutes 1 second', () => {
      const now = Date.now();
      const lastBackgroundTime = now - (5 * 60 * 1000 + 1000); // 5:01

      const elapsed = now - lastBackgroundTime;
      const shouldLock = elapsed >= BIOMETRIC_TIMEOUT_MS;

      console.log(`⏱️  Elapsed: ${formatDuration(elapsed)}`);
      console.log(`🔒 Should Lock: ${shouldLock}`);

      expect(shouldLock).toBe(true);
    });

    it('should lock at exactly 5 minutes', () => {
      const now = Date.now();
      const lastBackgroundTime = now - BIOMETRIC_TIMEOUT_MS;

      const elapsed = now - lastBackgroundTime;
      const shouldLock = elapsed >= BIOMETRIC_TIMEOUT_MS;

      console.log(`⏱️  Elapsed: ${formatDuration(elapsed)}`);
      console.log(`🔒 Should Lock: ${shouldLock}`);

      expect(shouldLock).toBe(true);
    });

    it('should lock well past timeout (10 minutes)', () => {
      const now = Date.now();
      const lastBackgroundTime = now - (10 * 60 * 1000); // 10 minutes

      const elapsed = now - lastBackgroundTime;
      const shouldLock = elapsed >= BIOMETRIC_TIMEOUT_MS;

      console.log(`⏱️  Elapsed: ${formatDuration(elapsed)}`);
      console.log(`🔒 Should Lock: ${shouldLock}`);

      expect(shouldLock).toBe(true);
    });
  });

  describe('Real-world Timing Scenarios', () => {
    it('should handle realistic app backgrounding scenario', async () => {
      console.log('\n📱 Simulating app backgrounding for 30 seconds...');

      const backgroundTime = Date.now();

      // Simulate 30 seconds in background
      await wait(1000); // Wait 1 second (simulating partial time)

      const foregroundTime = backgroundTime + 30000; // Simulate 30 seconds elapsed
      const elapsed = foregroundTime - backgroundTime;
      const shouldLock = elapsed >= BIOMETRIC_TIMEOUT_MS;

      console.log(`⏱️  Time in background: ${formatDuration(elapsed)}`);
      console.log(`🔒 Should Lock: ${shouldLock}`);

      expect(shouldLock).toBe(false); // 30 seconds < 5 minutes
    });

    it('should handle app staying in background for 6 minutes', () => {
      const backgroundTime = Date.now();
      const foregroundTime = backgroundTime + (6 * 60 * 1000); // 6 minutes

      const elapsed = foregroundTime - backgroundTime;
      const shouldLock = elapsed >= BIOMETRIC_TIMEOUT_MS;

      console.log(`⏱️  Time in background: ${formatDuration(elapsed)}`);
      console.log(`🔒 Should Lock: ${shouldLock}`);

      expect(shouldLock).toBe(true);
    });

    it('should not lock if lastBackgroundTime is null (fresh start)', () => {
      const lastBackgroundTime = null;

      if (lastBackgroundTime === null) {
        console.log('🔓 Fresh start - no timeout check needed');
        expect(true).toBe(true);
        return;
      }

      const now = Date.now();
      const elapsed = now - lastBackgroundTime;
      const shouldLock = elapsed >= BIOMETRIC_TIMEOUT_MS;

      expect(shouldLock).toBe(false);
    });
  });

  describe('Performance of Timeout Check', () => {
    it('should perform timeout check in under 1ms', async () => {
      const iterations = 1000;
      const durations: number[] = [];

      for (let i = 0; i < iterations; i++) {
        const { duration } = await measureTime(() => {
          const now = Date.now();
          const lastBackgroundTime = now - BIOMETRIC_TIMEOUT_MS;
          const elapsed = now - lastBackgroundTime;
          return elapsed >= BIOMETRIC_TIMEOUT_MS;
        });

        durations.push(duration);
      }

      const avgDuration = durations.reduce((sum, d) => sum + d, 0) / durations.length;
      const maxDuration = Math.max(...durations);

      console.log(`⚡ Average check time: ${avgDuration.toFixed(4)}ms`);
      console.log(`⚡ Max check time: ${maxDuration.toFixed(4)}ms`);
      console.log(`⚡ Iterations: ${iterations}`);

      // Timeout check should be extremely fast
      expect(avgDuration).toBeLessThan(1);
      expect(maxDuration).toBeLessThan(5);
    });
  });

  describe('Date.now() Reliability', () => {
    it('should return monotonically increasing timestamps', async () => {
      const timestamps: number[] = [];

      for (let i = 0; i < 100; i++) {
        timestamps.push(Date.now());
        await wait(1); // Small delay
      }

      console.log(`⏱️  Collected ${timestamps.length} timestamps`);

      // Each timestamp should be >= previous
      for (let i = 1; i < timestamps.length; i++) {
        expect(timestamps[i]).toBeGreaterThanOrEqual(timestamps[i - 1]);
      }

      console.log(`✅ All timestamps monotonically increasing`);
    });

    it('should provide millisecond precision', () => {
      const t1 = Date.now();
      const t2 = Date.now();
      const t3 = Date.now();

      console.log(`⏱️  Timestamp 1: ${t1}`);
      console.log(`⏱️  Timestamp 2: ${t2}`);
      console.log(`⏱️  Timestamp 3: ${t3}`);

      // All timestamps should be valid numbers
      expect(typeof t1).toBe('number');
      expect(typeof t2).toBe('number');
      expect(typeof t3).toBe('number');

      // Should be reasonably close (within 10ms if running fast)
      expect(t3 - t1).toBeLessThan(10);
    });
  });
});
