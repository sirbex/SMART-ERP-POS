import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function checkProducts() {
  try {
    console.log('🔍 Checking products with UoM configurations...\n');
    
    // Get products with SODA or water
    const products = await prisma.product.findMany({
      where: {
        OR: [
          { name: { contains: 'SODA', mode: 'insensitive' } },
          { name: { contains: 'water', mode: 'insensitive' } },
          { name: { contains: 'pepsi', mode: 'insensitive' } }
        ]
      },
      include: {
        productUoMs: {
          include: {
            uom: true
          },
          orderBy: {
            isDefault: 'desc'
          }
        }
      }
    });

    if (products.length === 0) {
      console.log('❌ No products found matching SODA, water, or pepsi');
      return;
    }

    products.forEach(product => {
      console.log(`📦 Product: ${product.name}`);
      console.log(`   ID: ${product.id}`);
      console.log(`   Base Unit: ${product.baseUnit}`);
      console.log(`   Selling Price: $${product.sellingPrice}`);
      console.log(`   Stock: ${product.currentStock}`);
      console.log(`   Has Multiple Units: ${product.hasMultipleUnits}`);
      
      if (product.productUoMs && product.productUoMs.length > 0) {
        console.log(`   📏 Unit of Measures:`);
        product.productUoMs.forEach(puom => {
          console.log(`      • ${puom.uom.name} (${puom.uom.abbreviation})`);
          console.log(`        - Conversion: ${puom.conversionFactor}x base unit`);
          console.log(`        - Default: ${puom.isDefault ? 'Yes' : 'No'}`);
          console.log(`        - Unit Price: ${puom.unitPrice ? '$' + puom.unitPrice : 'Auto-calculated'}`);
          console.log(`        - Barcode: ${puom.barcode || 'None'}`);
        });
      } else {
        console.log(`   ⚠️  No UoM configurations found`);
      }
      console.log('');
    });

    // Check all available UoMs in the system
    console.log('\n📏 Available Units in System:');
    const allUoms = await prisma.unitOfMeasure.findMany({
      orderBy: { name: 'asc' }
    });
    allUoms.forEach(uom => {
      console.log(`   • ${uom.name} (${uom.abbreviation}) - Category: ${uom.categoryId || 'None'}`);
    });

  } catch (error) {
    console.error('❌ Error:', error.message);
  } finally {
    await prisma.$disconnect();
  }
}

checkProducts();
