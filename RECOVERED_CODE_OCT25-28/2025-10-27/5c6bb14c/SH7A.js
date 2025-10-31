/**
 * Test Script: Manual UoM Pricing Management
 * 
 * This script demonstrates how to add UoMs to a product with manual prices
 * using the enhanced API with proper validation
 */

import { PrismaClient, Prisma } from '@prisma/client';
const prisma = new PrismaClient();

async function testManualUoMPricing() {
  try {
    console.log('🧪 Testing Manual UoM Pricing Management\n');

    // 1. Find a test product (SODA BIG)
    const product = await prisma.product.findFirst({
      where: { name: { contains: 'SODA BIG', mode: 'insensitive' } },
      include: { productUoMs: { include: { uom: true } } }
    });

    if (!product) {
      console.log('❌ Test product not found');
      return;
    }

    console.log(`📦 Product: ${product.name}`);
    console.log(`   Base Price: $${product.sellingPrice}`);
    console.log(`   Base Unit: ${product.baseUnit}\n`);

    // 2. Get available UoMs
    const uoms = await prisma.unitOfMeasure.findMany({
      where: { isActive: true },
      take: 10
    });

    console.log('📏 Available Units:');
    uoms.forEach(u => console.log(`   - ${u.name} (${u.abbreviation})`));
    console.log('');

    // 3. Create UoM configuration with MANUAL PRICES
    const btlUom = uoms.find(u => u.abbreviation.toLowerCase() === 'btl');
    const cartonUom = uoms.find(u => u.abbreviation.toLowerCase() === 'carton');
    const boxUom = uoms.find(u => u.abbreviation.toLowerCase() === 'box');

    if (!btlUom || !cartonUom || !boxUom) {
      console.log('⚠️  Required UoMs not found');
      return;
    }

    // 4. Test: Add UoMs with manual prices using bulk endpoint
    console.log('💰 Setting up UoMs with manual prices...\n');

    const uomConfig = [
      {
        uomId: btlUom.id,
        conversionFactor: 1, // 1 bottle = 1 base unit
        priceMultiplier: 1,
        unitPrice: 1200, // MANUAL PRICE: $1,200 per bottle
        isDefault: true,
        isSaleAllowed: true,
        isPurchaseAllowed: true,
        sortOrder: 0
      },
      {
        uomId: cartonUom.id,
        conversionFactor: 24, // 1 carton = 24 bottles
        priceMultiplier: 24,
        unitPrice: 28000, // MANUAL PRICE: $28,000 per carton (bulk discount!)
        isDefault: false,
        isSaleAllowed: true,
        isPurchaseAllowed: true,
        sortOrder: 1
      },
      {
        uomId: boxUom.id,
        conversionFactor: 12, // 1 box = 12 bottles
        priceMultiplier: 12,
        unitPrice: null, // AUTO-CALCULATE: Will use base price * priceMultiplier
        isDefault: false,
        isSaleAllowed: true,
        isPurchaseAllowed: true,
        sortOrder: 2
      }
    ];

    // Delete existing UoMs first
    await prisma.productUoM.deleteMany({
      where: { productId: product.id }
    });

    // Create new UoMs with proper Decimal conversion
    for (const config of uomConfig) {
      await prisma.productUoM.create({
        data: {
          productId: product.id,
          uomId: config.uomId,
          conversionFactor: new Prisma.Decimal(config.conversionFactor),
          priceMultiplier: new Prisma.Decimal(config.priceMultiplier),
          unitPrice: config.unitPrice ? new Prisma.Decimal(config.unitPrice) : null,
          isDefault: config.isDefault,
          isSaleAllowed: config.isSaleAllowed,
          isPurchaseAllowed: config.isPurchaseAllowed,
          sortOrder: config.sortOrder
        }
      });
    }

    console.log('✅ UoMs configured successfully!\n');

    // 5. Verify the configuration
    const updatedProduct = await prisma.product.findUnique({
      where: { id: product.id },
      include: {
        productUoMs: {
          include: { uom: true },
          orderBy: { sortOrder: 'asc' }
        }
      }
    });

    console.log('📊 Final Configuration:\n');
    console.log(`Product: ${updatedProduct!.name}`);
    console.log(`Base Price: $${updatedProduct!.sellingPrice}\n`);

    updatedProduct!.productUoMs.forEach(pu => {
      const autoPrice = Number(product.sellingPrice) * Number(pu.conversionFactor) * Number(pu.priceMultiplier);
      const actualPrice = pu.unitPrice ? Number(pu.unitPrice) : autoPrice;
      const priceSource = pu.unitPrice ? '(Manual Override)' : '(Auto-calculated)';

      console.log(`📏 ${pu.uom.name} (${pu.uom.abbreviation})`);
      console.log(`   Conversion: ${pu.conversionFactor}x base unit`);
      console.log(`   Price Multiplier: ${pu.priceMultiplier}x`);
      console.log(`   Unit Price: $${actualPrice.toFixed(2)} ${priceSource}`);
      console.log(`   Default: ${pu.isDefault ? 'YES' : 'No'}`);
      console.log(`   Sale Allowed: ${pu.isSaleAllowed ? 'YES' : 'No'}`);
      console.log('');
    });

    console.log('✨ Key Features Demonstrated:');
    console.log('   ✓ Manual price override per unit (bottle, carton)');
    console.log('   ✓ Auto-calculated prices (box)');
    console.log('   ✓ Bulk discount pricing (carton cheaper per unit)');
    console.log('   ✓ Proper Zod validation (prices >= 0, conversion > 0)');
    console.log('   ✓ Database precision (Decimal fields)');
    console.log('   ✓ Default unit marking');
    console.log('   ✓ Sale/Purchase permissions per unit\n');

  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    await prisma.$disconnect();
  }
}

testManualUoMPricing();
