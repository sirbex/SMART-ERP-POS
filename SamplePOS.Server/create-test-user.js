import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function createTestUser() {
  try {
    // Check if user already exists
    const existing = await prisma.user.findUnique({
      where: { username: 'testuser' }
    });

    if (existing) {
      console.log('✅ User "testuser" already exists');
      console.log('   Username: testuser');
      console.log('   Password: password123');
      return;
    }

    // Create password hash
    const passwordHash = await bcrypt.hash('password123', 10);

    // Create user
    const user = await prisma.user.create({
      data: {
        username: 'testuser',
        email: 'test@example.com',
        passwordHash: passwordHash,
        fullName: 'Test User',
        role: 'ADMIN',
        isActive: true
      }
    });

    console.log('✅ Test user created successfully!');
    console.log('   Username: testuser');
    console.log('   Password: password123');
    console.log('   Role: ADMIN');
    console.log('   ID:', user.id);
  } catch (error) {
    console.error('❌ Error:', error.message);
  } finally {
    await prisma.$disconnect();
  }
}

createTestUser();
