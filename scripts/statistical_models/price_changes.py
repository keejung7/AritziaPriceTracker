"""Evaluate whether listed size availability adds signal to price-change forecasts."""

import argparse
import json
from pathlib import Path

import numpy as np
import pandas as pd

from fit import LIMITED, STOCK_STATES, fit_logistic, sigmoid

KEYS = ["p", "c"]


def load(directory, name):
    frame = pd.read_json(
        directory / f"{name}.json", convert_dates=False, dtype={"p": str, "c": str, "z": str}
    )
    frame.d = pd.to_datetime(frame.d)
    return frame


def price_history(directory, minimum_coverage):
    days = load(directory, "days")
    qualifying = days.loc[days.n.ge(minimum_coverage), "d"]
    prices = load(directory, "prices")
    valid = prices.o.gt(0) & (prices.s.isna() | (prices.s.gt(0) & prices.s.le(prices.o)))
    prices = prices.loc[valid & prices.d.isin(qualifying)].sort_values([*KEYS, "d"]).copy()
    prices["effective"] = prices.s.fillna(prices.o)
    prices["discount"] = 1 - prices.effective / prices.o

    stock = load(directory, "stock")
    stock = stock.loc[stock.d.isin(qualifying) & stock.a.isin(STOCK_STATES)].copy()
    stock = stock.merge(prices[[*KEYS, "d", "discount"]], on=[*KEYS, "d"], validate="many_to_one")
    # Keep sizes whose same-timestamp price agrees with the daily price exposure.
    stock = stock.loc[np.isclose(stock.m, stock.discount, rtol=0, atol=1e-7)].copy()
    stock["available"] = stock.a.map(STOCK_STATES)
    stock["limited"] = stock.a.isin(LIMITED).astype(int)
    size_counts = stock.groupby([*KEYS, "d"]).agg(
        known_sizes=("available", "size"),
        available_share=("available", "mean"),
        limited_share=("limited", "mean"),
    )
    prices = prices.join(size_counts, on=[*KEYS, "d"])
    history = prices.groupby(KEYS, sort=False)
    prices["age"] = (prices.d - history.d.transform("first")).dt.days
    prices["end"] = history.d.shift(-1)
    prices["gap"] = (prices.end - prices.d).dt.days
    next_price = history.effective.shift(-1)
    prices["price_change_fraction"] = next_price / prices.effective - 1
    prices["drop"] = next_price.le(prices.effective - .01 + 1e-8)
    prices["rise"] = next_price.ge(prices.effective + .01 - 1e-8)
    prices["previous_change"] = prices.effective / history.effective.shift(1) - 1
    previous_date = history.d.shift(1)
    prices["availability_change"] = (
        prices.available_share - history.available_share.shift(1)
    ).where((prices.d - previous_date).dt.days.le(7))
    return prices


def observations(directory, minimum_coverage):
    prices = price_history(directory, minimum_coverage)
    return prices.loc[prices.gap.between(1, 3) & prices.known_sizes.ge(2)].copy()


def design(rows, inventory):
    columns = {
        "gap_2": rows.gap.eq(2),
        "gap_3": rows.gap.eq(3),
        "discount": rows.discount,
        "log_list_price": np.log(rows.o),
        "log_tracked_age": np.log1p(rows.age),
        "previous_price_change": rows.previous_change.clip(-1, 1).fillna(0),
        "no_previous_price": rows.previous_change.isna(),
        "weekend": rows.d.dt.dayofweek.ge(5),
    }
    if inventory:
        columns.update({
            "available_share": rows.available_share,
            "all_sold_out": rows.available_share.eq(0),
            "limited_share": rows.limited_share,
            "log_known_sizes": np.log(rows.known_sizes),
            "availability_change": rows.availability_change.fillna(0),
            "no_recent_availability_change": rows.availability_change.isna(),
        })
    return pd.DataFrame(columns, index=rows.index, dtype=float)


def predict(train, test, target, inventory):
    train_x = design(train, inventory)
    spread = train_x.std(ddof=0)
    active = spread.index[spread.gt(1e-10)]
    center = train_x[active].mean()

    def matrix(x):
        normalized = ((x[active] - center) / spread[active]).clip(-10, 10)
        return np.column_stack([np.ones(len(x)), normalized])

    coefficients = fit_logistic(matrix(train_x), train[target].to_numpy())
    return sigmoid(matrix(design(test, inventory)) @ coefficients)


def metrics(outcomes, predictions):
    outcomes = np.asarray(outcomes, dtype=int)
    by_score = pd.DataFrame({"prediction": predictions, "event": outcomes})
    ranked = by_score.groupby("prediction", sort=True).event.agg(["sum", "size"]).iloc[::-1]
    precision = ranked["sum"].cumsum() / ranked["size"].cumsum()
    positives = outcomes.sum()
    return {
        "mean_prediction": float(np.mean(predictions)),
        "brier_score": float(np.mean((outcomes - predictions) ** 2)),
        "average_precision": float((precision * ranked["sum"]).sum() / positives) if positives else None,
    }


def evaluate(rows, starts, target):
    reports = []
    for start, stop in zip(starts, [*starts[1:], pd.Timestamp.max]):
        train = rows.loc[rows.end < start]
        test = rows.loc[(rows.d >= start) & (rows.end < stop)]
        if train[target].nunique() < 2 or test.empty:
            continue
        baseline = predict(train, test, target, inventory=False)
        augmented = predict(train, test, target, inventory=True)
        count = int(test[target].sum())
        event_days = test.loc[test[target]].groupby("end").size()
        event_windows = []
        for (start_date, end_date), window in test.groupby(["d", "end"]):
            if not window[target].any():
                continue
            selection = test.d.eq(start_date) & test.end.eq(end_date)
            event_windows.append({
                "from": start_date.date().isoformat(),
                "to": end_date.date().isoformat(),
                "pairs": len(window),
                "events": int(window[target].sum()),
                "price_calendar": metrics(window[target], baseline[selection]),
                "price_calendar_inventory": metrics(window[target], augmented[selection]),
            })
        reports.append({
            "start": start.date().isoformat(),
            "end": test.end.max().date().isoformat(),
            "pairs": len(test),
            "events": count,
            "event_dates": len(event_days),
            "largest_event_date_share": float(event_days.max() / count) if count else None,
            "observed_rate": float(test[target].mean()),
            "windows_with_events": event_windows,
            "price_calendar": metrics(test[target], baseline),
            "price_calendar_inventory": metrics(test[target], augmented),
        })
    return reports


def summarize_availability(rows, starts):
    sample = rows.loc[rows.d.ge(starts[0])].copy()
    sample["availability"] = pd.cut(
        sample.available_share, [-1e-8, 0, .5, .999999, 1],
        labels=["none", "up_to_half", "more_than_half", "all"],
    )
    sample["already_discounted"] = sample.discount.gt(0)
    report = []
    for (discounted, availability), group in sample.groupby(
        ["already_discounted", "availability"], observed=True
    ):
        report.append({
            "already_discounted": bool(discounted),
            "availability": availability,
            "pairs": len(group),
            "products": int(group.p.nunique()),
            "drop_rate": float(group["drop"].mean()),
            "rise_rate": float(group.rise.mean()),
        })
    return report


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("snapshot_dir", type=Path)
    parser.add_argument("--holdouts", required=True, nargs="+", type=pd.Timestamp)
    parser.add_argument("--min-daily-colors", type=int, default=5000)
    args = parser.parse_args()
    if args.min_daily_colors < 1:
        parser.error("Minimum daily coverage must be positive")
    starts = sorted(set(args.holdouts))
    rows = observations(args.snapshot_dir, args.min_daily_colors)
    drops_by_date = []
    for date, group in rows.groupby("end"):
        drops = group.loc[group["drop"]]
        if drops.empty:
            continue
        drops_by_date.append({
            "date": date.date().isoformat(),
            "pairs": len(group),
            "drops": len(drops),
            "products_with_drops": int(drops.p.nunique()),
            "median_drop_fraction": float(-drops.price_change_fraction.median()),
        })
    report = {
        "eligible_pairs": len(rows),
        "drop_days": drops_by_date,
        "availability_groups": summarize_availability(rows, starts),
        "drop": evaluate(rows, starts, "drop"),
        "rise": evaluate(rows, starts, "rise"),
    }
    print(json.dumps(report, indent=2, allow_nan=False))


if __name__ == "__main__":
    main()
