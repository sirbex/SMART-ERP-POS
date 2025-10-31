import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function showProductDetails() {
  try {
    const products = await prisma.product.findMany({
      where: {
        OR: [
          { name: { contains: 'SODA', mode: 'insensitive' } },
          { name: { contains: 'water', mode: 'insensitive' } }
        ]
      },
      select: {
        id: true,
        name: true,
        baseUnit: true,
        sellingPrice: true,
        hasMultipleUnits: true,
        alternateUnit: true,
        conversionFactor: true,
        productUoMs: {
          include: {
            uom: true
          }
        }
      }
    });

    console.log('📦 Product Details:\n');
    products.forEach(p => {
      console.log(`Product: ${p.name}`);
      console.log(`  Base Unit: ${p.baseUnit}`);
      console.log(`  Selling Price: $${p.sellingPrice}`);
      console.log(`  Has Multiple Units: ${p.hasMultipleUnits}`);
      console.log(`  Old Alternate Unit: ${p.alternateUnit || 'None'}`);
      console.log(`  Old Conversion Factor: ${p.conversionFactor || 'None'}`);
      console.log(`  New ProductUoMs: ${p.productUoMs.length} entries`);
      console.log('');
    });
  } catch (error) {
    console.error('Error:', error.message);
  } finally {
    await prisma.$disconnect();
  }
}

showProductDetails();
