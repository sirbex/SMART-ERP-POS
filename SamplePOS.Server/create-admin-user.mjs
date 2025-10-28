import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function createAdminUser() {
  try {
    // Check if admin user already exists
    const existing = await prisma.user.findUnique({
      where: { username: 'admin' }
    });

    if (existing) {
      console.log('✅ Admin user already exists');
      console.log('   Username: admin');
      console.log('   Role:', existing.role);
      return;
    }

    // Create password hash for Admin123!
    const passwordHash = await bcrypt.hash('Admin123!', 10);

    // Create admin user
    const user = await prisma.user.create({
      data: {
        username: 'admin',
        email: 'admin@samplepos.com',
        passwordHash: passwordHash,
        fullName: 'System Administrator',
        role: 'ADMIN',
        isActive: true
      }
    });

    console.log('✅ Admin user created successfully!');
    console.log('   Username: admin');
    console.log('   Password: Admin123!');
    console.log('   Role: ADMIN');
    console.log('   ID:', user.id);
  } catch (error) {
    console.error('❌ Error:', error.message);
  } finally {
    await prisma.$disconnect();
  }
}

createAdminUser();