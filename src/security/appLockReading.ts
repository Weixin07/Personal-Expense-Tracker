/**
 * The stored app-lock setting: `true` or `false` only for the exact strings
 * the setting is written as, `null` for anything else, a missing row included.
 */
export const readGateSetting = (
  value: string | null | undefined,
): boolean | null => {
  if (value === 'true') {
    return true;
  }
  if (value === 'false') {
    return false;
  }
  return null;
};

/**
 * Decides whether the app lock is on from the stored setting and, where that
 * is `null`, from the lock marker (`marker` is `null` when the keychain could
 * not answer). An unreadable setting is unknown rather than off: a database
 * Android recreated after corruption has no setting, and reading that as off
 * would open a locked app. The marker settles it, and with no answer at all
 * the lock stays on. `writeBack` is the value to store in place of the
 * unreadable setting, set only when the marker gave a definite answer.
 */
export const resolveGateReading = (
  reading: boolean | null,
  marker: boolean | null,
): { enabled: boolean; writeBack: boolean | null } => {
  if (reading !== null) {
    return { enabled: reading, writeBack: null };
  }
  if (marker === null) {
    return { enabled: true, writeBack: null };
  }
  return { enabled: marker, writeBack: marker };
};
