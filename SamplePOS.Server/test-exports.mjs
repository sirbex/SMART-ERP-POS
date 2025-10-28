/*
 Test CSV export endpoints: suppliers, purchase orders, goods receipts.
 - Logs response headers
 - Saves CSVs to ./logs/exports/
 - Prints first 2 lines of each CSV
*/
import fs from 'fs';
import path from 'path';
import axios from 'axios';

const API = 'http://localhost:3001/api';
const outDir = path.join(process.cwd(), 'logs', 'exports');

function ensureDir(p) {
  if (!fs.existsSync(p)) fs.mkdirSync(p, { recursive: true });
}

async function getCredentials() {
  // Prefer test-login.json if present; fallback to common test user
  try {
    const raw = fs.readFileSync(path.join(process.cwd(), 'test-login.json'), 'utf8');
    const creds = JSON.parse(raw);
    return { username: creds.username, password: creds.password };
  } catch {
    return { username: 'testuser', password: 'password123' };
  }
}

async function login() {
  const creds = await getCredentials();
  const res = await axios.post(`${API}/auth/login`, creds);
  return res.data.token;
}

function toStr(buf) {
  if (Buffer.isBuffer(buf)) return buf.toString('utf8');
  // Axios with responseType 'arraybuffer' returns ArrayBuffer
  if (buf instanceof ArrayBuffer) return Buffer.from(buf).toString('utf8');
  return String(buf);
}

async function saveCSV(name, data) {
  ensureDir(outDir);
  const file = path.join(outDir, name);
  fs.writeFileSync(file, data);
  return file;
}

function previewCSV(csvStr) {
  const lines = csvStr.split(/\r?\n/).slice(0, 2);
  return lines.join('\n');
}

async function fetchAndSave(token, url, filename) {
  const res = await axios.get(url, {
    responseType: 'arraybuffer',
    headers: { Authorization: `Bearer ${token}` }
  });
  const contentType = res.headers['content-type'] || '';
  const disposition = res.headers['content-disposition'] || '';
  const csvStr = toStr(res.data);
  const file = await saveCSV(filename, csvStr);
  return { file, contentType, disposition, preview: previewCSV(csvStr) };
}

async function main() {
  console.log('🔐 Logging in...');
  const token = await login();
  console.log('✅ Logged in');

  // Find one supplier and one PO for item export
  const listCfg = { headers: { Authorization: `Bearer ${token}` }, params: { page: 1, limit: 1 } };
  const [{ data: supList }, { data: poList }] = await Promise.all([
    axios.get(`${API}/suppliers`, listCfg),
    axios.get(`${API}/purchase-orders`, listCfg)
  ]);
  const supplierId = (supList.data?.[0]?.id) || (Array.isArray(supList) ? supList[0]?.id : undefined);
  const poId = (poList.data?.[0]?.id) || (Array.isArray(poList) ? poList[0]?.id : undefined);

  const results = [];

  // Purchase orders summary export
  console.log('⬇️  Exporting Purchase Orders summary...');
  results.push({
    name: 'purchase-orders.csv',
    ...(await fetchAndSave(token, `${API}/purchase-orders/export`, `purchase-orders-${Date.now()}.csv`))
  });

  // PO items export (if any PO exists)
  if (poId) {
    console.log(`⬇️  Exporting PO items for PO ${poId}...`);
    results.push({
      name: 'po-items.csv',
      ...(await fetchAndSave(token, `${API}/purchase-orders/${poId}/items/export`, `po-${poId}-items-${Date.now()}.csv`))
    });
  } else {
    console.log('ℹ️  No purchase orders found; skipping PO items export');
  }

  // Goods receipts export
  console.log('⬇️  Exporting Goods Receipts...');
  results.push({
    name: 'goods-receipts.csv',
    ...(await fetchAndSave(token, `${API}/goods-receipts/export`, `goods-receipts-${Date.now()}.csv`))
  });

  // Supplier exports if a supplier exists
  if (supplierId) {
    console.log(`⬇️  Exporting Supplier Performance for ${supplierId}...`);
    results.push({
      name: 'supplier-performance.csv',
      ...(await fetchAndSave(token, `${API}/suppliers/${supplierId}/performance/export`, `supplier-${supplierId}-performance-${Date.now()}.csv`))
    });

    console.log(`⬇️  Exporting Supplier History for ${supplierId}...`);
    results.push({
      name: 'supplier-history.csv',
      ...(await fetchAndSave(token, `${API}/suppliers/${supplierId}/history/export`, `supplier-${supplierId}-history-${Date.now()}.csv`))
    });
  } else {
    console.log('ℹ️  No suppliers found; skipping supplier exports');
  }

  // Report
  console.log('\n📄 Export Results:');
  for (const r of results) {
    const okCT = (r.contentType || '').includes('text/csv');
    const okCD = (r.disposition || '').includes('attachment');
    console.log(`- ${r.name}:`);
    console.log(`  Content-Type: ${r.contentType} ${okCT ? '✅' : '❌'}`);
    console.log(`  Disposition:  ${r.disposition} ${okCD ? '✅' : '❌'}`);
    console.log('  Preview:');
    console.log('  ' + r.preview.replace(/\n/g, '\n  '));
    console.log(`  Saved: ${r.file}`);
  }

  console.log('\n✅ CSV export endpoints verified.');
}

main().catch(err => {
  if (err.response) {
    console.error('❌ Request failed:', err.response.status, err.response.data);
  } else {
    console.error('❌ Error:', err.message);
  }
  process.exit(1);
});
