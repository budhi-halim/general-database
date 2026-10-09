#!/usr/bin/env python3
"""
Data fetcher for Islandsun Indonesia JSON endpoints.

Responsibilities:
- Fetch four JSON endpoints (sample requests, stock requests, sales orders, technical information)
- Store each JSON response into its corresponding file under data/
- Produce an additional derived file last_production.json derived from stock_requests.json
  containing only the latest production record per product with keys:
    - date         (from srs_date)
    - customer     (from srs_customer)
    - product_code (from kode_produk)
- Intended for automated execution via GitHub Actions
"""

from __future__ import annotations
from datetime import datetime, timedelta, timezone as dt_timezone
from pathlib import Path
from typing import Any
import time
import json
import requests
from urllib.parse import urlencode

# ----------------------------
# CONFIG / CONSTANTS
# ----------------------------
DATA_DIR: Path = Path("data")

SAMPLE_BASE_URL: str = "http://apps.islandsunindonesia.com:81/islandsun/samplerequest/json"
STOCK_BASE_URL: str = "http://apps.islandsunindonesia.com:81/islandsun/stock-request/json-srs"
SALES_BASE_URL: str = "http://apps.islandsunindonesia.com:81/islandsun/sales-order/json"
TECHNICAL_INFORMATION_BASE_URL: str = "http://apps.islandsunindonesia.com:81/islandsun/master/Tir/json"

SAMPLE_REQUEST_FILE: Path = DATA_DIR / "sample_requests.json"
STOCK_REQUEST_FILE: Path = DATA_DIR / "stock_requests.json"
SALES_ORDER_FILE: Path = DATA_DIR / "sales_orders.json"
LAST_PRODUCTION_FILE: Path = DATA_DIR / "last_production.json"
TECHNICAL_INFORMATION_FILE: Path = DATA_DIR / "technical_information.json"

HTTP_TIMEOUT: int = 90          # seconds
RETRY_LIMIT: int = 3            # number of retry attempts
RETRY_DELAY: int = 5            # seconds between retries
JAKARTA_UTC_OFFSET_HOURS: int = 7

# ----------------------------
# UTILITIES
# ----------------------------
def ensure_data_dir() -> None:
    DATA_DIR.mkdir(parents=True, exist_ok=True)


def read_json(path: Path) -> Any | None:
    if not path.exists():
        return None
    try:
        with path.open("r", encoding="utf-8") as f:
            return json.load(f)
    except json.JSONDecodeError:
        return None


def write_json(path: Path, obj: Any) -> None:
    tmp: Path = path.with_suffix(path.suffix + ".tmp")
    with tmp.open("w", encoding="utf-8") as f:
        json.dump(obj, f, ensure_ascii=False, indent=2)
    tmp.replace(path)


def jakarta_today_date_str() -> str:
    now_utc: datetime = datetime.now(dt_timezone.utc)
    now_jakarta: datetime = now_utc + timedelta(hours=JAKARTA_UTC_OFFSET_HOURS)
    return now_jakarta.strftime("%Y-%m-%d")


# ----------------------------
# URL BUILDERS
# ----------------------------
def get_sample_request_url() -> str:
    params: dict[str, str] = {
        "dari": "0001-01-01",
        "sampai": jakarta_today_date_str(),
        "fil_status": "",
        "tipe": "",
    }
    return f"{SAMPLE_BASE_URL}?{urlencode(params)}"


def get_stock_request_url() -> str:
    params: dict[str, str] = {
        "tipe": "",
        "status": "",
        "dari": "0001-01-01",
        "sampai": jakarta_today_date_str(),
    }
    return f"{STOCK_BASE_URL}?{urlencode(params)}"


def get_sales_order_url() -> str:
    params: dict[str, str] = {
        "dari": "0001-01-01",
        "sampai": jakarta_today_date_str(),
        "status": "",
        "tipe": "",
        "srs_value": "",
        "orderData": "",
    }
    return f"{SALES_BASE_URL}?{urlencode(params)}"


def get_technical_information_url() -> str:
    """Request all technical information through today's Jakarta date."""
    params: dict[str, str] = {
        "dari": "0001-01-01",
        "sampai": jakarta_today_date_str(),
        "fil_status": "",
        "tipe": "",
        "fil_lock": "",
    }
    return f"{TECHNICAL_INFORMATION_BASE_URL}?{urlencode(params)}"


def is_technical_information_payload(payload: object) -> bool:
    """Reject malformed or truncated snapshots before replacing saved information."""
    if not isinstance(payload, dict) or not isinstance(payload.get("data"), list):
        return False
    entries = payload["data"]
    if not all(isinstance(entry, dict) and "id_tir" in entry and "tir_no" in entry for entry in entries):
        return False
    count = payload.get("recordsFiltered")
    return isinstance(count, int) and not isinstance(count, bool) and count == len(entries)


# ----------------------------
# FETCHING
# ----------------------------
def fetch_json(url: str) -> Any | None:
    for attempt in range(1, RETRY_LIMIT + 1):
        try:
            response = requests.get(url, timeout=HTTP_TIMEOUT)
            response.raise_for_status()
            return response.json()
        except requests.exceptions.Timeout:
            print(f"Timeout while fetching {url} (attempt {attempt}/{RETRY_LIMIT})")
        except requests.exceptions.ConnectionError:
            print(f"Connection error while fetching {url} (attempt {attempt}/{RETRY_LIMIT})")
        except requests.exceptions.HTTPError as e:
            print(f"HTTP error while fetching {url}: {e}")
            break
        except requests.exceptions.RequestException as e:
            print(f"Request exception while fetching {url}: {e}")
            break
        except json.JSONDecodeError:
            print(f"Invalid JSON returned from {url}")
            break

        if attempt < RETRY_LIMIT:
            time.sleep(RETRY_DELAY)

    return None


# ----------------------------
# DERIVED DATA: last_production.json
# - Build a map of latest production per product (kode_produk)
# - Output list of objects with keys: date, customer, product_code
# ----------------------------
def build_last_production_from_stock(stock_json: Any) -> list:
    """
    stock_json is expected to be the structure returned in stock_requests.json,
    i.e. a dict with 'data' as a list of entries.
    We return a list of unique latest records per product_code with only
    the keys: date, customer, product_code.
    """
    if not stock_json or not isinstance(stock_json, dict):
        return []

    entries = stock_json.get("data", [])
    if not isinstance(entries, list):
        return []

    latest_map: dict[str, tuple[datetime | None, dict]] = {}

    for e in entries:
        # product code key normalization
        prod_code_raw = e.get("kode_produk") or ""
        prod_code = str(prod_code_raw).strip()
        if not prod_code:
            # skip entries without a product code
            continue

        date_raw = e.get("srs_date") or ""
        date_obj = None
        if isinstance(date_raw, str) and date_raw:
            try:
                # Accept ISO-like YYYY-MM-DD
                date_obj = datetime.fromisoformat(date_raw).date()
            except Exception:
                # Try common fallback formats if any - keep None if not parseable
                try:
                    date_obj = datetime.strptime(date_raw, "%Y-%m-%d").date()
                except Exception:
                    date_obj = None

        current = latest_map.get(prod_code)
        if current is None:
            latest_map[prod_code] = (date_obj, e)
        else:
            prev_date = current[0]
            # If new date is valid and greater than previous, replace
            if date_obj is not None:
                if prev_date is None or date_obj > prev_date:
                    latest_map[prod_code] = (date_obj, e)
            else:
                # If new entry doesn't have a valid date, keep previous
                pass

    # Build resulting list (filter & rename keys)
    out: list[dict] = []
    for prod_code, (_d, entry) in latest_map.items():
        out.append({
            "date": entry.get("srs_date") or None,
            "customer": entry.get("srs_customer") or None,
            "product_code": entry.get("kode_produk") or None,
        })

    # Sort by product_code for stable output
    out.sort(key=lambda x: (x.get("product_code") or ""))
    return out


# ----------------------------
# MAIN FLOW
# ----------------------------
def main() -> int:
    """Refresh the four source snapshots and existing production summary."""
    ensure_data_dir()

    urls: dict[str, Path] = {
        get_sample_request_url(): SAMPLE_REQUEST_FILE,
        get_stock_request_url(): STOCK_REQUEST_FILE,
        get_sales_order_url(): SALES_ORDER_FILE,
        get_technical_information_url(): TECHNICAL_INFORMATION_FILE,
    }

    all_ok: bool = True

    for url, path in urls.items():
        print(f"Fetching {url}")
        data = fetch_json(url)
        if data is not None:
            if path == TECHNICAL_INFORMATION_FILE and not is_technical_information_payload(data):
                print("Technical information has an unsupported or incomplete format; keeping the saved file.")
                all_ok = False
                continue
            write_json(path, data)
            print(f"Saved {path}")

            # If this was the stock_requests endpoint, also produce last_production.json
            if path == STOCK_REQUEST_FILE:
                try:
                    last_prod = build_last_production_from_stock(data)
                    write_json(LAST_PRODUCTION_FILE, last_prod)
                    print(f"Saved {LAST_PRODUCTION_FILE}")
                except Exception as e:
                    print(f"Failed building last_production.json: {e}")
        else:
            print(f"Failed to fetch {url}")
            all_ok = False

    if all_ok:
        print("All JSON files fetched and saved successfully.")
        return 0
    else:
        print("One or more JSON files failed to fetch.")
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
