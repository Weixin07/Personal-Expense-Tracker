/**
 * `minutes: null` is Never and `minutes: 0` is Immediately, so the two cannot be
 * folded together — zero is falsy but meaningful. `storageToken` is the
 * `app_settings` encoding: a SQL NULL there already means "unset", which
 * resolves to the default, so Never needs a token of its own.
 */
export type AutoLockPreset = {
  minutes: number | null;
  label: string;
  storageToken: string;
};

export const DEFAULT_AUTO_LOCK_MINUTES = 5;

const autoLockPresets: AutoLockPreset[] = [
  { minutes: 0, label: 'Immediately', storageToken: '0' },
  { minutes: 1, label: 'After 1 minute', storageToken: '1' },
  { minutes: 5, label: 'After 5 minutes', storageToken: '5' },
  { minutes: 15, label: 'After 15 minutes', storageToken: '15' },
  { minutes: 30, label: 'After 30 minutes', storageToken: '30' },
  { minutes: null, label: 'Never', storageToken: 'never' },
];

export const getAutoLockPresets = (): AutoLockPreset[] => autoLockPresets;

export const findAutoLockPreset = (
  minutes: number | null,
): AutoLockPreset | null =>
  autoLockPresets.find(preset => preset.minutes === minutes) ?? null;

export const autoLockLabel = (minutes: number | null): string =>
  findAutoLockPreset(minutes)?.label ?? 'After 5 minutes';

export const autoLockMinutesToToken = (minutes: number | null): string =>
  findAutoLockPreset(minutes)?.storageToken ??
  String(DEFAULT_AUTO_LOCK_MINUTES);

/**
 * Anything unrecognised — missing, NULL, or a value outside the preset set —
 * resolves to the default rather than to Never: a garbage read of a security
 * control must fail toward the stricter behaviour.
 */
export const autoLockMinutesFromToken = (
  token: string | null | undefined,
): number | null => {
  if (token == null) {
    return DEFAULT_AUTO_LOCK_MINUTES;
  }
  const preset = autoLockPresets.find(item => item.storageToken === token);
  return preset ? preset.minutes : DEFAULT_AUTO_LOCK_MINUTES;
};
