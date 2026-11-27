"""Fit stock transitions and interval-censored markdown curves from database snapshots."""

import argparse
import json
from pathlib import Path

import numpy as np
import pandas as pd

STOCK_STATES = {
    "Sold Out Online": 0,
    "In Stock": 1,
    "Only a Few Left": 1,
    "1 Left": 1,
    "2 Left": 1,
    "3 Left": 1,
}
LIMITED = ["Only a Few Left", "1 Left", "2 Left", "3 Left"]
HORIZONS = (7, 14, 30)


def stock_pairs(stock, qualifying_dates):
    stock = stock.loc[stock.d.isin(qualifying_dates)].sort_values(["p", "c", "z", "d"])
    stock["state"] = stock.a.map(STOCK_STATES)
    variants = stock.groupby(["p", "c", "z"], sort=False)
    stock["end"] = variants.d.shift(-1)
    stock["next_state"] = variants.state.shift(-1)
    stock["days"] = (stock.end - stock.d).dt.days
    pairs = stock.dropna(subset=["state", "next_state"]).copy()
    pairs["changed"] = pairs.state.ne(pairs.next_state).astype(int)
    return pairs


def features(pairs):
    discount = pairs.m.where(pairs.m.between(0, 1))
    return np.column_stack([
        np.ones(len(pairs)),
        pairs.days.eq(2),
        pairs.days.eq(3),
        discount.fillna(0) * 10,
        discount.isna(),
        pairs.a.isin(LIMITED),
        pairs.a.isin(["1 Left", "2 Left", "3 Left"]),
    ])


def sigmoid(logits):
    return 1 / (1 + np.exp(-np.clip(logits, -35, 35)))


def fit_logistic(x, y):
    coefficients = np.zeros(x.shape[1])
    penalty = np.diag(np.r_[0, np.ones(x.shape[1] - 1)])
    for _ in range(50):
        probabilities = sigmoid(x @ coefficients)
        variance = probabilities * (1 - probabilities)
        gradient = x.T @ (y - probabilities) - penalty @ coefficients
        information = x.T @ (variance[:, None] * x) + penalty
        step = np.linalg.solve(information, gradient)
        coefficients += step
        if np.max(np.abs(step)) < 1e-8:
            return coefficients
    raise ValueError("Logistic regression failed to converge")


def intercept_update(logits, outcomes):
    # The fitted event count increases monotonically with the intercept.
    lower, upper = -40., 40.
    target = outcomes.mean()
    for _ in range(60):
        midpoint = (lower + upper) / 2
        if sigmoid(logits + midpoint).mean() < target:
            lower = midpoint
        else:
            upper = midpoint
    return (lower + upper) / 2


def transition_probability(state, days, rates):
    restock, stockout = rates
    total = restock + stockout
    return np.where(state == 0, restock, stockout) / total * -np.expm1(-total * days)


def fit_markov(pairs):
    counts = pairs.groupby(["state", "days"]).changed.agg(["sum", "size"]).reset_index()
    state, days, events, size = counts.to_numpy().T

    def loss(log_rates):
        probability = transition_probability(state, days, np.exp(log_rates))
        probability = np.clip(probability, 1e-12, 1 - 1e-12)
        return -(events @ np.log(probability) + (size - events) @ np.log1p(-probability))

    best = np.log([.02, .01])
    for step in (1, .3, .1, .03, .01, .003, .001, .0003, .0001):
        offsets = (np.array([i, j]) * step for i in range(-4, 5) for j in range(-4, 5))
        best = min((best + offset for offset in offsets), key=loss)
    return np.exp(best)


def metrics(pairs, predictions):
    return {
        "observations": len(pairs),
        "products": int(pairs.p.nunique()),
        "observed_rate": float(pairs.changed.mean()),
        "predicted_rate": float(np.mean(predictions)),
        "brier_score": float(np.mean((pairs.changed - predictions) ** 2)),
    }


def evaluate_stock(pairs, calibration_start, holdout_start):
    short = pairs.loc[pairs.days.between(1, 3)]
    training = short.loc[short.end < calibration_start]
    calibration = short.loc[(short.d >= calibration_start) & (short.end < holdout_start)]
    holdout = short.loc[short.d >= holdout_start]
    for sample in (training, calibration, holdout):
        if sample.state.nunique() != 2:
            raise ValueError("Each date split must contain both starting stock states")
    for sample in (training, calibration):
        if (sample.groupby("state").changed.nunique() < 2).any():
            raise ValueError("Training and calibration need both outcomes per starting state")

    markov_rates = {"training": fit_markov(training), "calibrated": fit_markov(calibration)}
    markov_sensitivity = {}
    for max_gap in (3, 7, 27):
        sample = pairs.loc[(pairs.end < calibration_start) & pairs.days.between(1, max_gap)]
        rates = fit_markov(sample)
        markov_sensitivity[str(max_gap)] = {
            "rates_per_day": rates.tolist(),
            "three_day_restock": float(transition_probability(0, 3, rates)),
        }

    results = {}
    for state, name in ((0, "restock"), (1, "stockout")):
        train, calibrate, test = (sample.loc[sample.state.eq(state)] for sample in (training, calibration, holdout))
        train_x = features(train)
        active = np.r_[True, train_x[:, 1:].std(axis=0) > 0]
        coefficients = fit_logistic(train_x[:, active], train.changed.to_numpy())
        test_logits = features(test)[:, active] @ coefficients
        update = intercept_update(features(calibrate)[:, active] @ coefficients, calibrate.changed)
        baseline = train.groupby("days").changed.mean()
        if not test.days.isin(baseline.index).all():
            raise ValueError("The training split needs observations for every holdout gap length")
        results[name] = {
            "logistic_coefficients": dict(zip(
                np.array(["intercept", "gap_2", "gap_3", "discount_per_10_points",
                          "discount_missing", "limited_stock", "one_to_three_left"])[active],
                coefficients.tolist(),
            )),
            "calibration_intercept_change": update,
            "gap_baseline": metrics(test, test.days.map(baseline)),
            "logistic": metrics(test, sigmoid(test_logits)),
            "logistic_calibrated": metrics(test, sigmoid(test_logits + update)),
            "markov": {
                label: {
                    "holdout": metrics(test, transition_probability(state, test.days, rates)),
                    "probability_at_check": {
                        str(days): float(transition_probability(state, days, rates))
                        for days in (1, 2, 3)
                    },
                }
                for label, rates in markov_rates.items()
            },
        }
    return {"holdout": results, "markov_training_gap_sensitivity": markov_sensitivity}


def markdown_intervals(prices, qualifying_dates, max_gap):
    valid = prices.o.gt(0) & (prices.s.isna() | (prices.s.gt(0) & prices.s.le(prices.o)))
    prices = prices.loc[valid & prices.d.isin(qualifying_dates)].sort_values(["p", "c", "d"])
    intervals = []
    already_discounted = 0
    for (product, _), history in prices.groupby(["p", "c"], sort=False):
        discounted = history.s.lt(history.o).to_numpy()
        if discounted[0]:
            already_discounted += 1
            continue
        start = history.d.iloc[0]
        days = (history.d - start).dt.days.to_numpy()
        left, right = 0, np.inf
        for day, sale in zip(days[1:], discounted[1:]):
            if day - left > max_gap:
                break
            if sale:
                right = day
                break
            left = day
        intervals.append((product, start.strftime("%Y-%m"), left, right))
    return pd.DataFrame(intervals, columns=["product", "cohort", "left", "right"]), already_discounted


def turnbull(intervals):
    """Fit masses over contiguous day ranges with identical observation support."""
    counts = intervals.groupby(["left", "right"]).size().reset_index(name="count")
    finite_right = counts.right[np.isfinite(counts.right)]
    edges = np.unique(np.r_[0, counts.left, finite_right, np.inf])
    lower, upper = edges[:-1], edges[1:]
    compatible = (upper[None, :] <= counts.right.to_numpy()[:, None]) & (
        lower[None, :] >= counts.left.to_numpy()[:, None]
    )
    compatible = compatible.astype(float)
    weights = counts["count"].to_numpy() / len(intervals)
    mass = np.full(len(lower), 1 / len(lower))
    for iteration in range(1, 20001):
        updated = mass * ((weights / (compatible @ mass)) @ compatible)
        if np.max(np.abs(updated - mass)) < 1e-8:
            mass = updated
            break
        mass = updated
    return {
        "product_colors": len(intervals),
        "products": int(intervals["product"].nunique()),
        "detected_markdowns": int(np.isfinite(intervals.right).sum()),
        "converged": iteration < 20000,
        "probability_by_day": {
            str(day): {
                "followed_without_markdown_to_day": int(intervals.left.ge(day).sum()),
                "lower": float(mass[upper <= day].sum()),
                "upper": float(mass[lower < day].sum()),
            }
            for day in HORIZONS
            if day <= max(intervals.left.max(), finite_right.max() if len(finite_right) else 0)
        },
    }


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("snapshot_dir", type=Path)
    parser.add_argument("--calibration-start", required=True, type=pd.Timestamp)
    parser.add_argument("--holdout-start", required=True, type=pd.Timestamp)
    parser.add_argument("--min-daily-colors", type=int, default=5000)
    parser.add_argument("--markdown-max-gap", type=int, default=14)
    args = parser.parse_args()
    if args.calibration_start >= args.holdout_start:
        parser.error("Calibration must start before the holdout")
    if min(args.min_daily_colors, args.markdown_max_gap) < 1:
        parser.error("Coverage and markdown gap limits must be positive")

    def load(name):
        frame = pd.read_json(
            args.snapshot_dir / f"{name}.json", convert_dates=False, dtype={"p": str, "c": str, "z": str}
        )
        frame.d = pd.to_datetime(frame.d)
        return frame

    days = load("days")
    good = days.loc[days.n >= args.min_daily_colors, "d"]
    pairs = stock_pairs(load("stock"), good)
    intervals, excluded = markdown_intervals(load("prices"), good, args.markdown_max_gap)
    if intervals.empty:
        parser.error("No product-colors were first observed at full price")
    report = {
        "coverage": {
            "qualifying_dates": len(good),
            "latest_qualifying_date": good.max().date().isoformat(),
            "calibration_start": args.calibration_start.date().isoformat(),
            "holdout_start": args.holdout_start.date().isoformat(),
            "minimum_daily_product_colors": args.min_daily_colors,
        },
        "stock": evaluate_stock(pairs, args.calibration_start, args.holdout_start),
        "markdown": {
            "maximum_gap_days": args.markdown_max_gap,
            "already_discounted_at_first_check": excluded,
            "all": turnbull(intervals),
            "first_seen_month": {month: turnbull(cohort) for month, cohort in intervals.groupby("cohort")},
        },
    }
    print(json.dumps(report, indent=2, allow_nan=False))


if __name__ == "__main__":
    main()
