import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

/**
 * Set up proper pricing for products using the UoM system
 * Based on your POS display:
 * - SODA BIG 500ML: $1,000 per btl
 * - water 500ml: $900 per btl
 * - SODA pepsi 500ML: $700 per pcs
 */

async function setupProductPricing() {
  try {
    console.log('💰 Setting up product pricing...\n');

    // 1. SODA BIG 500ML - $1,000 per bottle
    const sodaBig = await prisma.product.findFirst({
      where: { name: { contains: 'SODA BIG', mode: 'insensitive' } },
      include: { productUoMs: { include: { uom: true } } }
    });

    if (sodaBig) {
      console.log(`📦 ${sodaBig.name}`);
      
      // Update base product selling price
      await prisma.product.update({
        where: { id: sodaBig.id },
        data: { sellingPrice: 1000 }
      });
      
      // Set unit prices
      const btlUom = sodaBig.productUoMs.find(p => p.uom.abbreviation === 'btl');
      const cartonUom = sodaBig.productUoMs.find(p => p.uom.abbreviation === 'carton');
      
      if (btlUom) {
        await prisma.productUoM.update({
          where: { id: btlUom.id },
          data: { unitPrice: 1000 }
        });
        console.log(`   ✅ btl: $1,000 per bottle`);
      }
      
      if (cartonUom) {
        // Carton = 24 bottles @ $1,000 each = $24,000 per carton
        await prisma.productUoM.update({
          where: { id: cartonUom.id },
          data: { unitPrice: 24000 }
        });
        console.log(`   ✅ carton: $24,000 per carton (24 bottles)`);
      }
    }

    // 2. water 500ml - $900 per bottle
    const water = await prisma.product.findFirst({
      where: { name: { contains: 'water', mode: 'insensitive' } },
      include: { productUoMs: { include: { uom: true } } }
    });

    if (water) {
      console.log(`\n📦 ${water.name}`);
      
      await prisma.product.update({
        where: { id: water.id },
        data: { sellingPrice: 900 }
      });
      
      const btlUom = water.productUoMs.find(p => p.uom.abbreviation === 'btl');
      const boxUom = water.productUoMs.find(p => p.uom.abbreviation === 'box');
      
      if (btlUom) {
        await prisma.productUoM.update({
          where: { id: btlUom.id },
          data: { unitPrice: 900 }
        });
        console.log(`   ✅ btl: $900 per bottle`);
      }
      
      if (boxUom) {
        // Box = 24 bottles @ $900 each = $21,600 per box
        await prisma.productUoM.update({
          where: { id: boxUom.id },
          data: { unitPrice: 21600 }
        });
        console.log(`   ✅ box: $21,600 per box (24 bottles)`);
      }
    }

    // 3. SODA pepsi 500ML - $700 per piece (needs UoM setup first)
    const pepsi = await prisma.product.findFirst({
      where: { name: { contains: 'pepsi', mode: 'insensitive' } },
      include: { productUoMs: { include: { uom: true } } }
    });

    if (pepsi) {
      console.log(`\n📦 ${pepsi.name}`);
      
      await prisma.product.update({
        where: { id: pepsi.id },
        data: { sellingPrice: 700 }
      });

      // Check if pcs UoM exists
      let pcsUom = await prisma.unitOfMeasure.findFirst({
        where: {
          OR: [
            { abbreviation: 'pcs' },
            { abbreviation: 'pc' }
          ]
        }
      });

      // Create pcs UoM if it doesn't exist
      if (!pcsUom) {
        const generalCategory = await prisma.uoMCategory.findFirst({
          where: { name: 'General' }
        });

        pcsUom = await prisma.unitOfMeasure.create({
          data: {
            categoryId: generalCategory.id,
            name: 'Piece',
            abbreviation: 'pcs',
            conversionFactor: 1,
            isBase: true,
            description: 'Individual piece/item'
          }
        });
        console.log(`   Created "pcs" unit`);
      }

      // Create ProductUoM if doesn't exist
      const existingPuom = await prisma.productUoM.findFirst({
        where: {
          productId: pepsi.id,
          uomId: pcsUom.id
        }
      });

      if (!existingPuom) {
        await prisma.productUoM.create({
          data: {
            productId: pepsi.id,
            uomId: pcsUom.id,
            conversionFactor: 1,
            isDefault: true,
            isSaleAllowed: true,
            isPurchaseAllowed: true,
            unitPrice: 700,
            sortOrder: 1
          }
        });
        console.log(`   ✅ pcs: $700 per piece (created)`);
      } else {
        await prisma.productUoM.update({
          where: { id: existingPuom.id },
          data: { unitPrice: 700 }
        });
        console.log(`   ✅ pcs: $700 per piece (updated)`);
      }
    }

    console.log('\n✅ All prices updated successfully!\n');
    
    // Verify
    console.log('📊 Final Pricing Summary:\n');
    const allProducts = await prisma.product.findMany({
      where: {
        OR: [
          { name: { contains: 'SODA', mode: 'insensitive' } },
          { name: { contains: 'water', mode: 'insensitive' } }
        ]
      },
      include: {
        productUoMs: {
          include: { uom: true },
          orderBy: { sortOrder: 'asc' }
        }
      }
    });

    allProducts.forEach(p => {
      console.log(`${p.name}`);
      console.log(`  Base Price: $${p.sellingPrice}`);
      p.productUoMs.forEach(puom => {
        const price = puom.unitPrice || (p.sellingPrice * Number(puom.conversionFactor));
        console.log(`  • ${puom.uom.abbreviation}: $${price} (${puom.isDefault ? 'DEFAULT' : ''})`);
      });
      console.log('');
    });

  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    await prisma.$disconnect();
  }
}

setupProductPricing();
