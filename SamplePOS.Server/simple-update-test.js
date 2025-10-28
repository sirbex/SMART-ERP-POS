// Simple database update test
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function testDirectUpdate() {
  try {
    console.log('🔍 Finding MINUTE MAID product...');
    
    const product = await prisma.product.findFirst({
      where: { name: { contains: 'MINUTE MAID', mode: 'insensitive' } }
    });
    
    if (!product) {
      console.log('❌ Product not found');
      return;
    }
    
    console.log(`✅ Found: ${product.name}`);
    console.log(`Current reorder level: ${product.reorderLevel}`);
    console.log(`Last updated: ${product.updatedAt}`);
    
    // Update reorder level to trigger history
    console.log('\n🔄 Updating reorder level to 50...');
    
    const updated = await prisma.product.update({
      where: { id: product.id },
      data: { reorderLevel: 50 }
    });
    
    console.log(`✅ Updated successfully!`);
    console.log(`New reorder level: ${updated.reorderLevel}`);
    console.log(`New updated time: ${updated.updatedAt}`);
    
    // Note: History will be generated when the API endpoint is called
    console.log('\n📋 Product update completed. Check the frontend View button to see history!');
    
  } catch (error) {
    console.error('❌ Error:', error.message);
  } finally {
    await prisma.$disconnect();
  }
}

testDirectUpdate();