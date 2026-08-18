import RNFS from 'react-native-fs';
import type { SQLiteDatabase } from 'react-native-sqlite-storage';

const SNAPSHOT_DIRECTORY = `${RNFS.DocumentDirectoryPath}/pre-migration`;

/**
 * `react-native-sqlite-storage` opens a `location: 'default'` database from the
 * app's `databases/` directory, a sibling of the `files/` directory RNFS
 * reports. Neither library exposes this path, so it is reconstructed here.
 */
const databaseFilePath = (databaseName: string): string =>
  `${RNFS.DocumentDirectoryPath}/../databases/${databaseName}`;

const snapshotFilePath = (databaseName: string): string =>
  `${SNAPSHOT_DIRECTORY}/${databaseName}`;

/**
 * Highest applied migration version, or 0 when the tracking table does not yet
 * exist — a fresh install, which has nothing worth preserving.
 */
export const readAppliedSchemaVersion = async (
  db: SQLiteDatabase,
): Promise<number> => {
  try {
    const [result] = await db.executeSql(
      'SELECT MAX(version) AS version FROM schema_migrations',
    );
    if (result.rows.length === 0) {
      return 0;
    }
    const row = result.rows.item(0) as { version: number | null };
    return row?.version ?? 0;
  } catch {
    return 0;
  }
};

/** Remove a snapshot left behind by an upgrade that has since completed. */
export const discardMigrationSnapshot = async (
  databaseName: string,
): Promise<void> => {
  try {
    const destination = snapshotFilePath(databaseName);
    if (await RNFS.exists(destination)) {
      await RNFS.unlink(destination);
    }
  } catch {
    // A snapshot that cannot be removed is harmless — the next upgrade
    // overwrites it.
  }
};

/**
 * Copy the database aside before pending migrations run. Returns the snapshot
 * path, or null when none was taken: either the schema is already current, or
 * the copy failed.
 *
 * Best-effort by design — a failure is swallowed rather than blocking startup.
 * Migrations are transactional, so an upgrade without a snapshot still cannot
 * corrupt the database, whereas an app that refuses to open locks the user out
 * of their data entirely.
 *
 * The write-ahead log is checkpointed into the main file first. Without that the
 * copy omits every commit still living in `<name>-wal`, yielding a snapshot that
 * looks complete and is not.
 */
export const captureMigrationSnapshot = async (
  db: SQLiteDatabase,
  databaseName: string,
  targetVersion: number,
): Promise<string | null> => {
  const appliedVersion = await readAppliedSchemaVersion(db);
  if (appliedVersion === 0 || appliedVersion >= targetVersion) {
    await discardMigrationSnapshot(databaseName);
    return null;
  }

  const destination = snapshotFilePath(databaseName);
  try {
    // eslint-disable-next-line no-secrets/no-secrets -- SQLite pragma, not a credential
    await db.executeSql('PRAGMA wal_checkpoint(TRUNCATE)');
    await RNFS.mkdir(SNAPSHOT_DIRECTORY);
    if (await RNFS.exists(destination)) {
      await RNFS.unlink(destination);
    }
    await RNFS.copyFile(databaseFilePath(databaseName), destination);
    return destination;
  } catch {
    return null;
  }
};
