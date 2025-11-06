# Quick Start Guide

Get your realtime canvas backend running locally in 5 minutes!

## Prerequisites

- Node.js 18+ installed
- npm or yarn
- A code editor

## Installation Steps

### 1. Install Dependencies

```bash
npm install
```

This will install:
- express (web server)
- socket.io (realtime communication)
- bcrypt (password hashing)
- jsonwebtoken (JWT authentication)
- cors, helmet (security)
- express-rate-limit (rate limiting)

### 2. Set Up Environment Variables

Copy the example environment file:
```bash
cp .env.example .env
```

Edit `.env` and add your configuration:

```env
PORT=3000
NODE_ENV=development
JWT_SECRET=your-secret-key-here
CLIENT_URL=http://localhost:5173
```

**Generate a secure JWT secret:**
```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

Copy the output and paste it as your JWT_SECRET value.

### 3. Start the Server

```bash
npm start
```

You should see:
```
Server running on port 3000
Environment: development
```

### 4. Test the Backend

Open another terminal and test the health endpoint:

```bash
curl http://localhost:3000/health
```

Expected response:
```json
{
  "status": "ok",
  "timestamp": "2024-01-01T00:00:00.000Z",
  "connections": 0
}
```

### 5. Test Authentication

**Register a user:**
```bash
curl -X POST http://localhost:3000/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{"username":"testuser","password":"testpass123","email":"test@example.com"}'
```

**Login:**
```bash
curl -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username":"testuser","password":"testpass123"}'
```

Save the token from the response - you'll need it for authenticated requests!

### 6. Test with the Demo Client

Open `client-example.html` in your browser:

1. Open the file directly in Chrome/Firefox
2. Or use a simple HTTP server:
   ```bash
   # Python 3
   python -m http.server 8000
   
   # Node.js
   npx serve .
   ```
3. Open http://localhost:8000/client-example.html
4. Register or login
5. Start drawing!

## Project Structure

```
.
├── server.js                 # Main server file
├── package.json              # Dependencies
├── Procfile                  # Heroku deployment
├── .env.example             # Environment template
├── .gitignore               # Git ignore rules
│
├── middleware/
│   └── auth.js              # Authentication middleware
│
├── routes/
│   └── auth.js              # Authentication routes
│
├── services/
│   ├── userStore.js         # User management (in-memory)
│   └── canvasManager.js     # Canvas state management
│
├── client-example.html      # Demo frontend client
├── README.md                # Full documentation
└── HEROKU_DEPLOY.md        # Deployment guide
```

## Available Scripts

```bash
# Start server (production mode)
npm start

# Start with auto-reload (development)
npm run dev
```

Note: `npm run dev` requires nodemon. Install it:
```bash
npm install -D nodemon
```

## API Endpoints

### Authentication

- `POST /api/auth/register` - Register new user
- `POST /api/auth/login` - Login user
- `GET /api/auth/verify` - Verify JWT token
- `GET /api/auth/me` - Get current user info

### System

- `GET /health` - Health check endpoint

## Socket.IO Events

### Client → Server

- `canvas:join` - Join a canvas room
- `draw:start` - Start drawing
- `draw:move` - Drawing movement
- `draw:end` - End drawing
- `shape:add` - Add shape
- `shape:update` - Update shape
- `shape:delete` - Delete shape
- `canvas:clear` - Clear canvas
- `cursor:move` - Cursor position
- `chat:message` - Send chat message

### Server → Client

- `user:connected` - Connection successful
- `canvas:state` - Canvas state sync
- `canvas:users` - List of active users
- `user:joined` - User joined
- `user:left` - User left
- `draw:*` - Drawing events from others
- `shape:*` - Shape events from others
- `cursor:move` - Other user's cursor
- `chat:message` - Chat messages

## Common Issues

### Port already in use
```bash
# Find process using port 3000
lsof -i :3000
# Kill it
kill -9 <PID>
```

### JWT_SECRET not set
Make sure you created `.env` file and set JWT_SECRET

### Can't connect from frontend
Check CORS settings - CLIENT_URL in .env should match your frontend URL

### Socket.IO won't connect
1. Check token is valid
2. Verify backend URL in client
3. Check browser console for errors

## Next Steps

1. **Add a Database**: Replace in-memory storage with PostgreSQL or MongoDB
2. **Add Redis**: For session management and pub/sub
3. **Deploy to Heroku**: Follow HEROKU_DEPLOY.md
4. **Build Frontend**: Create a proper React/Vue frontend
5. **Add AI Features**: Integrate Claude API for smart features

## Development Tips

### Enable Debug Logging

```bash
DEBUG=* npm start
```

### Test with Multiple Clients

Open multiple browser tabs with the demo client to test realtime sync

### Monitor Socket Connections

Check the health endpoint to see connection count:
```bash
curl http://localhost:3000/health
```

### View Server Logs

Server logs show:
- User connections/disconnections
- Canvas joins
- Errors and warnings

## Security Notes

⚠️ **Important for Production:**

1. Never commit `.env` file to git
2. Use strong JWT_SECRET (32+ random characters)
3. Enable HTTPS in production
4. Set proper CORS (don't use `*`)
5. Add rate limiting (already included)
6. Use environment variables for all secrets

## Getting Help

- Check README.md for full documentation
- See HEROKU_DEPLOY.md for deployment
- Review code comments in server.js

## Resources

- [Socket.IO Documentation](https://socket.io/docs/)
- [Express.js Guide](https://expressjs.com/)
- [JWT Best Practices](https://jwt.io/introduction)
- [Node.js Security](https://nodejs.org/en/docs/guides/security/)

Happy coding! 🚀
