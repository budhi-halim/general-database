#!/usr/bin/env python3
"""
Data fetcher for Islandsun Indonesia JSON endpoints.

Responsibilities:
- Fetch three JSON endpoints (sample requests, stock requests, sales orders)
- Store each JSON response into its corresponding file under data/
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

SAMPLE_REQUEST_FILE: Path = DATA_DIR / "sample_requests.json"
STOCK_REQUEST_FILE: Path = DATA_DIR / "stock_requests.json"
SALES_ORDER_FILE: Path = DATA_DIR / "sales_orders.json"

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
# MAIN FLOW
# ----------------------------
def main() -> int:
    ensure_data_dir()

    urls: dict[str, Path] = {
        get_sample_request_url(): SAMPLE_REQUEST_FILE,
        get_stock_request_url(): STOCK_REQUEST_FILE,
        get_sales_order_url(): SALES_ORDER_FILE,
    }

    all_ok: bool = True

    for url, path in urls.items():
        print(f"Fetching {url}")
        data = fetch_json(url)
        if data is not None:
            write_json(path, data)
            print(f"Saved {path}")
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