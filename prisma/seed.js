const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcrypt');

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Starting database seed...');

  // Hash passwords (required for bcrypt authentication to work)
  const saltRounds = 10;
  const adminPassword = await bcrypt.hash('admin', saltRounds);
  const user1Password = await bcrypt.hash('user1', saltRounds);
  const user2Password = await bcrypt.hash('user2', saltRounds);

  // Check and create admin user
  const existingAdmin = await prisma.user.findUnique({
    where: { username: 'admin' },
  });
  if (existingAdmin) {
    console.log('⏭️  Admin user already exists, skipping');
  } else {
    await prisma.user.create({
      data: {
        username: 'admin',
        email: 'admin@example.com',
        password: adminPassword,
      },
    });
    console.log('✅ Created admin user');
  }

  // Check and create standard user 1
  const existingUser1 = await prisma.user.findUnique({
    where: { username: 'user1' },
  });
  if (existingUser1) {
    console.log('⏭️  User1 already exists, skipping');
  } else {
    await prisma.user.create({
      data: {
        username: 'user1',
        email: 'user1@example.com',
        password: user1Password,
      },
    });
    console.log('✅ Created user1');
  }

  // Check and create standard user 2
  const existingUser2 = await prisma.user.findUnique({
    where: { username: 'user2' },
  });
  if (existingUser2) {
    console.log('⏭️  User2 already exists, skipping');
  } else {
    await prisma.user.create({
      data: {
        username: 'user2',
        email: 'user2@example.com',
        password: user2Password,
      },
    });
    console.log('✅ Created user2');
  }

  console.log('\n🎉 Database seeding completed successfully!');
  console.log('\nTest credentials (username / password):');
  console.log('Admin: admin / admin');
  console.log('User1: user1 / user1');
  console.log('User2: user2 / user2');
}

main()
  .catch((e) => {
    console.error('❌ Error seeding database:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
