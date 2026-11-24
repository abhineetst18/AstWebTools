"""Regression tests for the fuel price listing and snapshot."""

import unittest

from scripts.update_fuel_price import summarize_prices


class FuelPriceTest(unittest.TestCase):
    def test_summarizes_reported_prices_only(self) -> None:
        result = summarize_prices("""
            <div class="cp-price"> 19,25<small>kr</small></div>
            <div class="cp-price">
              16,75<small>kr</small>
            </div>
            <div class="cp-price">Saknas</div>
            <div class="cp-price">0,00<small>kr</small></div>
            <div class="other-price">9,99<small>kr</small></div>
        """)

        self.assertEqual(result["stationCount"], 2)
        self.assertEqual(result["median"], 18.0)
        self.assertEqual(result["cheapest"], 16.75)
        self.assertEqual(result["mostExpensive"], 19.25)
        self.assertEqual(result["average"], 18.0)

    def test_rejects_tiers_and_empty_listing(self) -> None:
        for payload in (
            '{"stations":[{"communeLink":"goteborg","tiers":{"price95":2}}]}',
            '<div class="cp-price">Saknas</div>',
        ):
            with self.subTest(payload=payload), self.assertRaisesRegex(ValueError, "No reported 95 E10 prices"):
                summarize_prices(payload)
