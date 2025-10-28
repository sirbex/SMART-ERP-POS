import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcrypt';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

const prisma = new PrismaClient();

async function createDefaultUsers() {
  console.log('🌱 Starting user seeding...\n');

  try {
    // Default admin user
    const adminData = {
      username: 'admin',
      email: 'admin@samplepos.com',
      password: 'Admin123!',
      fullName: 'System Administrator',
      role: 'ADMIN' as const,
      isActive: true,
    };

    // Default manager user
    const managerData = {
      username: 'manager',
      email: 'manager@samplepos.com',
      password: 'Manager123!',
      fullName: 'Store Manager',
      role: 'MANAGER' as const,
      isActive: true,
    };

    // Default cashier user
    const cashierData = {
      username: 'cashier',
      email: 'cashier@samplepos.com',
      password: 'Cashier123!',
      fullName: 'Store Cashier',
      role: 'CASHIER' as const,
      isActive: true,
    };

    const usersToCreate = [adminData, managerData, cashierData];

    for (const userData of usersToCreate) {
      // Check if user already exists
      const existingUser = await prisma.user.findFirst({
        where: {
          OR: [
            { username: userData.username },
            { email: userData.email },
          ],
        },
      });

      if (existingUser) {
        console.log(`⚠️  User '${userData.username}' already exists, skipping...`);
        continue;
      }

      // Hash password
      const hashedPassword = await bcrypt.hash(userData.password, 10);

      // Create user
      const user = await prisma.user.create({
        data: {
          username: userData.username,
          email: userData.email,
          passwordHash: hashedPassword,
          fullName: userData.fullName,
          role: userData.role,
          isActive: userData.isActive,
        },
      });

      console.log(`✅ Created ${userData.role} user: ${userData.username}`);
      console.log(`   Email: ${userData.email}`);
      console.log(`   Password: ${userData.password}`);
      console.log(`   ID: ${user.id}\n`);
    }

    console.log('🎉 User seeding completed!\n');
    console.log('📝 Default Credentials:');
    console.log('   Admin    -> username: admin    | password: Admin123!');
    console.log('   Manager  -> username: manager  | password: Manager123!');
    console.log('   Cashier  -> username: cashier  | password: Cashier123!\n');

  } catch (error) {
    console.error('❌ Error creating users:', error);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

// Run the seed function
createDefaultUsers()
  .then(() => {
    console.log('✨ Seed script finished successfully');
    process.exit(0);
  })
  .catch((error) => {
    console.error('💥 Seed script failed:', error);
    process.exit(1);
  });
