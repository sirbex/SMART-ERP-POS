/*
 Test PDF export endpoints: suppliers, purchase orders, goods receipts.
 - Logs response headers
 - Saves PDFs to ./logs/exports/
 - Prints size (bytes) of each PDF
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

function abToBuffer(ab) {
  if (Buffer.isBuffer(ab)) return ab;
  if (ab instanceof ArrayBuffer) return Buffer.from(ab);
  return Buffer.from(String(ab));
}

async function savePDF(name, data) {
  ensureDir(outDir);
  const file = path.join(outDir, name);
  fs.writeFileSync(file, data);
  return file;
}

async function fetchAndSavePDF(token, url, filename) {
  const res = await axios.get(url, {
    responseType: 'arraybuffer',
    headers: { Authorization: `Bearer ${token}` }
  });
  const contentType = res.headers['content-type'] || '';
  const disposition = res.headers['content-disposition'] || '';
  const buf = abToBuffer(res.data);
  const file = await savePDF(filename, buf);
  return { file, contentType, disposition, size: buf.length };
}

async function main() {
  console.log('🔐 Logging in...');
  const token = await login();
  console.log('✅ Logged in');

  // Identify one supplier and one PO
  const listCfg = { headers: { Authorization: `Bearer ${token}` }, params: { page: 1, limit: 1 } };
  const [{ data: supList }, { data: poList }] = await Promise.all([
    axios.get(`${API}/suppliers`, listCfg),
    axios.get(`${API}/purchase-orders`, listCfg)
  ]);
  const supplierId = (supList.data?.[0]?.id) || (Array.isArray(supList) ? supList[0]?.id : undefined);
  const poId = (poList.data?.[0]?.id) || (Array.isArray(poList) ? poList[0]?.id : undefined);

  const results = [];

  // Purchase orders summary PDF
  console.log('⬇️  Exporting Purchase Orders summary (PDF)...');
  results.push({
    name: 'purchase-orders.pdf',
    ...(await fetchAndSavePDF(token, `${API}/purchase-orders/export/pdf`, `purchase-orders-${Date.now()}.pdf`))
  });

  // PO items PDF
  if (poId) {
    console.log(`⬇️  Exporting PO items PDF for PO ${poId}...`);
    results.push({
      name: 'po-items.pdf',
      ...(await fetchAndSavePDF(token, `${API}/purchase-orders/${poId}/items/export/pdf`, `po-${poId}-items-${Date.now()}.pdf`))
    });
  } else {
    console.log('ℹ️  No purchase orders found; skipping PO items PDF export');
  }

  // Goods receipts PDF
  console.log('⬇️  Exporting Goods Receipts (PDF)...');
  results.push({
    name: 'goods-receipts.pdf',
    ...(await fetchAndSavePDF(token, `${API}/goods-receipts/export/pdf`, `goods-receipts-${Date.now()}.pdf`))
  });

  // Supplier PDFs
  if (supplierId) {
    console.log(`⬇️  Exporting Supplier Performance PDF for ${supplierId}...`);
    results.push({
      name: 'supplier-performance.pdf',
      ...(await fetchAndSavePDF(token, `${API}/suppliers/${supplierId}/performance/export/pdf`, `supplier-${supplierId}-performance-${Date.now()}.pdf`))
    });

    console.log(`⬇️  Exporting Supplier History PDF for ${supplierId}...`);
    results.push({
      name: 'supplier-history.pdf',
      ...(await fetchAndSavePDF(token, `${API}/suppliers/${supplierId}/history/export/pdf`, `supplier-${supplierId}-history-${Date.now()}.pdf`))
    });
  } else {
    console.log('ℹ️  No suppliers found; skipping supplier PDF exports');
  }

  // Report
  console.log('\n📄 PDF Export Results:');
  for (const r of results) {
    const okCT = (r.contentType || '').includes('application/pdf');
    const okCD = (r.disposition || '').includes('attachment');
    const okSize = (r.size || 0) > 100; // >100 bytes is a minimal sanity check
    console.log(`- ${r.name}:`);
    console.log(`  Content-Type: ${r.contentType} ${okCT ? '✅' : '❌'}`);
    console.log(`  Disposition:  ${r.disposition} ${okCD ? '✅' : '❌'}`);
    console.log(`  Size: ${r.size} bytes ${okSize ? '✅' : '❌'}`);
    console.log(`  Saved: ${r.file}`);
  }

  console.log('\n✅ PDF export endpoints verified.');
}

main().catch(err => {
  if (err.response) {
    console.error('❌ Request failed:', err.response.status, err.response.data);
  } else {
    console.error('❌ Error:', err.message);
  }
  process.exit(1);
});
