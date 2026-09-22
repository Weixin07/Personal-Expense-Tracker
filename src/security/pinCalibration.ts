import { derive, generateSaltB64 } from './pinHash';

export const PIN_CALIBRATION_TARGET_MS = 250;
export const PIN_ITERATIONS_MIN = 100_000;
export const PIN_ITERATIONS_MAX = 1_000_000;

const PROBE_ITERATIONS = 50_000;
const PROBE_PIN = '000000';

export type CalibrationOptions = {
  now?: () => number;
};

/**
 * Chooses the iteration count this device can derive within the target budget,
 * clamped so a device measured while throttled cannot produce a weak record and
 * a fast one cannot produce a count that ages badly. Runs at enrolment and on
 * PIN change only — never on unlock, which must stay a pure verify.
 */
export const calibrateIterations = async ({
  now = Date.now,
}: CalibrationOptions = {}): Promise<number> => {
  const saltB64 = await generateSaltB64();

  // Discarded: the first derivation also pays for JIT warm-up and provider
  // initialisation, which would scale into the returned count.
  await derive(PROBE_PIN, saltB64, PROBE_ITERATIONS);

  const startedAt = now();
  await derive(PROBE_PIN, saltB64, PROBE_ITERATIONS);
  const elapsedMs = now() - startedAt;

  if (elapsedMs <= 0) {
    return PIN_ITERATIONS_MAX;
  }

  const scaled = Math.round(
    PROBE_ITERATIONS * (PIN_CALIBRATION_TARGET_MS / elapsedMs),
  );
  return Math.min(PIN_ITERATIONS_MAX, Math.max(PIN_ITERATIONS_MIN, scaled));
};
