import React from 'react';
import {
  renderWithProviders,
  screen,
  fireEvent,
  waitFor,
} from '../../__tests__/test-utils/renderWithProviders';
import BiometricGateModal from '../BiometricGateModal';
import {
  PIN_LOCKOUT_ATTEMPTS,
  type LockoutStatus,
} from '../../security/lockoutPolicy';

const allowed: LockoutStatus = {
  allowed: true,
  retryAtMs: null,
  throttled: false,
  lockedOut: false,
  attemptsRemaining: PIN_LOCKOUT_ATTEMPTS,
  warnAttemptsRemaining: false,
};

const throttled: LockoutStatus = {
  allowed: false,
  retryAtMs: Date.now() + 30_000,
  throttled: true,
  lockedOut: false,
  attemptsRemaining: 6,
  warnAttemptsRemaining: true,
};

const lockedOut: LockoutStatus = {
  allowed: false,
  retryAtMs: Date.now() + 30 * 60 * 1000,
  throttled: false,
  lockedOut: true,
  attemptsRemaining: 0,
  warnAttemptsRemaining: true,
};

const renderModal = (
  overrides: Partial<React.ComponentProps<typeof BiometricGateModal>> = {},
) =>
  renderWithProviders(
    <BiometricGateModal
      presentation="unlock"
      lastError={null}
      lockout={allowed}
      biometricsAvailable
      pinUsable
      onRetry={jest.fn()}
      onSubmitPin={jest.fn().mockResolvedValue(true)}
      onSetUpPin={jest.fn().mockResolvedValue(undefined)}
      onDeclineSetup={jest.fn().mockResolvedValue(undefined)}
      onConfirmCredential={jest.fn().mockResolvedValue('cancelled')}
      onOpenScreenLockSettings={jest.fn().mockResolvedValue(undefined)}
      onCheckAgain={jest.fn().mockResolvedValue(undefined)}
      {...overrides}
    />,
  );

describe('BiometricGateModal', () => {
  it('prompts for biometrics by default', () => {
    renderModal();
    expect(screen.getByText('Unlock required')).toBeOnTheScreen();
    expect(screen.getByLabelText('Try biometrics again')).toBeOnTheScreen();
  });

  it('surfaces a biometric failure and offers the PIN', () => {
    renderModal({ lastError: 'Authentication cancelled.' });
    expect(screen.getByText('Authentication cancelled.')).toBeOnTheScreen();
    expect(screen.getByLabelText('Use PIN instead')).toBeOnTheScreen();
  });

  it('submits a PIN once the PIN path is opened', async () => {
    const onSubmitPin = jest.fn().mockResolvedValue(true);
    renderModal({ onSubmitPin });
    fireEvent.press(screen.getByLabelText('Use PIN instead'));
    fireEvent.changeText(screen.getByLabelText('App PIN'), '846207');
    fireEvent.press(screen.getByLabelText('Unlock with PIN'));
    await waitFor(() => expect(onSubmitPin).toHaveBeenCalledWith('846207'));
  });

  /**
   * A throttle and a lockout must read differently: the user needs to know
   * whether waiting a moment helps or whether they are out for half an hour.
   */
  it('reports a throttle with the remaining attempts', () => {
    renderModal({ lockout: throttled });
    expect(screen.getByText(/Too many attempts/)).toBeOnTheScreen();
    expect(
      screen.getByText(/6 attempts remaining before a longer lockout/),
    ).toBeOnTheScreen();
  });

  it.each([
    ['no failures yet', allowed],
    [
      'three failures that have not earned a wait',
      { ...allowed, attemptsRemaining: PIN_LOCKOUT_ATTEMPTS - 3 },
    ],
  ])(
    'shows no attempt count before the first throttle (%s)',
    (_label, lockout) => {
      renderModal({ lockout });
      expect(screen.queryByText(/attempts remaining/)).toBeNull();
    },
  );

  it('reports a lockout distinctly from a throttle', () => {
    renderModal({ lockout: lockedOut });
    expect(
      screen.getByText(/Too many incorrect PIN attempts/),
    ).toBeOnTheScreen();
    expect(screen.getByText(/30 minutes/)).toBeOnTheScreen();
  });

  it('says biometrics still work while locked out, and they do', () => {
    const onRetry = jest.fn();
    renderModal({ lockout: lockedOut, onRetry });
    expect(
      screen.getByText('Biometrics still work if they are available.'),
    ).toBeOnTheScreen();
    fireEvent.press(screen.getByLabelText('Try biometrics again'));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it.each([
    ['throttled', throttled],
    ['locked out', lockedOut],
  ])('keeps biometrics usable while %s', (_label, lockout) => {
    const onRetry = jest.fn();
    renderModal({ lockout, onRetry });
    fireEvent.press(screen.getByLabelText('Try biometrics again'));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it.each([
    ['throttled', throttled],
    ['locked out', lockedOut],
  ])(
    'offers biometrics again when %s after switching to the PIN',
    (_label, lockout) => {
      const onRetry = jest.fn();
      const props = {
        lastError: null,
        biometricsAvailable: true,
        pinUsable: true,
        presentation: 'unlock' as const,
        onRetry,
        onSubmitPin: jest.fn().mockResolvedValue(false),
        onSetUpPin: jest.fn().mockResolvedValue(undefined),
        onDeclineSetup: jest.fn().mockResolvedValue(undefined),
        onConfirmCredential: jest.fn().mockResolvedValue('cancelled'),
        onOpenScreenLockSettings: jest.fn().mockResolvedValue(undefined),
        onCheckAgain: jest.fn().mockResolvedValue(undefined),
      };
      const view = renderWithProviders(
        <BiometricGateModal {...props} lockout={allowed} />,
      );
      fireEvent.press(screen.getByLabelText('Use PIN instead'));
      view.rerender(<BiometricGateModal {...props} lockout={lockout} />);
      fireEvent.press(screen.getByLabelText('Try biometrics again'));
      expect(onRetry).toHaveBeenCalledTimes(1);
    },
  );

  it('offers no PIN entry while waiting', () => {
    renderModal({ lockout: throttled });
    expect(screen.queryByLabelText('Use PIN instead')).toBeNull();
    expect(screen.queryByLabelText('App PIN')).toBeNull();
  });

  it('never renders the entered PIN as text', async () => {
    const onSubmitPin = jest.fn().mockResolvedValue(false);
    renderModal({ onSubmitPin });
    fireEvent.press(screen.getByLabelText('Use PIN instead'));
    fireEvent.changeText(screen.getByLabelText('App PIN'), '846207');
    fireEvent.press(screen.getByLabelText('Unlock with PIN'));
    await waitFor(() => expect(onSubmitPin).toHaveBeenCalled());
    expect(screen.queryByText('846207')).toBeNull();
  });
});

describe('BiometricGateModal remount discards entry', () => {
  it('drops a partly typed PIN when remounted under a new key', () => {
    const props = {
      lastError: null,
      lockout: allowed,
      biometricsAvailable: true,
      pinUsable: true,
      presentation: 'unlock' as const,
      onRetry: jest.fn(),
      onSubmitPin: jest.fn().mockResolvedValue(true),
      onSetUpPin: jest.fn().mockResolvedValue(undefined),
      onDeclineSetup: jest.fn().mockResolvedValue(undefined),
      onConfirmCredential: jest.fn().mockResolvedValue('cancelled'),
      onOpenScreenLockSettings: jest.fn().mockResolvedValue(undefined),
      onCheckAgain: jest.fn().mockResolvedValue(undefined),
    };
    const { rerender } = renderWithProviders(
      <BiometricGateModal key={0} {...props} />,
    );
    fireEvent.press(screen.getByLabelText('Use PIN instead'));
    fireEvent.changeText(screen.getByLabelText('App PIN'), '8462');
    expect(screen.getByLabelText('App PIN').props.value).toBe('8462');

    rerender(<BiometricGateModal key={1} {...props} />);

    expect(screen.queryByLabelText('App PIN')).toBeNull();
    expect(screen.getByLabelText('Use PIN instead')).toBeOnTheScreen();
  });
});

describe('BiometricGateModal on a device without biometrics', () => {
  const unavailable = { biometricsAvailable: false as const };

  it('opens on the PIN field instead of the biometric prompt', () => {
    renderModal(unavailable);
    expect(screen.getByLabelText('App PIN')).toBeOnTheScreen();
    expect(screen.queryByLabelText('Try biometrics again')).toBeNull();
  });

  it('offers no switch back to biometrics that cannot work', () => {
    renderModal(unavailable);
    expect(screen.queryByLabelText('Use biometrics instead')).toBeNull();
    expect(screen.queryByLabelText('Use PIN instead')).toBeNull();
  });

  it('asks for the PIN rather than describing a biometric prompt', () => {
    renderModal(unavailable);
    expect(
      screen.getByText('Enter your app PIN to continue.'),
    ).toBeOnTheScreen();
  });

  it('still prompts for biometrics while the probe is in flight', () => {
    renderModal({ biometricsAvailable: null });
    expect(screen.queryByLabelText('App PIN')).toBeNull();
    expect(screen.getByLabelText('Try biometrics again')).toBeOnTheScreen();
  });
});

describe('BiometricGateModal attempts remaining', () => {
  it('is absent before the first throttle', () => {
    renderModal();
    expect(screen.queryByText(/attempts remaining/)).toBeNull();
  });

  it('is shown between waits, once a throttle has been earned', () => {
    renderModal({
      lockout: {
        allowed: true,
        retryAtMs: null,
        throttled: false,
        lockedOut: false,
        attemptsRemaining: 6,
        warnAttemptsRemaining: true,
      },
    });
    expect(
      screen.getByText('6 attempts remaining before a longer lockout.'),
    ).toBeOnTheScreen();
    expect(screen.getByLabelText('Try biometrics again')).toBeOnTheScreen();
  });

  it('is shown during an active throttle', () => {
    renderModal({ lockout: throttled });
    expect(
      screen.getByText('6 attempts remaining before a longer lockout.'),
    ).toBeOnTheScreen();
  });
});

describe('BiometricGateModal locked with no PIN, biometrics possible', () => {
  const noPin = { presentation: 'unlock-no-pin' as const, pinUsable: false };

  it('offers biometrics and the screen lock, with no PIN to switch to', () => {
    const onRetry = jest.fn();
    const onConfirmCredential = jest.fn().mockResolvedValue('cancelled');
    renderModal({ ...noPin, onRetry, onConfirmCredential });
    expect(screen.queryByLabelText('Use PIN instead')).toBeNull();
    expect(screen.queryByLabelText('App PIN')).toBeNull();
    expect(screen.queryByText('Turn the lock off')).toBeNull();
    expect(screen.queryByText('Set an app PIN')).toBeNull();
    fireEvent.press(screen.getByLabelText('Try biometrics again'));
    expect(onRetry).toHaveBeenCalledTimes(1);
    fireEvent.press(screen.getByLabelText('Use screen lock instead'));
    expect(onConfirmCredential).toHaveBeenCalledTimes(1);
  });

  it('keeps the screen lock on offer with the probe still in flight', () => {
    renderModal({ ...noPin, biometricsAvailable: null });
    expect(screen.getByLabelText('Use screen lock instead')).toBeOnTheScreen();
    expect(screen.queryByLabelText('App PIN')).toBeNull();
  });
});

describe('BiometricGateModal when the gate has no PIN yet', () => {
  const upgrading = { presentation: 'enrol' as const };

  it('offers enrolment instead of a PIN field nothing can satisfy', () => {
    renderModal(upgrading);
    expect(screen.getByText('Set an app PIN')).toBeOnTheScreen();
    expect(screen.queryByLabelText('App PIN')).toBeNull();
    expect(screen.queryByLabelText('Try biometrics again')).toBeNull();
  });

  it('states that declining leaves the data unprotected', () => {
    renderModal(upgrading);
    expect(
      screen.getByText(/Turning the lock off instead leaves your data/),
    ).toBeOnTheScreen();
  });

  it('enrols a PIN that passes the rule', async () => {
    const onSetUpPin = jest.fn().mockResolvedValue(undefined);
    renderModal({ ...upgrading, onSetUpPin });
    fireEvent.changeText(screen.getByLabelText('New PIN'), '846207');
    fireEvent.changeText(screen.getByLabelText('Confirm new PIN'), '846207');
    fireEvent.press(screen.getByLabelText('Set PIN'));
    await waitFor(() => expect(onSetUpPin).toHaveBeenCalledWith('846207'));
  });

  it('rejects a weak PIN without echoing it', () => {
    const onSetUpPin = jest.fn().mockResolvedValue(undefined);
    renderModal({ ...upgrading, onSetUpPin });
    fireEvent.changeText(screen.getByLabelText('New PIN'), '123456');
    fireEvent.changeText(screen.getByLabelText('Confirm new PIN'), '123456');
    fireEvent.press(screen.getByLabelText('Set PIN'));
    expect(onSetUpPin).not.toHaveBeenCalled();
    expect(
      screen.getByText('PIN cannot be a run of consecutive digits.'),
    ).toBeOnTheScreen();
    expect(screen.queryByText('123456')).toBeNull();
  });

  it('turns the lock off when enrolment is declined', async () => {
    const onDeclineSetup = jest.fn().mockResolvedValue(undefined);
    renderModal({ ...upgrading, onDeclineSetup });
    fireEvent.press(screen.getByText('Turn the lock off'));
    await waitFor(() => expect(onDeclineSetup).toHaveBeenCalled());
  });

  it('surfaces a failed enrolment rather than closing silently', async () => {
    const onSetUpPin = jest.fn().mockRejectedValue(new Error('keystore full'));
    renderModal({ ...upgrading, onSetUpPin });
    fireEvent.changeText(screen.getByLabelText('New PIN'), '846207');
    fireEvent.changeText(screen.getByLabelText('Confirm new PIN'), '846207');
    fireEvent.press(screen.getByLabelText('Set PIN'));
    await waitFor(() =>
      expect(screen.getByText('keystore full')).toBeOnTheScreen(),
    );
  });
});

describe('BiometricGateModal when no biometric can stand in for a missing PIN', () => {
  it('asks for the screen lock and nothing else', () => {
    const onConfirmCredential = jest.fn().mockResolvedValue('cancelled');
    renderModal({
      presentation: 'confirm-credential',
      biometricsAvailable: false,
      pinUsable: false,
      onConfirmCredential,
    });
    expect(
      screen.getByText('Confirm your screen lock to continue.'),
    ).toBeOnTheScreen();
    expect(screen.queryByText('Turn the lock off')).toBeNull();
    expect(screen.queryByText('Set an app PIN')).toBeNull();
    expect(screen.queryByLabelText('App PIN')).toBeNull();
    expect(screen.queryByLabelText('Try biometrics again')).toBeNull();
    fireEvent.press(screen.getByLabelText('Confirm your screen lock'));
    expect(onConfirmCredential).toHaveBeenCalledTimes(1);
  });

  it('shows why the last confirmation did not unlock', () => {
    renderModal({
      presentation: 'confirm-credential',
      lastError: "Not confirmed. Tap Confirm it's you to try again.",
    });
    expect(
      screen.getByText("Not confirmed. Tap Confirm it's you to try again."),
    ).toBeOnTheScreen();
  });

  it('holds the button while the prompt is showing', async () => {
    let finish: (value: unknown) => void = () => undefined;
    const onConfirmCredential = jest.fn(
      () => new Promise(resolve => (finish = resolve)),
    );
    renderModal({ presentation: 'confirm-credential', onConfirmCredential });
    fireEvent.press(screen.getByLabelText('Confirm your screen lock'));
    fireEvent.press(screen.getByLabelText('Confirm your screen lock'));
    expect(onConfirmCredential).toHaveBeenCalledTimes(1);
    finish('cancelled');
    await waitFor(() =>
      expect(
        screen.getByLabelText('Confirm your screen lock'),
      ).not.toBeDisabled(),
    );
  });
});

describe('BiometricGateModal on a device with no screen lock', () => {
  const noLock = { presentation: 'set-screen-lock' as const };

  it('asks for a screen lock and offers no way past it', () => {
    renderModal(noLock);
    expect(screen.getByText('Screen lock needed')).toBeOnTheScreen();
    expect(
      screen.getByText(
        "The app lock needs your phone's screen lock to confirm it's you. Set a PIN, pattern or password in Android settings, then come back.",
      ),
    ).toBeOnTheScreen();
    expect(screen.queryByText('Turn the lock off')).toBeNull();
    expect(screen.queryByText('Set an app PIN')).toBeNull();
    expect(screen.queryByLabelText('App PIN')).toBeNull();
    expect(screen.queryByLabelText('Confirm your screen lock')).toBeNull();
  });

  it('opens the screen lock settings', async () => {
    const onOpenScreenLockSettings = jest.fn().mockResolvedValue(undefined);
    renderModal({ ...noLock, onOpenScreenLockSettings });
    fireEvent.press(screen.getByLabelText('Open screen lock settings'));
    await waitFor(() => expect(onOpenScreenLockSettings).toHaveBeenCalled());
  });

  it('checks again on request', async () => {
    const onCheckAgain = jest.fn().mockResolvedValue(undefined);
    renderModal({ ...noLock, onCheckAgain });
    fireEvent.press(screen.getByLabelText('Check for a screen lock again'));
    await waitFor(() => expect(onCheckAgain).toHaveBeenCalled());
  });
});

describe('BiometricGateModal decline refused by the provider', () => {
  it('shows the refusal instead of rejecting unhandled', async () => {
    const onDeclineSetup = jest
      .fn()
      .mockRejectedValue(new Error('Unlock the app first.'));
    renderModal({ presentation: 'enrol', onDeclineSetup });
    fireEvent.press(screen.getByText('Turn the lock off'));
    await waitFor(() =>
      expect(screen.getByText('Unlock the app first.')).toBeOnTheScreen(),
    );
  });
});
