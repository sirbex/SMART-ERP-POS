/**
 * Quick PDF test with authentication
 */

import fs from 'fs';
import path from 'path';

const API_BASE = 'http://localhost:3001/api';

const exportDir = './logs/exports';
if (!fs.existsSync(exportDir)) {
  fs.mkdirSync(exportDir, { recursive: true });
}

async function getToken() {
  const response = await fetch(`${API_BASE}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: 'admin', password: 'Admin123!' })
  });
  
  if (!response.ok) {
    throw new Error(`Login failed: ${response.status}`);
  }
  
  const data = await response.json();
  return data.token;
}

async function testPdf(token, url, filename) {
  console.log(`\n📄 Testing: ${filename}`);
  
  const response = await fetch(`${API_BASE}${url}`, {
    headers: { 'Authorization': `Bearer ${token}` }
  });
  
  if (!response.ok) {
    console.error(`   ❌ Failed: ${response.status}`);
    return;
  }
  
  const buffer = await response.arrayBuffer();
  const filepath = path.join(exportDir, filename);
  fs.writeFileSync(filepath, Buffer.from(buffer));
  
  console.log(`   ✅ Success: ${buffer.byteLength} bytes`);
  console.log(`   📁 ${filepath}`);
}

async function run() {
  console.log('🔐 Logging in...');
  const token = await getToken();
  console.log('✅ Authenticated\n');
  
  console.log('🧪 Testing Improved PDF Generation');
  console.log('===================================');
  
  await testPdf(token, '/purchase-orders/PO-2025-0008/items/export/pdf', 'po-items-landscape.pdf');
  await testPdf(token, '/purchase-orders/export/pdf', 'po-list-portrait.pdf');
  await testPdf(token, '/goods-receipts/export/pdf', 'goods-receipts-landscape.pdf');
  
  console.log('\n✅ All tests completed!');
  console.log(`\n💡 Open PDFs in: ${path.resolve(exportDir)}`);
  console.log('   Check for: landscape orientation, complete headers, proper text wrapping');
}

run().catch(console.error);
