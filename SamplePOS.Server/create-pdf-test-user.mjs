import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcrypt';

const prisma = new PrismaClient();

async function createTestUser() {
  try {
    const hashedPassword = await bcrypt.hash('Test@123', 10);
    
    await prisma.user.upsert({
      where: { username: 'pdftest' },
      update: {
          passwordHash: hashedPassword,
        role: 'ADMIN'
      },
      create: {
        username: 'pdftest',
          passwordHash: hashedPassword,
          email: 'pdftest@example.com',
        fullName: 'PDF Test User',
        role: 'ADMIN',
        isActive: true
      }
    });
    
    console.log('✅ Test user created: pdftest / Test@123');
  } catch (error) {
    console.error('❌ Error:', error.message);
  } finally {
    await prisma.$disconnect();
  }
}

createTestUser();
