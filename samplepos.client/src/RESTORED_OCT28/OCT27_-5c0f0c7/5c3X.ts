/**
 * Setup Sugar UoM Example
 * 
 * This script demonstrates the complete setup for a product with multiple units:
 * - Product: Sugar (25kg sack)
 * - Units: Sack (25kg), Kilogram (1kg)
 * - Individual prices for each unit
 * - Proper inventory tracking in base units (kg)
 */

import { PrismaClient, Prisma } from '@prisma/client';

const prisma = new PrismaClient();

async function setupSugarExample() {
  console.log('🎯 Setting up Sugar UoM Example...\n');

  try {
    // ========================================
    // STEP 1: Create Weight Category
    // ========================================
    console.log('📦 Step 1: Creating Weight category...');
    
    let weightCategory = await prisma.uoMCategory.findFirst({
      where: { name: 'Weight' },
    });

    if (!weightCategory) {
      weightCategory = await prisma.uoMCategory.create({
        data: {
          name: 'Weight',
          description: 'Weight measurements for bulk and retail products',
          isActive: true,
        },
      });
      console.log('✅ Created Weight category:', weightCategory.id);
    } else {
      console.log('✅ Weight category already exists:', weightCategory.id);
    }

    // ========================================
    // STEP 2: Create Units of Measure
    // ========================================
    console.log('\n📏 Step 2: Creating units of measure...');

    // Kilogram (Base Unit)
    let kgUnit = await prisma.unitOfMeasure.findFirst({
      where: {
        categoryId: weightCategory.id,
        abbreviation: 'kg',
      },
    });

    if (!kgUnit) {
      kgUnit = await prisma.unitOfMeasure.create({
        data: {
          categoryId: weightCategory.id,
          name: 'Kilogram',
          abbreviation: 'kg',
          conversionFactor: 1.0, // Base unit
          isBase: true,
          isActive: true,
          description: 'Base weight unit',
        },
      });
      console.log('✅ Created Kilogram unit:', kgUnit.id);
    } else {
      console.log('✅ Kilogram unit already exists:', kgUnit.id);
    }

    // Sack (25kg)
    let sackUnit = await prisma.unitOfMeasure.findFirst({
      where: {
        categoryId: weightCategory.id,
        abbreviation: 'sack',
      },
    });

    if (!sackUnit) {
      sackUnit = await prisma.unitOfMeasure.create({
        data: {
          categoryId: weightCategory.id,
          name: 'Sack',
          abbreviation: 'sack',
          conversionFactor: 25.0, // 1 sack = 25 kg
          isBase: false,
          isActive: true,
          description: '25 kilogram sack',
        },
      });
      console.log('✅ Created Sack unit:', sackUnit.id);
    } else {
      console.log('✅ Sack unit already exists:', sackUnit.id);
    }

    // Update category to set base UoM
    await prisma.uoMCategory.update({
      where: { id: weightCategory.id },
      data: { baseUoMId: kgUnit.id },
    });

    // ========================================
    // STEP 3: Create/Update Sugar Product
    // ========================================
    console.log('\n🍬 Step 3: Creating/updating Sugar product...');

    let sugarProduct = await prisma.product.findFirst({
      where: { name: { contains: 'Sugar', mode: 'insensitive' } },
    });

    if (!sugarProduct) {
      sugarProduct = await prisma.product.create({
        data: {
          name: 'Sugar',
          description: 'Premium white sugar - sold by sack or kilogram',
          category: 'Groceries',
          barcode: 'SUGAR-001',
          baseUnit: 'kg',
          currentStock: 0, // Will be added via stock batch
          reorderLevel: 50, // 50 kg = 2 sacks
          costPrice: 40.00, // Cost per kg
          sellingPrice: 50.00, // Base selling price per kg
          taxRate: 0,
          isActive: true,
        },
      });
      console.log('✅ Created Sugar product:', sugarProduct.id);
    } else {
      sugarProduct = await prisma.product.update({
        where: { id: sugarProduct.id },
        data: {
          baseUnit: 'kg',
          sellingPrice: 50.00,
          costPrice: 40.00,
        },
      });
      console.log('✅ Updated Sugar product:', sugarProduct.id);
    }

    // ========================================
    // STEP 4: Setup Product UoMs with Prices
    // ========================================
    console.log('\n💰 Step 4: Setting up UoMs with individual prices...');

    // Delete existing ProductUoMs to start fresh
    await prisma.productUoM.deleteMany({
      where: { productId: sugarProduct.id },
    });

    // Create ProductUoM for Sack (25kg) - Default unit
    const sackProductUoM = await prisma.productUoM.create({
      data: {
        productId: sugarProduct.id,
        uomId: sackUnit.id,
        conversionFactor: 25.0, // 1 sack = 25 kg
        unitPrice: 1000.00, // $1000 per sack (special wholesale price)
        isDefault: true, // Default unit when adding to cart
        isSaleAllowed: true,
        isPurchaseAllowed: true,
        barcode: 'SUGAR-SACK-001',
        sortOrder: 0,
      },
      include: {
        uom: true,
      },
    });
    console.log('✅ Created Sack UoM: $1000.00 per sack (25kg)');

    // Create ProductUoM for Kilogram - Retail unit
    const kgProductUoM = await prisma.productUoM.create({
      data: {
        productId: sugarProduct.id,
        uomId: kgUnit.id,
        conversionFactor: 1.0, // 1 kg = 1 kg (base)
        unitPrice: 50.00, // $50 per kg (retail price)
        isDefault: false,
        isSaleAllowed: true,
        isPurchaseAllowed: true,
        barcode: 'SUGAR-KG-001',
        sortOrder: 1,
      },
      include: {
        uom: true,
      },
    });
    console.log('✅ Created Kilogram UoM: $50.00 per kg');

    // ========================================
    // STEP 5: Add Initial Stock
    // ========================================
    console.log('\n📦 Step 5: Adding initial stock...');

    // Add 10 sacks = 250 kg
    const initialStock = new Prisma.Decimal(250); // 10 sacks × 25 kg
    const costPerKg = new Prisma.Decimal(40.00);

    const stockBatch = await prisma.stockBatch.create({
      data: {
        productId: sugarProduct.id,
        batchNumber: `SUGAR-BATCH-${Date.now()}`,
        quantityReceived: initialStock,
        quantityRemaining: initialStock,
        costPerUnit: costPerKg,
        totalCost: initialStock.mul(costPerKg),
        receivedDate: new Date(),
        expiryDate: null,
        supplierReference: 'Initial Stock',
      },
    });

    // Update product stock
    await prisma.product.update({
      where: { id: sugarProduct.id },
      data: { currentStock: initialStock },
    });

    console.log(`✅ Added stock: ${initialStock} kg (10 sacks) @ $${costPerKg}/kg`);
    console.log(`   Batch: ${stockBatch.batchNumber}`);

    // ========================================
    // SUMMARY
    // ========================================
    console.log('\n' + '='.repeat(60));
    console.log('✨ SETUP COMPLETE!');
    console.log('='.repeat(60));
    console.log('\n📋 Product Configuration:');
    console.log(`   Product ID: ${sugarProduct.id}`);
    console.log(`   Product Name: ${sugarProduct.name}`);
    console.log(`   Base Unit: kg`);
    console.log(`   Current Stock: 250 kg (10 sacks)`);
    console.log('\n💵 Price Configuration:');
    console.log('   • Sack (25kg): $1,000.00 per sack (wholesale)');
    console.log('   • Kilogram: $50.00 per kg (retail)');
    console.log('\n🔄 Inventory Logic:');
    console.log('   • Selling 1 sack deducts 25 kg from inventory');
    console.log('   • Selling 5 kg deducts 5 kg from inventory');
    console.log('   • All tracking in base unit (kg) via FIFO');
    console.log('\n📝 How to Use:');
    console.log('   1. Add "Sugar" to POS cart');
    console.log('   2. Select unit from dropdown (Sack or kg)');
    console.log('   3. Price automatically adjusts:');
    console.log('      - Sack: $1,000.00 per unit');
    console.log('      - kg: $50.00 per unit');
    console.log('   4. Complete sale - inventory deducts in kg');
    console.log('\n🎯 Test Scenarios:');
    console.log('   A) Sell 1 sack → Pays $1,000, deducts 25kg → 225kg remaining');
    console.log('   B) Sell 10 kg → Pays $500, deducts 10kg → 215kg remaining');
    console.log('   C) Sell 2 sacks → Pays $2,000, deducts 50kg → 165kg remaining');
    console.log('\n' + '='.repeat(60));

    // ========================================
    // Return data for API calls
    // ========================================
    return {
      product: sugarProduct,
      weightCategory,
      units: {
        kilogram: kgUnit,
        sack: sackUnit,
      },
      productUoMs: {
        sack: sackProductUoM,
        kilogram: kgProductUoM,
      },
      stockBatch,
    };

  } catch (error) {
    console.error('\n❌ Error during setup:', error);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

// Run the setup
setupSugarExample()
  .then((result) => {
    console.log('\n✅ Setup script completed successfully');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n❌ Setup script failed:', error);
    process.exit(1);
  });
