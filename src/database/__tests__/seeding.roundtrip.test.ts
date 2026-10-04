/**
 * @jest-environment node
 */
import { DatabaseSync } from 'node:sqlite';
import { adaptNodeSqlite } from '../../__tests__/test-utils/sqliteAdapter';
import { runMigrations } from '../migrations';
import { seedInitialData } from '../seeding';

/** A seeded app-lock default would read as off, under the rule on `resolveGateReading`. */
describe('a freshly created database', () => {
  let raw: DatabaseSync;

  beforeEach(() => {
    raw = new DatabaseSync(':memory:');
    raw.exec('PRAGMA foreign_keys = ON');
  });

  afterEach(() => {
    raw.close();
  });

  const gateRows = () =>
    raw
      .prepare('SELECT 1 FROM app_settings WHERE key = ?')
      .all('biometric_gate_enabled');

  it('has no app-lock setting after migrating and seeding, however often it is seeded', async () => {
    const db = adaptNodeSqlite(raw);
    await runMigrations(db);
    await seedInitialData(db);
    expect(gateRows()).toHaveLength(0);
    await seedInitialData(db);
    expect(gateRows()).toHaveLength(0);
  });
});
