#!/usr/bin/env node
/**
 * Live proof: correction eligibility API (requires local API :3001).
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
  const headers = { Authorization: `Bearer ${token}` };

  const listRes = await fetch(`${BASE}/api/goods-receipts?limit=5&status=COMPLETED`, { headers });
  if (!listRes.ok) throw new Error(`List GR failed ${listRes.status}: ${await listRes.text()}`);
  const listJson = await listRes.json();
  const gr = listJson.data?.[0];
  if (!gr?.id) {
    console.log('SKIP live proof — no COMPLETED goods receipt in database');
    process.exit(0);
  }

  const params = new URLSearchParams({
    documentType: 'GOODS_RECEIPT',
    documentId: gr.id,
  });
  const eligRes = await fetch(`${BASE}/api/corrections/eligibility?${params}`, { headers });
  const eligBody = await eligRes.text();
  if (!eligRes.ok) {
    console.error('FAIL eligibility HTTP', eligRes.status, eligBody.slice(0, 1500));
    process.exit(1);
  }
  const eligJson = JSON.parse(eligBody);
  if (!eligJson.success || !eligJson.data?.route) {
    console.error('FAIL eligibility response', eligBody.slice(0, 1500));
    process.exit(1);
  }

  const previewRes = await fetch(`${BASE}/api/corrections/preview`, {
    method: 'POST',
    headers: { ...headers, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      documentType: 'GOODS_RECEIPT',
      documentId: gr.id,
      correctionKind: 'RETURN_GRN',
    }),
  });
  const previewBody = await previewRes.text();
  if (!previewRes.ok) {
    console.error('FAIL preview HTTP', previewRes.status, previewBody.slice(0, 1500));
    process.exit(1);
  }
  const previewJson = JSON.parse(previewBody);
  if (!previewJson.success || previewJson.data?.correctionKind !== 'RETURN_GRN') {
    console.error('FAIL preview response', previewBody.slice(0, 1500));
    process.exit(1);
  }

  console.log(
    `PASS corrections GR=${gr.grNumber ?? gr.id} route=${eligJson.data.route} allowed=${eligJson.data.allowed} preview=${previewJson.data.route}`,
  );
}

main().catch((e) => {
  console.error('FAIL', e.message);
  process.exit(1);
});
