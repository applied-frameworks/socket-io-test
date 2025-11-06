# Realtime Collaborative Canvas Backend

A Socket.IO-based backend for realtime collaborative drawing with authentication.

## Features

- ✅ User authentication (register/login with JWT)
- ✅ Realtime drawing synchronization via Socket.IO
- ✅ Canvas state management
- ✅ User presence tracking
- ✅ Shape management (add, update, delete)
- ✅ Cursor tracking
- ✅ Chat functionality
- ✅ Rate limiting and security headers
- ✅ Heroku-ready deployment

## Tech Stack

- Node.js + Express
- Socket.IO for realtime communication
- JWT for authentication
- bcrypt for password hashing
- In-memory storage (easily replaceable with database)

## Quick Start

### Local Development

1. **Clone the repository**
```bash
git clone <your-repo-url>
cd realtime-canvas-backend
```

2. **Install dependencies**
```bash
npm install
```

3. **Set up environment variables**
```bash
cp .env.example .env
```

Edit `.env` and set your values:
```env
PORT=3000
NODE_ENV=development
JWT_SECRET=your-super-secret-key-here
CLIENT_URL=http://localhost:5173
```

**Important:** Generate a secure JWT secret:
```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

4. **Start the server**
```bash
npm start
# or for development with auto-reload
npm run dev
```

Server will be running at `http://localhost:3000`

## API Endpoints

### Authentication

#### Register
```http
POST /api/auth/register
Content-Type: application/json

{
  "username": "johndoe",
  "password": "securepassword",
  "email": "john@example.com"
}
```

Response:
```json
{
  "message": "User registered successfully",
  "token": "jwt-token-here",
  "user": {
    "id": "user_123",
    "username": "johndoe",
    "email": "john@example.com"
  }
}
```

#### Login
```http
POST /api/auth/login
Content-Type: application/json

{
  "username": "johndoe",
  "password": "securepassword"
}
```

Response:
```json
{
  "message": "Login successful",
  "token": "jwt-token-here",
  "user": {
    "id": "user_123",
    "username": "johndoe",
    "email": "john@example.com"
  }
}
```

#### Verify Token
```http
GET /api/auth/verify
Authorization: Bearer <jwt-token>
```

#### Get Current User
```http
GET /api/auth/me
Authorization: Bearer <jwt-token>
```

### Health Check
```http
GET /health
```

## Socket.IO Events

### Connection

Connect with authentication:
```javascript
const socket = io('http://localhost:3000', {
  auth: {
    token: 'your-jwt-token'
  }
});
```

### Client → Server Events

| Event | Data | Description |
|-------|------|-------------|
| `canvas:join` | `canvasId` | Join a specific canvas room |
| `draw:start` | `{ x, y, color, width }` | Start drawing |
| `draw:move` | `{ x, y }` | Continue drawing |
| `draw:end` | `{ }` | End drawing |
| `shape:add` | `{ type, x, y, width, height, color, ... }` | Add a shape |
| `shape:update` | `{ shapeId, ...updates }` | Update a shape |
| `shape:delete` | `{ shapeId }` | Delete a shape |
| `canvas:clear` | `{ }` | Clear the canvas |
| `cursor:move` | `{ x, y }` | Update cursor position |
| `chat:message` | `message` | Send a chat message |

### Server → Client Events

| Event | Data | Description |
|-------|------|-------------|
| `user:connected` | `{ userId, username }` | User successfully connected |
| `canvas:state` | `{ shapes, drawEvents, users }` | Current canvas state |
| `canvas:users` | `[{ userId, username }]` | List of users in canvas |
| `user:joined` | `{ userId, username }` | User joined canvas |
| `user:left` | `{ userId, username }` | User left canvas |
| `draw:start` | `{ x, y, color, userId, username }` | Another user started drawing |
| `draw:move` | `{ x, y, userId }` | Another user's drawing movement |
| `draw:end` | `{ userId }` | Another user ended drawing |
| `shape:add` | `{ ...shapeData }` | Shape added by another user |
| `shape:update` | `{ shapeId, ...updates }` | Shape updated |
| `shape:delete` | `{ shapeId }` | Shape deleted |
| `canvas:clear` | `{ userId, username }` | Canvas cleared |
| `cursor:move` | `{ userId, username, x, y }` | Another user's cursor moved |
| `chat:message` | `{ userId, username, message, timestamp }` | Chat message |

## Frontend Integration Example

```javascript
import io from 'socket.io-client';

// Login first
async function login(username, password) {
  const response = await fetch('http://localhost:3000/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password })
  });
  const data = await response.json();
  return data.token;
}

// Connect to Socket.IO
const token = await login('johndoe', 'password');
const socket = io('http://localhost:3000', {
  auth: { token }
});

// Handle connection
socket.on('user:connected', (data) => {
  console.log('Connected as:', data.username);
});

// Join a canvas
socket.emit('canvas:join', 'canvas-room-1');

// Receive canvas state
socket.on('canvas:state', (state) => {
  console.log('Canvas state:', state);
  // Render shapes and draw events
});

// Listen for drawing events
socket.on('draw:start', (data) => {
  console.log('User started drawing:', data);
});

socket.on('draw:move', (data) => {
  // Update drawing on canvas
});

// Send drawing events
canvas.addEventListener('mousedown', (e) => {
  socket.emit('draw:start', {
    x: e.clientX,
    y: e.clientY,
    color: '#000000',
    width: 2
  });
});

canvas.addEventListener('mousemove', (e) => {
  socket.emit('draw:move', {
    x: e.clientX,
    y: e.clientY
  });
});
```

## Deployment to Heroku

### Prerequisites
- Heroku CLI installed
- Git repository initialized

### Steps

1. **Create a Heroku app**
```bash
heroku create your-app-name
```

2. **Set environment variables**
```bash
heroku config:set JWT_SECRET=$(node -e "console.log(require('crypto').randomBytes(32).toString('hex'))")
heroku config:set NODE_ENV=production
heroku config:set CLIENT_URL=https://your-frontend-url.com
```

3. **Deploy from GitHub**

Option A: Automatic deployment (recommended)
- Go to your Heroku dashboard
- Select your app → Deploy tab
- Connect to GitHub
- Enable automatic deploys from your main branch

Option B: Manual deployment
```bash
git add .
git commit -m "Initial commit"
git push heroku main
```

4. **Verify deployment**
```bash
heroku logs --tail
heroku open
```

Your backend will be available at: `https://your-app-name.herokuapp.com`

### Post-Deployment

1. **Test the health endpoint**
```bash
curl https://your-app-name.herokuapp.com/health
```

2. **Update your frontend to use the Heroku URL**
```javascript
const socket = io('https://your-app-name.herokuapp.com', {
  auth: { token }
});
```

3. **Monitor logs**
```bash
heroku logs --tail
```

## Environment Variables

| Variable | Description | Required | Default |
|----------|-------------|----------|---------|
| `PORT` | Server port | No | 3000 |
| `NODE_ENV` | Environment | No | development |
| `JWT_SECRET` | JWT signing secret | Yes | - |
| `CLIENT_URL` | Frontend URL for CORS | No | * |

## Security Features

- ✅ JWT-based authentication
- ✅ Password hashing with bcrypt
- ✅ Rate limiting (100 requests/15min per IP)
- ✅ Helmet.js security headers
- ✅ CORS protection
- ✅ Socket.IO authentication middleware

## Future Enhancements

- [ ] Database integration (PostgreSQL/MongoDB)
- [ ] Redis for session storage and pub/sub
- [ ] Canvas persistence to cloud storage
- [ ] File upload for images
- [ ] AI integration for smart features
- [ ] Canvas versioning/history
- [ ] Export canvas to PNG/SVG
- [ ] Real-time collaboration analytics
- [ ] User roles and permissions

## Database Migration

To switch from in-memory storage to a database:

1. Install database driver:
```bash
npm install pg  # for PostgreSQL
# or
npm install mongodb  # for MongoDB
```

2. Update `services/userStore.js` and `services/canvasManager.js` with database queries

3. Add database connection in `server.js`

## Troubleshooting

### Socket.IO connection fails
- Check CORS settings in `server.js`
- Verify JWT token is valid
- Check CLIENT_URL environment variable

### Authentication errors
- Ensure JWT_SECRET is set in .env
- Verify token format: `Bearer <token>`
- Check token expiration (default: 7 days)

### Heroku deployment issues
- Check Heroku logs: `heroku logs --tail`
- Verify environment variables: `heroku config`
- Ensure Procfile is present

## License

MIT

## Support

For issues and questions, please open an issue on GitHub.
