const { refreshCatalogReadModel } = require('../db/catalogReadModel');

function fixture({ failStage, previous = 10, current = 10 } = {}) {
  const queries = [];
  const logger = { info: jest.fn(), error: jest.fn(), warn: jest.fn() };
  const client = {
    release: jest.fn(),
    async query(sql, values) {
      queries.push(sql);
      if (failStage && sql.includes(`/* ${failStage} */`)) throw new Error('injected failure');
      if (sql.includes('/* create_snapshot */')) return { rows: [{ snapshot_id: '2', data_as_of: new Date('2026-10-13') }] };
      if (sql.includes('/* validate_counts */')) return { rows: [{ product_count: current, color_count: current, history_count: current, previous_product_count: previous, previous_color_count: previous }] };
      return { rows: [], rowCount: current };
    },
  };
  return { pool: { connect: async () => client }, queries, logger, client };
}

test('locks and applies timeout within transaction, validates before publication and returns timings', async () => {
  const f = fixture();
  const result = await refreshCatalogReadModel(f.pool, { logger: f.logger, statementTimeoutMs: 1234 });
  const index = (s) => f.queries.findIndex(q => q.includes(s));
  expect(index('BEGIN')).toBeLessThan(index('statement_timeout'));
  expect(index('pg_advisory_xact_lock')).toBeLessThan(index('create_snapshot'));
  expect(index('validate_counts')).toBeLessThan(index('activate_snapshot'));
  expect(f.queries.at(-1)).toBe('COMMIT');
  expect(result).toMatchObject({ snapshotId: '2', productCount: 10, colorCount: 10, historyCount: 10 });
  expect(Object.keys(result.queryDurationsMs)).toHaveLength(8);
  expect(result.totalDurationMs).toBeGreaterThanOrEqual(0);
});

test('a derivation failure rolls back before publication and records the failed stage', async () => {
  const f = fixture({ failStage: 'derive_products' });
  await expect(refreshCatalogReadModel(f.pool, { logger: f.logger })).rejects.toThrow('injected failure');
  expect(f.queries.at(-1)).toBe('ROLLBACK');
  expect(f.queries.some(q => q.includes('activate_snapshot'))).toBe(false);
  expect(f.logger.error.mock.calls.flat().join(' ')).toContain('derive_products');
  expect(f.client.release).toHaveBeenCalled();
});

test('severe count regression prevents activation', async () => {
  const f = fixture({ current: 2 });
  await expect(refreshCatalogReadModel(f.pool, { logger: f.logger, failureRegressionRatio: 0.5 })).rejects.toThrow(/regression/);
  expect(f.queries.at(-1)).toBe('ROLLBACK');
});

test('warning count regression logs and publishes', async () => {
  const f = fixture({ current: 8 });
  await refreshCatalogReadModel(f.pool, { logger: f.logger, warningRegressionRatio: 0.9, failureRegressionRatio: 0.5 });
  expect(f.logger.warn).toHaveBeenCalled();
  expect(f.queries.at(-1)).toBe('COMMIT');
});
