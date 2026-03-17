#!/bin/bash
TOKEN=$(curl -sk https://henber.wizarddigital-inv.com/api/auth/login -X POST -H "Content-Type: application/json" -d @/tmp/login.json | python3 -c "import sys,json;print(json.load(sys.stdin)['data']['token'])")
echo "GOT TOKEN: ${TOKEN:0:20}..."

echo ""
echo "=== Creating PO ==="
curl -sk https://henber.wizarddigital-inv.com/api/purchase-orders -X POST \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d '{"supplierId":"353491c8-cb74-442b-b8e7-ed4d7e6de56c","orderDate":"2026-03-17","createdBy":"61bd9504-c86a-499d-9efd-db219dbdb51f","items":[{"productId":"014747ef-279d-4e09-bc4f-5febc3551c7f","productName":"headex 500g","quantity":100,"unitCost":50,"uomId":"23d3c829-9643-47dc-9827-8981392331fd"}]}'

echo ""
echo "---DONE---"
