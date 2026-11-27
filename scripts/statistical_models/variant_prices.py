"""Estimate per-variant price scenarios and backtest them on past markdown waves."""

import argparse
import json
from pathlib import Path

import numpy as np
import pandas as pd

from price_changes import KEYS, predict, price_history

MIN_GROUP_DROPS = 20
MIN_GROUP_WAVES = 2


def segments(rows):
    result = rows.copy()
    result["on_sale"] = result.discount.gt(0)
    result["size_availability"] = pd.cut(
        result.available_share, [-1e-8, .5, .999999, 1],
        labels=["up_to_half", "more_than_half", "all"],
    ).astype("string")
    result.loc[result.known_sizes.lt(2), "size_availability"] = pd.NA
    return result


def price_ratios(drops):
    """Give each historical markdown date equal weight within the comparison group."""
    sorted_drops = drops.sort_values("price_change_fraction")
    weight = 1 / sorted_drops.groupby("end").end.transform("size").to_numpy()
    quantile = np.searchsorted(weight.cumsum(), weight.sum() * np.array([.25, .5, .75]))
    return 1 + sorted_drops.price_change_fraction.to_numpy()[quantile]


def scenario_prices(rows, drops, use_inventory):
    result = rows.copy()
    columns = ["markdown_price_low", "markdown_price_mid", "markdown_price_high"]
    result[columns] = np.nan
    result["comparison"] = ""
    result["comparison_drops"] = 0
    result["comparison_wave_dates"] = 0

    def apply(mask, examples, label):
        if len(examples) < MIN_GROUP_DROPS or examples.end.nunique() < MIN_GROUP_WAVES:
            return
        ratios = price_ratios(examples)
        result.loc[mask, columns] = np.round(result.loc[mask, "effective"].to_numpy()[:, None] * ratios, 2)
        result.loc[mask, "comparison"] = label
        result.loc[mask, "comparison_drops"] = len(examples)
        result.loc[mask, "comparison_wave_dates"] = examples.end.nunique()

    apply(np.ones(len(result), dtype=bool), drops, "all_markdown_drops")
    for on_sale, status_drops in drops.groupby("on_sale"):
        same_price_status = result.on_sale.eq(on_sale)
        apply(same_price_status, status_drops, "same_sale_status")
        if use_inventory:
            for availability, size_drops in status_drops.groupby("size_availability"):
                matches = result.size_availability.eq(availability).fillna(False)
                apply(same_price_status & matches, size_drops, "same_sale_status_and_size_availability")
    return result


def evaluate(test, drops, use_inventory):
    priced = scenario_prices(test, drops, use_inventory)
    actual = priced.effective * (1 + priced.price_change_fraction)
    return {
        "variants_that_dropped": len(priced),
        "median_actual_drop_pct": float(-100 * priced.price_change_fraction.median()),
        "unchanged_price_mean_absolute_error": float((priced.effective - actual).abs().mean()),
        "conditional_price_mean_absolute_error": float((priced.markdown_price_mid - actual).abs().mean()),
        "conditional_middle_range_coverage": float(actual.round(2).between(
            priced.markdown_price_low, priced.markdown_price_high
        ).mean()),
    }


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("snapshot_dir", type=Path)
    parser.add_argument("output_csv", type=Path)
    parser.add_argument("--as-of", type=pd.Timestamp)
    parser.add_argument("--min-daily-colors", type=int, default=5000)
    parser.add_argument("--wave-share", type=float, default=.05)
    parser.add_argument("--app-output", type=Path, help="Directory for per-product price outlook JSON")
    args = parser.parse_args()
    if args.min_daily_colors < 1 or not 0 < args.wave_share < 1:
        parser.error("Use a positive daily coverage count and a wave share between zero and one")

    history = segments(price_history(args.snapshot_dir, args.min_daily_colors))
    if args.as_of is not None:
        history = history.loc[history.d <= args.as_of]
    if history.empty:
        parser.error("No qualifying prices on or before the requested date")
    latest = history.d.max()
    pairs = history.loc[history.end.le(latest) & history.gap.between(1, 3)]
    wave_dates = pairs.groupby("end")["drop"].mean()
    drops = pairs.loc[pairs["drop"] & pairs.end.isin(wave_dates.index[wave_dates.ge(args.wave_share)])]
    if len(drops) < MIN_GROUP_DROPS or drops.end.nunique() < MIN_GROUP_WAVES:
        parser.error("The price scenario needs at least two historical markdown waves and 20 price drops")

    backtests = []
    for (start, end), test in drops.groupby(["d", "end"]):
        earlier = drops.loc[drops.end.le(start)]
        if len(earlier) < MIN_GROUP_DROPS or earlier.end.nunique() < MIN_GROUP_WAVES:
            continue
        window = pairs.loc[pairs.d.eq(start) & pairs.end.eq(end)]
        backtests.append({
            "from": start.date().isoformat(),
            "to": end.date().isoformat(),
            "previous_wave_dates": int(earlier.end.nunique()),
            "all_variants_in_window": len(window),
            "all_variants_unchanged_rate": float((~(window["drop"] | window.rise)).mean()),
            "sale_status": evaluate(test, earlier, use_inventory=False),
            "sale_status_and_availability": evaluate(test, earlier, use_inventory=True),
        })

    current = history.loc[history.d.eq(latest)]
    # Keep both scenarios visible while the incremental inventory signal is under evaluation.
    output = scenario_prices(current, drops, use_inventory=False).join(
        scenario_prices(current, drops, use_inventory=True)[[
            "markdown_price_low", "markdown_price_mid", "markdown_price_high", "comparison",
        ]].add_prefix("availability_adjusted_")
    )
    historical_low = history.groupby(KEYS).effective.min().rename("observed_price_low")
    output = output.join(historical_low, on=KEYS).rename(columns={
        "p": "product_no", "c": "color_id", "d": "price_as_of", "effective": "current_price",
    })
    output[[
        "product_no", "color_id", "price_as_of", "current_price", "observed_price_low",
        "on_sale", "known_sizes", "available_share",
        "markdown_price_low", "markdown_price_mid", "markdown_price_high", "comparison",
        "comparison_drops", "comparison_wave_dates",
        "availability_adjusted_markdown_price_low", "availability_adjusted_markdown_price_mid",
        "availability_adjusted_markdown_price_high", "availability_adjusted_comparison",
    ]].to_csv(args.output_csv, index=False, date_format="%Y-%m-%d")

    if args.app_output is not None:
        # Score a fixed one-day horizon without using the unknown next observation.
        training = pairs.loc[pairs.end.lt(latest) & pairs.known_sizes.ge(2)]
        forecast = current.assign(gap=1)
        output["drop_chance_next_day"] = (
            predict(training, forecast, "drop", inventory=False)
            if training["drop"].nunique() == 2 else np.nan
        )
        args.app_output.mkdir(parents=True, exist_ok=True)
        for product_no, colors in output.groupby("product_no"):
            if not product_no.isascii() or not product_no.isdigit():
                raise ValueError("Invalid product number in snapshot")
            records = colors.set_index("color_id")[[
                "current_price", "drop_chance_next_day", "markdown_price_low", "markdown_price_high",
            ]].to_json(orient="index")
            destination = args.app_output / f"{product_no}.json"
            temporary = destination.with_suffix(".tmp")
            temporary.write_text(json.dumps({
                "asOf": latest.date().isoformat(),
                "colors": json.loads(records),
            }), encoding="utf-8")
            temporary.replace(destination)

    print(json.dumps({
        "price_as_of": latest.date().isoformat(),
        "product_colors": len(output),
        "products": int(output.product_no.nunique()),
        "availability_adjusted_product_colors": int(output.availability_adjusted_comparison.eq(
            "same_sale_status_and_size_availability"
        ).sum()),
        "historical_wave_dates": [pd.Timestamp(date).date().isoformat() for date in sorted(drops.end.unique())],
        "conditional_price_backtests": backtests,
    }, indent=2, allow_nan=False))


if __name__ == "__main__":
    main()
