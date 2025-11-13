require('dotenv').config();
const fastify = require('fastify')({
  logger: true,
  trustProxy: 1
});
const path = require('path');
const fastifyCors = require('@fastify/cors');
const fastifyHelmet = require('@fastify/helmet');
const fastifyRateLimit = require('@fastify/rate-limit');
const fastifyStatic = require('@fastify/static');
const fastifyWebsocket = require('@fastify/websocket');

// Yjs imports
const Y = require('yjs');
const { LeveldbPersistence } = require('y-leveldb');
const syncProtocol = require('y-protocols/sync');
const awarenessProtocol = require('y-protocols/awareness');
const encoding = require('lib0/encoding');
const decoding = require('lib0/decoding');
const map = require('lib0/map');

// App imports
const authRoutes = require('./routes/fastify-auth');
const documentRoutes = require('./routes/fastify-documents');

// CORS origin configuration
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

// Register plugins
async function registerPlugins() {
  // CORS
  await fastify.register(fastifyCors, {
    origin: corsOrigin,
    credentials: true
  });

  // Security headers
  await fastify.register(fastifyHelmet, {
    global: true,
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
  });

  // Rate limiting (disabled for local development and testing)
  if (process.env.NODE_ENV !== 'test' && process.env.NODE_ENV !== 'development') {
    await fastify.register(fastifyRateLimit, {
      max: 100,
      timeWindow: '15 minutes'
    });
  }

  // WebSocket support
  await fastify.register(fastifyWebsocket);

  // Static files
  if (process.env.NODE_ENV === 'production' || process.env.NODE_ENV === 'staging') {
    const clientBuildPath = path.join(__dirname, 'client', 'dist');
    await fastify.register(fastifyStatic, {
      root: clientBuildPath,
      prefix: '/'
    });
  }

  // Serve public folder
  await fastify.register(fastifyStatic, {
    root: path.join(__dirname, 'public'),
    prefix: '/public/',
    decorateReply: false
  });
}

// Initialize Yjs persistence
const yjsPersistence = new LeveldbPersistence('./yjs-storage');

// Health check endpoint
fastify.get('/health', async (request, reply) => {
  return {
    status: 'ok',
    timestamp: new Date().toISOString()
  };
});

// API Routes
fastify.register(authRoutes, { prefix: '/api/auth' });
fastify.register(documentRoutes, { prefix: '/api/documents' });

// Store for Yjs documents
const docs = new Map();

// Get or create a Y.Doc for a document
function getYDoc(documentId) {
  let doc = docs.get(documentId);
  if (!doc) {
    doc = new Y.Doc();
    docs.set(documentId, doc);

    // Bind to persistence
    yjsPersistence.bindState(documentId, doc).then(() => {
      console.log(`Loaded document ${documentId} from persistence`);
    });
  }
  return doc;
}

// Yjs WebSocket endpoint
fastify.register(async function (fastify) {
  fastify.get('/yjs/:documentId', { websocket: true }, (connection, req) => {
    const documentId = req.params.documentId;
    const ws = connection.socket;

    console.log(`Yjs WebSocket connection for document: ${documentId}`);

    // Get or create Y.Doc
    const ydoc = getYDoc(documentId);

    // Create awareness instance if not exists
    if (!ydoc.awareness) {
      ydoc.awareness = new awarenessProtocol.Awareness(ydoc);
    }

    // Handle incoming messages
    ws.on('message', (message) => {
      try {
        const uint8Array = new Uint8Array(message);
        const decoder = decoding.createDecoder(uint8Array);
        const encoder = encoding.createEncoder();
        const messageType = decoding.readVarUint(decoder);

        switch (messageType) {
          case syncProtocol.messageYjsSyncStep1:
            encoding.writeVarUint(encoder, syncProtocol.messageYjsSyncStep2);
            syncProtocol.readSyncStep1(decoder, encoder, ydoc);
            if (encoding.length(encoder) > 1) {
              ws.send(encoding.toUint8Array(encoder));
            }
            break;

          case syncProtocol.messageYjsSyncStep2:
            syncProtocol.readSyncStep2(decoder, ydoc, null);
            break;

          case syncProtocol.messageYjsUpdate:
            syncProtocol.readUpdate(decoder, ydoc, null);
            break;

          case awarenessProtocol.messageAwareness:
            awarenessProtocol.applyAwarenessUpdate(
              ydoc.awareness,
              decoding.readVarUint8Array(decoder),
              null
            );
            break;
        }
      } catch (err) {
        console.error('Error handling Yjs message:', err);
      }
    });

    // Send sync step 1
    const encoder = encoding.createEncoder();
    encoding.writeVarUint(encoder, syncProtocol.messageYjsSyncStep1);
    syncProtocol.writeSyncStep1(encoder, ydoc);
    ws.send(encoding.toUint8Array(encoder));

    // Broadcast updates to other clients
    const updateHandler = (update, origin) => {
      if (origin !== ws && ws.readyState === 1) {
        const encoder = encoding.createEncoder();
        encoding.writeVarUint(encoder, syncProtocol.messageYjsUpdate);
        encoding.writeVarUint8Array(encoder, update);
        ws.send(encoding.toUint8Array(encoder));
      }
    };
    ydoc.on('update', updateHandler);

    // Broadcast awareness updates
    const awarenessChangeHandler = ({ added, updated, removed }, origin) => {
      const changedClients = added.concat(updated).concat(removed);
      const encoder = encoding.createEncoder();
      encoding.writeVarUint(encoder, awarenessProtocol.messageAwareness);
      encoding.writeVarUint8Array(
        encoder,
        awarenessProtocol.encodeAwarenessUpdate(ydoc.awareness, changedClients)
      );
      const message = encoding.toUint8Array(encoder);

      if (ws.readyState === 1) {
        ws.send(message);
      }
    };
    ydoc.awareness.on('change', awarenessChangeHandler);

    // Cleanup on close
    ws.on('close', () => {
      console.log(`Yjs WebSocket closed for document: ${documentId}`);
      ydoc.off('update', updateHandler);
      ydoc.awareness.off('change', awarenessChangeHandler);

      // Remove awareness state
      awarenessProtocol.removeAwarenessStates(
        ydoc.awareness,
        [ydoc.awareness.clientID],
        null
      );
    });
  });
});

// Catch-all for client-side routing (production/staging)
if (process.env.NODE_ENV === 'production' || process.env.NODE_ENV === 'staging') {
  fastify.setNotFoundHandler((request, reply) => {
    // Don't serve index.html for API routes
    if (request.url.startsWith('/api/') || request.url.startsWith('/yjs/')) {
      return reply.code(404).send({ error: 'Not found' });
    }

    // Serve index.html for client-side routing
    const clientBuildPath = path.join(__dirname, 'client', 'dist', 'index.html');
    reply.sendFile('index.html', path.join(__dirname, 'client', 'dist'));
  });
}

// Start server
async function start() {
  try {
    await registerPlugins();

    const PORT = process.env.PORT || 3000;
    await fastify.listen({ port: PORT, host: '0.0.0.0' });

    console.log(`Server running on port ${PORT}`);
    console.log(`Environment: ${process.env.NODE_ENV || 'development'}`);
  } catch (err) {
    fastify.log.error(err);
    process.exit(1);
  }
}

// Graceful shutdown
process.on('SIGTERM', async () => {
  console.log('SIGTERM signal received: closing HTTP server');
  await fastify.close();
  await yjsPersistence.destroy();
  console.log('HTTP server closed');
});

start();

module.exports = fastify;
