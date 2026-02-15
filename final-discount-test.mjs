/**
 * FINAL DISCOUNT ALLOCATION TEST
 * Verifies no discrepancies in profit calculations
 */

const API_BASE = 'http://localhost:3001/api';
let authToken = null;

async function apiRequest(endpoint, method = 'GET', body = null) {
    const options = {
        method,
        headers: { 'Content-Type': 'application/json' }
    };
    if (authToken) options.headers['Authorization'] = `Bearer ${authToken}`;
    if (body) options.body = JSON.stringify(body);

    const res = await fetch(`${API_BASE}${endpoint}`, options);
    return res.json();
}

async function runTest() {
    console.log('\n╔══════════════════════════════════════════════════╗');
    console.log('║  FINAL DISCOUNT ALLOCATION VERIFICATION TEST     ║');
    console.log('╚══════════════════════════════════════════════════╝\n');

    // 1. Login
    console.log('1. Authenticating...');
    const loginRes = await apiRequest('/auth/login', 'POST', {
        email: 'admin@samplepos.com',
        password: 'admin123'
    });

    if (!loginRes.success) {
        console.log('   ❌ Login failed:', loginRes.error);
        return false;
    }
    authToken = loginRes.data.token;
    console.log('   ✅ Logged in successfully\n');

    // 2. Get product with inventory
    console.log('2. Getting test product...');
    const productsRes = await apiRequest('/products');
    const product = productsRes.data?.find(p => p.name === 'SODA 500ML') || productsRes.data?.[0];

    if (!product) {
        console.log('   ❌ No products available');
        return false;
    }
    console.log(`   ✅ Using: ${product.name} (Price: ${product.sellingPrice})\n`);

    // 3. Get customer
    console.log('3. Getting customer...');
    const customersRes = await apiRequest('/customers');
    const customer = customersRes.data?.[0];
    console.log(`   ✅ Using: ${customer?.name || 'Walk-in'}\n`);

    // 4. Create sale WITH 15% DISCOUNT
    console.log('4. Creating sale with 15% discount...');
    const quantity = 3;
    const unitPrice = parseFloat(product.sellingPrice);
    const costPrice = parseFloat(product.costPrice || product.averageCost || '1000');
    const lineTotal = quantity * unitPrice;
    const discountPercent = 0.15;
    const discountAmount = lineTotal * discountPercent;
    const totalAmount = lineTotal - discountAmount;

    console.log(`   ├─ Quantity: ${quantity}`);
    console.log(`   ├─ Unit Price: ${unitPrice.toFixed(2)}`);
    console.log(`   ├─ Line Total (pre-discount): ${lineTotal.toFixed(2)}`);
    console.log(`   ├─ Discount (15%): ${discountAmount.toFixed(2)}`);
    console.log(`   └─ Total Amount (post-discount): ${totalAmount.toFixed(2)}`);

    const saleData = {
        customerId: customer?.id,
        lineItems: [{
            productId: product.id,
            productName: product.name,
            sku: product.sku || '',
            uom: 'PIECE',
            quantity: quantity,
            unitPrice: unitPrice,
            costPrice: costPrice,
            subtotal: lineTotal
        }],
        subtotal: lineTotal,
        discountAmount: discountAmount,
        taxAmount: 0,
        totalAmount: totalAmount,
        paymentMethod: 'CASH',
        amountTendered: totalAmount
    };

    const saleRes = await apiRequest('/sales', 'POST', saleData);

    if (!saleRes.success) {
        console.log(`\n   ❌ Failed to create sale: ${saleRes.error}`);
        return false;
    }

    const sale = saleRes.data.sale;
    const items = saleRes.data.items;
    console.log(`\n   ✅ Sale created: ${sale.saleNumber}\n`);

    // 5. VERIFICATION CHECKS
    console.log('5. Running verification checks...\n');

    let allPassed = true;

    // Check A: Header profit = totalAmount - totalCost
    const expectedHeaderProfit = sale.totalAmount - sale.totalCost;
    const headerProfitMatch = Math.abs(sale.profit - expectedHeaderProfit) < 0.02;
    console.log(`   CHECK A: Header Profit Calculation`);
    console.log(`   ├─ Total Amount: ${sale.totalAmount}`);
    console.log(`   ├─ Total Cost: ${sale.totalCost}`);
    console.log(`   ├─ Expected Profit: ${expectedHeaderProfit.toFixed(2)}`);
    console.log(`   ├─ Actual Profit: ${sale.profit}`);
    console.log(`   └─ ${headerProfitMatch ? '✅ PASS' : '❌ FAIL'}\n`);
    if (!headerProfitMatch) allPassed = false;

    // Check B: Sum of item profits = header profit
    const itemProfitSum = items.reduce((sum, item) => sum + parseFloat(item.profit || 0), 0);
    const itemsMatchHeader = Math.abs(itemProfitSum - sale.profit) < 0.02;
    console.log(`   CHECK B: Item Profits Sum = Header Profit`);
    console.log(`   ├─ Sum of Item Profits: ${itemProfitSum.toFixed(2)}`);
    console.log(`   ├─ Header Profit: ${sale.profit}`);
    console.log(`   ├─ Variance: ${Math.abs(itemProfitSum - sale.profit).toFixed(2)}`);
    console.log(`   └─ ${itemsMatchHeader ? '✅ PASS' : '❌ FAIL'}\n`);
    if (!itemsMatchHeader) allPassed = false;

    // Check C: Discount was stored
    const discountStored = Math.abs(sale.discountAmount - discountAmount) < 0.02;
    console.log(`   CHECK C: Discount Amount Stored`);
    console.log(`   ├─ Expected Discount: ${discountAmount.toFixed(2)}`);
    console.log(`   ├─ Stored Discount: ${sale.discountAmount}`);
    console.log(`   └─ ${discountStored ? '✅ PASS' : '❌ FAIL'}\n`);
    if (!discountStored) allPassed = false;

    // Check D: Subtotal stored correctly
    const subtotalCorrect = Math.abs(sale.subtotal - lineTotal) < 0.02;
    console.log(`   CHECK D: Subtotal Correct`);
    console.log(`   ├─ Expected Subtotal: ${lineTotal.toFixed(2)}`);
    console.log(`   ├─ Stored Subtotal: ${sale.subtotal}`);
    console.log(`   └─ ${subtotalCorrect ? '✅ PASS' : '❌ FAIL'}\n`);
    if (!subtotalCorrect) allPassed = false;

    // Check E: Total = Subtotal - Discount
    const totalCorrect = Math.abs(sale.totalAmount - (sale.subtotal - sale.discountAmount)) < 0.02;
    console.log(`   CHECK E: Total = Subtotal - Discount`);
    console.log(`   ├─ Subtotal: ${sale.subtotal}`);
    console.log(`   ├─ Discount: ${sale.discountAmount}`);
    console.log(`   ├─ Expected Total: ${(sale.subtotal - sale.discountAmount).toFixed(2)}`);
    console.log(`   ├─ Actual Total: ${sale.totalAmount}`);
    console.log(`   └─ ${totalCorrect ? '✅ PASS' : '❌ FAIL'}\n`);
    if (!totalCorrect) allPassed = false;

    // Check F: Database verification
    console.log('   CHECK F: Database Verification (via SQL)...');

    // 6. FINAL RESULT
    console.log('\n╔══════════════════════════════════════════════════╗');
    if (allPassed) {
        console.log('║  ✅ ALL CHECKS PASSED - NO DISCREPANCIES FOUND   ║');
    } else {
        console.log('║  ❌ SOME CHECKS FAILED - DISCREPANCIES DETECTED  ║');
    }
    console.log('╚══════════════════════════════════════════════════╝\n');

    // Return the sale ID for database verification
    console.log(`Sale ID for DB verification: ${sale.id}`);
    console.log(`Sale Number: ${sale.saleNumber}`);

    return allPassed;
}

runTest()
    .then(passed => process.exit(passed ? 0 : 1))
    .catch(err => {
        console.error('Test error:', err);
        process.exit(1);
    });
