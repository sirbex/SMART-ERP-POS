// STEP 5: SEED TEST DATA AND GET IDS
// This script creates test data and returns actual IDs for API testing

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function seedTestData() {
  console.log('\n============================================================');
  console.log('  SEEDING TEST DATA FOR API TESTING');
  console.log('============================================================\n');

  try {
    // Create or get test supplier
    let supplier = await prisma.supplier.findFirst({
      where: { name: 'Test Supplier Inc.' }
    });

    if (!supplier) {
      supplier = await prisma.supplier.create({
        data: {
          name: 'Test Supplier Inc.',
          email: 'test@supplier.com',
          phone: '+1-555-0100',
          address: '123 Test Street, Test City, TC 12345',
          contactPerson: 'John Test',
          paymentTerms: 'NET30',
          isActive: true
        }
      });
      console.log('✅ Created test supplier:', supplier.name);
    } else {
      console.log('✅ Found existing test supplier:', supplier.name);
    }

    // Create or get test product
    let product = await prisma.product.findFirst({
      where: { barcode: 'TEST-001' }
    });

    if (!product) {
      product = await prisma.product.create({
        data: {
          name: 'Test Product Alpha',
          barcode: 'TEST-001',
          description: 'Test product for receiving system integration',
          category: 'Test Category',
          baseUnit: 'PIECE',
          currentStock: 0,
          reorderLevel: 10,
          costPrice: 25.50,
          sellingPrice: 35.00,
          hasMultipleUnits: false,
          taxRate: 0.12,
          isActive: true
        }
      });
      console.log('✅ Created test product:', product.name);
    } else {
      console.log('✅ Found existing test product:', product.name);
    }

    // Create or get test user with proper password
    // Delete existing test user first to ensure fresh password
    await prisma.user.deleteMany({
      where: { username: 'testuser' }
    });
    
    const user = await prisma.user.create({
      data: {
        username: 'testuser',
        email: 'test@user.com',
        passwordHash: '$2b$10$w5DpIE8qUpYvg1o7ITesyOEWDVHihBSMAXWt7ddCcTaahUhG2eQ.G', // password123
        fullName: 'Test User',
        role: 'ADMIN',
        isActive: true
      }
    });
    console.log('✅ Created test user:', user.fullName, '(username: testuser, password: password123)');

    // Output IDs for use in test script
    console.log('\n============================================================');
    console.log('  TEST DATA IDS (Copy these to test-api.ps1)');
    console.log('============================================================\n');
    console.log(`$supplierId = "${supplier.id}"`);
    console.log(`$productId = "${product.id}"`);
    console.log(`$userId = "${user.id}"`);
    console.log('\n============================================================\n');

    return {
      supplierId: supplier.id,
      productId: product.id,
      userId: user.id
    };

  } catch (error) {
    console.error('❌ Error seeding test data:', error);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

seedTestData()
  .then(() => process.exit(0))
  .catch(() => process.exit(1));
