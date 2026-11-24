"""Generate the fuel-price JSON from the public Goteborg 95 E10 listing."""

import json
import logging
import re
import statistics
import sys
from datetime import datetime, timezone
from pathlib import Path

PRICE = re.compile(r'<div class="cp-price">\s*([0-9]+,[0-9]{2})\s*<small>kr</small>\s*</div>')


def summarize_prices(html: str) -> dict[str, float | int | str]:
    """Summarize reported station prices, excluding unavailable entries."""
    prices = [
        float(match[1].replace(",", "."))
        for match in PRICE.finditer(html)
        if match[1] != "0,00"
    ]
    if not prices:
        raise ValueError("No reported 95 E10 prices found in the Goteborg station listing")

    return {
        "median": statistics.median(prices),
        "cheapest": min(prices),
        "mostExpensive": max(prices),
        "average": round(statistics.mean(prices), 2),
        "stationCount": len(prices),
        "updatedAt": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "source": "bensinpriser.nu",
        "commune": "goteborg",
    }


def main(listing: Path) -> None:
    """Write the price snapshot only after the listing has been parsed."""
    result = summarize_prices(listing.read_text(encoding="utf-8"))
    Path("data/fuel-price.json").write_text(json.dumps(result, indent=2) + "\n", encoding="utf-8")
    logging.info("Updated prices from %s stations; median %s SEK/l", result["stationCount"], result["median"])


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO)
    main(Path(sys.argv[1]))
