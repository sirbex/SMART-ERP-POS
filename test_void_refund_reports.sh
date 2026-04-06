#!/bin/bash
BASE="https://wizarddigital-inv.com"

echo "=== LOGIN ==="
RESP=$(curl -s "$BASE/api/auth/login" -H "Content-Type: application/json" -d '{"email":"admin@samplepos.com","password":"admin123"}')
TOKEN=$(echo "$RESP" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('data',{}).get('token',''))" 2>/dev/null)
if [ -z "$TOKEN" ]; then echo "FAIL: $RESP"; exit 1; fi
echo "PASS - TOKEN_OK"

echo ""
echo "=== TEST 1: VOID SALES REPORT ==="
VOID=$(curl -s "$BASE/api/reports/generate" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"reportType":"VOID_SALES_REPORT","startDate":"2025-01-01","endDate":"2026-12-31"}')
echo "$VOID" | python3 -c "
import sys, json
d = json.load(sys.stdin)
if not d.get('success'):
    print('FAIL:', d.get('error','unknown'))
    sys.exit(0)
r = d['data']
s = r.get('summary', {})
print('PASS')
print('  reportType:', r.get('reportType'))
print('  recordCount:', r.get('recordCount'))
print('  voidedSaleCount:', s.get('voidedSaleCount'))
print('  totalVoidedAmount:', s.get('totalVoidedAmountFormatted', s.get('totalVoidedAmount')))
print('  totalLostProfit:', s.get('totalLostProfitFormatted', s.get('totalLostProfit')))
br = r.get('byReason', [])
print('  byReason entries:', len(br))
for b in br:
    print('    -', b.get('reason'), ': count=', b.get('count'), ', amount=', b.get('totalAmount'))
data = r.get('data', [])
print('  dataRows:', len(data))
if data:
    row = data[0]
    fields = list(row.keys())
    print('  rowFields:', fields)
    print('  firstRow: sale#=', row.get('saleNumber'), ', amount=', row.get('totalAmount'), ', reason=', row.get('voidReason'), ', voidedBy=', row.get('voidedBy'))
"

echo ""
echo "=== TEST 2: REFUND REPORT ==="
REFUND=$(curl -s "$BASE/api/reports/generate" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"reportType":"REFUND_REPORT","startDate":"2025-01-01","endDate":"2026-12-31"}')
echo "$REFUND" | python3 -c "
import sys, json
d = json.load(sys.stdin)
if not d.get('success'):
    print('FAIL:', d.get('error','unknown'))
    sys.exit(0)
r = d['data']
s = r.get('summary', {})
print('PASS')
print('  reportType:', r.get('reportType'))
print('  recordCount:', r.get('recordCount'))
print('  refundCount:', s.get('refundCount'))
print('  totalRefundAmount:', s.get('totalRefundAmountFormatted', s.get('totalRefundAmount')))
print('  fullRefundCount:', s.get('fullRefundCount'))
print('  partialRefundCount:', s.get('partialRefundCount'))
tp = r.get('topRefundedProducts', [])
print('  topRefundedProducts:', len(tp))
for p in tp:
    print('    -', p.get('productName'), ': times=', p.get('timesRefunded'), ', qty=', p.get('totalQty'), ', amt=', p.get('totalAmount'))
data = r.get('data', [])
print('  dataRows:', len(data))
if data:
    row = data[0]
    fields = list(row.keys())
    print('  rowFields:', fields)
    print('  firstRow: refund#=', row.get('refundNumber'), ', sale#=', row.get('saleNumber'), ', amount=', row.get('totalAmount'), ', type=', row.get('refundType'), ', by=', row.get('createdBy'))
"

echo ""
echo "=== TEST 3: PDF ENDPOINTS ==="
HTTP1=$(curl -s -o /dev/null -w "%{http_code}" "$BASE/api/reports/void-sales?start_date=2025-01-01&end_date=2026-12-31&format=pdf" -H "Authorization: Bearer $TOKEN")
echo "  VoidPDF HTTP: $HTTP1"
HTTP2=$(curl -s -o /dev/null -w "%{http_code}" "$BASE/api/reports/refunds?start_date=2025-01-01&end_date=2026-12-31&format=pdf" -H "Authorization: Bearer $TOKEN")
echo "  RefundPDF HTTP: $HTTP2"

echo ""
echo "=== TEST 4: JSON ENDPOINTS ==="
HTTP3=$(curl -s -o /dev/null -w "%{http_code}" "$BASE/api/reports/void-sales?start_date=2025-01-01&end_date=2026-12-31&format=json" -H "Authorization: Bearer $TOKEN")
echo "  VoidJSON HTTP: $HTTP3"
HTTP4=$(curl -s -o /dev/null -w "%{http_code}" "$BASE/api/reports/refunds?start_date=2025-01-01&end_date=2026-12-31&format=json" -H "Authorization: Bearer $TOKEN")
echo "  RefundJSON HTTP: $HTTP4"

echo ""
echo "=== TEST 5: HENBER TENANT ==="
RESP2=$(curl -s "https://henber.wizarddigital-inv.com/api/auth/login" -H "Content-Type: application/json" -d '{"email":"beccapowers18@gmail.com","password":"admin123"}')
TOKEN2=$(echo "$RESP2" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('data',{}).get('token',''))" 2>/dev/null)
if [ -z "$TOKEN2" ]; then
    echo "SKIP - Henber login failed (password unknown)"
else
    echo "Henber TOKEN_OK"
    HVOID=$(curl -s "https://henber.wizarddigital-inv.com/api/reports/generate" \
      -H "Authorization: Bearer $TOKEN2" \
      -H "Content-Type: application/json" \
      -d '{"reportType":"VOID_SALES_REPORT","startDate":"2025-01-01","endDate":"2026-12-31"}')
    echo "$HVOID" | python3 -c "
import sys, json
d = json.load(sys.stdin)
if d.get('success'):
    print('  Henber VoidReport: PASS, records=', d['data'].get('recordCount'))
else:
    print('  Henber VoidReport: FAIL -', d.get('error'))
"
fi

echo ""
echo "=== ALL TESTS COMPLETE ==="
