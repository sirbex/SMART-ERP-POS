/**
 * Get first available PO for testing
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

async function testAllPdfs(token) {
  console.log('\n🧪 Testing All PDF Exports');
  console.log('==========================\n');
  
  // 1. Get a real PO
  console.log('📦 Fetching purchase orders...');
  const poResponse = await fetch(`${API_BASE}/purchase-orders`, {
    headers: { 'Authorization': `Bearer ${token}` }
  });
  const poData = await poResponse.json();
  const po = poData.data?.[0];
  
  if (po) {
    console.log(`✅ Found PO: ${po.poNumber} (ID: ${po.id})`);
    
    // Test PO Items PDF (wide table)
    console.log('\n📄 Testing PO Items PDF (should be landscape for many columns)');
    const itemsResponse = await fetch(`${API_BASE}/purchase-orders/${po.id}/items/export/pdf`, {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    if (itemsResponse.ok) {
      const buffer = await itemsResponse.arrayBuffer();
      const filename = `po-${po.poNumber}-items.pdf`;
      fs.writeFileSync(path.join(exportDir, filename), Buffer.from(buffer));
      console.log(`   ✅ ${buffer.byteLength} bytes → ${filename}`);
    } else {
      console.log(`   ❌ Failed: ${itemsResponse.status}`);
    }
  } else {
    console.log('⚠️  No purchase orders found');
  }
  
  // 2. Test PO List PDF
  console.log('\n📄 Testing PO List PDF (portrait)');
  const listResponse = await fetch(`${API_BASE}/purchase-orders/export/pdf`, {
    headers: { 'Authorization': `Bearer ${token}` }
  });
  if (listResponse.ok) {
    const buffer = await listResponse.arrayBuffer();
    const filename = 'po-list.pdf';
    fs.writeFileSync(path.join(exportDir, filename), Buffer.from(buffer));
    console.log(`   ✅ ${buffer.byteLength} bytes → ${filename}`);
  }
  
  // 3. Test Goods Receipts PDF
  console.log('\n📄 Testing Goods Receipts PDF (landscape)');
  const grResponse = await fetch(`${API_BASE}/goods-receipts/export/pdf`, {
    headers: { 'Authorization': `Bearer ${token}` }
  });
  if (grResponse.ok) {
    const buffer = await grResponse.arrayBuffer();
    const filename = 'goods-receipts.pdf';
    fs.writeFileSync(path.join(exportDir, filename), Buffer.from(buffer));
    console.log(`   ✅ ${buffer.byteLength} bytes → ${filename}`);
  }
  
  // 4. Test Supplier PDFs
  console.log('\n📦 Fetching suppliers...');
  const suppResponse = await fetch(`${API_BASE}/suppliers`, {
    headers: { 'Authorization': `Bearer ${token}` }
  });
  const suppData = await suppResponse.json();
  const supplier = suppData.data?.[0];
  
  if (supplier) {
    console.log(`✅ Found Supplier: ${supplier.name}`);
    
    console.log('\n📄 Testing Supplier Performance PDF');
    const perfResponse = await fetch(`${API_BASE}/suppliers/${supplier.id}/performance/export/pdf`, {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    if (perfResponse.ok) {
      const buffer = await perfResponse.arrayBuffer();
      const filename = `supplier-${supplier.name.replace(/[^a-z0-9]/gi, '_')}-performance.pdf`;
      fs.writeFileSync(path.join(exportDir, filename), Buffer.from(buffer));
      console.log(`   ✅ ${buffer.byteLength} bytes → ${filename}`);
    }
    
    console.log('\n📄 Testing Supplier History PDF (landscape)');
    const histResponse = await fetch(`${API_BASE}/suppliers/${supplier.id}/history/export/pdf`, {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    if (histResponse.ok) {
      const buffer = await histResponse.arrayBuffer();
      const filename = `supplier-${supplier.name.replace(/[^a-z0-9]/gi, '_')}-history.pdf`;
      fs.writeFileSync(path.join(exportDir, filename), Buffer.from(buffer));
      console.log(`   ✅ ${buffer.byteLength} bytes → ${filename}`);
    }
  }
  
  console.log('\n✅ All PDF tests completed!');
  console.log(`\n📂 Saved to: ${path.resolve(exportDir)}`);
  console.log('\n💡 Check the PDFs for:');
  console.log('   ✓ Landscape for wide tables (6+ columns)');
  console.log('   ✓ All column headers complete (not "Ordere")');
  console.log('   ✓ Text properly wrapped');
  console.log('   ✓ Gray header background');
  console.log('   ✓ Better font sizes and spacing\n');
}

async function run() {
  if (!fs.existsSync(exportDir)) fs.mkdirSync(exportDir, { recursive: true });
  
  console.log('🔐 Authenticating...');
  const token = await getToken();
  console.log('✅ Logged in');
  
  await testAllPdfs(token);
}

run().catch(console.error);
