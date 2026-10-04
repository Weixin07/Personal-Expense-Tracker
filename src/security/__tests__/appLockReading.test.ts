import { readGateSetting, resolveGateReading } from '../appLockReading';

const TRISTATE = [true, false, null] as const;

describe('readGateSetting', () => {
  it('reads the two stored strings as definite answers', () => {
    expect(readGateSetting('true')).toBe(true);
    expect(readGateSetting('false')).toBe(false);
  });

  it.each([undefined, null, '', 'TRUE', 'False', ' true', 'yes', '1'])(
    'reads %p as unknown',
    value => {
      expect(readGateSetting(value)).toBeNull();
    },
  );
});

describe('resolveGateReading', () => {
  it.each([
    [true, true, true, null],
    [true, false, true, null],
    [true, null, true, null],
    [false, true, false, null],
    [false, false, false, null],
    [false, null, false, null],
    [null, true, true, true],
    [null, false, false, false],
    [null, null, true, null],
  ] as const)(
    'setting %p with marker %p gives enabled %p, writeBack %p',
    (reading, marker, enabled, writeBack) => {
      expect(resolveGateReading(reading, marker)).toEqual({
        enabled,
        writeBack,
      });
    },
  );

  it('writes back only an unknown setting, and only what the lock resolved to', () => {
    for (const reading of TRISTATE) {
      for (const marker of TRISTATE) {
        const { enabled, writeBack } = resolveGateReading(reading, marker);
        expect(writeBack !== null).toBe(reading === null && marker !== null);
        expect(writeBack === null || writeBack === enabled).toBe(true);
      }
    }
  });
});
