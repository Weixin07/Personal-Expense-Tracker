import {
  createRecord,
  decodeRecord,
  encodeRecord,
  PinRecordError,
  PIN_KDF_ALGORITHM,
  PIN_RECORD_VERSION,
  verify,
} from '../pinHash';

const ITERATIONS = 150_000;

describe('pinHash', () => {
  it('derives the same hash for the same PIN and salt', async () => {
    const record = await createRecord('846207', ITERATIONS);
    const again = await verify('846207', record);
    expect(again).toBe(true);
  });

  it('derives a different hash for the same PIN under a different salt', async () => {
    const first = await createRecord('846207', ITERATIONS);
    const second = await createRecord('846207', ITERATIONS);
    expect(first.saltB64).not.toEqual(second.saltB64);
    expect(first.hashB64).not.toEqual(second.hashB64);
  });

  it('rejects a wrong PIN', async () => {
    const record = await createRecord('846207', ITERATIONS);
    await expect(verify('846208', record)).resolves.toBe(false);
  });

  it('stores no trace of the PIN in the record', async () => {
    const pin = '846207';
    const record = await createRecord(pin, ITERATIONS);
    const serialised = encodeRecord(record);
    expect(serialised).not.toContain(pin);
    expect(record.hashB64).not.toContain(pin);
    expect(record.saltB64).not.toContain(pin);
  });

  it('round-trips a record through encode and decode', async () => {
    const record = await createRecord('846207', ITERATIONS);
    const decoded = decodeRecord(encodeRecord(record));
    expect(decoded).toEqual(record);
    expect(decoded.v).toBe(PIN_RECORD_VERSION);
    expect(decoded.algorithm).toBe(PIN_KDF_ALGORITHM);
    expect(decoded.iterations).toBe(ITERATIONS);
  });

  // A decode failure must never read as "no PIN set", which would unlock the app.
  it.each([
    ['not json', 'definitely-not-json'],
    ['a non-object', '42'],
    ['a record missing fields', '{"v":1}'],
    [
      'an unsupported algorithm',
      JSON.stringify({
        v: 1,
        algorithm: 'MD5',
        iterations: 1,
        saltB64: 'aa',
        hashB64: 'bb',
      }),
    ],
  ])('throws on %s rather than returning null', (_label, raw) => {
    expect(() => decodeRecord(raw)).toThrow(PinRecordError);
  });
});

describe('constant-time comparison', () => {
  it('rejects a hash of a different length without throwing', async () => {
    const record = await createRecord('846207', ITERATIONS);
    const truncated = { ...record, hashB64: record.hashB64.slice(0, 4) };
    await expect(verify('846207', truncated)).resolves.toBe(false);
  });

  it('rejects a hash of the same length that differs', async () => {
    const record = await createRecord('846207', ITERATIONS);
    const flipped =
      (record.hashB64[0] === 'A' ? 'B' : 'A') + record.hashB64.slice(1);
    await expect(
      verify('846207', { ...record, hashB64: flipped }),
    ).resolves.toBe(false);
  });
});

describe('constant-time comparison across lengths', () => {
  it('rejects a stored hash longer than the derived one', async () => {
    const record = await createRecord('846207', ITERATIONS);
    const padded = { ...record, hashB64: `${record.hashB64}AAAA` };
    await expect(verify('846207', padded)).resolves.toBe(false);
  });
});
