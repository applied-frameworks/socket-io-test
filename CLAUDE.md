# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is a Socket.IO-based realtime collaborative canvas backend with JWT authentication. It enables multiple users to draw, add shapes, track cursors, and chat in realtime on shared canvases.

**Tech Stack**: Node.js, Express, Socket.IO, JWT, bcrypt

**Storage**: In-memory Maps (designed to be replaced with database)

## Development Commands

### Running the Application
```bash
npm install          # Install dependencies
npm start            # Start production server
npm run dev          # Start with nodemon (auto-reload)
```

### Environment Setup
Create `.env` from `.env.example`:
```bash
PORT=3000
JWT_SECRET=your-super-secret-jwt-key-change-this-in-production
NODE_ENV=development
ALLOWED_ORIGINS=http://localhost:3000,http://localhost:5173
```

Generate a secure JWT secret:
```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

### Testing the Server
```bash
curl http://localhost:3000/health
```

## Architecture

### Authentication Flow
1. **User Registration/Login** (`routes/auth.js`):
   - Passwords hashed with bcrypt (10 rounds)
   - JWT tokens issued with 7-day expiration
   - Tokens contain `{ userId, username }` payload

2. **HTTP Routes** (`middleware/auth.js:authenticateToken`):
   - Bearer token in `Authorization` header
   - Token verified and user attached to `req.user`

3. **Socket.IO Connections** (`middleware/auth.js:authenticateSocket`):
   - Token passed in `socket.handshake.auth.token`
   - User attached to `socket.user` before connection accepted
   - Authentication required for all WebSocket connections

### Data Management (In-Memory)

**User Store** (`services/userStore.js`):
- Singleton class with two Maps: by userId and by username
- Methods: `createUser()`, `getUserById()`, `getUserByUsername()`, `updateLastLogin()`
- IDs generated as `user_${timestamp}_${random}`

**Canvas Manager** (`services/canvasManager.js`):
- Each canvas stored with: `{ shapes[], drawEvents[], users Map, timestamps }`
- Draw events limited to last 1000 to prevent memory bloat
- Automatic cleanup: canvases with no users for 24h are deleted (runs hourly)
- Methods: `getCanvasState()`, `addShape()`, `updateShape()`, `deleteShape()`, `clearCanvas()`
- Shape IDs: `shape_${timestamp}_${random}`

### Socket.IO Event Flow

**Connection Lifecycle** (`server.js:57-199`):
1. Client connects with JWT → `authenticateSocket` middleware verifies
2. Server emits `user:connected` with userId and username
3. Client emits `canvas:join` with canvasId
4. Server responds with full `canvas:state` and `canvas:users` list
5. Other users in room receive `user:joined` notification

**Event Routing Pattern**:
- Client events are received, enriched with `userId`, `username`, `timestamp`
- Events broadcast to room using `socket.to(socket.currentCanvas).emit()`
- State updates persisted via `canvasManager` methods
- Chat messages use `io.to()` (includes sender) vs `socket.to()` (excludes sender)

**Current Canvas Tracking**:
- `socket.currentCanvas` stores the active canvas ID per connection
- Used for routing events to correct room
- Cleaned up in disconnect handler

### Key Design Decisions

1. **In-Memory Storage Singleton Pattern**: Both `userStore` and `canvasManager` export singleton instances. When migrating to a database, these modules should be replaced with database access layers while maintaining the same interface.

2. **Draw Event Buffering**: Draw events (freehand drawing) are stored separately from shapes. Only the last 100 draw events are sent on join, while all shapes are sent. This prevents overwhelming new joiners with historical drawing data.

3. **Security Layers**:
   - Helmet.js for HTTP security headers
   - Rate limiting: 100 requests per 15 minutes per IP on `/api/*` routes
   - CORS configured via `CLIENT_URL` environment variable
   - JWT verification on both HTTP and WebSocket connections

4. **Graceful Shutdown**: SIGTERM handler closes server cleanly (important for Heroku deployments)

## Socket.IO Events Reference

### Client → Server
- `canvas:join` - Join canvas room and receive state
- `draw:start/move/end` - Freehand drawing events
- `shape:add/update/delete` - Shape manipulation
- `canvas:clear` - Clear all shapes and draw events
- `cursor:move` - Update user cursor position
- `chat:message` - Send chat message

### Server → Client
- `user:connected` - Confirmation of successful auth
- `canvas:state` - Full canvas data on join
- `canvas:users` - Active users list
- `user:joined/left` - User presence notifications
- All drawing/shape events broadcast to room participants

## Deployment

**Heroku**: Uses `Procfile` (`web: node server.js`)

Required config vars:
```bash
heroku config:set JWT_SECRET=<generated-secret>
heroku config:set NODE_ENV=production
heroku config:set CLIENT_URL=https://your-frontend-url.com
```

**Port**: Reads from `process.env.PORT` (Heroku dynamically assigns this)

## Database Migration Path

To replace in-memory storage with a database:

1. **Users**: Replace `services/userStore.js` with database model/queries
   - Keep same method signatures: `createUser()`, `getUserById()`, etc.
   - Update `routes/auth.js` to use async/await if not already

2. **Canvas Data**: Replace `services/canvasManager.js` with database layer
   - Consider separate tables/collections for canvases, shapes, draw_events
   - May need Redis pub/sub for multi-instance Socket.IO scaling
   - Keep `getCanvasState()` interface, paginate draw events if needed

3. **Add database connection**: Initialize in `server.js` before routes

## Important Notes

- JWT_SECRET must be set in production (no default)
- Draw events are intentionally ephemeral (only last 1000 kept)
- Socket.IO ping settings: 25s interval, 60s timeout (adjust for network conditions)
- The cleanup interval runs once per hour - consider moving to a separate cron job in production
