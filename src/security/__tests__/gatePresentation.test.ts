import {
  gatePresentation,
  type GateInputs,
  type GatePresentation,
} from '../gatePresentation';

const TRISTATE = [true, false, null] as const;
const BOOLEANS = [true, false] as const;

const everyInput = (): GateInputs[] => {
  const all: GateInputs[] = [];
  for (const isInitialised of BOOLEANS) {
    for (const hasError of BOOLEANS) {
      for (const gateEnabled of BOOLEANS) {
        for (const isLocked of BOOLEANS) {
          for (const sessionAuthenticated of BOOLEANS) {
            for (const pinUsable of TRISTATE) {
              for (const pinStored of TRISTATE) {
                for (const biometricsAvailable of TRISTATE) {
                  for (const secureLockScreen of TRISTATE) {
                    all.push({
                      isInitialised,
                      hasError,
                      gateEnabled,
                      isLocked,
                      sessionAuthenticated,
                      pinUsable,
                      pinStored,
                      biometricsAvailable,
                      secureLockScreen,
                    });
                  }
                }
              }
            }
          }
        }
      }
    }
  }
  return all;
};

const NO_PIN_LOCKED: GatePresentation[] = [
  'unlock-no-pin',
  'confirm-credential',
  'set-screen-lock',
];

describe('gatePresentation over every input', () => {
  const inputs = everyInput();

  it('offers enrolment only once the session has authenticated', () => {
    const offenders = inputs.filter(
      input =>
        !input.sessionAuthenticated && gatePresentation(input) === 'enrol',
    );
    expect(offenders).toEqual([]);
  });

  it('never offers enrolment while locked', () => {
    const offenders = inputs.filter(
      input => input.isLocked && gatePresentation(input) === 'enrol',
    );
    expect(offenders).toEqual([]);
  });

  it('keeps a locked gate on screen, whatever the load state', () => {
    const offenders = inputs.filter(
      input =>
        input.gateEnabled &&
        input.isLocked &&
        gatePresentation(input) === 'hidden',
    );
    expect(offenders).toEqual([]);
  });

  it('opens a locked install with no PIN only through authentication', () => {
    const offenders = inputs.filter(
      input =>
        input.gateEnabled &&
        input.isLocked &&
        input.pinStored === false &&
        !NO_PIN_LOCKED.includes(gatePresentation(input)),
    );
    expect(offenders).toEqual([]);
  });

  it('shows nothing while the gate is off', () => {
    const offenders = inputs.filter(
      input => !input.gateEnabled && gatePresentation(input) !== 'hidden',
    );
    expect(offenders).toEqual([]);
  });
});

describe('gatePresentation by route', () => {
  const lockedNoPin: GateInputs = {
    isInitialised: true,
    hasError: false,
    gateEnabled: true,
    isLocked: true,
    sessionAuthenticated: false,
    pinUsable: false,
    pinStored: false,
    biometricsAvailable: true,
    secureLockScreen: true,
  };

  it.each<[string, Partial<GateInputs>, GatePresentation]>([
    [
      'the screen lock was removed',
      { biometricsAvailable: false, secureLockScreen: false },
      'set-screen-lock',
    ],
    [
      'every biometric was un-enrolled',
      { biometricsAvailable: false },
      'confirm-credential',
    ],
    [
      'the biometric credential is missing',
      { biometricsAvailable: false },
      'confirm-credential',
    ],
    [
      'the biometric probe threw',
      { biometricsAvailable: false, secureLockScreen: true },
      'confirm-credential',
    ],
    [
      'the lock-screen probe could not answer',
      { biometricsAvailable: false, secureLockScreen: null },
      'confirm-credential',
    ],
    [
      'a credential that may no longer open still looks usable',
      {},
      'unlock-no-pin',
    ],
    [
      'the biometric probe has not landed',
      { biometricsAvailable: null },
      'unlock-no-pin',
    ],
    [
      'the session authenticated without a PIN',
      { isLocked: false, sessionAuthenticated: true },
      'enrol',
    ],
    [
      'unlocked but never authenticated, before the cold-start lock',
      { isLocked: false },
      'hidden',
    ],
    [
      'a stored PIN record cannot be read',
      { pinStored: true, biometricsAvailable: false },
      'unlock',
    ],
    [
      'the PIN probe has not landed',
      { pinStored: null, pinUsable: null, biometricsAvailable: false },
      'unlock',
    ],
    [
      'authenticated, but the initial load failed',
      { isLocked: false, sessionAuthenticated: true, hasError: true },
      'hidden',
    ],
  ])('%s', (_label, overrides, expected) => {
    expect(gatePresentation({ ...lockedNoPin, ...overrides })).toBe(expected);
  });
});
