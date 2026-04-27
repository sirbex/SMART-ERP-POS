#!/bin/bash
BASE="http://172.18.0.5:3001/api"

echo "=== Getting auth token ==="
LOGIN=$(curl -s -X POST "$BASE/auth/login" -H "Content-Type: application/json" -d '{"email":"admin@samplepos.com","password":"admin123"}')
echo "Login: ${LOGIN:0:80}"
TOKEN=$(echo "$LOGIN" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d['data']['token'])" 2>/dev/null)
echo "Token length: ${#TOKEN}"
[ ${#TOKEN} -lt 20 ] && echo "LOGIN FAILED" && exit 1

echo ""
echo "=== Getting product with stock ==="
PROD_JSON=$(curl -s "$BASE/products?limit=20" -H "Authorization: Bearer $TOKEN")
PROD_ID=$(echo "$PROD_JSON" | python3 -c "import sys,json; d=json.load(sys.stdin); items=[x for x in d.get('data',[]) if x.get('stockQuantity',0)>3]; print(items[0].get('id','NONE') if items else 'NONE')")
PROD_PRICE=$(echo "$PROD_JSON" | python3 -c "import sys,json; d=json.load(sys.stdin); items=[x for x in d.get('data',[]) if x.get('stockQuantity',0)>3]; print(items[0].get('sellingPrice',1000) if items else 1000)")
PROD_COST=$(echo "$PROD_JSON" | python3 -c "import sys,json; d=json.load(sys.stdin); items=[x for x in d.get('data',[]) if x.get('stockQuantity',0)>3]; print(items[0].get('unitCost',500) if items else 500)")
PROD_NAME=$(echo "$PROD_JSON" | python3 -c "import sys,json; d=json.load(sys.stdin); items=[x for x in d.get('data',[]) if x.get('stockQuantity',0)>3]; print(items[0].get('name','Unknown') if items else 'Unknown')")

echo "Product: $PROD_NAME | ID: $PROD_ID | Price: $PROD_PRICE | Cost: $PROD_COST"
[ "$PROD_ID" = "NONE" ] && echo "No product found" && exit 1

test_sale() {
  local METHOD=$1
  local AMOUNT_PAID=${2:-$PROD_PRICE}
  echo ""
  echo "--- Testing $METHOD ---"
  RESP=$(curl -s -X POST "$BASE/sales" \
    -H "Content-Type: application/json" \
    -H "Authorization: Bearer $TOKEN" \
    -d "{\"items\":[{\"productId\":\"$PROD_ID\",\"quantity\":1,\"unitPrice\":$PROD_PRICE,\"unitCost\":$PROD_COST,\"discount\":0,\"productType\":\"inventory\"}],\"totalAmount\":$PROD_PRICE,\"costAmount\":$PROD_COST,\"paymentMethod\":\"$METHOD\",\"amountPaid\":$AMOUNT_PAID,\"changeAmount\":0,\"notes\":\"Test sale\"}")
  SUCCESS=$(echo "$RESP" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('success',False))" 2>/dev/null)
  SALE_NUM=$(echo "$RESP" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('data',{}).get('saleNumber','N/A'))" 2>/dev/null)
  ERROR=$(echo "$RESP" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('error','none'))" 2>/dev/null)
  if [ "$SUCCESS" = "True" ]; then
    echo "  PASS - $SALE_NUM"
  else
    echo "  FAIL - $ERROR"
    echo "  Full: ${RESP:0:500}"
  fi
}

test_sale "CASH"
test_sale "MOBILE_MONEY"
test_sale "CARD"
test_sale "CREDIT" 0

echo ""
echo "=== DONE ==="
