require('dotenv').config();
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const authRoutes = require('./routes/auth');
const { authenticateSocket } = require('./middleware/auth');
const canvasManager = require('./services/canvasManager');

const app = express();
const server = http.createServer(app);

// CORS configuration
const io = new Server(server, {
  cors: {
    origin: process.env.CLIENT_URL || '*',
    methods: ['GET', 'POST'],
    credentials: true
  },
  pingTimeout: 60000,
  pingInterval: 25000
});

// Middleware
app.use(helmet());
app.use(cors({
  origin: process.env.CLIENT_URL || '*',
  credentials: true
}));
app.use(express.json());

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100 // limit each IP to 100 requests per windowMs
});
app.use('/api/', limiter);

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ 
    status: 'ok', 
    timestamp: new Date().toISOString(),
    connections: io.engine.clientsCount
  });
});

// API Routes
app.use('/api/auth', authRoutes);

// Socket.IO authentication middleware
io.use(authenticateSocket);

// Socket.IO connection handling
io.on('connection', (socket) => {
  console.log(`User connected: ${socket.user.username} (${socket.id})`);
  
  // Send user info
  socket.emit('user:connected', {
    userId: socket.user.userId,
    username: socket.user.username
  });

  // Join a canvas room
  socket.on('canvas:join', (canvasId) => {
    socket.join(canvasId);
    socket.currentCanvas = canvasId;

    // Add user to canvas
    canvasManager.addUser(canvasId, socket.user.userId, socket.user.username);

    // Send current canvas state to the newly joined user
    const canvasState = canvasManager.getCanvasState(canvasId);
    socket.emit('canvas:state', canvasState);

    // Notify others in the room
    socket.to(canvasId).emit('user:joined', {
      userId: socket.user.userId,
      username: socket.user.username
    });

    // Send updated list of active users to everyone in the room
    const users = canvasManager.getCanvasUsers(canvasId);
    io.to(canvasId).emit('canvas:users', users);

    console.log(`${socket.user.username} joined canvas: ${canvasId}`);
  });

  // Drawing events
  socket.on('draw:start', (data) => {
    const drawData = {
      ...data,
      userId: socket.user.userId,
      username: socket.user.username,
      timestamp: Date.now()
    };
    
    socket.to(socket.currentCanvas).emit('draw:start', drawData);
    canvasManager.addDrawEvent(socket.currentCanvas, drawData);
  });

  socket.on('draw:move', (data) => {
    const drawData = {
      ...data,
      userId: socket.user.userId,
      timestamp: Date.now()
    };
    
    socket.to(socket.currentCanvas).emit('draw:move', drawData);
  });

  socket.on('draw:end', (data) => {
    const drawData = {
      ...data,
      userId: socket.user.userId,
      timestamp: Date.now()
    };
    
    socket.to(socket.currentCanvas).emit('draw:end', drawData);
  });

  // Shape events
  socket.on('shape:add', (data) => {
    const shapeData = {
      ...data,
      userId: socket.user.userId,
      username: socket.user.username,
      timestamp: Date.now()
    };
    
    socket.to(socket.currentCanvas).emit('shape:add', shapeData);
    canvasManager.addShape(socket.currentCanvas, shapeData);
  });

  socket.on('shape:update', (data) => {
    const shapeData = {
      ...data,
      userId: socket.user.userId,
      timestamp: Date.now()
    };
    
    socket.to(socket.currentCanvas).emit('shape:update', shapeData);
    canvasManager.updateShape(socket.currentCanvas, data.shapeId, shapeData);
  });

  socket.on('shape:delete', (data) => {
    socket.to(socket.currentCanvas).emit('shape:delete', data);
    canvasManager.deleteShape(socket.currentCanvas, data.shapeId);
  });

  // Clear canvas
  socket.on('canvas:clear', () => {
    socket.to(socket.currentCanvas).emit('canvas:clear', {
      userId: socket.user.userId,
      username: socket.user.username
    });
    canvasManager.clearCanvas(socket.currentCanvas);
  });

  // Cursor position
  socket.on('cursor:move', (data) => {
    socket.to(socket.currentCanvas).emit('cursor:move', {
      userId: socket.user.userId,
      username: socket.user.username,
      x: data.x,
      y: data.y
    });
  });

  // Chat messages
  socket.on('chat:message', (message) => {
    const chatMessage = {
      userId: socket.user.userId,
      username: socket.user.username,
      message: message,
      timestamp: Date.now()
    };
    
    io.to(socket.currentCanvas).emit('chat:message', chatMessage);
  });

  // Disconnection
  socket.on('disconnect', () => {
    console.log(`User disconnected: ${socket.user.username} (${socket.id})`);

    if (socket.currentCanvas) {
      socket.to(socket.currentCanvas).emit('user:left', {
        userId: socket.user.userId,
        username: socket.user.username
      });

      canvasManager.removeUser(socket.currentCanvas, socket.user.userId);

      // Send updated users list to everyone remaining in the room
      const users = canvasManager.getCanvasUsers(socket.currentCanvas);
      io.to(socket.currentCanvas).emit('canvas:users', users);
    }
  });

  // Error handling
  socket.on('error', (error) => {
    console.error(`Socket error for user ${socket.user.username}:`, error);
  });
});

const PORT = process.env.PORT || 3000;

server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  console.log(`Environment: ${process.env.NODE_ENV || 'development'}`);
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('SIGTERM signal received: closing HTTP server');
  server.close(() => {
    console.log('HTTP server closed');
  });
});
