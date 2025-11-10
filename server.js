require('dotenv').config();
const express = require('express');
const http = require('http');
const path = require('path');
const { Server } = require('socket.io');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const authRoutes = require('./routes/auth');
const documentRoutes = require('./routes/documents');
const shapesRoutes = require('./routes/shapes');
const { authenticateSocket } = require('./middleware/auth');
const canvasManager = require('./services/canvasManager');
const documentManager = require('./services/documentManager');

const app = express();
const server = http.createServer(app);

// Trust proxy for AWS Elastic Beanstalk / nginx (1 hop)
app.set('trust proxy', 1);

// CORS origin configuration
// In development: allow localhost with any port
// In staging/production: only allow specified CLIENT_URL
const corsOrigin = (origin, callback) => {
  const isDevelopment = process.env.NODE_ENV === 'development' || process.env.NODE_ENV === 'test';

  if (isDevelopment) {
    // Allow any localhost origin in development
    if (!origin || origin.startsWith('http://localhost:') || origin.startsWith('http://127.0.0.1:')) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  } else {
    // In staging/production, only allow the specific CLIENT_URL
    const allowedOrigin = process.env.CLIENT_URL;
    if (origin === allowedOrigin || !origin) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  }
};

// CORS configuration
const io = new Server(server, {
  cors: {
    origin: corsOrigin,
    methods: ['GET', 'POST'],
    credentials: true
  },
  pingTimeout: 60000,
  pingInterval: 25000
});

// Middleware - Configure Helmet security headers
app.use(helmet({
  originAgentCluster: false,  // Disable to avoid conflicts with reverse proxies
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      imgSrc: ["'self'", "data:"],
      connectSrc: ["'self'"],
      fontSrc: ["'self'"],
      objectSrc: ["'none'"],
      mediaSrc: ["'self'"],
      frameSrc: ["'none'"],
    },
  },
}));
app.use(cors({
  origin: corsOrigin,
  credentials: true
}));
app.use(express.json());

// Rate limiting (disabled for testing)
if (process.env.NODE_ENV !== 'test') {
  const limiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 100 // limit each IP to 100 requests per windowMs
  });
  app.use('/api/', limiter);
}

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
app.use('/api/documents', documentRoutes);
app.use('/api/shapes', shapesRoutes);

// Serve static files from the public folder
app.use('/public', express.static(path.join(__dirname, 'public')));

// Serve static files from the client build folder in production or staging
if (process.env.NODE_ENV === 'production' || process.env.NODE_ENV === 'staging') {
  const clientBuildPath = path.join(__dirname, 'client', 'dist');
  app.use(express.static(clientBuildPath));

  // Catch-all route to serve index.html for client-side routing
  app.get('*', (req, res) => {
    // Don't serve index.html for API routes or Socket.IO
    if (req.path.startsWith('/api/') || req.path.startsWith('/socket.io/')) {
      return res.status(404).json({ error: 'Not found' });
    }
    res.sendFile(path.join(clientBuildPath, 'index.html'));
  });
}

// Socket.IO authentication middleware
io.use(authenticateSocket);

// Socket.IO connection handling
io.on('connection', (socket) => {
  const userFullName = `${socket.user.firstName} ${socket.user.lastName}`;
  console.log(`User connected: ${userFullName} (${socket.id})`);

  // Send user info
  socket.emit('user:connected', {
    userId: socket.user.userId,
    firstName: socket.user.firstName,
    lastName: socket.user.lastName,
    email: socket.user.email
  });

  // Join a document room
  socket.on('document:join', async (data) => {
    const { documentId } = data;
    socket.join(documentId);
    socket.currentDocument = documentId;

    const userInfo = {
      firstName: socket.user.firstName,
      lastName: socket.user.lastName,
      email: socket.user.email
    };

    // Add user to document
    documentManager.addUser(documentId, socket.user.userId, userInfo);

    // Send current document state to the newly joined user
    try {
      const documentState = await documentManager.getDocumentState(documentId);
      socket.emit('document:state', documentState);

      // Notify others in the room
      socket.to(documentId).emit('user:joined', {
        userId: socket.user.userId,
        ...userInfo
      });

      // Send updated list of active users to everyone in the room
      const users = documentManager.getDocumentUsers(documentId);
      io.to(documentId).emit('document:users', users);

      console.log(`${userInfo.firstName} ${userInfo.lastName} joined document: ${documentId}`);
    } catch (error) {
      console.error('Error joining document:', error);
      socket.emit('error', { message: 'Failed to join document' });
    }
  });

  // Document shape events
  socket.on('shape:add', async (data) => {
    try {
      const shape = await documentManager.addShape(socket.currentDocument, {
        ...data,
        userId: socket.user.userId
      });

      // Broadcast to others in the document
      socket.to(socket.currentDocument).emit('shape:add', shape);
    } catch (error) {
      console.error('Error adding shape:', error);
      socket.emit('error', { message: 'Failed to add shape' });
    }
  });

  socket.on('shape:update', async (data) => {
    try {
      const { id, ...updates } = data;
      const shape = await documentManager.updateShape(socket.currentDocument, id, updates);

      // Broadcast to others in the document
      socket.to(socket.currentDocument).emit('shape:update', shape);
    } catch (error) {
      console.error('Error updating shape:', error);
      socket.emit('error', { message: 'Failed to update shape' });
    }
  });

  socket.on('shape:delete', async (data) => {
    try {
      const { id } = data;
      await documentManager.deleteShape(socket.currentDocument, id);

      // Broadcast to others in the document
      socket.to(socket.currentDocument).emit('shape:delete', { id });
    } catch (error) {
      console.error('Error deleting shape:', error);
      socket.emit('error', { message: 'Failed to delete shape' });
    }
  });

  socket.on('document:clear', async () => {
    try {
      await documentManager.clearDocument(socket.currentDocument);

      // Broadcast to everyone in the document
      io.to(socket.currentDocument).emit('document:clear', {
        userId: socket.user.userId,
        firstName: socket.user.firstName,
        lastName: socket.user.lastName
      });
    } catch (error) {
      console.error('Error clearing document:', error);
      socket.emit('error', { message: 'Failed to clear document' });
    }
  });

  // Join a canvas room (backward compatibility)
  socket.on('canvas:join', (canvasId) => {
    socket.join(canvasId);
    socket.currentCanvas = canvasId;

    const userFullName = `${socket.user.firstName} ${socket.user.lastName}`;

    // Add user to canvas
    canvasManager.addUser(canvasId, socket.user.userId, userFullName);

    // Send current canvas state to the newly joined user
    const canvasState = canvasManager.getCanvasState(canvasId);
    socket.emit('canvas:state', canvasState);

    // Notify others in the room
    socket.to(canvasId).emit('user:joined', {
      userId: socket.user.userId,
      firstName: socket.user.firstName,
      lastName: socket.user.lastName,
      email: socket.user.email
    });

    // Send updated list of active users to everyone in the room
    const users = canvasManager.getCanvasUsers(canvasId);
    io.to(canvasId).emit('canvas:users', users);

    console.log(`${userFullName} joined canvas: ${canvasId}`);
  });

  // Drawing events
  socket.on('draw:start', (data) => {
    const drawData = {
      ...data,
      userId: socket.user.userId,
      firstName: socket.user.firstName,
      lastName: socket.user.lastName,
      timestamp: Date.now()
    };

    socket.to(socket.currentDocument).emit('draw:start', drawData);
    canvasManager.addDrawEvent(socket.currentDocument, drawData);
  });

  socket.on('draw:move', (data) => {
    const drawData = {
      ...data,
      userId: socket.user.userId,
      timestamp: Date.now()
    };

    socket.to(socket.currentDocument).emit('draw:move', drawData);
  });

  socket.on('draw:end', (data) => {
    const drawData = {
      ...data,
      userId: socket.user.userId,
      timestamp: Date.now()
    };

    socket.to(socket.currentDocument).emit('draw:end', drawData);
  });

  // Cursor position
  socket.on('cursor:move', (data) => {
    socket.to(socket.currentDocument).emit('cursor:move', {
      userId: socket.user.userId,
      firstName: socket.user.firstName,
      lastName: socket.user.lastName,
      x: data.x,
      y: data.y
    });
  });

  // Chat messages
  socket.on('chat:message', (message) => {
    const chatMessage = {
      userId: socket.user.userId,
      firstName: socket.user.firstName,
      lastName: socket.user.lastName,
      message: message,
      timestamp: Date.now()
    };

    io.to(socket.currentDocument).emit('chat:message', chatMessage);
  });

  // Disconnection
  socket.on('disconnect', () => {
    const userFullName = `${socket.user.firstName} ${socket.user.lastName}`;
    console.log(`User disconnected: ${userFullName} (${socket.id})`);

    // Handle document disconnection
    if (socket.currentDocument) {
      socket.to(socket.currentDocument).emit('user:left', {
        userId: socket.user.userId,
        firstName: socket.user.firstName,
        lastName: socket.user.lastName
      });

      documentManager.removeUser(socket.currentDocument, socket.user.userId);

      // Send updated users list to everyone remaining in the room
      const users = documentManager.getDocumentUsers(socket.currentDocument);
      io.to(socket.currentDocument).emit('document:users', users);
    }

    // Handle canvas disconnection (backward compatibility)
    if (socket.currentCanvas) {
      socket.to(socket.currentCanvas).emit('user:left', {
        userId: socket.user.userId,
        firstName: socket.user.firstName,
        lastName: socket.user.lastName
      });

      canvasManager.removeUser(socket.currentCanvas, socket.user.userId);

      // Send updated users list to everyone remaining in the room
      const users = canvasManager.getCanvasUsers(socket.currentCanvas);
      io.to(socket.currentCanvas).emit('canvas:users', users);
    }
  });

  // Error handling
  socket.on('error', (error) => {
    const userFullName = `${socket.user.firstName} ${socket.user.lastName}`;
    console.error(`Socket error for user ${userFullName}:`, error);
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
