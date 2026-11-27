# Aritzia stock and markdown models

Run these commands from the repository root. Choose a new export directory for each database snapshot.

```sh
python3 -m venv /tmp/aritzia-model-venv
/tmp/aritzia-model-venv/bin/pip install -r scripts/statistical_models/requirements.txt
node --env-file=.env scripts/statistical_models/export.cjs /tmp/aritzia-model-snapshot
/tmp/aritzia-model-venv/bin/python scripts/statistical_models/fit.py /tmp/aritzia-model-snapshot \
  --calibration-start 2026-11-06 --holdout-start 2026-11-16 > /tmp/aritzia-model-report.json
```

The exporter reads a consistent database snapshot in a read-only transaction and keeps the latest observation per variant and Toronto calendar day. Choose the calibration and holdout dates before comparing results. Pairs crossing split boundaries are excluded from evaluation.

- **Logistic regression** estimates restock and stockout separately at a check 1–3 days later. It compares the original fit and a calibration-period intercept update against historical rates by gap length. Lower Brier scores indicate better probability predictions on the holdout.
- **Continuous-time Markov model** estimates transitions between available and sold out. The report compares rates fitted on the training and calibration periods and shows sensitivity to the maximum training gap. Availability at the next check is the modeled outcome.
- **Interval-censored markdown model** reports time since first observing a product-color at full price. It reports all eligible variants and monthly first-seen cohorts. The bounds show where the fitted mass could fall within an observation interval. These bounds describe event timing within the fitted distribution. The report omits horizons beyond each cohort’s observed follow-up.

The default coverage cutoff is 5,000 product-color observations per calendar day. Markdown follow-up stops before a gap longer than 14 days. Use `--min-daily-colors` and `--markdown-max-gap` to check sensitivity. A missing size or an observed future ship date does not establish availability. More calendar periods are needed to assess whether calibration improvements repeat.

## Price changes and size availability

Run the price-change comparison against the same export.

```sh
/tmp/aritzia-model-venv/bin/python -B scripts/statistical_models/price_changes.py \
  /tmp/aritzia-model-snapshot --holdouts 2026-10-01 2026-11-06 2026-11-16 \
  > /tmp/aritzia-price-changes.json
```

The target is a change of at least one cent in effective price for the same product-color at its next observed check, 1–3 days later. Drop and rise models compare identical rows with at least two observed size statuses linked to a matching discount. Holdouts are chronological and each fit uses only labels observed before its holdout starts.

The baseline uses price, discount, tracking age, recent price movement, weekday/weekend and gap length. The second model adds the share and number of observed sizes available, low stock, complete stockout and recent changes in availability. Size availability is a proxy for inventory. The stock snapshots do not contain quantities for most sizes.

Average precision measures ranking and is undefined in windows with zero events. Brier score measures probability error. Event-date summaries show whether scores rely on a single catalog-wide change. Ranking within a window that contains price drops evaluates which variants moved once a price-change window occurred.

## Price scenarios by product and color

```sh
/tmp/aritzia-model-venv/bin/python -B scripts/statistical_models/variant_prices.py \
  /tmp/aritzia-model-snapshot /tmp/aritzia-variant-prices.csv \
  > /tmp/aritzia-variant-price-backtests.json
```

The CSV covers every valid product-color on the latest qualifying observation date. Use `--as-of` to reproduce a historical snapshot. It shows the observed price, historical observed low, and conditional price scenarios if that variant gets cheaper during a broad markdown. The last observed price is the baseline scenario for an unchanged price.

By default, a broad markdown means at least 5% of observed product-color pairs with 1–3 day follow-up dropped on the same observation date. Each qualifying date has equal weight when estimating percentiles of the price ratio among variants that actually dropped. The low, mid, and high scenario prices are the 25th, 50th, and 75th percentiles. They describe conditional markdown amounts. They supply neither a date nor a probability of a markdown. Groups with fewer than 20 drops or fewer than two dates use a broader comparison group.

The backtests use only outcomes available as of the starting observation and compare scenario estimates with realized prices among colors that actually dropped. The inventory-adjusted columns are included for comparison. A separate evaluation would be needed to estimate the chance of a price drop for an individual product-color.

## Product detail forecasts

Add `--app-output public/predictions` to the `variant_prices.py` command to
generate the product forecasts before starting the app or creating its deployment.
Use an empty output directory for each new release so the deployment contains
only the current snapshot. The files are generated locally and ignored by Git.

The export uses the price/calendar model for a check one day after the snapshot
and the conditional markdown range without availability adjustment. The app shows
forecasts when their snapshot day (Toronto time) and reference price match the
selected color's latest observation. Use a fresh export for each data refresh.
