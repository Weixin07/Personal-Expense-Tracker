/**
 * @jest-environment node
 */
import { DatabaseSync } from 'node:sqlite';
import type { SQLiteDatabase } from 'react-native-sqlite-storage';
import { adaptNodeSqlite } from '../test-utils/sqliteAdapter';
import { runMigrations } from '../../database/migrations';
import {
  createTransactionsBulk,
  listTransactions,
} from '../../database/repositories/transactionsRepository';
import { applyFilters } from '../../utils/transactionFilters';
import {
  benchmark,
  formatDuration,
  generateMockTransactions,
  assertPerformance,
} from './testHelpers';
import type {
  NewTransactionRecord,
  TransactionRecord,
} from '../../database/types';

/**
 * Evidence for whether `LIKE` is fast enough to keep, or whether search needs
 * FTS5. Two paths are measured because they are governed by different limits:
 * the query resolves off the JS thread, so its cost is how long a result takes;
 * the in-memory pass runs on the thread that draws, so its cost is frames.
 *
 * Node's SQLite is far newer than the engine on the minimum supported device
 * (see `sqliteAdapter.ts`), so a pass here bounds a regression, not the device.
 * The fixture also flatters `LIKE`: descriptions and payees come from small
 * fixed pools, and real ledger text is longer and more varied.
 */
describe('Performance: searching 10k transactions', () => {
  const TRANSACTION_COUNT = 10000;
  const QUERY = 'coffee';
  const SQL_BUDGET_MS = 50;
  const IN_MEMORY_BUDGET_MS = 16;
  const ITERATIONS = 25;
  const WARMUP_RUNS = 5;
  const NO_SUSPECTS: ReadonlySet<number> = new Set();

  let raw: DatabaseSync;
  let db: SQLiteDatabase;
  let mockTransactions: TransactionRecord[];

  const toNewRecord = (record: TransactionRecord): NewTransactionRecord => {
    const isTransfer = record.type === 'transfer';
    return {
      type: record.type,
      description: record.description,
      payee: record.payee,
      amountNative: record.amountNative,
      currencyCode: record.currencyCode,
      fxRateToBase: record.fxRateToBase,
      baseAmount: record.baseAmount,
      baseCurrencyCode: record.baseCurrencyCode,
      date: record.date,
      time: record.time,
      categoryId: null,
      fundId: 1,
      // The schema requires a transfer to name a second, different fund, and
      // to leave those columns null on anything else.
      counterpartFundId: isTransfer ? 2 : null,
      counterpartAmount: isTransfer ? record.amountNative : null,
      counterpartCurrencyCode: isTransfer ? record.currencyCode : null,
      notes: record.notes,
    };
  };

  beforeAll(async () => {
    mockTransactions = generateMockTransactions(
      TRANSACTION_COUNT,
    ) as TransactionRecord[];

    raw = new DatabaseSync(':memory:');
    db = adaptNodeSqlite(raw);
    await runMigrations(db);
    raw.exec("INSERT INTO funds (name) VALUES ('Transfer destination')");
    // Seeding is ~162 statements at the host-parameter cap. Outside the
    // measured window on purpose: it is fixture cost, not search cost.
    await createTransactionsBulk(db, mockTransactions.map(toNewRecord));

    // Both paths are run before either is timed: a first pass pays for JIT
    // compilation, which on a frame-scale budget is most of the measurement.
    for (let run = 0; run < WARMUP_RUNS; run += 1) {
      await listTransactions(db, { query: QUERY });
      applyFilters(mockTransactions, { query: QUERY }, NO_SUSPECTS);
    }
  });

  afterAll(() => {
    raw.close();
  });

  it(`answers a LIKE search within ${SQL_BUDGET_MS}ms`, async () => {
    const { results, metrics } = await benchmark(
      () => listTransactions(db, { query: QUERY }),
      ITERATIONS,
    );

    console.log(
      `⏱️  SQL LIKE: median ${formatDuration(metrics.median)} ` +
        `(min ${formatDuration(metrics.min)}, max ${formatDuration(metrics.max)})`,
    );
    console.log(`📋 Matched: ${results[0].length} of ${TRANSACTION_COUNT}`);

    expect(results[0].length).toBeGreaterThan(0);
    assertPerformance(
      { duration: metrics.median },
      { maxDuration: SQL_BUDGET_MS },
      `LIKE over ${TRANSACTION_COUNT} rows, median of ${ITERATIONS}`,
    );
  });

  it(`filters in memory within ${IN_MEMORY_BUDGET_MS}ms, one frame`, async () => {
    const { results, metrics } = await benchmark(
      () => applyFilters(mockTransactions, { query: QUERY }, NO_SUSPECTS),
      ITERATIONS,
    );

    console.log(
      `⏱️  In-memory: median ${formatDuration(metrics.median)} ` +
        `(min ${formatDuration(metrics.min)}, max ${formatDuration(metrics.max)})`,
    );
    console.log(`📋 Matched: ${results[0].length} of ${TRANSACTION_COUNT}`);

    expect(results[0].length).toBeGreaterThan(0);
    assertPerformance(
      { duration: metrics.median },
      { maxDuration: IN_MEMORY_BUDGET_MS },
      `In-memory search over ${TRANSACTION_COUNT} rows, median of ${ITERATIONS}`,
    );
  });

  it('composes with a date filter without a second pass', async () => {
    const { metrics } = await benchmark(
      () =>
        listTransactions(db, {
          query: QUERY,
          type: 'expense',
          startDate: '2021-01-01',
        }),
      ITERATIONS,
    );

    console.log(
      `⏱️  SQL LIKE, composed: median ${formatDuration(metrics.median)}`,
    );

    assertPerformance(
      { duration: metrics.median },
      { maxDuration: SQL_BUDGET_MS },
      `Composed LIKE over ${TRANSACTION_COUNT} rows, median of ${ITERATIONS}`,
    );
  });
});
