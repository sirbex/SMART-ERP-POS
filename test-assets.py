#!/usr/bin/env python3
"""
Asset Accounting E2E Test
Tests: create category → acquire asset → run depreciation → dispose asset
"""

import json
import requests

BASE = "https://wizarddigital-inv.com/api"
HEADERS = {"Content-Type": "application/json"}

def login():
    r = requests.post(f"{BASE}/auth/login", json={"email": "admin@samplepos.com", "password": "admin123"})
    r.raise_for_status()
    token = r.json()["data"]["token"]
    return {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}

def test_asset_accounting():
    headers = login()
    print("✓ Logged in")

    # 1. List existing categories
    r = requests.get(f"{BASE}/assets/categories", headers=headers)
    assert r.status_code == 200, f"GET categories failed: {r.text}"
    cats = r.json()["data"]
    print(f"✓ GET categories: {len(cats)} existing")

    # 2. Create asset category
    cat_data = {
        "code": "TEST-VEH",
        "name": "Test Vehicles",
        "usefulLifeMonths": 60,
        "depreciationMethod": "STRAIGHT_LINE",
        "depreciationRate": None,
        "assetAccountCode": "1500",
        "depreciationAccountCode": "6500",
        "accumDepreciationAccountCode": "1550"
    }
    r = requests.post(f"{BASE}/assets/categories", json=cat_data, headers=headers)
    if r.status_code == 409:
        # Already exists, get the existing one
        cat_id = next(c["id"] for c in cats if c["code"] == "TEST-VEH")
        print(f"✓ Category already exists (id={cat_id[:8]}...)")
    else:
        assert r.status_code == 201, f"POST categories failed: {r.text}"
        cat_id = r.json()["data"]["id"]
        print(f"✓ Created category: {cat_id[:8]}...")

    # 3. Acquire asset (CASH payment)
    asset_data = {
        "name": "Test Vehicle Asset",
        "description": "E2E test asset",
        "categoryId": cat_id,
        "acquisitionDate": "2026-04-01",
        "acquisitionCost": 5000000,
        "salvageValue": 500000,
        "paymentMethod": "CASH"
    }
    r = requests.post(f"{BASE}/assets/", json=asset_data, headers=headers)
    assert r.status_code == 201, f"POST acquire asset failed: {r.text}"
    asset = r.json()["data"]
    asset_id = asset["id"]
    asset_number = asset["assetNumber"]
    print(f"✓ Acquired asset: {asset_number} (id={asset_id[:8]}...)")
    assert asset["acquisitionCost"] == 5000000
    assert asset["status"] == "ACTIVE"

    # 4. Get depreciation schedule (should be empty initially)
    r = requests.get(f"{BASE}/assets/{asset_id}/depreciation", headers=headers)
    assert r.status_code == 200, f"GET depreciation failed: {r.text}"
    schedule = r.json()["data"]
    print(f"✓ GET depreciation schedule: {len(schedule)} entries (expected 0)")

    # 5. Run monthly depreciation for April 2026
    r = requests.post(f"{BASE}/assets/depreciation/run", json={"year": 2026, "month": 4}, headers=headers)
    assert r.status_code == 200, f"Run depreciation failed: {r.text}"
    result = r.json()["data"]
    print(f"✓ Run depreciation: processed={result['processed']}, total={result['totalDepreciation']}")
    # Expected monthly depr = (5,000,000 - 500,000) / 60 = 75,000
    expected_monthly = (5000000 - 500000) / 60
    # Allow for rounding
    assert abs(result["totalDepreciation"] - expected_monthly) < 1, \
        f"Depreciation mismatch: got {result['totalDepreciation']}, expected ~{expected_monthly}"

    # 6. Get updated asset
    r = requests.get(f"{BASE}/assets/{asset_id}", headers=headers)
    assert r.status_code == 200, f"GET asset failed: {r.text}"
    updated = r.json()["data"]
    print(f"✓ Asset after depreciation: NBV={updated['netBookValue']}, AccumDepr={updated['accumulatedDepreciation']}")

    # 7. Run depreciation again for same month (idempotency check)
    r = requests.post(f"{BASE}/assets/depreciation/run", json={"year": 2026, "month": 4}, headers=headers)
    assert r.status_code == 200, f"Idempotency run failed: {r.text}"
    result2 = r.json()["data"]
    assert result2["processed"] == 0, f"Idempotency failed: processed {result2['processed']} but expected 0"
    print(f"✓ Idempotency check: processed=0 (correct, already done for April 2026)")

    # 8. Dispose asset
    r = requests.post(f"{BASE}/assets/{asset_id}/dispose", json={
        "disposalDate": "2026-04-30",
        "disposalAmount": 4800000
    }, headers=headers)
    assert r.status_code == 200, f"Dispose asset failed: {r.text}"
    disposed = r.json()["data"]
    print(f"✓ Disposed asset: status={disposed['status']}, disposalAmount={disposed['disposalAmount']}")
    assert disposed["status"] == "DISPOSED"
    assert disposed["disposalAmount"] == 4800000

    # 9. Get asset register summary
    r = requests.get(f"{BASE}/assets/summary", headers=headers)
    assert r.status_code == 200, f"GET summary failed: {r.text}"
    summary = r.json()["data"]
    print(f"✓ Asset register summary: {len(summary)} category rows")

    print("\n✅ ALL ASSET ACCOUNTING TESTS PASSED")

if __name__ == "__main__":
    test_asset_accounting()
