import axios from 'axios';
import fs from 'fs';

const BASE_URL = 'http://localhost:3001/api';

async function testAllPDFs() {
  try {
    console.log('🎨 TESTING ALL ENHANCED PDF EXPORTS\n');
    console.log('=' .repeat(80));

      // 1. Register test user (if not exists) and login
      try {
        await axios.post(`${BASE_URL}/auth/register`, {
            username: 'pdftest',
          password: 'Test@123',
          fullName: 'PDF Tester',
          role: 'ADMIN'
        });
        console.log('✅ Test user registered\n');
      } catch (e) {
        console.log('ℹ️  Using existing test user\n');
      }

      const loginRes = await axios.post(`${BASE_URL}/auth/login`, {
          username: 'pdftest',
        password: 'Test@123'
    });
    const token = loginRes.data.token;
    const headers = { Authorization: `Bearer ${token}` };

    // 2. Get supplier for testing
    const suppliersRes = await axios.get(`${BASE_URL}/suppliers`, { headers });
    const supplier = suppliersRes.data.data[0];
    if (!supplier) {
      console.log('❌ No suppliers found');
      return;
    }

    // 3. Get PO for testing
    const posRes = await axios.get(`${BASE_URL}/purchase-orders`, { headers });
    const po = posRes.data.data[0];

    console.log(`\n📋 Test Data:\n   Supplier: ${supplier.name}\n   PO: ${po?.poNumber || 'N/A'}\n`);
    console.log('=' .repeat(80));

    const pdfs = [];

    // Test 1: Purchase Orders List PDF
    try {
      const res = await axios.get(`${BASE_URL}/purchase-orders/export/pdf`, {
        headers,
        responseType: 'arraybuffer'
      });
      const filename = `logs/exports/ENHANCED-po-list-${Date.now()}.pdf`;
      fs.writeFileSync(filename, res.data);
      const size = (fs.statSync(filename).size / 1024).toFixed(1);
      pdfs.push({ name: 'Purchase Orders List', size, file: filename });
      console.log(`✅ Purchase Orders List: ${size}KB`);
    } catch (err) {
      console.log(`❌ Purchase Orders List: ${err.message}`);
    }

    // Test 2: PO Items PDF
    if (po) {
      try {
        const res = await axios.get(`${BASE_URL}/purchase-orders/${po.id}/items/export/pdf`, {
          headers,
          responseType: 'arraybuffer'
        });
        const filename = `logs/exports/ENHANCED-po-items-${Date.now()}.pdf`;
        fs.writeFileSync(filename, res.data);
        const size = (fs.statSync(filename).size / 1024).toFixed(1);
        pdfs.push({ name: 'PO Items Details', size, file: filename });
        console.log(`✅ PO Items Details: ${size}KB`);
      } catch (err) {
        console.log(`❌ PO Items Details: ${err.message}`);
      }
    }

    // Test 3: Goods Receipts PDF
    try {
      const res = await axios.get(`${BASE_URL}/goods-receipts/export/pdf`, {
        headers,
        responseType: 'arraybuffer'
      });
      const filename = `logs/exports/ENHANCED-goods-receipts-${Date.now()}.pdf`;
      fs.writeFileSync(filename, res.data);
      const size = (fs.statSync(filename).size / 1024).toFixed(1);
      pdfs.push({ name: 'Goods Receipts', size, file: filename });
      console.log(`✅ Goods Receipts: ${size}KB`);
    } catch (err) {
      console.log(`❌ Goods Receipts: ${err.message}`);
    }

    // Test 4: Supplier Performance PDF
    try {
      const res = await axios.get(`${BASE_URL}/suppliers/${supplier.id}/performance/export/pdf`, {
        headers,
        responseType: 'arraybuffer'
      });
      const filename = `logs/exports/ENHANCED-supplier-performance-${Date.now()}.pdf`;
      fs.writeFileSync(filename, res.data);
      const size = (fs.statSync(filename).size / 1024).toFixed(1);
      pdfs.push({ name: 'Supplier Performance', size, file: filename });
      console.log(`✅ Supplier Performance: ${size}KB`);
    } catch (err) {
      console.log(`❌ Supplier Performance: ${err.message}`);
    }

    // Test 5: Supplier History PDF
    try {
      const res = await axios.get(`${BASE_URL}/suppliers/${supplier.id}/history/export/pdf`, {
        headers,
        responseType: 'arraybuffer'
      });
      const filename = `logs/exports/ENHANCED-supplier-history-${Date.now()}.pdf`;
      fs.writeFileSync(filename, res.data);
      const size = (fs.statSync(filename).size / 1024).toFixed(1);
      pdfs.push({ name: 'Supplier History', size, file: filename });
      console.log(`✅ Supplier History: ${size}KB`);
    } catch (err) {
      console.log(`❌ Supplier History: ${err.message}`);
    }

    // Summary
    console.log('\n' + '='.repeat(80));
    console.log(`\n🎉 GENERATED ${pdfs.length} ENHANCED PDFs!\n`);
    
    console.log('📊 File Sizes:');
    pdfs.forEach(pdf => {
      console.log(`   • ${pdf.name.padEnd(25)} ${pdf.size.padStart(6)}KB`);
    });

    console.log('\n✨ ENHANCEMENTS APPLIED:');
    console.log('   🎨 Sky Blue Header (#0ea5e9) with emerald accent stripe');
    console.log('   📐 Larger fonts (9-10pt data, 11-12pt labels, 22pt titles)');
    console.log('   🌈 Alternating row backgrounds for easy scanning');
    console.log('   💛 Bright yellow totals highlighting (#fef08a)');
    console.log('   💚 Green summary boxes with shadow effects');
    console.log('   🔷 Cyan table headers (#0891b2)');
    console.log('   📦 Rounded boxes for timestamps and page numbers');
    console.log('   ⚡ Better spacing (2px line gap, +10px row height)');
    console.log('   💰 Currency symbols (₱) on all monetary values');
    console.log('   📍 Colored bullet points in summaries');
    console.log('   🎯 Landscape orientation for wide tables (6+ columns)');
    
    console.log('\n📁 All PDFs saved to: logs/exports/ENHANCED-*.pdf\n');
    console.log('='.repeat(80));

  } catch (error) {
    console.error('❌ Fatal error:', error.response?.data || error.message);
    process.exit(1);
  }
}

testAllPDFs();
