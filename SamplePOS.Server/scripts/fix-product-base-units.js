import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function fixProductBaseUnits() {
  try {
    console.log('🔧 Fixing product baseUnit fields...\n');

    // Get all products with UoMs
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
          include: { uom: true },
          orderBy: { isDefault: 'desc' }
        }
      }
    });

    console.log(`Found ${products.length} products to check\n`);

    for (const product of products) {
      console.log(`📦 ${product.name}`);
      console.log(`   Current baseUnit: "${product.baseUnit}"`);
      
      // Get the default UoM
      const defaultUom = product.productUoMs.find(pu => pu.isDefault);
      
      if (defaultUom) {
        const correctBaseUnit = defaultUom.uom.abbreviation;
        
        if (product.baseUnit !== correctBaseUnit) {
          console.log(`   ⚠️  Mismatch! Should be: ${correctBaseUnit}`);
          
          // Update the product
          await prisma.product.update({
            where: { id: product.id },
            data: { baseUnit: correctBaseUnit }
          });
          
          console.log(`   ✅ Updated to: ${correctBaseUnit}`);
        } else {
          console.log(`   ✓ Correct`);
        }
      } else {
        console.log(`   ⚠️  No default UoM found!`);
        
        // If there are any UoMs, use the first one
        if (product.productUoMs.length > 0) {
          const firstUom = product.productUoMs[0];
          const newBaseUnit = firstUom.uom.abbreviation;
          
          console.log(`   Setting first UoM as default: ${newBaseUnit}`);
          
          // Update ProductUoM to be default
          await prisma.productUoM.update({
            where: { id: firstUom.id },
            data: { isDefault: true }
          });
          
          // Update product baseUnit
          await prisma.product.update({
            where: { id: product.id },
            data: { baseUnit: newBaseUnit }
          });
          
          console.log(`   ✅ Updated to: ${newBaseUnit}`);
        }
      }
      
      console.log('');
    }

    console.log('\n✅ All products fixed!\n');
    
    // Final verification
    console.log('📊 Final State:\n');
    const verifyProducts = await prisma.product.findMany({
      where: {
        OR: [
          { name: { contains: 'SODA', mode: 'insensitive' } },
          { name: { contains: 'water', mode: 'insensitive' } }
        ]
      },
      include: {
        productUoMs: {
          include: { uom: true },
          orderBy: { isDefault: 'desc' }
        }
      }
    });

    verifyProducts.forEach(p => {
      console.log(`✓ ${p.name}`);
      console.log(`  Base Unit: ${p.baseUnit}`);
      if (p.productUoMs.length > 0) {
        console.log(`  UoMs:`);
        p.productUoMs.forEach(puom => {
          console.log(`    • ${puom.uom.name} (${puom.uom.abbreviation}) - ${puom.conversionFactor}x ${puom.isDefault ? '← DEFAULT' : ''}`);
        });
      } else {
        console.log(`  ⚠️  No UoMs configured`);
      }
      console.log('');
    });

  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    await prisma.$disconnect();
  }
}

fixProductBaseUnits();
