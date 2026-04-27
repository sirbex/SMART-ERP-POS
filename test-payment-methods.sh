#!/bin/bash
# Test all payment methods to confirm GL posting works after governance fix

BASE="http://localhost:3001/api"

echo "=== Getting auth token ==="
TOKEN=$(curl -s -X POST "$BASE/auth/login" \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@samplepos.com","password":"admin123"}' \
  | python3 -c "import sys,json; d=json.load(sys.stdin); print(d['data']['token'])")

echo "Token length: ${#TOKEN}"
if [ ${#TOKEN} -lt 20 ]; then
  echo "LOGIN FAILED"
  exit 1
fi

echo ""
echo "=== Getting a product with stock ==="
PROD_JSON=$(curl -s "$BASE/products?limit=20" -H "Authorization: Bearer $TOKEN")
PROD_ID=$(echo "$PROD_JSON" | python3 -c "
import sys,json
d=json.load(sys.stdin)
items=[x for x in d.get('data',{}).get('data',[]) if x.get('stockQuantity',0)>3]
p=items[0] if items else {}
print(p.get('id','NONE'))
")
PROD_PRICE=$(echo "$PROD_JSON" | python3 -c "
import sys,json
d=json.load(sys.stdin)
items=[x for x in d.get('data',{}).get('data',[]) if x.get('stockQuantity',0)>3]
p=items[0] if items else {}
print(p.get('sellingPrice',1000))
")
PROD_COST=$(echo "$PROD_JSON" | python3 -c "
import sys,json
d=json.load(sys.stdin)
items=[x for x in d.get('data',{}).get('data',[]) if x.get('stockQuantity',0)>3]
p=items[0] if items else {}
print(p.get('unitCost',500))
")
PROD_NAME=$(echo "$PROD_JSON" | python3 -c "
import sys,json
d=json.load(sys.stdin)
items=[x for x in d.get('data',{}).get('data',[]) if x.get('stockQuantity',0)>3]
p=items[0] if items else {}
print(p.get('name','Unknown'))
")

echo "Product: $PROD_NAME (ID: $PROD_ID, Price: $PROD_PRICE, Cost: $PROD_COST)"

if [ "$PROD_ID" = "NONE" ]; then
  echo "No product found with stock > 3"
  exit 1
fi

# Helper function to make a sale
make_sale() {
  local METHOD=$1
  local AMOUNT=$2
  local AMOUNT_PAID=${3:-$AMOUNT}
  
  echo ""
  echo "--- Testing $METHOD sale ---"
  
  BODY=$(python3 -c "
import json
body = {
  'items': [{'productId': '$PROD_ID', 'quantity': 1, 'unitPrice': $AMOUNT, 'unitCost': $PROD_COST, 'discount': 0, 'productType': 'inventory'}],
  'totalAmount': $AMOUNT,
  'costAmount': $PROD_COST,
  'paymentMethod': '$METHOD',
  'amountPaid': $AMOUNT_PAID,
  'changeAmount': 0,
  'notes': 'Test sale - payment method test'
}
print(json.dumps(body))
")

  RESP=$(curl -s -X POST "$BASE/sales" \
    -H "Content-Type: application/json" \
    -H "Authorization: Bearer $TOKEN" \
    -d "$BODY")
  
  SUCCESS=$(echo "$RESP" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('success', False))" 2>/dev/null)
  SALE_NUM=$(echo "$RESP" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('data',{}).get('saleNumber','N/A'))" 2>/dev/null)
  ERROR=$(echo "$RESP" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('error',''))" 2>/dev/null)
  
  if [ "$SUCCESS" = "True" ]; then
    echo "  PASS ✓ - Sale: $SALE_NUM"
  else
    echo "  FAIL ✗ - Error: $ERROR"
    echo "  Full response: $(echo $RESP | head -c 300)"
  fi
}

# Test all payment methods
make_sale "CASH" "$PROD_PRICE"
make_sale "MOBILE_MONEY" "$PROD_PRICE"
make_sale "CARD" "$PROD_PRICE"
make_sale "CREDIT" "$PROD_PRICE" 0

echo ""
echo "=== Payment method tests complete ==="
