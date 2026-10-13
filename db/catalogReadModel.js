const { performance } = require('node:perf_hooks');
const { createDbLogger } = require('./loadLogging');

const DEFAULTS = Object.freeze({ historyDays: 90, statementTimeoutMs: 120000,
  warningRegressionRatio: 0.75, failureRegressionRatio: 0.50, retainedSnapshots: 2 });
const AVAILABLE = "trim(product_status) ~* '^(In Stock|Only a Few Left|Available)$'";
const SOLD_OUT = "trim(product_status) ~* '^(Sold Out|Unavailable)$'";
// Raw scraper metadata stores fractions and may be absent/stale. Catalog values
// are percentage points calculated from the same paired prices shown to readers.
const DISCOUNT_PERCENT = `CASE WHEN p.original_price>0
  AND COALESCE(p.sale_price,p.original_price)<=p.original_price
  THEN round((1-COALESCE(p.sale_price,p.original_price)/p.original_price)*100) END`;
// Choose the latest complete color observation before eligibility and price ranking.
// Reuse the same daily series for chart points, all low labels, and validation.
const DAILY_SERIES = `WITH daily_colors AS (
  SELECT DISTINCT ON (p.product_no,p.color_id,(p.scraped_date AT TIME ZONE 'UTC')::date)
    p.*, (p.scraped_date AT TIME ZONE 'UTC')::date AS observation_date
  FROM aritzia_products.price_snapshots p
  WHERE EXISTS (SELECT 1 FROM aritzia_products.stock_snapshots s WHERE s.product_no=p.product_no
    AND s.color_id=p.color_id AND s.scraped_date=p.scraped_date)
  ORDER BY p.product_no,p.color_id,(p.scraped_date AT TIME ZONE 'UTC')::date,p.scraped_date DESC
), eligible_daily_colors AS (
  SELECT p.product_no,p.color_id,p.original_price,p.sale_price,p.scraped_date,p.observation_date,
    ${DISCOUNT_PERCENT} AS sale_percent,COALESCE(p.sale_price,p.original_price) AS effective_price FROM daily_colors p
  WHERE COALESCE(p.sale_price,p.original_price) IS NOT NULL
    AND EXISTS (SELECT 1 FROM aritzia_products.stock_snapshots s WHERE s.product_no=p.product_no
      AND s.color_id=p.color_id AND s.scraped_date=p.scraped_date AND ${AVAILABLE})
), daily_products AS (
  SELECT DISTINCT ON (product_no,observation_date) * FROM eligible_daily_colors
  ORDER BY product_no,observation_date,effective_price,color_id
)`;

async function refreshCatalogReadModel(pool, options = {}) {
  const { historyDays, statementTimeoutMs, warningRegressionRatio,
    failureRegressionRatio, retainedSnapshots, logger = createDbLogger() } = { ...DEFAULTS, ...options };
  if (!Number.isInteger(historyDays) || historyDays < 1 || historyDays > 90) throw new Error('historyDays must be between 1 and 90');
  if (!Number.isInteger(statementTimeoutMs) || statementTimeoutMs < 1) throw new Error('statementTimeoutMs must be positive');
  if (!Number.isInteger(retainedSnapshots) || retainedSnapshots < 0) throw new Error('retainedSnapshots must be nonnegative');
  if (!(failureRegressionRatio >= 0 && failureRegressionRatio <= warningRegressionRatio && warningRegressionRatio <= 1)) throw new Error('Invalid regression ratios');
  const started = performance.now();
  const attemptStartedAt = new Date();
  const queryDurationsMs = {};
  const client = await pool.connect();
  let stage = 'begin';
  let snapshotId;
  let dataAsOf;
  const run = async (name, sql, values = []) => {
    stage = name;
    const start = performance.now();
    try { return await client.query(`/* ${name} */\n${sql}`, values); }
    finally {
      queryDurationsMs[name] = performance.now() - start;
      logger.info(`catalog stage=${name} queryDurationMs=${queryDurationsMs[name].toFixed(2)}`);
    }
  };
  try {
    await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ');
    await client.query(`SET LOCAL statement_timeout = '${statementTimeoutMs}ms'`);
    logger.info(`catalog settings statementTimeoutMs=${statementTimeoutMs} retainedSnapshots=${retainedSnapshots} historyDays=${historyDays}`);
    await client.query('SELECT pg_advisory_xact_lock(18436, 1)');
    const created = await run('create_snapshot', `INSERT INTO aritzia_products.catalog_snapshots (data_as_of)
      SELECT COALESCE(GREATEST((SELECT max(scraped_date) FROM aritzia_products.price_snapshots),
        (SELECT max(scraped_date) FROM aritzia_products.stock_snapshots)), now())
      RETURNING snapshot_id, data_as_of`);
    snapshotId = created.rows[0].snapshot_id;
    dataAsOf = created.rows[0].data_as_of;
    await run('derive_current_colors', `INSERT INTO aritzia_products.catalog_product_colors
      (snapshot_id, product_no, color_id, original_price, sale_price, effective_price,
       sale_percent, available_sizes, availability_status, scraped_date,
       color_name, product_color_image_url, swatch_image_url)
      SELECT $1, p.product_no, p.color_id, p.original_price, p.sale_price,
        COALESCE(p.sale_price, p.original_price), ${DISCOUNT_PERCENT}, COALESCE(s.sizes, '{}'::text[]),
        CASE WHEN cardinality(s.sizes)>0 THEN 'available'
          WHEN s.total>0 AND s.all_sold_out THEN 'sold_out' ELSE 'unknown' END,
        p.scraped_date, c.color_name, pc.product_color_image_url, c.swatch_image_url
      FROM (SELECT DISTINCT ON (product_no, color_id) * FROM aritzia_products.price_snapshots
        ORDER BY product_no, color_id, scraped_date DESC) p
      JOIN aritzia_products.product_colors pc USING(product_no, color_id)
      JOIN aritzia_products.colors c USING(color_id)
      LEFT JOIN LATERAL (SELECT count(*) AS total,
        bool_and(COALESCE(${SOLD_OUT}, false)) AS all_sold_out,
        array_agg(product_size ORDER BY product_size) FILTER (WHERE ${AVAILABLE}) AS sizes
        FROM aritzia_products.stock_snapshots s WHERE s.product_no=p.product_no
          AND s.color_id=p.color_id AND s.scraped_date=p.scraped_date) s ON true`, [snapshotId]);
    await run('derive_products', `INSERT INTO aritzia_products.catalog_products
      (snapshot_id, product_no, product_slug, product_full_url, product_name, product_brand,
       categories, from_color_id, from_price, from_original_price, from_sale_percent,
       availability_status, tracking_started_at)
      SELECT $1, p.product_no, p.product_slug, p.product_full_url, p.product_name, p.product_brand,
        ARRAY(SELECT category_slug FROM aritzia_products.product_categories cat
          WHERE cat.product_no=p.product_no ORDER BY category_slug),
        cheapest.color_id, cheapest.effective_price, cheapest.original_price, cheapest.sale_percent,
        CASE WHEN bool_or(c.availability_status='available') THEN 'available'
          WHEN bool_and(c.availability_status='sold_out') THEN 'sold_out' ELSE 'unknown' END,
        (SELECT min(scraped_date) FROM aritzia_products.price_snapshots raw WHERE raw.product_no=p.product_no)
      FROM aritzia_products.products p JOIN aritzia_products.catalog_product_colors c
        ON c.product_no=p.product_no AND c.snapshot_id=$1
      LEFT JOIN LATERAL (SELECT * FROM aritzia_products.catalog_product_colors cc
        WHERE cc.snapshot_id=$1 AND cc.product_no=p.product_no AND cc.availability_status='available'
          AND cc.effective_price IS NOT NULL ORDER BY cc.effective_price, cc.color_id LIMIT 1) cheapest ON true
      GROUP BY p.product_no, cheapest.color_id, cheapest.effective_price, cheapest.original_price, cheapest.sale_percent`, [snapshotId]);
    await run('derive_90_day_history', `${DAILY_SERIES}
      INSERT INTO aritzia_products.catalog_product_price_history
      (snapshot_id, product_no, observation_date, effective_price, original_price, sale_percent, color_id)
      SELECT $1, product_no, observation_date, effective_price, original_price, sale_percent, color_id
      FROM daily_products
      WHERE observation_date >= ($2::timestamptz AT TIME ZONE 'UTC')::date-($3::integer-1)`, [snapshotId,dataAsOf,historyDays]);
    await run('derive_all_time_lows', `${DAILY_SERIES}, lows AS (
      SELECT p.product_no, min(effective_price) AS ever,
        min(effective_price) FILTER (WHERE observation_date >= ($2::timestamptz AT TIME ZONE 'UTC')::date-89) AS days90,
        min(effective_price) FILTER (WHERE observation_date >= ($2::timestamptz AT TIME ZONE 'UTC')::date-29) AS days30
      FROM daily_products p
      GROUP BY p.product_no)
      UPDATE aritzia_products.catalog_products c SET insight_label=CASE
        WHEN c.from_price<=lows.ever THEN 'Lowest ever'
        WHEN c.from_price<=lows.days90 THEN 'Lowest in 90 days'
        WHEN c.from_price<=lows.days30 THEN 'Lowest in 30 days' END
      FROM lows WHERE c.snapshot_id=$1 AND c.product_no=lows.product_no`, [snapshotId,dataAsOf]);
    const countsResult = await run('validate_counts', `${DAILY_SERIES} SELECT
      (EXISTS (SELECT 1 FROM eligible_daily_colors WHERE effective_price<0 OR original_price<0 OR sale_price<0)
        OR EXISTS (SELECT 1 FROM aritzia_products.catalog_product_colors WHERE snapshot_id=$1
          AND availability_status='available' AND (effective_price<0 OR original_price<0 OR sale_price<0))
        OR EXISTS (SELECT 1 FROM aritzia_products.catalog_products WHERE snapshot_id=$1
          AND (from_price<0 OR from_original_price<0))
        OR EXISTS (SELECT 1 FROM aritzia_products.catalog_product_price_history WHERE snapshot_id=$1
          AND (effective_price<0 OR original_price<0))) AS has_negative_price,
      (SELECT count(*) FROM aritzia_products.catalog_products WHERE snapshot_id=$1) AS product_count,
      (SELECT count(*) FROM aritzia_products.catalog_product_colors WHERE snapshot_id=$1) AS color_count,
      (SELECT count(*) FROM aritzia_products.catalog_product_price_history WHERE snapshot_id=$1) AS history_count,
      (SELECT count(*) FROM aritzia_products.catalog_products p JOIN aritzia_products.catalog_snapshots s USING(snapshot_id) WHERE s.status='active') AS previous_product_count,
      (SELECT count(*) FROM aritzia_products.catalog_product_colors p JOIN aritzia_products.catalog_snapshots s USING(snapshot_id) WHERE s.status='active') AS previous_color_count`, [snapshotId]);
    const counts = countsResult.rows[0];
    if (counts.has_negative_price) throw new Error('Catalog validation rejected a negative price');
    for (const kind of ['product','color']) {
      const previous = Number(counts[`previous_${kind}_count`]);
      const current = Number(counts[`${kind}_count`]);
      if (previous>0 && current/previous<failureRegressionRatio) throw new Error(`Severe ${kind} count regression: ${previous} -> ${current}`);
      if (previous>0 && current/previous<warningRegressionRatio) logger.warn(`catalog warning ${kind} count regression: ${previous} -> ${current}`);
    }
    logger.info(`catalog counts productCount=${counts.product_count} colorCount=${counts.color_count} historyCount=${counts.history_count}`);
    await run('activate_snapshot', `WITH deactivate AS (
      UPDATE aritzia_products.catalog_snapshots SET status='inactive' WHERE status='active' RETURNING snapshot_id)
      UPDATE aritzia_products.catalog_snapshots SET status='active', activated_at=now()
      WHERE snapshot_id=$1 AND (SELECT count(*) FROM deactivate)>=0`, [snapshotId]);
    const cleanup = await run('cleanup_snapshots', `DELETE FROM aritzia_products.catalog_snapshots WHERE status<>'active'
      AND snapshot_id NOT IN (SELECT snapshot_id FROM aritzia_products.catalog_snapshots
        WHERE status IN ('inactive','failed') ORDER BY snapshot_id DESC LIMIT $1)`, [retainedSnapshots]);
    logger.info(`catalog cleanup removedSnapshots=${cleanup.rowCount ?? 0} retainedNonActive=${retainedSnapshots}`);
    stage = 'commit';
    await client.query('COMMIT');
    const totalDurationMs = performance.now()-started;
    logger.info(`catalog snapshotId=${snapshotId} totalDurationMs=${totalDurationMs.toFixed(2)}`);
    return { snapshotId, dataAsOf, productCount: Number(counts.product_count), colorCount: Number(counts.color_count),
      historyCount: Number(counts.history_count), queryDurationsMs, totalDurationMs };
  } catch (error) {
    try { await client.query('ROLLBACK'); }
    catch (rollbackError) { logger.error(`catalog rollback failed: ${rollbackError.message}`); }
    logger.error(`catalog failed stage=${stage} snapshotId=${snapshotId ?? 'none'} totalDurationMs=${(performance.now()-started).toFixed(2)} error=${error.message}`);
    try {
      // This separate transaction cannot alter the active pointer. Reuse the failed
      // attempt's allocated ID; created_at preserves its start, and logs its duration.
      await client.query('BEGIN');
      await client.query(`SET LOCAL statement_timeout = '${statementTimeoutMs}ms'`);
      if (snapshotId !== undefined) {
        await client.query(`/* record_failure */ INSERT INTO aritzia_products.catalog_snapshots
          (snapshot_id,status,data_as_of,created_at) VALUES($1,'failed',$2,$3)`,
        [snapshotId,dataAsOf ?? attemptStartedAt,attemptStartedAt]);
      } else {
        await client.query(`/* record_failure */ INSERT INTO aritzia_products.catalog_snapshots
          (status,data_as_of,created_at) VALUES('failed',$1,$1)`, [attemptStartedAt]);
      }
      await client.query('COMMIT');
      logger.info(`catalog failure marker persisted snapshotId=${snapshotId ?? 'generated'} totalDurationMs=${(performance.now()-started).toFixed(2)}`);
    } catch (markerError) {
      try { await client.query('ROLLBACK'); } catch (_) { /* preserve original error */ }
      logger.error(`catalog failure marker persistence failed: ${markerError.message}`);
    }
    throw error;
  } finally { client.release(); }
}
module.exports = { refreshCatalogReadModel, DEFAULTS };
