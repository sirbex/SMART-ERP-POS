import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function fixBaseUnit() {
  try {
    console.log('🔧 Fixing products with missing baseUnit...\n');

    // Find products without baseUnit
    const productsWithoutBase = await prisma.product.findMany({
      where: {
        OR: [
          { baseUnit: null },
          { baseUnit: '' }
        ]
      },
      include: {
        productUoMs: {
          include: { uom: true },
          where: { isDefault: true }
        }
      }
    });

    console.log(`Found ${productsWithoutBase.length} products without baseUnit\n`);

    for (const product of productsWithoutBase) {
      console.log(`📦 ${product.name}`);
      console.log(`   Current baseUnit: ${product.baseUnit || 'NULL'}`);
      
      // Try to get baseUnit from default ProductUoM
      const defaultUom = product.productUoMs.find(pu => pu.isDefault);
      
      let newBaseUnit = 'pcs'; // default fallback
      
      if (defaultUom) {
        newBaseUnit = defaultUom.uom.abbreviation;
        console.log(`   ✅ Setting baseUnit from default UoM: ${newBaseUnit}`);
      } else {
        // Guess from product name or use default
        const name = product.name.toLowerCase();
        if (name.includes('btl') || name.includes('bottle')) {
          newBaseUnit = 'btl';
        } else if (name.includes('kg') || name.includes('kilo')) {
          newBaseUnit = 'kg';
        } else if (name.includes('box') || name.includes('carton')) {
          newBaseUnit = 'box';
        }
        console.log(`   ⚠️  No default UoM, guessing: ${newBaseUnit}`);
      }
      
      // Update the product
      await prisma.product.update({
        where: { id: product.id },
        data: { baseUnit: newBaseUnit }
      });
      
      console.log(`   ✅ Updated baseUnit to: ${newBaseUnit}\n`);
    }

    console.log('✅ All products fixed!\n');
    
    // Verify
    console.log('📊 Verification:\n');
    const allProducts = await prisma.product.findMany({
      where: {
        OR: [
          { name: { contains: 'SODA', mode: 'insensitive' } },
          { name: { contains: 'water', mode: 'insensitive' } }
        ]
      },
      select: {
        name: true,
        baseUnit: true,
        productUoMs: {
          include: { uom: true },
          orderBy: { isDefault: 'desc' }
        }
      }
    });

    allProducts.forEach(p => {
      console.log(`✓ ${p.name}`);
      console.log(`  Base Unit: ${p.baseUnit}`);
      p.productUoMs.forEach(puom => {
        console.log(`  • ${puom.uom.name} (${puom.uom.abbreviation}) ${puom.isDefault ? '← DEFAULT' : ''}`);
      });
      console.log('');
    });

  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    await prisma.$disconnect();
  }
}

fixBaseUnit();
