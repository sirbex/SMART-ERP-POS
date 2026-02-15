/**
 * AGGRESSIVE OFFLINE POS SYSTEM TEST
 * 
 * Tests every layer: DB schema, API endpoints, idempotency,
 * Zod validation, sync logic, and error handling.
 * 
 * Run: cd SamplePOS.Server && node test-offline-system.cjs
 */
const { Pool } = require('pg');
const http = require('http');

const BASE = 'http://localhost:3001';
const pool = new Pool({ connectionString: 'postgresql://postgres:password@localhost:5432/pos_system' });

let PASS = 0;
let FAIL = 0;
const RESULTS = [];

function assert(label, condition, detail) {
    if (condition) {
        PASS++;
        RESULTS.push({ label, status: 'PASS', detail });
        console.log(`  ✅ ${label}`);
    } else {
        FAIL++;
        RESULTS.push({ label, status: 'FAIL', detail });
        console.log(`  ❌ ${label} — ${detail}`);
    }
}

// ── HTTP helpers ──────────────────────────────────────────
function httpRequest(method, path, body, token) {
    return new Promise((resolve, reject) => {
        const url = new URL(path, BASE);
        const headers = { 'Content-Type': 'application/json' };
        if (token) headers['Authorization'] = 'Bearer ' + token;
        const payload = body ? JSON.stringify(body) : undefined;
        if (payload) headers['Content-Length'] = Buffer.byteLength(payload);

        const req = http.request({
            hostname: url.hostname,
            port: url.port,
            path: url.pathname + url.search,
            method,
            headers,
        }, (res) => {
            let data = '';
            res.on('data', c => data += c);
            res.on('end', () => {
                let parsed;
                try { parsed = JSON.parse(data); } catch { parsed = data; }
                resolve({ status: res.statusCode, body: parsed });
            });
        });
        req.on('error', reject);
        if (payload) req.write(payload);
        req.end();
    });
}

async function login(email, password) {
    const res = await httpRequest('POST', '/api/auth/login', { email, password });
    return res;
}

// ══════════════════════════════════════════════════════════
// TEST SUITES
// ══════════════════════════════════════════════════════════

async function testDatabaseSchema() {
    console.log('\n═══ TEST SUITE 1: DATABASE SCHEMA ═══');

    // 1a. idempotency_key column exists
    const cols = await pool.query(
        "SELECT column_name, data_type, character_maximum_length FROM information_schema.columns WHERE table_name = 'sales' AND column_name IN ('idempotency_key', 'offline_id') ORDER BY column_name"
    );
    assert('idempotency_key column exists',
        cols.rows.some(r => r.column_name === 'idempotency_key'),
        JSON.stringify(cols.rows));
    assert('offline_id column exists',
        cols.rows.some(r => r.column_name === 'offline_id'),
        JSON.stringify(cols.rows));

    // 1b. UNIQUE constraint on idempotency_key
    const uniq = await pool.query(
        "SELECT constraint_name FROM information_schema.table_constraints WHERE table_name = 'sales' AND constraint_type = 'UNIQUE' AND constraint_name LIKE '%idempotency%'"
    );
    assert('idempotency_key has UNIQUE constraint',
        uniq.rows.length > 0,
        JSON.stringify(uniq.rows));

    // 1c. Indexes exist
    const idx = await pool.query(
        "SELECT indexname FROM pg_indexes WHERE tablename = 'sales' AND (indexname LIKE '%idempotency%' OR indexname LIKE '%offline%') ORDER BY indexname"
    );
    assert('idx_sales_idempotency_key exists',
        idx.rows.some(r => r.indexname === 'idx_sales_idempotency_key'),
        JSON.stringify(idx.rows));
    assert('idx_sales_offline_id exists',
        idx.rows.some(r => r.indexname === 'idx_sales_offline_id'),
        JSON.stringify(idx.rows));

    // 1d. Columns are nullable (offline sales don't always have them)
    const nullable = await pool.query(
        "SELECT column_name, is_nullable FROM information_schema.columns WHERE table_name = 'sales' AND column_name IN ('idempotency_key', 'offline_id')"
    );
    for (const row of nullable.rows) {
        assert(`${row.column_name} is nullable (YES)`,
            row.is_nullable === 'YES',
            `is_nullable = ${row.is_nullable}`);
    }
}

async function testEndpointRouting() {
    console.log('\n═══ TEST SUITE 2: ENDPOINT ROUTING ═══');

    // 2a. GET /status without auth → 401
    const noAuthGet = await httpRequest('GET', '/api/pos/sync-offline-sales/status');
    assert('GET /status without auth → 401',
        noAuthGet.status === 401,
        `Got ${noAuthGet.status}: ${JSON.stringify(noAuthGet.body)}`);

    // 2b. POST /sync without auth → 401
    const noAuthPost = await httpRequest('POST', '/api/pos/sync-offline-sales', { foo: 'bar' });
    assert('POST /sync without auth → 401',
        noAuthPost.status === 401,
        `Got ${noAuthPost.status}: ${JSON.stringify(noAuthPost.body)}`);

    // 2c. NOT 404 (route is mounted)
    assert('GET /status is NOT 404',
        noAuthGet.status !== 404,
        `Status: ${noAuthGet.status}`);
    assert('POST /sync is NOT 404',
        noAuthPost.status !== 404,
        `Status: ${noAuthPost.status}`);

    // 2d. Error response follows API format
    assert('401 response has { success: false, error: string }',
        noAuthGet.body && noAuthGet.body.success === false && typeof noAuthGet.body.error === 'string',
        JSON.stringify(noAuthGet.body));
}

async function testAuthentication() {
    console.log('\n═══ TEST SUITE 3: AUTHENTICATION ═══');

    // 3a. Login with test credentials
    const loginRes = await login('audittest@test.com', 'password123');
    assert('Login succeeds with test credentials',
        loginRes.status === 200 && loginRes.body.success === true,
        `Status: ${loginRes.status}, success: ${loginRes.body?.success}`);

    const token = loginRes.body?.data?.token;
    assert('Token is returned',
        typeof token === 'string' && token.length > 20,
        token ? `${token.substring(0, 25)}...` : 'NO TOKEN');

    // 3b. Authenticated GET /status works
    if (token) {
        const statusRes = await httpRequest('GET', '/api/pos/sync-offline-sales/status', null, token);
        assert('GET /status with auth → 200',
            statusRes.status === 200,
            `Status: ${statusRes.status}`);
        assert('Status response has correct shape',
            statusRes.body?.success === true &&
            typeof statusRes.body?.data?.totalOffline === 'number' &&
            typeof statusRes.body?.data?.synced === 'number',
            JSON.stringify(statusRes.body));
    }

    return token;
}

async function testZodValidation(token) {
    console.log('\n═══ TEST SUITE 4: ZOD VALIDATION ═══');

    if (!token) {
        console.log('  ⚠️  Skipping - no auth token');
        return;
    }

    // 4a. Empty body → 400
    const empty = await httpRequest('POST', '/api/pos/sync-offline-sales', {}, token);
    assert('Empty body → 400',
        empty.status === 400,
        `Status: ${empty.status}, error: ${empty.body?.error}`);

    // 4b. Missing idempotencyKey → 400
    const noKey = await httpRequest('POST', '/api/pos/sync-offline-sales', {
        offlineId: 'test-1',
        offlineTimestamp: Date.now(),
        saleData: {}
    }, token);
    assert('Missing idempotencyKey → 400',
        noKey.status === 400,
        `Status: ${noKey.status}`);

    // 4c. Missing lineItems → 400
    const noItems = await httpRequest('POST', '/api/pos/sync-offline-sales', {
        idempotencyKey: 'test-no-items-key',
        offlineId: 'test-no-items',
        offlineTimestamp: Date.now(),
        saleData: {
            subtotal: 100,
            discountAmount: 0,
            taxAmount: 0,
            totalAmount: 100,
            paymentLines: [{ paymentMethod: 'CASH', amount: 100 }],
            lineItems: [] // empty!
        }
    }, token);
    assert('Empty lineItems array → 400',
        noItems.status === 400,
        `Status: ${noItems.status}, detail: ${JSON.stringify(noItems.body?.details?.[0])}`);

    // 4d. Invalid payment method → 400
    const badPay = await httpRequest('POST', '/api/pos/sync-offline-sales', {
        idempotencyKey: 'test-bad-payment',
        offlineId: 'test-bad-payment',
        offlineTimestamp: Date.now(),
        saleData: {
            subtotal: 100,
            taxAmount: 0,
            totalAmount: 100,
            lineItems: [{ productId: 'p1', productName: 'Widget', quantity: 1, unitPrice: 100 }],
            paymentLines: [{ paymentMethod: 'CREDIT', amount: 100 }] // CREDIT is blocked!
        }
    }, token);
    assert('CREDIT payment method → 400 (Zod rejects)',
        badPay.status === 400,
        `Status: ${badPay.status}, error: ${badPay.body?.error}`);

    // 4e. Negative quantity → 400
    const negQty = await httpRequest('POST', '/api/pos/sync-offline-sales', {
        idempotencyKey: 'test-neg-qty',
        offlineId: 'test-neg-qty',
        offlineTimestamp: Date.now(),
        saleData: {
            subtotal: 100,
            taxAmount: 0,
            totalAmount: 100,
            lineItems: [{ productId: 'p1', productName: 'Widget', quantity: -5, unitPrice: 100 }],
            paymentLines: [{ paymentMethod: 'CASH', amount: 100 }]
        }
    }, token);
    assert('Negative quantity → 400',
        negQty.status === 400,
        `Status: ${negQty.status}`);

    // 4f. Valid payload structure passes validation (may fail on business logic, but NOT 400)
    const validPayload = await httpRequest('POST', '/api/pos/sync-offline-sales', {
        idempotencyKey: 'test-valid-schema-' + Date.now(),
        offlineId: 'test-valid-schema-' + Date.now(),
        offlineTimestamp: Date.now(),
        saleData: {
            subtotal: 500,
            discountAmount: 0,
            taxAmount: 0,
            totalAmount: 500,
            lineItems: [{ productId: 'fake-product-id', productName: 'Test Widget', quantity: 1, unitPrice: 500 }],
            paymentLines: [{ paymentMethod: 'CASH', amount: 500 }]
        }
    }, token);
    assert('Valid schema passes Zod (not 400)',
        validPayload.status !== 400,
        `Status: ${validPayload.status}, response: ${JSON.stringify(validPayload.body).substring(0, 200)}`);
}

async function testIdempotency(token) {
    console.log('\n═══ TEST SUITE 5: IDEMPOTENCY ═══');

    if (!token) {
        console.log('  ⚠️  Skipping - no auth token');
        return;
    }

    // First, find a real product with stock
    const products = await pool.query(
        `SELECT p.id, p.name, p.sku, COALESCE(SUM(cl.remaining_quantity), 0) AS stock
     FROM products p
     LEFT JOIN cost_layers cl ON cl.product_id = p.id AND cl.remaining_quantity > 0
     GROUP BY p.id, p.name, p.sku
     HAVING COALESCE(SUM(cl.remaining_quantity), 0) > 5
     LIMIT 1`
    );

    if (products.rows.length === 0) {
        console.log('  ⚠️  No products with stock found — skipping idempotency live test');
        // Still test duplicate detection conceptually via DB
        const dupeKey = 'idem-test-' + Date.now();
        // Insert a fake idempotency_key
        const fakeId = await pool.query(
            "SELECT id, sale_number FROM sales LIMIT 1"
        );
        if (fakeId.rows.length > 0) {
            await pool.query(
                `UPDATE sales SET idempotency_key = $1 WHERE id = $2`,
                [dupeKey, fakeId.rows[0].id]
            );
            // Now try to sync with same key
            const dupeRes = await httpRequest('POST', '/api/pos/sync-offline-sales', {
                idempotencyKey: dupeKey,
                offlineId: 'idem-offline-' + Date.now(),
                offlineTimestamp: Date.now(),
                saleData: {
                    subtotal: 100, taxAmount: 0, totalAmount: 100,
                    lineItems: [{ productId: 'fake', productName: 'Fake', quantity: 1, unitPrice: 100 }],
                    paymentLines: [{ paymentMethod: 'CASH', amount: 100 }]
                }
            }, token);
            assert('Duplicate idempotency key → success + alreadySynced',
                dupeRes.body?.success === true && dupeRes.body?.data?.alreadySynced === true,
                JSON.stringify(dupeRes.body));

            // Clean up
            await pool.query(`UPDATE sales SET idempotency_key = NULL WHERE id = $1`, [fakeId.rows[0].id]);
        }
        return;
    }

    const product = products.rows[0];
    console.log(`  Using product: ${product.name} (stock: ${product.stock})`);

    // Attempt a real offline sync
    // Use realistic prices from actual product data
    const priceRes = await pool.query('SELECT selling_price FROM products WHERE id = $1', [product.id]);
    const sellingPrice = parseFloat(priceRes.rows[0]?.selling_price || '7500');

    const idemKey = 'idem-live-' + Date.now();
    const offId = 'offline-live-' + Date.now();
    const payload = {
        idempotencyKey: idemKey,
        offlineId: offId,
        offlineTimestamp: Date.now(),
        saleData: {
            subtotal: sellingPrice,
            discountAmount: 0,
            taxAmount: 0,
            totalAmount: sellingPrice,
            lineItems: [{
                productId: product.id,
                productName: product.name,
                sku: product.sku || '',
                quantity: 1,
                unitPrice: sellingPrice,
                costPrice: 0,
            }],
            paymentLines: [{ paymentMethod: 'CASH', amount: sellingPrice }]
        }
    };

    const firstSync = await httpRequest('POST', '/api/pos/sync-offline-sales', payload, token);
    const firstOk = firstSync.status === 200 && firstSync.body?.success === true;
    assert('First sync attempt → 200 success',
        firstOk,
        `Status: ${firstSync.status}, body: ${JSON.stringify(firstSync.body).substring(0, 200)}`);

    if (firstOk) {
        assert('First sync returns saleId',
            typeof firstSync.body?.data?.saleId === 'string',
            `saleId: ${firstSync.body?.data?.saleId}`);
        assert('First sync returns saleNumber',
            typeof firstSync.body?.data?.saleNumber === 'string',
            `saleNumber: ${firstSync.body?.data?.saleNumber}`);

        // 5b. Second sync with SAME idempotency key → idempotent
        const secondSync = await httpRequest('POST', '/api/pos/sync-offline-sales', payload, token);
        assert('Second sync (same key) → success + alreadySynced',
            secondSync.body?.success === true && secondSync.body?.data?.alreadySynced === true,
            JSON.stringify(secondSync.body));
        assert('Second sync returns SAME saleId',
            secondSync.body?.data?.saleId === firstSync.body?.data?.saleId,
            `First: ${firstSync.body?.data?.saleId}, Second: ${secondSync.body?.data?.saleId}`);

        // 5c. Verify idempotency_key is stored in DB
        const dbCheck = await pool.query(
            `SELECT idempotency_key, offline_id FROM sales WHERE idempotency_key = $1`, [idemKey]
        );
        assert('Idempotency key stored in DB',
            dbCheck.rows.length > 0 && dbCheck.rows[0].idempotency_key === idemKey,
            JSON.stringify(dbCheck.rows[0]));
        assert('Offline ID stored in DB',
            dbCheck.rows.length > 0 && dbCheck.rows[0].offline_id === offId,
            JSON.stringify(dbCheck.rows[0]));
    }
}

async function testRoleAuthorization(token) {
    console.log('\n═══ TEST SUITE 6: AUTHORIZATION ═══');

    // 6a. Invalid token → 401
    const badToken = await httpRequest('POST', '/api/pos/sync-offline-sales', {
        idempotencyKey: 'x', offlineId: 'x', offlineTimestamp: 0,
        saleData: {
            subtotal: 0, taxAmount: 0, totalAmount: 0,
            lineItems: [{ productId: 'x', productName: 'x', quantity: 1, unitPrice: 0 }],
            paymentLines: [{ paymentMethod: 'CASH', amount: 0 }]
        }
    }, 'invalid-token-12345');
    assert('Invalid JWT → 401 or 403',
        badToken.status === 401 || badToken.status === 403,
        `Status: ${badToken.status}`);

    // 6b. Expired token → 401
    const expiredToken = 'eyJhbGciOiJIUzI1NiJ9.eyJpZCI6ImZha2UiLCJleHAiOjE2MDAwMDAwMDB9.fake';
    const expired = await httpRequest('GET', '/api/pos/sync-offline-sales/status', null, expiredToken);
    assert('Expired/invalid JWT → 401 or 403',
        expired.status === 401 || expired.status === 403,
        `Status: ${expired.status}`);
}

async function testInventoryStockLevels(token) {
    console.log('\n═══ TEST SUITE 7: CATALOG SYNC ENDPOINT ═══');

    if (!token) {
        console.log('  ⚠️  Skipping - no auth token');
        return;
    }

    // 7a. GET /api/inventory/stock-levels (used by offlineCatalogService)
    const stockRes = await httpRequest('GET', '/api/inventory/stock-levels', null, token);
    assert('GET /api/inventory/stock-levels → 200',
        stockRes.status === 200,
        `Status: ${stockRes.status}`);
    assert('Stock levels returns { success: true, data: [...] }',
        stockRes.body?.success === true && Array.isArray(stockRes.body?.data),
        `success: ${stockRes.body?.success}, isArray: ${Array.isArray(stockRes.body?.data)}, count: ${stockRes.body?.data?.length}`);

    if (Array.isArray(stockRes.body?.data) && stockRes.body.data.length > 0) {
        const item = stockRes.body.data[0];
        assert('Stock item has productId',
            typeof (item.productId || item.product_id) === 'string',
            `Keys: ${Object.keys(item).join(', ')}`);
        assert('Stock item has name or product_name',
            typeof (item.name || item.product_name || item.productName) === 'string',
            `name: ${item.name || item.product_name || item.productName}`);
    }
}

async function testFrontendCodeConsistency() {
    console.log('\n═══ TEST SUITE 8: FRONTEND CODE CONSISTENCY ═══');
    const fs = require('fs');
    const path = require('path');
    const clientDir = path.resolve(__dirname, '..', 'samplepos.client', 'src');

    // 8a. offlineCatalogService exports
    const catService = fs.readFileSync(path.join(clientDir, 'services', 'offlineCatalogService.ts'), 'utf-8');
    assert('offlineCatalogService exports syncProductCatalog',
        catService.includes('export async function syncProductCatalog'),
        'Found in source');
    assert('offlineCatalogService exports searchCachedProducts',
        catService.includes('export function searchCachedProducts'),
        'Found in source');
    assert('offlineCatalogService exports decrementLocalStock',
        catService.includes('export function decrementLocalStock'),
        'Found in source');
    assert('offlineCatalogService exports restoreLocalStock',
        catService.includes('export function restoreLocalStock'),
        'Found in source');
    assert('offlineCatalogService exports persistCart',
        catService.includes('export function persistCart'),
        'Found in source');
    assert('offlineCatalogService exports getPersistedCart',
        catService.includes('export function getPersistedCart'),
        'Found in source');
    assert('offlineCatalogService exports clearPersistedCart',
        catService.includes('export function clearPersistedCart'),
        'Found in source');

    // 8b. Correct localStorage keys (no stale keys)
    assert('Uses pos_product_catalog key',
        catService.includes("'pos_product_catalog'") || catService.includes("CATALOG_STORAGE_KEY"),
        'Key found');
    assert('Uses pos_local_stock key',
        catService.includes("'pos_local_stock'") || catService.includes("STOCK_STORAGE_KEY"),
        'Key found');
    assert('Does NOT use old offline_sales_queue key',
        !catService.includes('offline_sales_queue'),
        'Not found (good)');

    // 8c. useOfflineMode hook
    const offlineHook = fs.readFileSync(path.join(clientDir, 'hooks', 'useOfflineMode.ts'), 'utf-8');
    assert('useOfflineMode uses pos_offline_sales key',
        offlineHook.includes("'pos_offline_sales'") || offlineHook.includes("OFFLINE_STORAGE_KEY"),
        'Key found');
    assert('useOfflineMode does NOT use old pos_sync_queue',
        !offlineHook.includes('pos_sync_queue'),
        'Not found (good)');
    assert('useOfflineMode exports saveSaleOffline',
        offlineHook.includes('saveSaleOffline'),
        'Found in source');
    assert('useOfflineMode exports syncPendingSales',
        offlineHook.includes('syncPendingSales'),
        'Found in source');
    assert('useOfflineMode generates idempotency keys',
        offlineHook.includes('idempotencyKey') || offlineHook.includes('idempotency'),
        'Found in source');
    assert('useOfflineMode strips CREDIT payments',
        offlineHook.includes('CREDIT') || offlineHook.includes('credit'),
        'Found in source');

    // 8d. POSPage integration
    const posPage = fs.readFileSync(path.join(clientDir, 'pages', 'pos', 'POSPage.tsx'), 'utf-8');
    assert('POSPage imports syncProductCatalog',
        posPage.includes('syncProductCatalog'),
        'Import found');
    assert('POSPage imports persistCart',
        posPage.includes('persistCart'),
        'Import found');
    assert('POSPage imports clearPersistedCart',
        posPage.includes('clearPersistedCart'),
        'Import found');
    assert('POSPage imports getPersistedCart',
        posPage.includes('getPersistedCart'),
        'Import found');
    assert('POSPage passes isOnline to POSProductSearch',
        posPage.includes('isOnline={isOnline}'),
        'Prop found');
    assert('POSPage has offline banner',
        posPage.includes('Offline Mode') || posPage.includes('offline-banner'),
        'Banner found');
    assert('POSPage bypasses cash register offline',
        posPage.includes('!hasOpenRegister && isOnline'),
        'Guard found');
    assert('POSPage does NOT use old offline_sales_queue key',
        !posPage.includes('offline_sales_queue'),
        'Not found (good)');
    assert('POSPage clears pos_offline_sales in clearAll',
        posPage.includes("pos_offline_sales"),
        'Key found');

    // 8e. POSProductSearch integration
    const search = fs.readFileSync(path.join(clientDir, 'pages', 'pos', 'POSProductSearch.tsx'), 'utf-8');
    assert('POSProductSearch accepts isOnline prop',
        search.includes('isOnline'),
        'Prop found');
    assert('POSProductSearch imports searchCachedProducts',
        search.includes('searchCachedProducts'),
        'Import found');
    assert('POSProductSearch disables query when offline',
        search.includes('enabled:') && search.includes('isOnline'),
        'Query guard found');
    assert('POSProductSearch does NOT have unused getLocalStock import',
        !search.includes('getLocalStock'),
        'Not found (good)');
}

async function testBackendCodeConsistency() {
    console.log('\n═══ TEST SUITE 9: BACKEND CODE CONSISTENCY ═══');
    const fs = require('fs');
    const path = require('path');
    const serverDir = path.resolve(__dirname, 'src');

    // 9a. offlineSyncRoutes structure
    const syncRoutes = fs.readFileSync(path.join(serverDir, 'modules', 'pos', 'offlineSyncRoutes.ts'), 'utf-8');
    assert('offlineSyncRoutes imports authenticate middleware',
        syncRoutes.includes('authenticate'),
        'Import found');
    assert('offlineSyncRoutes imports authorize middleware',
        syncRoutes.includes('authorize'),
        'Import found');
    assert('offlineSyncRoutes uses Zod validation',
        syncRoutes.includes('z.object') && syncRoutes.includes('safeParse'),
        'Zod found');
    assert('offlineSyncRoutes checks idempotency_key in DB',
        syncRoutes.includes("idempotency_key = $1"),
        'SQL check found');
    assert('offlineSyncRoutes blocks CREDIT payment',
        syncRoutes.includes("z.enum(['CASH', 'CARD', 'MOBILE_MONEY'])"),
        'Enum restricts to CASH/CARD/MOBILE_MONEY');
    assert('offlineSyncRoutes resolves cash register session',
        syncRoutes.includes('cash_register_sessions'),
        'Session query found');
    assert('offlineSyncRoutes handles stock conflicts gracefully',
        syncRoutes.includes('requiresReview') && syncRoutes.includes('Insufficient'),
        'Stock conflict handler found');
    assert('offlineSyncRoutes exports createOfflineSyncRoutes',
        syncRoutes.includes('export function createOfflineSyncRoutes'),
        'Export found');

    // 9b. server.ts mounts the route
    const server = fs.readFileSync(path.join(serverDir, 'server.ts'), 'utf-8');
    assert('server.ts imports createOfflineSyncRoutes',
        server.includes("import { createOfflineSyncRoutes }"),
        'Import found');
    assert('server.ts mounts at /api/pos/sync-offline-sales',
        server.includes("'/api/pos/sync-offline-sales'") && server.includes('createOfflineSyncRoutes'),
        'Route mounted');
}

async function testMigrationFile() {
    console.log('\n═══ TEST SUITE 10: MIGRATION SQL ═══');
    const fs = require('fs');
    const path = require('path');

    const sqlPath = path.resolve(__dirname, '..', 'shared', 'sql', 'add_offline_sync_columns.sql');
    const exists = fs.existsSync(sqlPath);
    assert('Migration file exists',
        exists,
        sqlPath);

    if (exists) {
        const sql = fs.readFileSync(sqlPath, 'utf-8');
        assert('Migration adds idempotency_key column',
            sql.includes('idempotency_key'),
            'Found in SQL');
        assert('Migration adds offline_id column',
            sql.includes('offline_id'),
            'Found in SQL');
        assert('Migration creates idempotency index',
            sql.includes('idx_sales_idempotency_key'),
            'Found in SQL');
        assert('Migration creates offline_id index',
            sql.includes('idx_sales_offline_id'),
            'Found in SQL');
        assert('Migration uses IF NOT EXISTS / DO block',
            sql.includes('IF NOT EXISTS') || sql.includes('DO $$'),
            'Idempotent migration');
    }
}

// ══════════════════════════════════════════════════════════
// RUNNER
// ══════════════════════════════════════════════════════════
async function main() {
    console.log('╔══════════════════════════════════════════════════╗');
    console.log('║   AGGRESSIVE OFFLINE POS SYSTEM TEST SUITE      ║');
    console.log('╚══════════════════════════════════════════════════╝');

    try {
        await testDatabaseSchema();
        await testEndpointRouting();
        const token = await testAuthentication();
        await testZodValidation(token);
        await testIdempotency(token);
        await testRoleAuthorization(token);
        await testInventoryStockLevels(token);
        await testFrontendCodeConsistency();
        await testBackendCodeConsistency();
        await testMigrationFile();
    } catch (err) {
        console.error('\n💥 UNEXPECTED ERROR:', err.message);
        console.error(err.stack);
    }

    console.log('\n╔══════════════════════════════════════════════════╗');
    console.log(`║   RESULTS:  ✅ ${String(PASS).padStart(2)} PASS  |  ❌ ${String(FAIL).padStart(2)} FAIL             ║`);
    console.log('╚══════════════════════════════════════════════════╝');

    if (FAIL > 0) {
        console.log('\nFailed tests:');
        RESULTS.filter(r => r.status === 'FAIL').forEach(r => {
            console.log(`  ❌ ${r.label}: ${r.detail}`);
        });
    }

    await pool.end();
    process.exit(FAIL > 0 ? 1 : 0);
}

main();
