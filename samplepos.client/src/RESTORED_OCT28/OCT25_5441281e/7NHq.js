import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function checkSales() {
  const sales = await prisma.sale.findMany({
    select: { saleNumber: true, createdAt: true },
    orderBy: { createdAt: 'desc' },
    take: 10
  });
  console.log(JSON.stringify(sales, null, 2));
  await prisma.$disconnect();
}

checkSales().catch(console.error);
