/**
 * Live OCC (Optimistic Concurrency Control) Integration Tests
 * Tests version column behavior across all OCC-enabled entities
 * 
 * Prerequisites: Server running on port 3001, database pos_system with migration 411
 */

const BASE = 'http://localhost:3001/api';
let authToken = '';
let passed = 0;
let failed = 0;

// ─── Helpers ───────────────────────────────────────────────────────────────────

async function api(method, path, body) {
    const opts = {
        method,
        headers: { 'Content-Type': 'application/json' },
    };
    if (authToken) opts.headers['Authorization'] = `Bearer ${authToken}`;
    if (body) opts.body = JSON.stringify(body);
    const res = await fetch(`${BASE}${path}`, opts);
    const json = await res.json().catch(() => ({}));
    return { status: res.status, ...json };
}

function assert(condition, label, detail) {
    if (condition) {
        console.log(`  ✅ ${label}`);
        passed++;
    } else {
        console.error(`  ❌ ${label} — ${detail || 'assertion failed'}`);
        failed++;
    }
}

// ─── Auth ──────────────────────────────────────────────────────────────────────

async function login() {
    console.log('\n🔑 Authenticating...');
    const res = await api('POST', '/auth/login', {
        email: 'admin@samplepos.com',
        password: 'admin123',
    });
    if (!res.success) {
        // Try default user
        const res2 = await api('POST', '/auth/login', {
            email: 'admin@admin.com',
            password: 'admin123',
        });
        if (res2.success) {
            authToken = res2.data?.token || res2.data?.accessToken;
        } else {
            console.error('Could not login. Response:', JSON.stringify(res2));
            process.exit(1);
        }
    } else {
        authToken = res.data?.token || res.data?.accessToken;
    }
    console.log('  Logged in, token:', authToken ? authToken.slice(0, 20) + '...' : 'NONE');
}

// ─── Test 1: Products — version round-trip ─────────────────────────────────────

async function testProductsVersion() {
    console.log('\n📦 TEST 1: Products — version round-trip');

    // List products, pick first active
    const list = await api('GET', '/products?limit=1');
    assert(list.success, 'List products succeeds');

    const products = list.data?.data || list.data || [];
    if (products.length === 0) {
        console.log('  ⚠️  No products found, skipping product OCC tests');
        return;
    }

    const prod = products[0];
    assert(typeof prod.version === 'number', 'Product has numeric version field', `got: ${JSON.stringify(prod.version)}`);
    assert(prod.version >= 1, 'Product version >= 1', `got: ${prod.version}`);

    const origVersion = prod.version;

    // Update with correct version
    const upd = await api('PUT', `/products/${prod.id}`, {
        name: prod.name, // same name, just to trigger update
        version: origVersion,
    });
    assert(upd.success, 'Update with correct version succeeds', JSON.stringify(upd));

    const updatedProd = upd.data;
    if (updatedProd) {
        assert(updatedProd.version === origVersion + 1, 'Version incremented after update', `expected ${origVersion + 1}, got ${updatedProd.version}`);
    }

    // Update with STALE version (should 409)
    const stale = await api('PUT', `/products/${prod.id}`, {
        name: prod.name,
        version: origVersion, // stale!
    });
    assert(stale.status === 409 || !stale.success, 'Stale version causes conflict (409)', `got status ${stale.status}`);

    // Update WITHOUT version (backward compat)
    const noVersion = await api('PUT', `/products/${prod.id}`, {
        name: prod.name,
    });
    assert(noVersion.success, 'Update without version still works (backward compat)', JSON.stringify(noVersion));
}

// ─── Test 2: Customers — version round-trip ────────────────────────────────────

async function testCustomersVersion() {
    console.log('\n👤 TEST 2: Customers — version round-trip');

    const list = await api('GET', '/customers?limit=1');
    assert(list.success, 'List customers succeeds');

    const customers = list.data?.data || list.data || [];
    if (customers.length === 0) {
        console.log('  ⚠️  No customers found, skipping customer OCC tests');
        return;
    }

    const cust = customers[0];
    assert(typeof cust.version === 'number', 'Customer has numeric version field', `got: ${JSON.stringify(cust.version)}`);
    assert(cust.version >= 1, 'Customer version >= 1', `got: ${cust.version}`);

    const origVersion = cust.version;

    // Update with correct version
    const upd = await api('PUT', `/customers/${cust.id}`, {
        name: cust.name,
        version: origVersion,
    });
    assert(upd.success, 'Update customer with correct version', JSON.stringify(upd));

    if (upd.data) {
        assert(upd.data.version === origVersion + 1, 'Customer version incremented', `expected ${origVersion + 1}, got ${upd.data.version}`);
    }

    // Stale version
    const stale = await api('PUT', `/customers/${cust.id}`, {
        name: cust.name,
        version: origVersion,
    });
    assert(stale.status === 409 || !stale.success, 'Stale customer version causes conflict', `got status ${stale.status}`);

    // No version (backward compat)
    const noVersion = await api('PUT', `/customers/${cust.id}`, {
        name: cust.name,
    });
    assert(noVersion.success, 'Customer update without version works', JSON.stringify(noVersion));
}

// ─── Test 3: Suppliers — version in read ───────────────────────────────────────

async function testSuppliersVersion() {
    console.log('\n🏭 TEST 3: Suppliers — version in reads');

    const list = await api('GET', '/suppliers?limit=1');
    assert(list.success, 'List suppliers succeeds');

    const suppliers = list.data?.data || list.data || [];
    if (suppliers.length === 0) {
        console.log('  ⚠️  No suppliers found, skipping supplier version tests');
        return;
    }

    const sup = suppliers[0];
    assert(typeof sup.version === 'number', 'Supplier has numeric version field', `got: ${JSON.stringify(sup.version)}`);
    assert(sup.version >= 1, 'Supplier version >= 1', `got: ${sup.version}`);

    // Get by ID
    const detail = await api('GET', `/suppliers/${sup.id}`);
    if (detail.success && detail.data) {
        assert(typeof detail.data.version === 'number', 'Supplier detail includes version', `got: ${JSON.stringify(detail.data.version)}`);
    }
}

// ─── Test 4: Purchase Orders — version in read ─────────────────────────────────

async function testPOsVersion() {
    console.log('\n📋 TEST 4: Purchase Orders — version in reads');

    const list = await api('GET', '/purchase-orders?limit=1');
    assert(list.success, 'List POs succeeds');

    const pos = list.data?.data || list.data?.pos || [];
    if (pos.length === 0) {
        console.log('  ⚠️  No POs found, skipping PO version tests');
        return;
    }

    const po = pos[0];
    assert(typeof po.version === 'number', 'PO has numeric version field', `got: ${JSON.stringify(po.version)}`);
}

// ─── Test 5: Goods Receipts — version in read ──────────────────────────────────

async function testGRsVersion() {
    console.log('\n📥 TEST 5: Goods Receipts — version in reads');

    const list = await api('GET', '/goods-receipts?limit=1');
    assert(list.success, 'List GRs succeeds');

    const grs = list.data?.data || list.data?.grs || [];
    if (grs.length === 0) {
        console.log('  ⚠️  No GRs found, skipping GR version tests');
        return;
    }

    const gr = grs[0];
    assert(typeof gr.version === 'number', 'GR has numeric version field', `got: ${JSON.stringify(gr.version)}`);

    // Test detail endpoint
    const detail = await api('GET', `/goods-receipts/${gr.id}`);
    if (detail.success && detail.data?.gr) {
        assert(typeof detail.data.gr.version === 'number', 'GR detail includes version', `got: ${JSON.stringify(detail.data.gr.version)}`);
    }
}

// ─── Test 6: Discounts — version in read (SELECT * auto-includes) ──────────────

async function testDiscountsVersion() {
    console.log('\n💰 TEST 6: Discounts — version in reads');

    const list = await api('GET', '/discounts');
    assert(list.success, 'List discounts succeeds');

    const discounts = list.data?.data || list.data || [];
    if (discounts.length === 0) {
        console.log('  ⚠️  No discounts found, skipping discount version tests');
        return;
    }

    const disc = discounts[0];
    assert(typeof disc.version === 'number', 'Discount has numeric version field', `got: ${JSON.stringify(disc.version)}`);
}

// ─── Test 7: Quotations — version in read (RETURNING * auto-includes) ──────────

async function testQuotationsVersion() {
    console.log('\n📄 TEST 7: Quotations — version in reads');

    const list = await api('GET', '/quotations?limit=1');
    assert(list.success, 'List quotations succeeds');

    const quotations = list.data?.data || list.data?.quotations || [];
    if (quotations.length === 0) {
        console.log('  ⚠️  No quotations found, skipping quotation version tests');
        return;
    }

    const q = quotations[0];
    assert(typeof q.version === 'number', 'Quotation has numeric version field', `got: ${JSON.stringify(q.version)}`);
}

// ─── Run ───────────────────────────────────────────────────────────────────────

async function main() {
    console.log('╔═══════════════════════════════════════════════════╗');
    console.log('║  OCC Integration Tests — Live Database Proofs    ║');
    console.log('╚═══════════════════════════════════════════════════╝');

    await login();
    await testProductsVersion();
    await testCustomersVersion();
    await testSuppliersVersion();
    await testPOsVersion();
    await testGRsVersion();
    await testDiscountsVersion();
    await testQuotationsVersion();

    console.log('\n═══════════════════════════════════════════════════');
    console.log(`  Results: ${passed} passed, ${failed} failed`);
    console.log('═══════════════════════════════════════════════════');

    process.exit(failed > 0 ? 1 : 0);
}

main().catch(err => {
    console.error('Fatal error:', err);
    process.exit(1);
});
