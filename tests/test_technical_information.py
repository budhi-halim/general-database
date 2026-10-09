"""Offline coverage of the technical-information fetch pipeline."""

import json
from contextlib import ExitStack
from pathlib import Path
import tempfile
import unittest
from unittest.mock import Mock, patch
from urllib.parse import parse_qs, urlsplit

import requests
from src import main


class TechnicalInformationTests(unittest.TestCase):
    """Exercise URL construction, validation, retries, and snapshot preservation."""

    def test_url_builders(self) -> None:
        """Keep the existing all-history queries and the portal's endpoint casing."""
        builders = [
            (main.get_sample_request_url, main.SAMPLE_BASE_URL, ["fil_status", "tipe"]),
            (main.get_stock_request_url, main.STOCK_BASE_URL, ["status", "tipe"]),
            (main.get_sales_order_url, main.SALES_BASE_URL, ["status", "tipe", "srs_value", "orderData"]),
            (main.get_technical_information_url, main.TECHNICAL_INFORMATION_BASE_URL, ["fil_status", "tipe", "fil_lock"]),
        ]
        with patch.object(main, "jakarta_today_date_str", return_value="2026-09-20"):
            for builder, endpoint, blanks in builders:
                url = builder()
                self.assertEqual(url.split("?")[0], endpoint)
                self.assertEqual(parse_qs(urlsplit(url).query, keep_blank_values=True), {
                    "dari": ["0001-01-01"], "sampai": ["2026-09-20"],
                    **{key: [""] for key in blanks},
                })
        self.assertTrue(main.TECHNICAL_INFORMATION_BASE_URL.endswith("/master/Tir/json"))

    def test_snapshot_validation(self) -> None:
        """Accept complete and empty responses while rejecting truncated snapshots."""
        record = {"id_tir": "001", "tir_no": "1/IX/2026/TIR", "tir_ir": '["Spec", ""]'}
        for payload in [{"data": [record], "recordsFiltered": 1}, {"data": [], "recordsFiltered": 0}]:
            self.assertTrue(main.is_technical_information_payload(payload))
        for payload in [None, [], {}, {"data": [record], "recordsFiltered": 2},
                        {"data": [record], "recordsFiltered": True},
                        {"data": [{}], "recordsFiltered": 1}]:
            self.assertFalse(main.is_technical_information_payload(payload))

    def test_retries_and_http_failure(self) -> None:
        """Reuse the bounded timeout retry policy and stop on an HTTP failure."""
        response = Mock()
        response.json.return_value = {"data": []}
        with patch.object(main.requests, "get", side_effect=[requests.Timeout(), requests.ConnectionError(), response]) as get, patch.object(main.time, "sleep") as sleep:
            self.assertEqual(main.fetch_json("http://example.test"), {"data": []})
            self.assertEqual(get.call_count, 3)
            get.assert_called_with("http://example.test", timeout=90)
            self.assertEqual(sleep.call_count, 2)
        response.raise_for_status.side_effect = requests.HTTPError()
        with patch.object(main.requests, "get", return_value=response) as get:
            self.assertIsNone(main.fetch_json("http://example.test"))
            self.assertEqual(get.call_count, 1)

    def test_full_pipeline_and_failed_refresh(self) -> None:
        """Write raw records atomically and retain the saved snapshot on failure."""
        technical = {"recordsFiltered": 1, "data": [{"id_tir": "001", "tir_no": "T1", "tir_ir": '["Spécification"]'}]}
        stock = {"data": [
            {"kode_produk": "A", "srs_date": "2025-01-01", "srs_customer": "Old"},
            {"kode_produk": "A", "srs_date": "2026-01-01", "srs_customer": "New"},
        ]}
        with tempfile.TemporaryDirectory() as directory, ExitStack() as stack:
            root = Path(directory)
            stack.enter_context(patch.object(main, "DATA_DIR", root))
            for constant, filename in [("SAMPLE_REQUEST_FILE", "sample_requests"), ("STOCK_REQUEST_FILE", "stock_requests"), ("SALES_ORDER_FILE", "sales_orders"), ("LAST_PRODUCTION_FILE", "last_production"), ("TECHNICAL_INFORMATION_FILE", "technical_information")]:
                stack.enter_context(patch.object(main, constant, root / f"{filename}.json"))
            with patch.object(main, "fetch_json", side_effect=[{"data": []}, stock, {"data": []}, technical]):
                self.assertEqual(main.main(), 0)
            saved = main.TECHNICAL_INFORMATION_FILE.read_bytes()
            self.assertEqual(json.loads(saved), technical)
            self.assertEqual(main.read_json(main.LAST_PRODUCTION_FILE), [{"date": "2026-01-01", "customer": "New", "product_code": "A"}])
            self.assertEqual(len(list(root.glob("*.json"))), 5)
            self.assertEqual(list(root.glob("*.tmp")), [])
            for failed in [None, {"data": [], "recordsFiltered": 1}]:
                with patch.object(main, "fetch_json", side_effect=[{"data": []}, stock, {"data": []}, failed]):
                    self.assertEqual(main.main(), 1)
                self.assertEqual(main.TECHNICAL_INFORMATION_FILE.read_bytes(), saved)


if __name__ == "__main__":
    unittest.main()
