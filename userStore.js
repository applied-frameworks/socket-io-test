const { v4: uuidv4 } = require('crypto');

// In-memory user storage
// In production, replace this with a proper database (MongoDB, PostgreSQL, etc.)
class UserStore {
  constructor() {
    this.users = new Map();
    this.usersByUsername = new Map();
  }

  createUser({ username, password, email }) {
    const user = {
      id: this.generateUserId(),
      username,
      password,
      email,
      createdAt: new Date().toISOString(),
      lastLogin: new Date().toISOString()
    };

    this.users.set(user.id, user);
    this.usersByUsername.set(username.toLowerCase(), user);

    return user;
  }

  getUserById(userId) {
    return this.users.get(userId);
  }

  getUserByUsername(username) {
    return this.usersByUsername.get(username.toLowerCase());
  }

  updateLastLogin(userId) {
    const user = this.users.get(userId);
    if (user) {
      user.lastLogin = new Date().toISOString();
    }
  }

  getAllUsers() {
    return Array.from(this.users.values()).map(user => ({
      id: user.id,
      username: user.username,
      email: user.email,
      createdAt: user.createdAt,
      lastLogin: user.lastLogin
    }));
  }

  deleteUser(userId) {
    const user = this.users.get(userId);
    if (user) {
      this.usersByUsername.delete(user.username.toLowerCase());
      this.users.delete(userId);
      return true;
    }
    return false;
  }

  generateUserId() {
    // Simple ID generation - in production use UUID or database auto-increment
    return `user_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }
}

// Singleton instance
const userStore = new UserStore();

module.exports = userStore;
