# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is a Socket.IO-based realtime collaborative canvas backend with JWT authentication. It enables multiple users to draw, add shapes, track cursors, and chat in realtime on shared canvases.

**Tech Stack**: Node.js, Express, Socket.IO, JWT, bcrypt, Prisma ORM

**Storage**: PostgreSQL (primary), supports 4 environments with zero code changes

## Environment Terminology

To avoid confusion, use these specific terms when discussing environments:

- **local** = Developer's local machine (PostgreSQL via Docker)
- **dev** = AWS Elastic Beanstalk development environment (PostgreSQL on AWS RDS)
- **staging** = AWS Elastic Beanstalk staging environment (PostgreSQL on AWS RDS)
- **prod** = AWS Elastic Beanstalk production environment (PostgreSQL on AWS RDS)

**Environments**:
1. **local** (PostgreSQL via Docker - recommended for production parity)
2. **dev** (PostgreSQL on AWS RDS)
3. **staging** (PostgreSQL on AWS RDS)
4. **prod** (PostgreSQL on AWS RDS)

## Development Commands

### Prerequisites
This project requires Node.js 22.x. If using nvm:
```bash
nvm use 22           # Switch to Node 22
```

### Running the Application
```bash
npm install                # Install dependencies
docker compose up -d       # Start PostgreSQL (first time setup)
npm run db:migrate:dev     # Apply database migrations
npm start                  # Start production server + client
npm run dev                # Start with nodemon (auto-reload) + client
```

### Database Commands
```bash
# Migration Commands
npm run db:migrate:dev     # Create & apply new migration (local only)
npm run db:migrate:deploy  # Apply pending migrations (dev/staging/prod)
npm run db:migrate:status  # Check migration status

# Utility Commands
npm run db:studio          # Open Prisma Studio (database GUI)
npm run db:generate        # Regenerate Prisma Client
npm run db:reset           # Reset database with migrations
npm run db:seed            # Seed database with test users

# Prototyping Only (DO NOT use in dev/staging/prod)
npm run db:push            # Push schema without migrations
```

### Database Seeding
The project includes a seed file (`prisma/seed.js`) that creates test users for development and testing:

**Test Users:**
- Admin: `admin` / `admin`
- User1: `user1` / `user1`
- User2: `user2` / `user2`

**Usage:**
```bash
npm run db:seed      # Create test users (idempotent - safe to run multiple times)
npx prisma db seed   # Alternative command
```

The seed script is **idempotent** - it checks if each user exists before creating them, so it's safe to run multiple times without duplicating data or affecting existing users.

### Testing Commands

**IMPORTANT**: UI tests require both the backend server (port 3000) and frontend client (port 8000) to be running.

```bash
# Start both servers before running tests (required for UI tests)
npm run dev          # In a separate terminal - starts backend + frontend

# Run all tests (API + UI)
npm test             # Runs all Playwright tests
npx playwright test  # Alternative command

# Run tests with UI mode
npm run test:ui      # Interactive test runner

# View test report
npm run test:report  # Open HTML test report
```

**Test Suites:**
- **API Tests** (`tests/auth.spec.js`): Authentication endpoints - can run without servers
- **UI Tests** (`tests/ui-auth-flow.spec.js`): Full signup/login flow - **requires servers running**

**Running Tests Workflow:**
1. Ensure database is set up: `npm run db:migrate:dev`
2. Start dev servers: `npm run dev` (in separate terminal)
3. Wait for servers to be ready (backend on port 3000, frontend on port 8000)
4. Run tests: `npm test`

### Environment Setup

**Local Environment Setup (Docker + PostgreSQL)**:
```bash
# 1. Copy .env.example to .env
cp .env.example .env

# 2. Edit .env and uncomment the PostgreSQL Docker option:
DATABASE_URL="postgresql://postgres:postgres@localhost:5432/canvas_dev?schema=public"

# 3. Generate a secure JWT secret
node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"

# 4. Start PostgreSQL
docker compose up -d

# 5. Apply migrations
npm run db:migrate:dev
```

**Local Environment Variables** (`.env`):
```bash
PORT=3000
JWT_SECRET=<generated-secret-from-step-3>
NODE_ENV=development
CLIENT_URL=http://localhost:8000
DATABASE_URL="postgresql://postgres:postgres@localhost:5432/canvas_dev?schema=public"
```

### Health Check
```bash
curl http://localhost:3000/health  # Verify backend server is running
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

### Data Management (Prisma + Hybrid Caching)

**Database Schema** (`prisma/schema.prisma`):
- **User**: Authentication and user data (persisted)
- **Canvas**: Canvas metadata (persisted)
- **Shape**: Persistent shapes on canvas (persisted)
- **DrawEvent**: Freehand drawing events, kept last 1000 (persisted)
- **CanvasUser**: Join table for tracking active users (not used, active users kept in-memory)

**User Store** (`services/userStore.js`):
- All methods are now `async` and use Prisma
- Methods: `createUser()`, `getUserById()`, `getUserByUsername()`, `updateLastLogin()`
- IDs generated by Prisma using `cuid()`

**Canvas Manager** (`services/canvasManager.js`) - Hybrid Approach:
- **Persisted**: Shapes, canvas metadata, draw events (buffered)
- **In-Memory**: Active users (cleared on restart), draw event buffer
- Draw events buffered in memory, flushed every 50 events or 10 seconds
- Automatic cleanup: canvases with no users for 24h are deleted (runs hourly)
- Methods are now `async`: `getCanvasState()`, `addShape()`, `updateShape()`, `deleteShape()`, `clearCanvas()`

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

This application can be deployed to multiple platforms. See detailed deployment guides in the `docs/` folder:

### AWS Elastic Beanstalk (Recommended)
- **Full guide**: [docs/AWS_DEPLOY.md](docs/AWS_DEPLOY.md)
- **GitHub Actions**: Automated deployment on push to `main` (`.github/workflows/deploy-aws.yml`)
- **Configuration**: See `.ebextensions/` and `.platform/` for Elastic Beanstalk settings
- **Database**: Supports AWS RDS PostgreSQL or SQLite
- **WebSocket**: Nginx configured for Socket.IO WebSocket upgrade

**Quick Setup:**
1. Set GitHub secrets: `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`
2. Create Elastic Beanstalk application: `socket-io-canvas`
3. Create environment: `socket-io-canvas-dev`
4. Configure environment variables (JWT_SECRET, DATABASE_URL, CLIENT_URL, NODE_ENV)
5. Push to `main` branch - GitHub Actions handles deployment


**Port**: Reads from `process.env.PORT` (dynamically assigned by platform)

## 4-Environment Database Strategy

This project uses PostgreSQL as the primary database with Prisma migrations for all environments. **Zero code changes** are needed when promoting through environments.

### Environment Workflow

```
local → Git → dev → staging → prod
```

**Key Principle**: The same `schema.prisma` and `prisma/migrations/` folder work across all environments. Only `DATABASE_URL` changes per environment.

### Environment Configurations

#### 1. local (PostgreSQL via Docker)
```bash
# .env
DATABASE_URL="postgresql://postgres:postgres@localhost:5432/canvas_dev?schema=public"

# Commands
docker compose up -d              # Start PostgreSQL
npm run db:migrate:dev            # Create/apply migrations
npm run db:seed                   # Seed test data
```

#### 2. dev (AWS RDS PostgreSQL)
```bash
# Environment variable in AWS Elastic Beanstalk
DATABASE_URL="postgresql://user:pass@dev-db.aws.com:5432/canvas_dev?schema=public"

# Deployment (automatic via GitHub Actions)
git push origin dev
# → Runs: npx prisma migrate deploy
```

#### 3. staging (AWS RDS PostgreSQL)
```bash
# Environment variable in AWS Elastic Beanstalk
DATABASE_URL="postgresql://user:pass@staging-db.aws.com:5432/canvas_staging?schema=public"

# Deployment
git push origin staging
# → Runs: npx prisma migrate deploy
```

#### 4. prod (AWS RDS PostgreSQL)
```bash
# Environment variable in AWS Elastic Beanstalk
DATABASE_URL="postgresql://user:pass@prod-db.aws.com:5432/canvas_prod?schema=public"

# Deployment
git push origin main
# → Runs: npx prisma migrate deploy
```

### Migration Workflow

**local (Creating Migrations)**:
```bash
# 1. Modify schema in prisma/schema.prisma
# 2. Create migration
npm run db:migrate:dev
# This creates a new migration file in prisma/migrations/

# 3. Commit and push
git add prisma/
git commit -m "Add new feature schema"
git push
```

**dev/staging/prod (Applying Migrations)**:
- Migrations are **automatically applied** during deployment
- The predeploy hook (`.platform/hooks/predeploy/01_database.sh`) runs `prisma migrate deploy`
- This applies all pending migrations safely without data loss

### Important Notes

- **Never edit migration files manually** - always generate via `prisma migrate dev`
- **Never use `db:push` in dev/staging/prod** - it bypasses migration history
- **Always test migrations in dev/staging** before prod
- **Migration files are committed to git** - they are the source of truth
- **Rollbacks**: Use `prisma migrate resolve` if needed (see Prisma docs)

### Schema Changes Best Practices

1. **Add new fields as optional** first, then make required in a second migration
2. **Never rename fields directly** - add new field, migrate data, drop old field
3. **Test with production-like data** in staging
4. **Coordinate with team** before making breaking changes

## Important Notes

- **Database**: PostgreSQL for all environments (local via Docker, dev/staging/prod via AWS RDS)
- **Migrations**: Use `db:migrate:dev` in local, `db:migrate:deploy` runs automatically in dev/staging/prod
- **Code Promotion**: Zero file changes needed - same codebase works across all 4 environments
- **Prisma Client**: Auto-generated after migrations - regenerate with `npm run db:generate` if needed
- **Testing**: UI tests require both backend (port 3000) and frontend (port 8000) servers running via `npm run dev`
- **Environment Variables**: JWT_SECRET and DATABASE_URL must be configured in all environments
- **Draw Events**: Persisted but limited to last 1000 per canvas
- **Active Users**: In-memory only (not persisted to database, cleared on restart)
- **Socket.IO Settings**: 25s ping interval, 60s timeout (adjust for network conditions)
- **Cleanup**: Canvases with no users for 24h deleted hourly - consider external cron in prod
