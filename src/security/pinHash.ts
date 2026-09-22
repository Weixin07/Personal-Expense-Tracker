import NativeAppPinCrypto from './NativeAppPinCrypto';

export const PIN_RECORD_VERSION = 1;
export const PIN_KDF_ALGORITHM = 'PBKDF2-HMAC-SHA256';

const SALT_BYTES = 16;
const KEY_LENGTH_BITS = 256;

/**
 * A stored PIN. `iterations` is per-device — it is calibrated at enrolment, so
 * two installs of the same build legitimately hold different counts. `v` exists
 * so the parameters can be raised later without invalidating existing records.
 */
export type PinRecord = {
  v: number;
  algorithm: string;
  iterations: number;
  saltB64: string;
  hashB64: string;
};

export class PinRecordError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PinRecordError';
  }
}

export const generateSaltB64 = (): Promise<string> =>
  NativeAppPinCrypto.randomBytesBase64(SALT_BYTES);

export const derive = (
  pin: string,
  saltB64: string,
  iterations: number,
): Promise<string> =>
  NativeAppPinCrypto.pbkdf2Sha256Base64(
    pin,
    saltB64,
    iterations,
    KEY_LENGTH_BITS,
  );

/**
 * Compares without an early return, so the time taken does not depend on how
 * many leading characters match.
 */
const constantTimeEquals = (a: string, b: string): boolean => {
  const length = Math.max(a.length, b.length);
  let difference = a.length ^ b.length;
  for (let index = 0; index < length; index += 1) {
    difference |= (a.charCodeAt(index) || 0) ^ (b.charCodeAt(index) || 0);
  }
  return difference === 0;
};

export const createRecord = async (
  pin: string,
  iterations: number,
): Promise<PinRecord> => {
  const saltB64 = await generateSaltB64();
  const hashB64 = await derive(pin, saltB64, iterations);
  return {
    v: PIN_RECORD_VERSION,
    algorithm: PIN_KDF_ALGORITHM,
    iterations,
    saltB64,
    hashB64,
  };
};

export const verify = async (
  pin: string,
  record: PinRecord,
): Promise<boolean> => {
  const candidate = await derive(pin, record.saltB64, record.iterations);
  return constantTimeEquals(candidate, record.hashB64);
};

export const encodeRecord = (record: PinRecord): string =>
  JSON.stringify(record);

/**
 * @throws PinRecordError when the stored value is not a usable record. Callers
 * must treat that as "a PIN exists but cannot be used", never as "no PIN set" —
 * the second reading would unlock the app.
 */
export const decodeRecord = (raw: string): PinRecord => {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new PinRecordError('Stored PIN record is not valid JSON.');
  }

  if (typeof parsed !== 'object' || parsed === null) {
    throw new PinRecordError('Stored PIN record is not an object.');
  }

  const candidate = parsed as Partial<PinRecord>;
  if (
    typeof candidate.v !== 'number' ||
    typeof candidate.algorithm !== 'string' ||
    typeof candidate.iterations !== 'number' ||
    typeof candidate.saltB64 !== 'string' ||
    typeof candidate.hashB64 !== 'string'
  ) {
    throw new PinRecordError('Stored PIN record is missing required fields.');
  }

  if (candidate.algorithm !== PIN_KDF_ALGORITHM) {
    throw new PinRecordError(
      `Stored PIN record uses unsupported algorithm ${candidate.algorithm}.`,
    );
  }

  return {
    v: candidate.v,
    algorithm: candidate.algorithm,
    iterations: candidate.iterations,
    saltB64: candidate.saltB64,
    hashB64: candidate.hashB64,
  };
};
