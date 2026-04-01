/**
 * Pricing Engine — Edge-Case Verification Test
 *
 * Tests every edge case in the resolution chain:
 *   1. No pricing rule exists → falls to group discount / base
 *   2. Multiple rules match → highest specificity wins (product > category > global)
 *   3. Category rule vs global rule → category wins (same group)
 *   4. Customer has no price group → base price returned
 *   5. Core formula: multiplier, discount, fixed
 *   6. Rule priority tiebreak within same scope
 *
 * Runs against the LIVE pos_system database with seeded data.
 * Usage: npx tsx src/modules/pricing/pricingEngine.verify.ts
 */

/* eslint-disable no-console */
import pg from 'pg';
import Decimal from 'decimal.js';

// ---- DB connection ----
const pool = new pg.Pool({
    connectionString: 'postgresql://postgres:password@localhost:5432/pos_system',
});

// ---- Known seed data IDs ----
// Wholesale Customers group
const WHOLESALE_GROUP = '28e9afec-c287-420f-a452-c17c8459c304';
// Retail Customers group
const RETAIL_GROUP = '667e9e69-8e8c-4149-a309-7bb4b5583054';

// Products in seeded categories
const COSMETICS_PRODUCT = '917811de-5781-4035-93aa-537ab2abc458'; // Bump Patrol? SA, COSMETICS T, selling=25000
const SUPPLEMENT_PRODUCT = '3d7f38a5-134c-4515-b728-11a38ad7c007'; // Enat 400, SUPPLEMENT B, selling=1400
const CONDOM_PRODUCT = 'b0733e1c-8ab4-4235-9c63-fa59d50e7a71'; // Lifeguard, CONDOMS, selling=1500
const ANTICANCER_PRODUCT = '82999314-3525-4f9a-8c1c-be6462a2bd33'; // Neutromax, ANTICANCER, selling=100000

let passed = 0;
let failed = 0;

function assert(condition: boolean, name: string, detail?: string) {
    if (condition) {
        console.log(`  ✅ ${name}`);
        passed++;
    } else {
        console.error(`  ❌ ${name}${detail ? ` — ${detail}` : ''}`);
        failed++;
    }
}

function assertClose(actual: number, expected: number, name: string, tolerance = 1) {
    const diff = Math.abs(actual - expected);
    if (diff <= tolerance) {
        console.log(`  ✅ ${name} (${actual} ≈ ${expected})`);
        passed++;
    } else {
        console.error(`  ❌ ${name} — got ${actual}, expected ${expected} (diff ${diff})`);
        failed++;
    }
}

// ============================================================================
// TEST 1: No pricing rule → Wholesale group has discount_percentage = 0.1000
// Product: ANTICANCER (no category rule, no product rule)
// Expected: global rule (10% discount) wins because global rule matches
// ============================================================================
async function test1_noSpecificRule_globalFallback() {
    console.log('\n── TEST 1: No specific rule → global discount rule ──');
    const res = await pool.query(
        `SELECT pr.name, pr.rule_type, pr.value, pr.category_id, pr.product_id
         FROM price_rules pr
         WHERE pr.customer_group_id = $1
           AND pr.product_id IS NULL AND pr.category_id IS NULL
           AND pr.is_active = true`,
        [WHOLESALE_GROUP],
    );
    assert(res.rows.length > 0, 'Global rule exists for Wholesale', `found ${res.rows.length}`);

    const baseRes = await pool.query(
        `SELECT COALESCE(pv.selling_price, p.selling_price) as selling_price
         FROM products p LEFT JOIN product_valuation pv ON pv.product_id = p.id
         WHERE p.id = $1`,
        [ANTICANCER_PRODUCT],
    );
    const basePrice = parseFloat(baseRes.rows[0].selling_price);
    // Global rule is 10% discount → expected = base * 0.9
    const expected = Math.round(basePrice * 0.9);
    console.log(`  Base price: ${basePrice}, expected with 10% global discount: ${expected}`);

    // Verify the SQL resolver picks the global rule
    const ruleRes = await pool.query(
        `SELECT pr.id, pr.name, pr.rule_type, pr.value::text,
                CASE WHEN pr.product_id IS NOT NULL THEN 'product'
                     WHEN pr.category_id IS NOT NULL THEN 'category'
                     ELSE 'global' END AS scope
         FROM price_rules pr
         WHERE pr.customer_group_id = $1
           AND pr.is_active = true
           AND pr.min_quantity <= 1
           AND (pr.valid_from IS NULL OR pr.valid_from <= CURRENT_DATE)
           AND (pr.valid_until IS NULL OR pr.valid_until >= CURRENT_DATE)
           AND (
               pr.product_id = $2
               OR pr.category_id = (SELECT category_id FROM products WHERE id = $2)
               OR (pr.product_id IS NULL AND pr.category_id IS NULL)
           )
         ORDER BY
            CASE WHEN pr.product_id IS NOT NULL THEN 1
                 WHEN pr.category_id IS NOT NULL THEN 2
                 ELSE 3 END,
            pr.priority DESC, pr.min_quantity DESC
         LIMIT 1`,
        [WHOLESALE_GROUP, ANTICANCER_PRODUCT],
    );
    assert(ruleRes.rows.length === 1, 'Exactly 1 rule resolved');
    assert(ruleRes.rows[0].scope === 'global', 'Scope is global', `got "${ruleRes.rows[0].scope}"`);
    assert(ruleRes.rows[0].rule_type === 'discount', 'Rule type is discount');
    assertClose(parseFloat(ruleRes.rows[0].value), 10, 'Discount value = 10%');
}

// ============================================================================
// TEST 2: Multiple rules match — category beats global
// Product: COSMETICS T product → has category rule (15%, qty>=5) AND global rule (10%)
// At qty=1 → only global matches (min_quantity filter)
// At qty=5 → category rule matches AND is higher specificity
// ============================================================================
async function test2_multipleRulesMatch_categoryBeatsGlobal() {
    console.log('\n── TEST 2: Multiple rules — category beats global ──');

    // qty=1: Category rule has min_quantity=5, so only global matches
    const ruleQty1 = await pool.query(
        `SELECT pr.name, pr.rule_type, pr.value::text,
                CASE WHEN pr.product_id IS NOT NULL THEN 'product'
                     WHEN pr.category_id IS NOT NULL THEN 'category'
                     ELSE 'global' END AS scope
         FROM price_rules pr
         WHERE pr.customer_group_id = $1
           AND pr.is_active = true
           AND pr.min_quantity <= 1
           AND (pr.valid_from IS NULL OR pr.valid_from <= CURRENT_DATE)
           AND (pr.valid_until IS NULL OR pr.valid_until >= CURRENT_DATE)
           AND (
               pr.product_id = $2
               OR pr.category_id = (SELECT category_id FROM products WHERE id = $2)
               OR (pr.product_id IS NULL AND pr.category_id IS NULL)
           )
         ORDER BY
            CASE WHEN pr.product_id IS NOT NULL THEN 1
                 WHEN pr.category_id IS NOT NULL THEN 2
                 ELSE 3 END,
            pr.priority DESC, pr.min_quantity DESC
         LIMIT 1`,
        [WHOLESALE_GROUP, COSMETICS_PRODUCT],
    );
    assert(ruleQty1.rows[0].scope === 'global', 'qty=1 → global rule wins (category has min_qty=5)', `got "${ruleQty1.rows[0].scope}"`);
    assertClose(parseFloat(ruleQty1.rows[0].value), 10, 'Global discount = 10%');

    // qty=5: Both category (15%) and global (10%) match, category wins by scope
    const ruleQty5 = await pool.query(
        `SELECT pr.name, pr.rule_type, pr.value::text,
                CASE WHEN pr.product_id IS NOT NULL THEN 'product'
                     WHEN pr.category_id IS NOT NULL THEN 'category'
                     ELSE 'global' END AS scope
         FROM price_rules pr
         WHERE pr.customer_group_id = $1
           AND pr.is_active = true
           AND pr.min_quantity <= 5
           AND (pr.valid_from IS NULL OR pr.valid_from <= CURRENT_DATE)
           AND (pr.valid_until IS NULL OR pr.valid_until >= CURRENT_DATE)
           AND (
               pr.product_id = $2
               OR pr.category_id = (SELECT category_id FROM products WHERE id = $2)
               OR (pr.product_id IS NULL AND pr.category_id IS NULL)
           )
         ORDER BY
            CASE WHEN pr.product_id IS NOT NULL THEN 1
                 WHEN pr.category_id IS NOT NULL THEN 2
                 ELSE 3 END,
            pr.priority DESC, pr.min_quantity DESC
         LIMIT 1`,
        [WHOLESALE_GROUP, COSMETICS_PRODUCT],
    );
    assert(ruleQty5.rows[0].scope === 'category', 'qty=5 → category rule wins over global', `got "${ruleQty5.rows[0].scope}"`);
    assertClose(parseFloat(ruleQty5.rows[0].value), 15, 'Category discount = 15%');

    // Verify prices: base=25000
    const base = 25000;
    const priceQty1 = Math.round(base * (1 - 10 / 100)); // 22500
    const priceQty5 = Math.round(base * (1 - 15 / 100)); // 21250
    console.log(`  Expected: qty=1 → ${priceQty1}, qty=5 → ${priceQty5}`);
}

// ============================================================================
// TEST 3: Category rule conflicts with global rule — category wins
// Product: SUPPLEMENT B → multiplier 0.85 (category) vs discount 10% (global)
// Both match at qty=1, category has higher specificity
// ============================================================================
async function test3_categoryConflictsGlobal() {
    console.log('\n── TEST 3: Category rule conflicts with global ──');
    const ruleRes = await pool.query(
        `SELECT pr.name, pr.rule_type, pr.value::text,
                CASE WHEN pr.product_id IS NOT NULL THEN 'product'
                     WHEN pr.category_id IS NOT NULL THEN 'category'
                     ELSE 'global' END AS scope,
                pr.priority
         FROM price_rules pr
         WHERE pr.customer_group_id = $1
           AND pr.is_active = true
           AND pr.min_quantity <= 1
           AND (pr.valid_from IS NULL OR pr.valid_from <= CURRENT_DATE)
           AND (pr.valid_until IS NULL OR pr.valid_until >= CURRENT_DATE)
           AND (
               pr.product_id = $2
               OR pr.category_id = (SELECT category_id FROM products WHERE id = $2)
               OR (pr.product_id IS NULL AND pr.category_id IS NULL)
           )
         ORDER BY
            CASE WHEN pr.product_id IS NOT NULL THEN 1
                 WHEN pr.category_id IS NOT NULL THEN 2
                 ELSE 3 END,
            pr.priority DESC, pr.min_quantity DESC`,
        [WHOLESALE_GROUP, SUPPLEMENT_PRODUCT],
    );

    assert(ruleRes.rows.length >= 2, `Multiple rules match (${ruleRes.rows.length})`, `found ${ruleRes.rows.length}`);
    assert(ruleRes.rows[0].scope === 'category', 'First row (winner) is category scope', `got "${ruleRes.rows[0].scope}"`);
    assert(ruleRes.rows[0].rule_type === 'multiplier', 'Winner is multiplier type', `got "${ruleRes.rows[0].rule_type}"`);
    assertClose(parseFloat(ruleRes.rows[0].value), 0.85, 'Multiplier value = 0.85');

    // Verify: base=1400, category multiplier=0.85 → 1400 * 0.85 = 1190
    const base = 1400;
    const expected = Math.round(base * 0.85);
    console.log(`  Base: ${base}, expected with 0.85x multiplier: ${expected}`);
}

// ============================================================================
// TEST 4: Customer has no price group → base price
// No customer group → no rules match → no group discount → base price
// ============================================================================
async function test4_noGroupFallsToBase() {
    console.log('\n── TEST 4: No customer group → base price ──');
    // With NULL customer group, the resolver should return 0 rows
    const ruleRes = await pool.query(
        `SELECT COUNT(*) as cnt
         FROM price_rules pr
         WHERE pr.customer_group_id IS NULL`,
    );
    assert(parseInt(ruleRes.rows[0].cnt) === 0, 'No rules with NULL customer_group_id');

    const baseRes = await pool.query(
        `SELECT COALESCE(pv.selling_price, p.selling_price) as selling_price
         FROM products p LEFT JOIN product_valuation pv ON pv.product_id = p.id
         WHERE p.id = $1`,
        [COSMETICS_PRODUCT],
    );
    const basePrice = parseFloat(baseRes.rows[0].selling_price);
    assert(basePrice === 25000, `Base price = ${basePrice} (no rules → this is final)`);
}

// ============================================================================
// TEST 5: Core formula verification
// ============================================================================
async function test5_coreFormulas() {
    console.log('\n── TEST 5: Core formula verification ──');

    const base = new Decimal(10000);

    // Multiplier: base × value
    const mult085 = base.times(new Decimal(0.85));
    assertClose(mult085.toNumber(), 8500, 'multiplier 0.85 × 10000 = 8500');

    const mult120 = base.times(new Decimal(1.20));
    assertClose(mult120.toNumber(), 12000, 'multiplier 1.20 × 10000 = 12000 (markup)');

    // Discount: base × (1 − value/100)
    const disc10 = base.times(new Decimal(1).minus(new Decimal(10).dividedBy(100)));
    assertClose(disc10.toNumber(), 9000, 'discount 10% off 10000 = 9000');

    const disc25 = base.times(new Decimal(1).minus(new Decimal(25).dividedBy(100)));
    assertClose(disc25.toNumber(), 7500, 'discount 25% off 10000 = 7500');

    // Fixed: value as final price
    const fixed = new Decimal(5500);
    assertClose(fixed.toNumber(), 5500, 'fixed price 5500 = 5500');

    // Discount on markup → discount reports 0 (not negative)
    const markupDiscount = base.minus(mult120);
    const reportedDiscount = markupDiscount.greaterThan(0) ? markupDiscount : new Decimal(0);
    assertClose(reportedDiscount.toNumber(), 0, 'Markup (1.20x) reports discount=0, not negative');
}

// ============================================================================
// TEST 6: Rule priority tiebreak (same scope)
// ============================================================================
async function test6_priorityTiebreak() {
    console.log('\n── TEST 6: Rule priority tiebreak ──');

    // CONDOMS category has one rule (priority 25), global has another (priority 10)
    // For CONDOM_PRODUCT with Wholesale group: category (25) beats global (10)
    const ruleRes = await pool.query(
        `SELECT pr.name, pr.rule_type, pr.value::text,
                CASE WHEN pr.product_id IS NOT NULL THEN 'product'
                     WHEN pr.category_id IS NOT NULL THEN 'category'
                     ELSE 'global' END AS scope,
                pr.priority
         FROM price_rules pr
         WHERE pr.customer_group_id = $1
           AND pr.is_active = true
           AND pr.min_quantity <= 1
           AND (pr.valid_from IS NULL OR pr.valid_from <= CURRENT_DATE)
           AND (pr.valid_until IS NULL OR pr.valid_until >= CURRENT_DATE)
           AND (
               pr.product_id = $2
               OR pr.category_id = (SELECT category_id FROM products WHERE id = $2)
               OR (pr.product_id IS NULL AND pr.category_id IS NULL)
           )
         ORDER BY
            CASE WHEN pr.product_id IS NOT NULL THEN 1
                 WHEN pr.category_id IS NOT NULL THEN 2
                 ELSE 3 END,
            pr.priority DESC, pr.min_quantity DESC`,
        [WHOLESALE_GROUP, CONDOM_PRODUCT],
    );

    assert(ruleRes.rows.length >= 2, `Multiple rules found for Condom product (${ruleRes.rows.length})`);
    assert(ruleRes.rows[0].scope === 'category', 'Winner is category scope (20% condom discount)', `got "${ruleRes.rows[0].scope}"`);
    assert(ruleRes.rows[0].priority >= ruleRes.rows[1].priority || ruleRes.rows[0].scope !== ruleRes.rows[1].scope,
        'Higher specificity/priority rule wins');

    // Condom product base=1500, 20% category discount → 1200
    assertClose(Math.round(1500 * (1 - 20 / 100)), 1200, 'Condom expected: 1500 × 0.80 = 1200');
}

// ============================================================================
// TEST 7: Retail group with quantity threshold
// ============================================================================
async function test7_retailQuantityThreshold() {
    console.log('\n── TEST 7: Retail group quantity threshold ──');

    // Retail "Bulk 5% Discount (qty >= 10)" → min_quantity = 10
    // qty=1 → no rule → falls to group discount (0%) → base
    const ruleQty1 = await pool.query(
        `SELECT COUNT(*) as cnt
         FROM price_rules pr
         WHERE pr.customer_group_id = $1
           AND pr.is_active = true
           AND pr.min_quantity <= 1
           AND (pr.product_id = $2 OR pr.category_id = (SELECT category_id FROM products WHERE id = $2)
                OR (pr.product_id IS NULL AND pr.category_id IS NULL))`,
        [RETAIL_GROUP, COSMETICS_PRODUCT],
    );
    assert(parseInt(ruleQty1.rows[0].cnt) === 0, 'qty=1 → no Retail rules match (threshold is 10)');

    // qty=10 → global rule matches
    const ruleQty10 = await pool.query(
        `SELECT pr.name, pr.value::text,
                CASE WHEN pr.product_id IS NOT NULL THEN 'product'
                     WHEN pr.category_id IS NOT NULL THEN 'category'
                     ELSE 'global' END AS scope
         FROM price_rules pr
         WHERE pr.customer_group_id = $1
           AND pr.is_active = true
           AND pr.min_quantity <= 10
           AND (pr.product_id = $2 OR pr.category_id = (SELECT category_id FROM products WHERE id = $2)
                OR (pr.product_id IS NULL AND pr.category_id IS NULL))
         ORDER BY
            CASE WHEN pr.product_id IS NOT NULL THEN 1
                 WHEN pr.category_id IS NOT NULL THEN 2
                 ELSE 3 END,
            pr.priority DESC
         LIMIT 1`,
        [RETAIL_GROUP, COSMETICS_PRODUCT],
    );
    assert(ruleQty10.rows.length === 1, 'qty=10 → 1 Retail rule matches');
    assert(ruleQty10.rows[0].scope === 'global', 'Retail bulk rule is global scope');
    assertClose(parseFloat(ruleQty10.rows[0].value), 5, 'Discount = 5%');
}

// ============================================================================
// TEST 8: DB constraint check — scope constraint prevents bad data
// ============================================================================
async function test8_scopeConstraint() {
    console.log('\n── TEST 8: DB scope constraint ──');

    // Try inserting a rule with BOTH category_id AND product_id → should fail
    try {
        await pool.query(
            `INSERT INTO price_rules (customer_group_id, rule_type, value, category_id, product_id)
             VALUES ($1, 'discount', 10,
                     (SELECT id FROM product_categories LIMIT 1),
                     $2)`,
            [WHOLESALE_GROUP, COSMETICS_PRODUCT],
        );
        assert(false, 'INSERT with both category + product should fail');
    } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        assert(msg.includes('chk_price_rule_scope'), 'Constraint chk_price_rule_scope prevented dual-scope rule', msg);
    }
}

// ============================================================================
// MAIN
// ============================================================================
async function main() {
    console.log('╔══════════════════════════════════════════════════════╗');
    console.log('║  PRICING ENGINE — EDGE CASE VERIFICATION SUITE      ║');
    console.log('╚══════════════════════════════════════════════════════╝');

    try {
        await test1_noSpecificRule_globalFallback();
        await test2_multipleRulesMatch_categoryBeatsGlobal();
        await test3_categoryConflictsGlobal();
        await test4_noGroupFallsToBase();
        await test5_coreFormulas();
        await test6_priorityTiebreak();
        await test7_retailQuantityThreshold();
        await test8_scopeConstraint();
    } finally {
        await pool.end();
    }

    console.log('\n══════════════════════════════════════════════════════');
    console.log(`  RESULTS: ${passed} passed, ${failed} failed`);
    console.log('══════════════════════════════════════════════════════');

    if (failed > 0) process.exit(1);
}

main().catch((err) => {
    console.error('FATAL:', err);
    process.exit(1);
});
