#!/usr/bin/env python3
import subprocess, json, sys

BASE = "http://172.18.0.5:3001/api"

# Login
r = subprocess.run(["curl", "-s", "-X", "POST", f"{BASE}/auth/login",
    "-H", "Content-Type: application/json",
    "-d", '{"email":"admin@samplepos.com","password":"admin123"}'],
    capture_output=True, text=True)
d = json.loads(r.stdout)
token = d["data"]["token"]
print(f"Token: {len(token)} chars")

# Get products
r2 = subprocess.run(["curl", "-s", f"{BASE}/products?limit=20",
    "-H", f"Authorization: Bearer {token}"],
    capture_output=True, text=True)
prods = json.loads(r2.stdout)
arr = prods.get("data", [])
if isinstance(arr, dict):
    arr = arr.get("data", [])

print(f"Products response type: {type(arr).__name__}, count: {len(arr)}")
if arr:
    p = arr[0]
    print(f"First product keys: {sorted(p.keys())}")
    print(f"  name: {p.get('name')}")
    print(f"  id: {p.get('id')}")
    print(f"  sellingPrice: {p.get('sellingPrice')}")
    print(f"  unitCost: {p.get('unitCost')}")
    print(f"  stockQuantity: {p.get('stockQuantity')}")

# Find product with stock
items = [x for x in arr if (x.get("quantityOnHand") or 0) > 3]
if not items:
    items = [x for x in arr if (x.get("quantityOnHand") or 0) > 0]
if not items:
    # Use any product (test without stock check)
    items = arr
if not items:
    print("No products found!")
    sys.exit(1)

p = items[0]
prod_id = p["id"]
prod_price = p.get("sellingPrice", 1000)
prod_cost = p.get("costPrice") or p.get("averageCost") or p.get("lastCost") or 500
print(f"\nUsing: {p['name']} | price={prod_price} | cost={prod_cost} | stock={p.get('quantityOnHand')}")

def test_sale(method, amount_paid=None, customer_id=None):
    if amount_paid is None:
        amount_paid = prod_price
    # Use POSSaleSchema format (the active POS schema)
    body = {
        "lineItems": [{"productId": prod_id, "productName": p["name"],
                       "sku": p.get("sku") or "", "uom": "pcs",
                       "quantity": 1, "unitPrice": prod_price,
                       "costPrice": prod_cost, "subtotal": prod_price}],
        "subtotal": prod_price,
        "taxAmount": 0,
        "totalAmount": prod_price,
        "paymentMethod": method,
        "amountTendered": amount_paid,
        "changeGiven": 0,
        "notes": "Test sale - payment method test"
    }
    if method == "CREDIT":
        body["amountTendered"] = 0
        body["changeGiven"] = 0
    if customer_id:
        body["customerId"] = customer_id
    r = subprocess.run(["curl", "-s", "-X", "POST", f"{BASE}/sales",
        "-H", "Content-Type: application/json",
        "-H", f"Authorization: Bearer {token}",
        "-d", json.dumps(body)],
        capture_output=True, text=True)
    resp = json.loads(r.stdout)
    if resp.get("success"):
        sale_data = resp.get('data', {})
        sale_num = sale_data.get('saleNumber') or sale_data.get('sale_number', 'N/A')
        print(f"  {method}: PASS - {sale_num}")
    else:
        err = resp.get('error', 'Unknown error')
        print(f"  {method}: FAIL - {err}")
        # Print detail if GOV error
        if 'GOV_RULE' in err or 'governance' in err.lower():
            print(f"    *** GOVERNANCE VIOLATION ***")

print("\n=== Testing all payment methods ===")
# Get a customer with credit limit for CREDIT sales
r_cust = subprocess.run(["curl", "-s", "http://172.18.0.5:3001/api/customers?limit=50",
    "-H", f"Authorization: Bearer {token}"],
    capture_output=True, text=True)
cust_data = json.loads(r_cust.stdout)
cust_arr = cust_data.get("data", [])
if isinstance(cust_arr, dict):
    cust_arr = cust_arr.get("data", [])
# Find customer with credit limit > 0
cust_with_credit = [c for c in cust_arr if float(c.get("creditLimit") or c.get("credit_limit") or 0) > 0]
if not cust_with_credit:
    # Fallback: known customer ID with credit from DB query
    customer_id = "3cd96edd-ce49-4d8b-ad88-e1f0c37437b8"
    customer_name = "Test Customer For CN-DN"
else:
    customer_id = cust_with_credit[0]["id"]
    customer_name = cust_with_credit[0].get("name", "Unknown")
print(f"Customer for CREDIT test: {customer_name} (limit OK)")

test_sale("CASH")
test_sale("MOBILE_MONEY")
test_sale("CARD")
test_sale("CREDIT", 0, customer_id)
print("\n=== DONE ===")
