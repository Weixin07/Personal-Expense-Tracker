import NativeAppPinCrypto from '../NativeAppPinCrypto';
import {
  calibrateIterations,
  PIN_ITERATIONS_MAX,
  PIN_ITERATIONS_MIN,
} from '../pinCalibration';

/**
 * `now` advances by `elapsedMs` on every second reading, so a probe appears to
 * take exactly that long however fast the mocked derive actually resolves.
 */
const clockTaking = (elapsedMs: number) => {
  let current = 0;
  let call = 0;
  return () => {
    call += 1;
    if (call % 2 === 0) {
      current += elapsedMs;
    }
    return current;
  };
};

beforeEach(() => {
  jest.clearAllMocks();
});

describe('calibrateIterations', () => {
  it('discards a warm-up run before measuring', async () => {
    await calibrateIterations({ now: clockTaking(100) });
    expect(NativeAppPinCrypto.pbkdf2Sha256Base64).toHaveBeenCalledTimes(2);
  });

  it('scales the count toward the target budget', async () => {
    // A 50k probe taking 125ms implies twice that within a 250ms target.
    const iterations = await calibrateIterations({ now: clockTaking(125) });
    expect(iterations).toBe(100_000);
  });

  // Clamped under the rule on `calibrateIterations`.
  it('clamps a slow device up to the floor', async () => {
    const iterations = await calibrateIterations({ now: clockTaking(10_000) });
    expect(iterations).toBe(PIN_ITERATIONS_MIN);
  });

  it('clamps a fast device down to the ceiling', async () => {
    const iterations = await calibrateIterations({ now: clockTaking(1) });
    expect(iterations).toBe(PIN_ITERATIONS_MAX);
  });

  it('returns the ceiling when the probe is too fast to time', async () => {
    const iterations = await calibrateIterations({ now: () => 0 });
    expect(iterations).toBe(PIN_ITERATIONS_MAX);
  });

  it('stays within the clamp for every plausible device speed', async () => {
    for (const elapsed of [1, 20, 125, 250, 900, 5_000]) {
      const iterations = await calibrateIterations({
        now: clockTaking(elapsed),
      });
      expect(iterations).toBeGreaterThanOrEqual(PIN_ITERATIONS_MIN);
      expect(iterations).toBeLessThanOrEqual(PIN_ITERATIONS_MAX);
    }
  });
});

describe('calibrateIterations default clock', () => {
  it('uses the real clock when none is injected', async () => {
    const iterations = await calibrateIterations();
    expect(iterations).toBeGreaterThanOrEqual(PIN_ITERATIONS_MIN);
    expect(iterations).toBeLessThanOrEqual(PIN_ITERATIONS_MAX);
  });
});
