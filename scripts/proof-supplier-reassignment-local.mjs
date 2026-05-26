#!/usr/bin/env node
/**
 * Live proof: supplier reassignment preview (requires local API :3001).
 * Preview only — does not post GL.
 */
const BASE = process.env.BASE_URL || 'http://localhost:3001';
const EMAIL = process.env.TEST_EMAIL || 'admin@samplepos.com';
const PASSWORD = process.env.TEST_PASSWORD || 'admin123';

async function login() {
  const res = await fetch(`${BASE}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: EMAIL, password: PASSWORD }),
  });
  if (!res.ok) throw new Error(`Login failed ${res.status}: ${await res.text()}`);
  const json = await res.json();
  const token = json.data?.token ?? json.data?.accessToken;
  if (!token) throw new Error('No token in login response');
  return token;
}

async function main() {
  const token = await login();
  const headers = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };

  const listRes = await fetch(`${BASE}/api/goods-receipts?limit=10&status=COMPLETED`, { headers });
  if (!listRes.ok) throw new Error(`List GR failed ${listRes.status}`);
  const listJson = await listRes.json();
  const grs = listJson.data ?? [];

  let gr = null;
  let toSupplierId = process.env.TO_SUPPLIER_ID;

  const supRes = await fetch(`${BASE}/api/suppliers?limit=50`, { headers });
  const supplierList = supRes.ok ? (await supRes.json()).data ?? [] : [];

  for (const candidate of grs) {
    const detailRes = await fetch(`${BASE}/api/goods-receipts/${candidate.id}`, { headers });
    if (!detailRes.ok) continue;
    const detailJson = await detailRes.json();
    const grRow = detailJson.data?.gr ?? detailJson.data;
    const sid = grRow?.supplierId || candidate.supplierId || candidate.supplier_id;
    if (!sid) continue;

    const other = supplierList.find((s) => {
      const id = s.id || s.Id;
      return id && id !== sid;
    });
    const altId = toSupplierId || other?.id || other?.Id;
    if (altId && altId !== sid) {
      gr = { ...candidate, supplierId: sid };
      toSupplierId = altId;
      break;
    }
  }

  if (!gr?.id || !toSupplierId) {
    console.log('SKIP — need COMPLETED GR with supplier + another supplier in directory');
    process.exit(0);
  }

  const fromSupplierId = gr.supplierId || gr.supplier_id;
  const previewRes = await fetch(`${BASE}/api/corrections/supplier-reassignment/preview`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      grnId: gr.id,
      fromSupplierId,
      toSupplierId,
      reason: 'Proof supplier reassignment preview',
    }),
  });
  const body = await previewRes.text();
  if (!previewRes.ok) {
    console.error('FAIL', previewRes.status, body.slice(0, 2000));
    process.exit(1);
  }
  const json = JSON.parse(body);
  if (!json.success || json.data?.amount == null) {
    console.error('FAIL response', body.slice(0, 2000));
    process.exit(1);
  }
  console.log(
    `PASS supplier-reassignment preview GR=${gr.grNumber ?? gr.id} amount=${json.data.amount} blockers=${json.data.blockers?.length ?? 0}`,
  );
}

main().catch((e) => {
  console.error('FAIL', e.message);
  process.exit(1);
});
