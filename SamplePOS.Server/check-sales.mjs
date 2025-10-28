import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function checkSales() {
  try {
    console.log('Checking Sales table...\n');
    
    const sales = await prisma.sale.findMany({
      select: {
        id: true,
        saleNumber: true,
        saleDate: true,
        totalAmount: true,
        status: true,
        customer: {
          select: { name: true }
        }
      },
      orderBy: { saleDate: 'desc' },
      take: 20
    });
    
    console.log(`Total sales found: ${sales.length}\n`);
    
    sales.forEach((sale, index) => {
      console.log(`${index + 1}. Sale#: ${sale.saleNumber}`);
      console.log(`   Status: ${sale.status}`);
      console.log(`   Date: ${sale.saleDate}`);
      console.log(`   Amount: ${sale.totalAmount}`);
      console.log(`   Customer: ${sale.customer?.name || 'N/A'}`);
      console.log('');
    });
    
    const statusCounts = sales.reduce((acc, sale) => {
      acc[sale.status] = (acc[sale.status] || 0) + 1;
      return acc;
    }, {});
    
    console.log('Sales by status:');
    Object.entries(statusCounts).forEach(([status, count]) => {
      console.log(`  ${status}: ${count}`);
    });
    
  } catch (error) {
    console.error('Error checking sales:', error);
  } finally {
    await prisma.$disconnect();
  }
}

checkSales();
