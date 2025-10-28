// Test script for product history endpoint
import { PrismaClient } from '@prisma/client';
import { ProductHistoryService } from './src/services/productHistoryService.js';

async function testProductHistory() {
  const prisma = new PrismaClient();
  
  try {
    // Get first product
    const product = await prisma.product.findFirst();
    if (!product) {
      console.log('No products found in database');
      return;
    }
    
    console.log(`Testing product history for: ${product.name} (${product.id})`);
    
    // Test the endpoint (simulate the service call)
    const history = await ProductHistoryService.getProductHistory(product.id);
    
    console.log('\n📊 Product History Summary:');
    console.log('- Events:', history.events.length);
    console.log('- Total Sold:', history.summary.totalQuantitySold);
    console.log('- Total Revenue:', history.summary.totalRevenue);
    console.log('- Current Stock:', history.summary.currentStock);
    console.log('- Cost History entries:', history.costHistory.length);
    console.log('- Batch Receipts:', history.batchReceipts.length);
    
    if (history.events.length > 0) {
      console.log('\n📝 Recent Events:');
      history.events.slice(0, 3).forEach(event => {
        console.log(`- ${event.type}: ${event.description}`);
      });
    }
    
    console.log('\n✅ Product history endpoint working correctly!');
    
  } catch (error) {
    console.error('❌ Error testing product history:', error.message);
  } finally {
    await prisma.$disconnect();
  }
}

testProductHistory();