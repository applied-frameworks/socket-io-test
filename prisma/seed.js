const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcrypt');

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Starting database seed...');

  // Hash passwords (required for bcrypt authentication to work)
  const saltRounds = 10;
  const defaultPassword = await bcrypt.hash('Password1', saltRounds);

  // Check and create admin user
  const existingAdmin = await prisma.user.findUnique({
    where: { email: 'admin@test.com' },
  });
  if (existingAdmin) {
    console.log('⏭️  Admin user already exists, skipping');
  } else {
    await prisma.user.create({
      data: {
        firstName: 'Admin',
        lastName: 'User',
        email: 'admin@test.com',
        password: defaultPassword,
      },
    });
    console.log('✅ Created admin user');
  }

  // Check and create standard user 1
  const existingUser1 = await prisma.user.findUnique({
    where: { email: 'user1@test.com' },
  });
  if (existingUser1) {
    console.log('⏭️  User Test1 already exists, skipping');
  } else {
    await prisma.user.create({
      data: {
        firstName: 'User',
        lastName: 'Test1',
        email: 'user1@test.com',
        password: defaultPassword,
      },
    });
    console.log('✅ Created user1');
  }

  // Check and create standard user 2
  const existingUser2 = await prisma.user.findUnique({
    where: { email: 'user2@test.com' },
  });
  if (existingUser2) {
    console.log('⏭️  User Test2 already exists, skipping');
  } else {
    await prisma.user.create({
      data: {
        firstName: 'User',
        lastName: 'Test2',
        email: 'user2@test.com',
        password: defaultPassword,
      },
    });
    console.log('✅ Created user2');
  }

  console.log('\n🎉 Database seeding completed successfully!');
  console.log('\nTest credentials (email / password):');
  console.log('Admin: admin@test.com / Password1');
  console.log('User1: user1@test.com / Password1');
  console.log('User2: user2@test.com / Password1');
}

main()
  .catch((e) => {
    console.error('❌ Error seeding database:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
