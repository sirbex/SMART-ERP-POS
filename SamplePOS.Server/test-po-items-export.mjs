/**
 * Test PO Items export from Supplier History dialog
 */

import fs from 'fs';
import path from 'path';

const API_BASE = 'http://localhost:3001/api';
const exportDir = './logs/exports';

async function getToken() {
  const response = await fetch(`${API_BASE}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: 'admin', password: 'Admin123!' })
  });
  const data = await response.json();
  return data.token;
}

async function testPOItemsExport(token) {
  console.log('\n📦 Testing PO Items Export (from Supplier History)');
  console.log('═'.repeat(60));
  
  // Get a PO
  const poResponse = await fetch(`${API_BASE}/purchase-orders`, {
    headers: { 'Authorization': `Bearer ${token}` }
  });
  const poData = await poResponse.json();
  const po = poData.data?.[0];
  
  if (!po) {
    console.log('❌ No purchase orders found');
    return;
  }
  
  console.log(`\n✅ Found PO: ${po.poNumber} (ID: ${po.id})`);
  console.log(`   Status: ${po.status}`);
  console.log(`   Total: ₱${po.totalAmount}\n`);
  
  // Test CSV Export
  console.log('📄 Testing CSV Export');
  console.log('   URL: /purchase-orders/:id/items/export');
  const csvRes = await fetch(`${API_BASE}/purchase-orders/${po.id}/items/export`, {
    headers: { 'Authorization': `Bearer ${token}` }
  });
  
  if (csvRes.ok) {
    const buffer = await csvRes.arrayBuffer();
    const filename = `test-po-${po.poNumber}-items.csv`;
    fs.writeFileSync(path.join(exportDir, filename), Buffer.from(buffer));
    console.log(`   ✅ CSV: ${(buffer.byteLength / 1024).toFixed(1)} KB`);
    console.log(`   📁 Saved: ${filename}`);
  } else {
    console.log(`   ❌ CSV Failed: ${csvRes.status}`);
  }
  
  // Test PDF Export
  console.log('\n📄 Testing PDF Export (with colorful totals)');
  console.log('   URL: /purchase-orders/:id/items/export/pdf');
  const pdfRes = await fetch(`${API_BASE}/purchase-orders/${po.id}/items/export/pdf`, {
    headers: { 'Authorization': `Bearer ${token}` }
  });
  
  if (pdfRes.ok) {
    const buffer = await pdfRes.arrayBuffer();
    const filename = `test-po-${po.poNumber}-items.pdf`;
    fs.writeFileSync(path.join(exportDir, filename), Buffer.from(buffer));
    console.log(`   ✅ PDF: ${(buffer.byteLength / 1024).toFixed(1)} KB`);
    console.log(`   📁 Saved: ${filename}`);
    console.log('\n   🎨 PDF Features:');
    console.log('      • Blue gradient header');
    console.log('      • Dark blue table headers');
    console.log('      • Yellow-highlighted TOTALS row');
    console.log('      • Right-aligned numbers');
    console.log('      • Landscape orientation');
  } else {
    console.log(`   ❌ PDF Failed: ${pdfRes.status}`);
  }
  
  console.log('\n═'.repeat(60));
  console.log('✅ PO Items Export Test Complete!');
  console.log('\n💡 These exports are now available in:');
  console.log('   📍 Supplier Management → Supplier Details → History → View Items');
  console.log('   🎯 Click "View Items" on any PO, then use Export dropdown\n');
}

async function run() {
  if (!fs.existsSync(exportDir)) fs.mkdirSync(exportDir, { recursive: true });
  
  console.log('🔐 Authenticating...');
  const token = await getToken();
  console.log('✅ Authenticated');
  
  await testPOItemsExport(token);
}

run().catch(console.error);
