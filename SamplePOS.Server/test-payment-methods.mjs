/*
 * Smoke test: Create a sale for each payment method to verify backend acceptance and persistence
 */

import fetch from 'node-fetch';
import fs from 'fs';

const BASE_URL = process.env.BASE_URL || 'http://localhost:3000';

const loginCreds = JSON.parse(fs.readFileSync(new URL('./test-login.json', import.meta.url)));

async function login() {
  const res = await fetch(`${BASE_URL}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(loginCreds)
  });
  if (!res.ok) throw new Error(`Login failed: ${res.status} ${await res.text()}`);
  const data = await res.json();
  return data.token;
}

async function getFirstProduct(token) {
  const res = await fetch(`${BASE_URL}/api/products?limit=1`, {
    headers: { Authorization: `Bearer ${token}` }
  });
  if (!res.ok) throw new Error(`Products fetch failed: ${res.status}`);
  const data = await res.json();
  const product = Array.isArray(data) ? data[0] : (data.data?.[0]);
  if (!product) throw new Error('No products available for testing');
  return product;
}

async function getFirstCustomer(token) {
  const res = await fetch(`${BASE_URL}/api/customers?limit=1`, {
    headers: { Authorization: `Bearer ${token}` }
  });
  if (!res.ok) throw new Error(`Customers fetch failed: ${res.status}`);
  const data = await res.json();
  const customer = Array.isArray(data) ? data[0] : (data.data?.[0]);
  return customer;
}

function buildSalePayload(product, method, customer) {
  const unitPrice = Number(product.sellingPrice || product.price || 1);
  const quantity = 1;
  const subtotal = unitPrice * quantity;
  const discount = 0;
  const taxRate = (Number(product.taxRate || 0) / 100);
  const tax = Math.round(subtotal * taxRate * 100) / 100;
  const total = Math.round((subtotal - discount + tax) * 100) / 100;

  const payment = {
    method,
    amount: total,
    reference: (method !== 'CASH' && method !== 'CREDIT') ? 'REF123456' : undefined,
  };

  return {
    customerId: method === 'CREDIT' && customer ? customer.id : null,
    items: [{
      productId: product.id,
      quantity,
      unit: product.baseUnit || 'pcs',
      uomId: null,
      unitPrice,
      discount,
      taxRate,
      notes: 'Payment methods smoke test'
    }],
    payments: [payment],
    subtotal,
    discount,
    tax,
    total,
    notes: `Automated test for ${method}`,
  };
}

async function postSale(token, payload) {
  const res = await fetch(`${BASE_URL}/api/sales`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`
    },
    body: JSON.stringify(payload)
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`Sale failed: ${res.status} ${text}`);
  return JSON.parse(text);
}

(async () => {
  try {
    console.log('→ Logging in...');
    const token = await login();

    console.log('→ Fetching product...');
    const product = await getFirstProduct(token);

    console.log('→ Fetching customer (for CREDIT test)...');
    const customer = await getFirstCustomer(token);

    const methods = ['CASH','CARD','BANK_TRANSFER','MOBILE_MONEY','AIRTEL_MONEY','FLEX_PAY','CREDIT'];
    for (const method of methods) {
      try {
        console.log(`→ Testing payment method: ${method}`);
        const payload = buildSalePayload(product, method, customer);
        const sale = await postSale(token, payload);
        console.log(`   ✓ Created sale ${sale.saleNumber} with ${method}`);
      } catch (err) {
        console.error(`   ✗ ${method} failed:`, err.message);
      }
    }
  } catch (e) {
    console.error('Test aborted:', e);
    process.exit(1);
  }
})();
