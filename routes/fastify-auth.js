const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const { authenticateToken } = require('../middleware/fastify-auth');
const userStore = require('../services/userStore');

async function authRoutes(fastify, options) {
  // Register new user
  fastify.post('/register', async (request, reply) => {
    try {
      const { firstName, lastName, email, password } = request.body;

      // Validation
      if (!firstName || !lastName || !email || !password) {
        return reply.code(400).send({
          error: 'First name, last name, email, and password are required'
        });
      }

      if (firstName.length < 1) {
        return reply.code(400).send({
          error: 'First name is required'
        });
      }

      if (lastName.length < 1) {
        return reply.code(400).send({
          error: 'Last name is required'
        });
      }

      // Basic email validation
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(email)) {
        return reply.code(400).send({
          error: 'Invalid email format'
        });
      }

      if (password.length < 6) {
        return reply.code(400).send({
          error: 'Password must be at least 6 characters long'
        });
      }

      // Check if user already exists
      const existingUser = await userStore.getUserByEmail(email);
      if (existingUser) {
        return reply.code(409).send({
          error: 'Email already exists'
        });
      }

      // Hash password
      const hashedPassword = await bcrypt.hash(password, 10);

      // Create user
      const user = await userStore.createUser({
        firstName,
        lastName,
        email,
        password: hashedPassword
      });

      // Generate token
      const token = jwt.sign(
        {
          userId: user.id,
          firstName: user.firstName,
          lastName: user.lastName,
          email: user.email
        },
        process.env.JWT_SECRET,
        { expiresIn: '7d' }
      );

      return reply.code(201).send({
        message: 'User registered successfully',
        token,
        user: {
          id: user.id,
          firstName: user.firstName,
          lastName: user.lastName,
          email: user.email
        }
      });
    } catch (error) {
      console.error('Registration error:', error);
      return reply.code(500).send({
        error: 'Internal server error during registration'
      });
    }
  });

  // Login
  fastify.post('/login', async (request, reply) => {
    try {
      const { email, password } = request.body;

      // Validation
      if (!email || !password) {
        return reply.code(400).send({
          error: 'Email and password are required'
        });
      }

      // Get user by email
      const user = await userStore.getUserByEmail(email);
      if (!user) {
        return reply.code(401).send({
          error: 'Invalid credentials'
        });
      }

      // Verify password
      const isValidPassword = await bcrypt.compare(password, user.password);
      if (!isValidPassword) {
        return reply.code(401).send({
          error: 'Invalid credentials'
        });
      }

      // Update last login
      await userStore.updateLastLogin(user.id);

      // Generate token
      const token = jwt.sign(
        {
          userId: user.id,
          firstName: user.firstName,
          lastName: user.lastName,
          email: user.email
        },
        process.env.JWT_SECRET,
        { expiresIn: '7d' }
      );

      return {
        message: 'Login successful',
        token,
        user: {
          id: user.id,
          firstName: user.firstName,
          lastName: user.lastName,
          email: user.email
        }
      };
    } catch (error) {
      console.error('Login error:', error);
      return reply.code(500).send({
        error: 'Internal server error during login'
      });
    }
  });

  // Get current user profile
  fastify.get('/profile', {
    preHandler: authenticateToken
  }, async (request, reply) => {
    try {
      const user = await userStore.getUserById(request.user.userId);

      if (!user) {
        return reply.code(404).send({
          error: 'User not found'
        });
      }

      return {
        id: user.id,
        firstName: user.firstName,
        lastName: user.lastName,
        email: user.email,
        createdAt: user.createdAt
      };
    } catch (error) {
      console.error('Profile error:', error);
      return reply.code(500).send({
        error: 'Internal server error'
      });
    }
  });
}

module.exports = authRoutes;
