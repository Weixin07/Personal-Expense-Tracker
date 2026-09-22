/**
 * Performance Test: Biometric Lock Timeout Accuracy
 * Measurement accuracy, and the lock decision at every auto-lock preset.
 */

import { measureTime, wait, formatDuration } from './testHelpers';
import {
  getAutoLockPresets,
  type AutoLockPreset,
} from '../../constants/autoLockPresets';

const idleTimeoutMs = (minutes: number | null): number | null =>
  minutes === null ? null : minutes * 60 * 1000;

const shouldLock = (elapsedMs: number, timeoutMs: number | null): boolean =>
  timeoutMs !== null && elapsedMs >= timeoutMs;

const idlePresets: AutoLockPreset[] = getAutoLockPresets().filter(
  preset => preset.minutes !== null && preset.minutes > 0,
);

describe('Performance: Biometric Lock Timeout Accuracy', () => {
  const TOLERANCE_MS = 100;

  describe('Timeout Duration Accuracy', () => {
    it('should measure 1-second timeout with high accuracy', async () => {
      const targetDuration = 1000;

      const { duration } = await measureTime(async () => {
        await wait(targetDuration);
      });

      console.log(`⏱️  Target: ${targetDuration}ms`);
      console.log(`⏱️  Actual: ${duration.toFixed(2)}ms`);

      expect(duration).toBeGreaterThanOrEqual(targetDuration - TOLERANCE_MS);
      expect(duration).toBeLessThan(targetDuration + TOLERANCE_MS * 5);
    }, 10000);

    it('should measure 5-second timeout with high accuracy', async () => {
      const targetDuration = 5000;

      const { duration } = await measureTime(async () => {
        await wait(targetDuration);
      });

      console.log(`⏱️  Target: ${targetDuration}ms`);
      console.log(`⏱️  Actual: ${duration.toFixed(2)}ms`);

      expect(duration).toBeGreaterThanOrEqual(targetDuration - TOLERANCE_MS);
      expect(duration).toBeLessThan(targetDuration + TOLERANCE_MS * 5);
    }, 15000);

    it('should measure 10-second timeout with high accuracy', async () => {
      const targetDuration = 10000;

      const { duration } = await measureTime(async () => {
        await wait(targetDuration);
      });

      console.log(`⏱️  Target: ${formatDuration(targetDuration)}`);
      console.log(`⏱️  Actual: ${formatDuration(duration)}`);

      expect(duration).toBeGreaterThanOrEqual(targetDuration - TOLERANCE_MS);
      expect(duration).toBeLessThan(targetDuration + TOLERANCE_MS * 5);
    }, 20000);
  });

  describe('Timeout Threshold Boundaries', () => {
    it.each(idlePresets)(
      'locks at exactly the $label threshold',
      ({ minutes }) => {
        const timeoutMs = idleTimeoutMs(minutes);
        const elapsed = timeoutMs as number;

        console.log(`⏱️  Elapsed: ${formatDuration(elapsed)}`);
        expect(shouldLock(elapsed, timeoutMs)).toBe(true);
      },
    );

    it.each(idlePresets)(
      'does not lock one second under the $label threshold',
      ({ minutes }) => {
        const timeoutMs = idleTimeoutMs(minutes) as number;
        const elapsed = timeoutMs - 1000;

        console.log(`⏱️  Elapsed: ${formatDuration(elapsed)}`);
        expect(shouldLock(elapsed, timeoutMs)).toBe(false);
      },
    );

    it.each(idlePresets)(
      'locks one second past the $label threshold',
      ({ minutes }) => {
        const timeoutMs = idleTimeoutMs(minutes) as number;
        expect(shouldLock(timeoutMs + 1000, timeoutMs)).toBe(true);
      },
    );

    it('locks on any background transition when set to Immediately', () => {
      const timeoutMs = idleTimeoutMs(0);
      expect(shouldLock(0, timeoutMs)).toBe(true);
      expect(shouldLock(1, timeoutMs)).toBe(true);
    });

    it('never locks on idle when set to Never', () => {
      const timeoutMs = idleTimeoutMs(null);
      expect(shouldLock(24 * 60 * 60 * 1000, timeoutMs)).toBe(false);
    });
  });

  describe('Timeout Consistency Across Multiple Checks', () => {
    it('should maintain consistent timeout behavior', async () => {
      const timeoutMs = idleTimeoutMs(5) as number;
      const results: boolean[] = [];

      for (let index = 0; index < 5; index += 1) {
        const now = Date.now();
        const lastBackgroundTime = now - timeoutMs;
        results.push(shouldLock(now - lastBackgroundTime, timeoutMs));
        await wait(10);
      }

      console.log(
        `🔒 Lock decisions: ${results.map(r => (r ? 'LOCK' : 'UNLOCK')).join(', ')}`,
      );

      expect(results.every(result => result === results[0])).toBe(true);
    });

    it('should handle rapid successive checks', () => {
      const timeoutMs = idleTimeoutMs(5) as number;
      const lastBackgroundTime = Date.now() - (timeoutMs + 1000);

      const checks = Array.from({ length: 100 }, () =>
        shouldLock(Date.now() - lastBackgroundTime, timeoutMs),
      );

      console.log(`🔒 Rapid checks performed: ${checks.length}`);
      expect(checks.every(check => check)).toBe(true);
    });
  });

  describe('Performance of Timeout Check', () => {
    it('should perform timeout check in under 1ms', async () => {
      const iterations = 1000;
      const timeoutMs = idleTimeoutMs(5);
      const durations: number[] = [];

      for (let index = 0; index < iterations; index += 1) {
        const { duration } = await measureTime(() => {
          const now = Date.now();
          return shouldLock(now - (now - (timeoutMs as number)), timeoutMs);
        });

        durations.push(duration);
      }

      const avgDuration =
        durations.reduce((sum, value) => sum + value, 0) / durations.length;
      const maxDuration = Math.max(...durations);

      console.log(`⚡ Average check time: ${avgDuration.toFixed(4)}ms`);
      console.log(`⚡ Max check time: ${maxDuration.toFixed(4)}ms`);

      expect(avgDuration).toBeLessThan(1);
      expect(maxDuration).toBeLessThan(5);
    }, 20000);
  });

  /**
   * The lockout in `lockoutPolicy` expires by comparing stored wall-clock
   * timestamps, so these properties of `Date.now()` are load-bearing for it, not
   * only for the idle timer.
   */
  describe('Date.now() Reliability', () => {
    it('should return monotonically increasing timestamps', async () => {
      const timestamps: number[] = [];

      for (let index = 0; index < 100; index += 1) {
        timestamps.push(Date.now());
        await wait(1);
      }

      console.log(`⏱️  Collected ${timestamps.length} timestamps`);

      for (let index = 1; index < timestamps.length; index += 1) {
        expect(timestamps[index]).toBeGreaterThanOrEqual(timestamps[index - 1]);
      }
    }, 10000);

    it('should provide millisecond precision', () => {
      const first = Date.now();
      const second = Date.now();
      const third = Date.now();

      expect(typeof first).toBe('number');
      expect(typeof second).toBe('number');
      expect(typeof third).toBe('number');

      expect(third - first).toBeLessThan(10);
    });
  });
});
