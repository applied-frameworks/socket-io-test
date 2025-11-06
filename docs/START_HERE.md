# 🎨 Realtime Collaborative Canvas Backend

Welcome! This is your complete Socket.IO backend for realtime collaborative drawing with authentication.

## 📚 Documentation Guide

Read the docs in this order:

### 1. Quick Start (5 minutes)
👉 **[QUICKSTART.md](QUICKSTART.md)** - Get running locally in 5 minutes

### 2. Project Overview (2 minutes)
👉 **[PROJECT_SUMMARY.md](PROJECT_SUMMARY.md)** - What you've got and how it works

### 3. Full Documentation (15 minutes)
👉 **[README.md](README.md)** - Complete API reference and usage guide

### 4. Deploy to Heroku (10 minutes)
👉 **[HEROKU_DEPLOY.md](HEROKU_DEPLOY.md)** - Step-by-step deployment from GitHub

### 5. AI Integration (Future)
👉 **[AI_INTEGRATION.md](AI_INTEGRATION.md)** - Add AI features with Claude API

## 🚀 Quick Commands

### Get Started Locally
```bash
npm install
cp .env.example .env
# Edit .env with your JWT_SECRET
npm start
```

### Deploy to Heroku
```bash
heroku create my-canvas-app
heroku config:set JWT_SECRET=$(node -e "console.log(require('crypto').randomBytes(32).toString('hex'))")
# Then connect GitHub in Heroku Dashboard
```

### Test the Backend
```bash
# Health check
curl http://localhost:3000/health

# Register user
curl -X POST http://localhost:3000/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{"username":"test","password":"test123"}'

# Or open client-example.html in browser
```

## 📁 Project Structure

```
.
├── START_HERE.md           ← You are here!
├── QUICKSTART.md           ← 5-minute setup guide
├── PROJECT_SUMMARY.md      ← Project overview
├── README.md               ← Full documentation
├── HEROKU_DEPLOY.md        ← Deployment guide
├── AI_INTEGRATION.md       ← AI features guide
│
├── server.js               ← Main server file
├── package.json            ← Dependencies
├── Procfile                ← Heroku config
├── .env.example            ← Environment template
│
├── middleware/
│   └── auth.js             ← Authentication
│
├── routes/
│   └── auth.js             ← Auth endpoints
│
├── services/
│   ├── userStore.js        ← User management
│   └── canvasManager.js    ← Canvas state
│
└── client-example.html     ← Test client
```

## ✨ What's Included

✅ JWT authentication (register, login, verify)
✅ Socket.IO realtime sync
✅ Drawing events (start, move, end)
✅ Shape management (add, update, delete)
✅ Canvas state management
✅ User presence tracking
✅ Cursor tracking
✅ Chat functionality
✅ Security (CORS, rate limiting, helmet)
✅ Heroku deployment ready
✅ Test client included

## 🎯 Key Features

### Authentication API
- `POST /api/auth/register` - Create account
- `POST /api/auth/login` - Get JWT token
- `GET /api/auth/verify` - Check token
- `GET /api/auth/me` - User info

### Socket.IO Events
**Send:**
- `canvas:join` - Join canvas room
- `draw:start`, `draw:move`, `draw:end` - Drawing
- `shape:add`, `shape:update`, `shape:delete` - Shapes
- `canvas:clear` - Clear canvas
- `cursor:move` - Cursor position

**Receive:**
- `user:connected` - Connection confirmed
- `canvas:state` - Full canvas state
- `canvas:users` - Active users
- All drawing/shape events from others

## 🛠 Technology Stack

- Node.js 18+
- Express.js (web server)
- Socket.IO 4.6+ (realtime)
- JWT + bcrypt (auth)
- Helmet + CORS (security)

## 🔧 Configuration

Required environment variables in `.env`:
```env
PORT=3000
NODE_ENV=development
JWT_SECRET=your-secure-random-key
CLIENT_URL=http://localhost:5173
```

Generate JWT_SECRET:
```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

## 🧪 Testing

### Test with cURL
```bash
# Register
curl -X POST http://localhost:3000/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{"username":"alice","password":"password123"}'

# Login
curl -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username":"alice","password":"password123"}'
```

### Test with Browser
Open `client-example.html` to test the full flow:
1. Register/Login
2. Join canvas
3. Draw and see realtime sync
4. Open multiple tabs to test collaboration

## 📦 Files You Need

### Core Files (Required)
- ✅ `server.js`
- ✅ `package.json`
- ✅ `Procfile`
- ✅ `.env` (create from .env.example)

### Application Code (Required)
- ✅ `middleware/auth.js`
- ✅ `routes/auth.js`
- ✅ `services/userStore.js`
- ✅ `services/canvasManager.js`

### Git Files (Required)
- ✅ `.gitignore`

### Documentation (Optional but helpful)
- 📖 All the .md files

### Testing (Optional)
- 🧪 `client-example.html`

## 🚢 Deployment Checklist

Before deploying:
- [ ] Generate secure JWT_SECRET
- [ ] Set up GitHub repository
- [ ] Create Heroku app
- [ ] Set environment variables
- [ ] Test locally first
- [ ] Enable automatic deploys
- [ ] Test deployed app
- [ ] Update frontend with backend URL

## 🔐 Security Notes

⚠️ **Important:**
- Never commit `.env` to git
- Use strong JWT_SECRET (32+ chars)
- Set proper CORS in production (not `*`)
- Enable HTTPS (Heroku does this automatically)
- Review rate limiting settings

## 🎓 Learning Path

**Day 1: Setup**
1. Read QUICKSTART.md
2. Get it running locally
3. Test with client-example.html

**Day 2: Understanding**
1. Read PROJECT_SUMMARY.md
2. Explore the code
3. Read README.md API reference

**Day 3: Deploy**
1. Push to GitHub
2. Follow HEROKU_DEPLOY.md
3. Deploy and test

**Day 4+: Build**
1. Create your frontend
2. Add database (PostgreSQL/MongoDB)
3. Consider AI features (AI_INTEGRATION.md)

## 🔮 Future Enhancements

Ready when you are:
- [ ] Database integration
- [ ] Redis for scaling
- [ ] File uploads
- [ ] Canvas export (PNG/SVG)
- [ ] AI features
- [ ] Undo/redo
- [ ] User roles/permissions
- [ ] Analytics

## 💡 Tips

**For Development:**
- Use `npm run dev` with nodemon for auto-reload
- Check `health` endpoint frequently
- Monitor server logs
- Test with multiple browser tabs

**For Production:**
- Use environment variables for all config
- Monitor logs with `heroku logs --tail`
- Set up error tracking (Sentry)
- Add database for persistence

**For Scaling:**
- Add Redis for pub/sub
- Use PostgreSQL for storage
- Enable Heroku auto-scaling
- Monitor performance

## 🆘 Need Help?

**Common Issues:**
- Port in use? Check with `lsof -i :3000`
- Auth failing? Check JWT_SECRET is set
- Socket.IO not connecting? Check CORS settings
- Deployment failing? Check Heroku logs

**Resources:**
- [Socket.IO Docs](https://socket.io/docs/)
- [Express Guide](https://expressjs.com/)
- [Heroku Docs](https://devcenter.heroku.com/)
- [JWT.io](https://jwt.io/introduction)

## ✅ Next Steps

1. **Start Here:** Read QUICKSTART.md (5 min)
2. **Get Running:** Follow setup steps (5 min)
3. **Test It:** Open client-example.html (2 min)
4. **Deploy:** Follow HEROKU_DEPLOY.md (10 min)
5. **Build:** Create your frontend!

---

Ready to build something awesome! 🚀

Questions? Check the other .md files for detailed info.
