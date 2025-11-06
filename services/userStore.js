// Database-backed user storage using Prisma
const prisma = require('./prisma');

class UserStore {
  async createUser({ username, password, email }) {
    const user = await prisma.user.create({
      data: {
        username: username.toLowerCase(),
        password,
        email,
        lastLogin: new Date(),
      },
    });

    return {
      id: user.id,
      username: user.username,
      password: user.password,
      email: user.email,
      createdAt: user.createdAt.toISOString(),
      lastLogin: user.lastLogin.toISOString(),
    };
  }

  async getUserById(userId) {
    const user = await prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user) return null;

    return {
      id: user.id,
      username: user.username,
      password: user.password,
      email: user.email,
      createdAt: user.createdAt.toISOString(),
      lastLogin: user.lastLogin.toISOString(),
    };
  }

  async getUserByUsername(username) {
    const user = await prisma.user.findUnique({
      where: { username: username.toLowerCase() },
    });

    if (!user) return null;

    return {
      id: user.id,
      username: user.username,
      password: user.password,
      email: user.email,
      createdAt: user.createdAt.toISOString(),
      lastLogin: user.lastLogin.toISOString(),
    };
  }

  async updateLastLogin(userId) {
    await prisma.user.update({
      where: { id: userId },
      data: { lastLogin: new Date() },
    });
  }

  async getAllUsers() {
    const users = await prisma.user.findMany({
      select: {
        id: true,
        username: true,
        email: true,
        createdAt: true,
        lastLogin: true,
      },
    });

    return users.map(user => ({
      id: user.id,
      username: user.username,
      email: user.email,
      createdAt: user.createdAt.toISOString(),
      lastLogin: user.lastLogin.toISOString(),
    }));
  }

  async deleteUser(userId) {
    try {
      await prisma.user.delete({
        where: { id: userId },
      });
      return true;
    } catch (error) {
      return false;
    }
  }
}

// Singleton instance
const userStore = new UserStore();

module.exports = userStore;
