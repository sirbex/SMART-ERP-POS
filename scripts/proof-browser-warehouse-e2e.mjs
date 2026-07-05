#!/usr/bin/env node
/**
 * Browser E2E — manual adjust storeLocationId + cashier warehouse lockdown.
 *
 * Prerequisites:
 *   npm run dev:server   (API :3001)
 *   npm run dev:client   (Vite :5173)
 *
 * Usage (production):
 *   CLIENT_URL=https://henber.wizarddigital-inv.com \
 *   BASE_URL=https://henber.wizarddigital-inv.com \
 *   TEST_EMAIL=... TEST_PASSWORD=... \
 *   CASHIER_EMAIL=... CASHIER_PASSWORD=... \
 *   node scripts/proof-browser-warehouse-e2e.mjs
 *
 * Local dev:
 *   PROOF_ALLOW_LOCAL=1 npm run proof:browser-warehouse-e2e
 */
import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { resolveVerificationEnvironment } from './lib/production-verification-guard.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const OUT = path.join(ROOT, 'PROOF_BROWSER_WAREHOUSE_E2E.md');

const {
  mode,
  baseUrl: API_URL,
  clientUrl: CLIENT_URL,
  testEmail: ADMIN_EMAIL,
  testPassword: ADMIN_PASSWORD,
} = resolveVerificationEnvironment({
  scriptName: 'Browser warehouse E2E',
  requireBaseUrl: true,
  requireTenantCredentials: true,
  requireClientUrl: true,
});

const CASHIER_EMAIL = process.env.CASHIER_EMAIL || (mode === 'local' ? 'cashier@test.com' : '');
const CASHIER_PASSWORD = process.env.CASHIER_PASSWORD || (mode === 'local' ? 'cashier123' : '');

if (mode === 'production' && (!CASHIER_EMAIL || !CASHIER_PASSWORD)) {
  console.error('Browser warehouse E2E cannot be executed: CASHIER_EMAIL and CASHIER_PASSWORD are required in production mode.');
  process.exit(2);
}

const lines = [];
let failed = 0;

function pass(name, detail = '') {
  const line = `- **PASS** ${name}${detail ? ` — ${detail}` : ''}`;
  lines.push(line);
  console.log(`  PASS  ${name}${detail ? ` — ${detail}` : ''}`);
}

function fail(name, detail = '') {
  const line = `- **FAIL** ${name}${detail ? ` — ${detail}` : ''}`;
  lines.push(line);
  console.error(`  FAIL  ${name}${detail ? ` — ${detail}` : ''}`);
  failed += 1;
}

async function apiLogin(email, password) {
  const res = await fetch(`${API_URL}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  const json = await res.json();
  if (!res.ok) throw new Error(json.error || `login HTTP ${res.status}`);
  const token = json.data?.token ?? json.data?.accessToken;
  const user = json.data?.user ?? json.data;
  if (!token) throw new Error('no token in login response');
  return { token, user };
}

async function seedBrowserAuth(page, email, password) {
  const { token, user } = await apiLogin(email, password);
  await page.goto(`${CLIENT_URL}/login`, { waitUntil: 'domcontentloaded' });
  await page.evaluate(
    ({ token, user }) => {
      localStorage.setItem('auth_token', token);
      localStorage.setItem(
        'user',
        JSON.stringify({
          id: user.id,
          email: user.email,
          fullName: user.fullName ?? user.full_name ?? user.email,
          role: user.role,
        }),
      );
    },
    { token, user },
  );
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(2000);
  return { token, user };
}

async function ensureClientUp() {
  try {
    const res = await fetch(CLIENT_URL, { redirect: 'manual' });
    if (res.status >= 500) throw new Error(`HTTP ${res.status}`);
  } catch (e) {
    throw new Error(`Client not reachable at ${CLIENT_URL} — start with npm run dev:client (${e.message})`);
  }
}

async function ensureApiUp() {
  const res = await fetch(`${API_URL}/api/health`);
  if (!res.ok) throw new Error(`API health HTTP ${res.status}`);
}

async function testCashierLockdown(page) {
  console.log('\n── Cashier warehouse lockdown (browser) ──');
  const { token: cashierToken } = await apiLogin(CASHIER_EMAIL, CASHIER_PASSWORD);
  await seedBrowserAuth(page, CASHIER_EMAIL, CASHIER_PASSWORD);

  const warehousePaths = [
    '/inventory/adjustments',
    '/inventory/store-transfers',
    '/inventory/purchase-orders',
  ];

  for (const p of warehousePaths) {
    await page.goto(`${CLIENT_URL}${p}`, { waitUntil: 'domcontentloaded', timeout: 60000 });
    await page.waitForTimeout(1500);
    const url = page.url();
    const pathname = new URL(url).pathname;
    if (pathname.startsWith('/pos') || pathname === '/login') {
      pass(`Cashier blocked from ${p}`, `redirected to ${pathname}`);
    } else if (pathname.startsWith('/inventory')) {
      fail(`Cashier blocked from ${p}`, `still on ${pathname}`);
    } else {
      pass(`Cashier blocked from ${p}`, `landed on ${pathname}`);
    }
  }

  // Live API denial (same session token)
  const stores = await fetch(`${API_URL}/api/inventory/store-locations`, {
    headers: { Authorization: `Bearer ${cashierToken}` },
  });
  if (stores.status === 403 || stores.status === 401) {
    pass('Cashier live API store-locations denied', `HTTP ${stores.status}`);
  } else {
    fail('Cashier live API store-locations denied', `HTTP ${stores.status}`);
  }
}

async function testManualAdjustStoreLocation(page) {
  console.log('\n── Manual adjust storeLocationId (browser network) ──');
  const { token } = await seedBrowserAuth(page, ADMIN_EMAIL, ADMIN_PASSWORD);

  const visRes = await fetch(`${API_URL}/api/inventory/stock-visibility`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const visJson = await visRes.json();
  const multistore = visJson.data?.multistore ?? visJson.multistore;
  if (!multistore) {
    fail('Multistore enabled for adjust E2E', 'stock-visibility reports multistore=false');
    return;
  }
  pass('Multistore enabled for adjust E2E', 'multistore=true');

  const storesRes = await fetch(`${API_URL}/api/inventory/store-locations`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const storesJson = await storesRes.json();
  const stores = storesJson.data ?? storesJson;
  const mainStore = (Array.isArray(stores) ? stores : []).find((s) => s.code === 'MAIN' || s.storeType === 'MAIN');
  if (!mainStore?.id) {
    fail('MAIN store available', 'no store id');
    return;
  }
  pass('MAIN store available', mainStore.id.slice(0, 8));

  const levelsRes = await fetch(`${API_URL}/api/inventory/stock-levels?limit=20`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const levelsJson = await levelsRes.json();
  const products = Array.isArray(levelsJson.data)
    ? levelsJson.data
    : levelsJson.data?.products ?? levelsJson.products ?? [];
  const batch = products.find((p) => Number(p.remaining_quantity ?? p.quantity ?? 0) > 0) ?? products[0];
  if (!batch?.product_id && !batch?.productId) {
    fail('Batch row for manual adjust', 'no stock-level rows');
    return;
  }
  pass('Stock-level row for manual adjust', (batch.product_id ?? batch.productId).slice(0, 8));

  let capturedBody = null;
  await page.route('**/api/inventory/adjust-batch', async (route) => {
    const req = route.request();
    capturedBody = req.postDataJSON();
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        success: true,
        data: { documentId: 'e2e-doc', movementId: 'e2e-mv' },
      }),
    });
  });

  await page.goto(`${CLIENT_URL}/inventory/adjustments`, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForTimeout(2000);

  const storeCombo = page.locator('#adjustment-store');
  if (await storeCombo.count()) {
    await storeCombo.click();
    await page.getByRole('option', { name: /MAIN/i }).first().click();
    await page.waitForTimeout(1000);
  }

  const adjustRowBtn = page.getByRole('button', { name: 'Adjust', exact: true }).first();
  await adjustRowBtn.waitFor({ state: 'visible', timeout: 15000 });
  await adjustRowBtn.click();
  await page.waitForTimeout(1000);

  await page.getByLabel(/Adjustment Quantity/i).fill('1');
  await page.locator('textarea').first().fill('Browser E2E proof adjust');
  await page.getByRole('button', { name: /Save Adjustment/i }).click();
  await page.waitForTimeout(2000);

  if (!capturedBody) {
    fail('Manual adjust intercepted adjust-batch request', 'no POST captured — UI path may differ');
    return;
  }

  if (capturedBody.storeLocationId === mainStore.id) {
    pass('Manual adjust POST includes storeLocationId', mainStore.id.slice(0, 8));
  } else {
    fail(
      'Manual adjust POST includes storeLocationId',
      `expected ${mainStore.id}, got ${capturedBody.storeLocationId ?? 'undefined'}`,
    );
  }
}

async function main() {
  console.log('\n╔══════════════════════════════════════════════════════════════╗');
  console.log('║  BROWSER E2E — Manual adjust + Cashier lockdown               ║');
  console.log('╚══════════════════════════════════════════════════════════════╝');
  console.log(`Client: ${CLIENT_URL}`);
  console.log(`API:    ${API_URL}\n`);

  await ensureApiUp();
  pass('API health', API_URL);

  await ensureClientUp();
  pass('Client reachable', CLIENT_URL);

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();

  try {
    await testCashierLockdown(page);
    await testManualAdjustStoreLocation(page);
  } finally {
    await browser.close();
  }

  const md = [
    '# Browser Warehouse E2E Proof',
    '',
    `- **Date:** ${new Date().toISOString()}`,
    `- **Mode:** ${mode}`,
    `- **Client:** ${CLIENT_URL}`,
    `- **API:** ${API_URL}`,
    '',
    ...lines,
    '',
    '## Summary',
    '',
    `- **Failed:** ${failed}`,
    `- **Result:** ${failed === 0 ? '**PASS**' : `**FAIL (${failed})**`}`,
    '',
  ].join('\n');

  fs.writeFileSync(OUT, md);
  console.log(`\nWrote ${OUT}\n`);
  process.exit(failed ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
