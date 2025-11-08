// Global setup for Playwright tests
// Load environment variables before all tests
require('dotenv').config();

module.exports = async () => {
  // Global setup runs once before all tests
  console.log('Loading environment variables for tests...');
  console.log('DATABASE_URL:', process.env.DATABASE_URL ? 'Set' : 'Not set');
  console.log('JWT_SECRET:', process.env.JWT_SECRET ? 'Set' : 'Not set');
};
