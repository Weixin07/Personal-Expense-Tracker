import {
  delayForFailures,
  EMPTY_LOCKOUT_STATE,
  evaluateLockout,
  nextStateAfterFailure,
  PIN_FREE_ATTEMPTS,
  PIN_LOCKOUT_ATTEMPTS,
  PIN_LOCKOUT_MS,
} from '../lockoutPolicy';

const NOW = 1_700_000_000_000;

describe('delayForFailures', () => {
  it('allows the first three attempts without delay', () => {
    for (let attempt = 1; attempt <= PIN_FREE_ATTEMPTS; attempt += 1) {
      expect(delayForFailures(attempt)).toBe(0);
    }
  });

  it('escalates strictly from the fourth to the ninth attempt', () => {
    const delays = [4, 5, 6, 7, 8, 9].map(delayForFailures);
    delays.forEach((delay, index) => {
      expect(delay).toBeGreaterThan(index === 0 ? 0 : delays[index - 1]);
    });
  });

  it('locks out at the tenth attempt', () => {
    expect(delayForFailures(PIN_LOCKOUT_ATTEMPTS)).toBe(PIN_LOCKOUT_MS);
  });
});

describe('evaluateLockout', () => {
  it('allows an attempt when nothing is recorded', () => {
    const status = evaluateLockout(EMPTY_LOCKOUT_STATE, NOW);
    expect(status.allowed).toBe(true);
    expect(status.throttled).toBe(false);
    expect(status.lockedOut).toBe(false);
    expect(status.attemptsRemaining).toBe(PIN_LOCKOUT_ATTEMPTS);
  });

  it('reports a throttle while the wait has not elapsed', () => {
    const status = evaluateLockout(
      { consecutiveFailures: 4, nextAllowedAt: NOW + 30_000 },
      NOW,
    );
    expect(status.allowed).toBe(false);
    expect(status.throttled).toBe(true);
    expect(status.lockedOut).toBe(false);
  });

  it('distinguishes a lockout from a throttle', () => {
    const status = evaluateLockout(
      {
        consecutiveFailures: PIN_LOCKOUT_ATTEMPTS,
        nextAllowedAt: NOW + PIN_LOCKOUT_MS,
      },
      NOW,
    );
    expect(status.lockedOut).toBe(true);
    expect(status.throttled).toBe(false);
    expect(status.attemptsRemaining).toBe(0);
  });

  // No dead end: the wait expires on its own rather than needing another factor.
  it('allows an attempt again once the lockout expires', () => {
    const state = {
      consecutiveFailures: PIN_LOCKOUT_ATTEMPTS,
      nextAllowedAt: NOW + PIN_LOCKOUT_MS,
    };
    const status = evaluateLockout(state, NOW + PIN_LOCKOUT_MS + 1);
    expect(status.allowed).toBe(true);
    expect(status.lockedOut).toBe(false);
  });
});

describe('nextStateAfterFailure', () => {
  it('records the first three failures without a wait', () => {
    let state = EMPTY_LOCKOUT_STATE;
    for (let attempt = 0; attempt < PIN_FREE_ATTEMPTS; attempt += 1) {
      state = nextStateAfterFailure(state, NOW);
    }
    expect(state.consecutiveFailures).toBe(PIN_FREE_ATTEMPTS);
    expect(state.nextAllowedAt).toBeNull();
  });

  it('sets a wait from the fourth failure', () => {
    let state = EMPTY_LOCKOUT_STATE;
    for (let attempt = 0; attempt <= PIN_FREE_ATTEMPTS; attempt += 1) {
      state = nextStateAfterFailure(state, NOW);
    }
    expect(state.consecutiveFailures).toBe(PIN_FREE_ATTEMPTS + 1);
    expect(state.nextAllowedAt).toBe(NOW + 30_000);
  });

  it('reaches the full lockout at the tenth failure', () => {
    let state = EMPTY_LOCKOUT_STATE;
    for (let attempt = 0; attempt < PIN_LOCKOUT_ATTEMPTS; attempt += 1) {
      state = nextStateAfterFailure(state, NOW);
    }
    expect(state.consecutiveFailures).toBe(PIN_LOCKOUT_ATTEMPTS);
    expect(state.nextAllowedAt).toBe(NOW + PIN_LOCKOUT_MS);
  });
});

describe('delayForFailures beyond the table', () => {
  it('treats a count past the lockout as a lockout', () => {
    expect(delayForFailures(PIN_LOCKOUT_ATTEMPTS + 5)).toBe(PIN_LOCKOUT_MS);
  });

  it('treats a nonsensical negative count as no delay', () => {
    expect(delayForFailures(-1)).toBe(0);
  });
});

describe('warnAttemptsRemaining', () => {
  it.each([0, 1, 2, 3])(
    'stays quiet at %i failures, before the first throttle',
    consecutiveFailures => {
      const status = evaluateLockout(
        { consecutiveFailures, nextAllowedAt: null },
        1_000,
      );
      expect(status.warnAttemptsRemaining).toBe(false);
    },
  );

  it.each([4, 5, 6, 7, 8, 9, 10])(
    'warns at %i failures, from the first throttle onward',
    consecutiveFailures => {
      const status = evaluateLockout(
        { consecutiveFailures, nextAllowedAt: null },
        1_000,
      );
      expect(status.warnAttemptsRemaining).toBe(true);
    },
  );

  it('keeps warning once a throttle has expired and input is allowed again', () => {
    const status = evaluateLockout(
      { consecutiveFailures: 4, nextAllowedAt: 500 },
      1_000,
    );
    expect(status.allowed).toBe(true);
    expect(status.warnAttemptsRemaining).toBe(true);
    expect(status.attemptsRemaining).toBe(6);
  });
});
