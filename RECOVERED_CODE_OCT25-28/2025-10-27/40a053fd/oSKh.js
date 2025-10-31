import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

/**
 * Migrate products from old single-unit system to new ProductUoM system
 * 
 * Old System: product.alternateUnit, product.conversionFactor (single alternate unit)
 * New System: ProductUoM table (multiple units per product)
 */

async function migrateToProductUoM() {
  try {
    console.log('🔄 Starting migration from old UoM system to new ProductUoM table...\n');

    // 1. Get all products with hasMultipleUnits=true
    const productsToMigrate = await prisma.product.findMany({
      where: {
        hasMultipleUnits: true,
        alternateUnit: { not: null }
      },
      include: {
        productUoMs: true
      }
    });

    console.log(`📦 Found ${productsToMigrate.length} products to migrate\n`);

    if (productsToMigrate.length === 0) {
      console.log('✅ No products need migration');
      return;
    }

    // 2. Create or get UoM entries for each unique unit
    const unitsNeeded = new Set();
    
    productsToMigrate.forEach(p => {
      unitsNeeded.add(p.baseUnit);
      if (p.alternateUnit) {
        unitsNeeded.add(p.alternateUnit);
      }
    });

    console.log('📏 Units needed:', Array.from(unitsNeeded).join(', '));
    console.log('');

    // Create UoMs if they don't exist
    const uomMap = new Map();
    
    for (const unitName of unitsNeeded) {
      let uom = await prisma.unitOfMeasure.findFirst({
        where: {
          OR: [
            { name: unitName },
            { abbreviation: unitName }
          ]
        }
      });

      if (!uom) {
        console.log(`   Creating UoM: ${unitName}`);
        uom = await prisma.unitOfMeasure.create({
          data: {
            name: unitName.charAt(0).toUpperCase() + unitName.slice(1),
            abbreviation: unitName,
            description: `Unit: ${unitName}`
          }
        });
      }

      uomMap.set(unitName, uom);
    }

    console.log('');

    // 3. For each product, create ProductUoM entries
    for (const product of productsToMigrate) {
      console.log(`📦 Migrating: ${product.name}`);

      // Skip if already has ProductUoMs
      if (product.productUoMs.length > 0) {
        console.log(`   ⚠️  Already has ${product.productUoMs.length} ProductUoMs, skipping`);
        continue;
      }

      const baseUom = uomMap.get(product.baseUnit);
      const altUom = product.alternateUnit ? uomMap.get(product.alternateUnit) : null;

      if (!baseUom) {
        console.log(`   ❌ Base unit "${product.baseUnit}" not found`);
        continue;
      }

      // Create base unit ProductUoM (always 1x conversion)
      await prisma.productUoM.create({
        data: {
          productId: product.id,
          uomId: baseUom.id,
          conversionFactor: 1,
          isDefault: true,
          isSaleAllowed: true,
          isPurchaseAllowed: true,
          sortOrder: 1
        }
      });
      console.log(`   ✅ Created base unit: ${baseUom.abbreviation} (1x)`);

      // Create alternate unit ProductUoM if exists
      if (altUom && product.conversionFactor) {
        await prisma.productUoM.create({
          data: {
            productId: product.id,
            uomId: altUom.id,
            conversionFactor: product.conversionFactor,
            isDefault: false,
            isSaleAllowed: true,
            isPurchaseAllowed: true,
            sortOrder: 2
          }
        });
        console.log(`   ✅ Created alternate unit: ${altUom.abbreviation} (${product.conversionFactor}x)`);
      }

      console.log('');
    }

    console.log('\n🎉 Migration complete! Verifying...\n');

    // 4. Verify migration
    const verifyProducts = await prisma.product.findMany({
      where: {
        id: { in: productsToMigrate.map(p => p.id) }
      },
      include: {
        productUoMs: {
          include: {
            uom: true
          },
          orderBy: {
            sortOrder: 'asc'
          }
        }
      }
    });

    verifyProducts.forEach(p => {
      console.log(`✓ ${p.name}`);
      p.productUoMs.forEach(puom => {
        console.log(`    • ${puom.uom.name} (${puom.uom.abbreviation}) - ${puom.conversionFactor}x ${puom.isDefault ? '(DEFAULT)' : ''}`);
      });
    });

    console.log('\n✅ All products migrated successfully!');
    console.log('\n💡 Next steps:');
    console.log('   1. Test the products in POS with UoM dropdown');
    console.log('   2. Set manual prices using: POST /api/uom/products/:productId/uoms/:uomId/price');
    console.log('   3. Add more units using: POST /api/uom/products/:productId/uoms');

  } catch (error) {
    console.error('❌ Migration error:', error);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

migrateToProductUoM();
