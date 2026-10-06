import type { TurboModule } from 'react-native';
import { TurboModuleRegistry } from 'react-native';

export interface Spec extends TurboModule {
  /** Sets or clears FLAG_SECURE on the app window; re-applied to a recreated activity. */
  setSecure(secure: boolean): void;
  /** While true, system alerts are closed as they appear, and any open one is closed now. */
  setAlertsSuppressed(suppressed: boolean): void;
  /**
   * The idle timeout under the rule on `idleTimeoutMs`. A return past it shows
   * nothing of the app until `releaseReturnHold`.
   */
  setIdleTimeout(timeoutMs: number | null): void;
  /**
   * Shows the app and any alert hidden since it last left the foreground with
   * the lock on. Does nothing if nothing is held; alerts stay closed while
   * suppressed.
   */
  releaseReturnHold(): void;
}

export default TurboModuleRegistry.getEnforcing<Spec>('AppLockWindow');
