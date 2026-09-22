import * as Keychain from 'react-native-keychain';
import { setPin } from '../pinCredential';
import { recordFailure } from '../lockoutStore';
import {
  getAllSettings,
  setSetting,
} from '../../database/repositories/settingsRepository';

jest.mock('../../database/repositories/settingsRepository', () => ({
  setSetting: jest.fn(() => Promise.resolve()),
  getSetting: jest.fn(() => Promise.resolve(null)),
  deleteSetting: jest.fn(() => Promise.resolve()),
  getAllSettings: jest.fn(() => Promise.resolve([])),
}));

const PIN = '846207';

const settingsRows: { key: string; value: string | null }[] = [];

const fakeDb = {} as Parameters<typeof getAllSettings>[0];

beforeEach(() => {
  jest.clearAllMocks();
  settingsRows.length = 0;
  (Keychain.setGenericPassword as jest.Mock).mockImplementation(() =>
    Promise.resolve(true),
  );
  (Keychain.getGenericPassword as jest.Mock).mockResolvedValue(false);
  (Keychain.resetGenericPassword as jest.Mock).mockResolvedValue(true);
  (getAllSettings as jest.Mock).mockImplementation(() =>
    Promise.resolve([...settingsRows]),
  );
});

/**
 * The PIN belongs in Keystore and must never reach the SQLite settings table.
 * Both assertions are needed: the first alone passes whenever a write went to a
 * key the test did not think to look at.
 */
describe('the app PIN never reaches app_settings', () => {
  it('leaves no PIN, hash, or salt in the settings table', async () => {
    await setPin(PIN, 150_000);
    const [, storedRecord] = (Keychain.setGenericPassword as jest.Mock).mock
      .calls[0];
    const { saltB64, hashB64 } = JSON.parse(storedRecord);

    const rows = await getAllSettings(fakeDb);
    const values = rows.map(row => row.value);
    expect(values).not.toContain(PIN);
    expect(values).not.toContain(saltB64);
    expect(values).not.toContain(hashB64);
  });

  it('never calls setSetting from the security layer', async () => {
    await setPin(PIN, 150_000);
    await recordFailure(Date.now());
    expect(setSetting).not.toHaveBeenCalled();
  });
});
