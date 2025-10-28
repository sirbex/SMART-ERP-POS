/**
 * Test improved PDF generation with wide tables
 */

import fs from 'fs';
import path from 'path';

const API_BASE = 'http://localhost:3001/api';
const TOKEN = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpZCI6ImU2NGI1YzI1LWFmY2ItNGVjMC1hNjE3LTM1MzE1ZGYyNWRiNSIsInVzZXJuYW1lIjoiYWRtaW4iLCJyb2xlIjoiQURNSU4iLCJpYXQiOjE3Mjk4NjI0NDd9.kB7u4jZOi_FHIj1kCIg0TbkuNRJWxfXsRl-m9BxW_eU';

const exportDir = './logs/exports';
if (!fs.existsSync(exportDir)) {
  fs.mkdirSync(exportDir, { recursive: true });
}

async function testPdfExport(url, filename, description) {
  console.log(`\n📄 Testing: ${description}`);
  console.log(`   URL: ${url}`);
  
  try {
    const response = await fetch(`${API_BASE}${url}`, {
      headers: { 'Authorization': `Bearer ${TOKEN}` }
    });
    
    if (!response.ok) {
      console.error(`   ❌ Failed: ${response.status} ${response.statusText}`);
      return;
    }
    
    const contentType = response.headers.get('content-type');
    const disposition = response.headers.get('content-disposition');
    
    if (contentType !== 'application/pdf') {
      console.error(`   ❌ Wrong content type: ${contentType}`);
      return;
    }
    
    const buffer = await response.arrayBuffer();
    const size = buffer.byteLength;
    
    const filepath = path.join(exportDir, filename);
    fs.writeFileSync(filepath, Buffer.from(buffer));
    
    console.log(`   ✅ Downloaded: ${size} bytes`);
    console.log(`   📁 Saved to: ${filepath}`);
    console.log(`   📋 Content-Type: ${contentType}`);
    console.log(`   📎 Disposition: ${disposition}`);
    
  } catch (error) {
    console.error(`   ❌ Error: ${error.message}`);
  }
}

async function runTests() {
  console.log('🧪 Testing Improved PDF Generation');
  console.log('==================================\n');
  
  // Test PO Items (many columns - should use landscape)
  await testPdfExport(
    '/purchase-orders/PO-2025-0008/items/export/pdf',
    'po-items-improved.pdf',
    'Purchase Order Items (Wide Table - Landscape)'
  );
  
  // Test PO List (fewer columns - portrait)
  await testPdfExport(
    '/purchase-orders/export/pdf',
    'po-list-improved.pdf',
    'Purchase Orders List (Portrait)'
  );
  
  // Test Goods Receipts
  await testPdfExport(
    '/goods-receipts/export/pdf',
    'goods-receipts-improved.pdf',
    'Goods Receipts (Wide Table - Landscape)'
  );
  
  // Test Supplier History (if supplier exists)
  const supplierId = 'ea5ca2a8-4c97-4b06-8c3e-e1a08d8f8ac8'; // Adjust if needed
  await testPdfExport(
    `/suppliers/${supplierId}/history/export/pdf`,
    'supplier-history-improved.pdf',
    'Supplier Order History (Wide Table - Landscape)'
  );
  
  console.log('\n✅ PDF tests completed!');
  console.log(`📂 All PDFs saved to: ${path.resolve(exportDir)}`);
  console.log('\n💡 Open the PDFs to verify:');
  console.log('   - Landscape orientation for wide tables (6+ columns)');
  console.log('   - All column headers visible and complete');
  console.log('   - Text properly wrapped, not cut off');
  console.log('   - Header background shading');
  console.log('   - Better spacing and readability');
}

runTests();
