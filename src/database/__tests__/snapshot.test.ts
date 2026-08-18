import RNFS from 'react-native-fs';
import type { ResultSet, SQLiteDatabase } from 'react-native-sqlite-storage';
import {
  captureMigrationSnapshot,
  discardMigrationSnapshot,
  readAppliedSchemaVersion,
} from '../snapshot';

const versionResult = (version: number | null): ResultSet =>
  ({
    insertId: undefined,
    rowsAffected: 0,
    rows: {
      length: 1,
      raw: () => [{ version }],
      item: (index: number) => (index === 0 ? { version } : null),
    },
  }) as unknown as ResultSet;

const makeDb = (): jest.Mocked<SQLiteDatabase> =>
  ({
    executeSql: jest.fn(),
  }) as unknown as jest.Mocked<SQLiteDatabase>;

describe('readAppliedSchemaVersion', () => {
  it('reports the highest applied version', async () => {
    const db = makeDb();
    db.executeSql.mockResolvedValue([versionResult(9)]);
    await expect(readAppliedSchemaVersion(db)).resolves.toBe(9);
  });

  it('reports 0 when the tracking table does not exist yet', async () => {
    const db = makeDb();
    db.executeSql.mockRejectedValue(new Error('no such table'));
    await expect(readAppliedSchemaVersion(db)).resolves.toBe(0);
  });
});

describe('captureMigrationSnapshot', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (RNFS.exists as jest.Mock).mockResolvedValue(false);
  });

  it('checkpoints the write-ahead log before copying', async () => {
    const db = makeDb();
    db.executeSql.mockResolvedValue([versionResult(9)]);

    await captureMigrationSnapshot(db, 'expense_tracker.db', 10);

    const checkpointCall = db.executeSql.mock.calls.findIndex(([sql]) =>
      String(sql).includes('wal_checkpoint'),
    );
    expect(checkpointCall).toBeGreaterThanOrEqual(0);
    expect(RNFS.copyFile).toHaveBeenCalledTimes(1);
    // A copy taken before the checkpoint would omit commits still in the WAL.
    expect(
      (RNFS.copyFile as jest.Mock).mock.invocationCallOrder[0],
    ).toBeGreaterThan(
      (db.executeSql as jest.Mock).mock.invocationCallOrder[checkpointCall],
    );
  });

  it('takes no snapshot when the schema is already current', async () => {
    const db = makeDb();
    db.executeSql.mockResolvedValue([versionResult(10)]);

    await expect(
      captureMigrationSnapshot(db, 'expense_tracker.db', 10),
    ).resolves.toBeNull();
    expect(RNFS.copyFile).not.toHaveBeenCalled();
  });

  it('takes no snapshot on a fresh install', async () => {
    const db = makeDb();
    db.executeSql.mockRejectedValue(new Error('no such table'));

    await expect(
      captureMigrationSnapshot(db, 'expense_tracker.db', 10),
    ).resolves.toBeNull();
    expect(RNFS.copyFile).not.toHaveBeenCalled();
  });

  it('does not block startup when the copy fails', async () => {
    const db = makeDb();
    db.executeSql.mockResolvedValue([versionResult(9)]);
    (RNFS.copyFile as jest.Mock).mockRejectedValueOnce(new Error('no space'));

    await expect(
      captureMigrationSnapshot(db, 'expense_tracker.db', 10),
    ).resolves.toBeNull();
  });
});

describe('discardMigrationSnapshot', () => {
  it('removes a snapshot left by a completed upgrade', async () => {
    (RNFS.exists as jest.Mock).mockResolvedValue(true);
    await discardMigrationSnapshot('expense_tracker.db');
    expect(RNFS.unlink).toHaveBeenCalled();
  });
});
