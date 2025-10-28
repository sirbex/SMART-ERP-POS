import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function checkUsers() {
  const users = await prisma.user.findMany({
    select: { username: true, role: true, fullName: true }
  });
  
  console.log('Available users:');
  users.forEach(user => {
    console.log(`  - ${user.username} (${user.role})`);
  });
  
  await prisma.$disconnect();
}

checkUsers();
