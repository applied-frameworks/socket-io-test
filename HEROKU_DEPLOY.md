# Heroku Deployment Guide

This guide will walk you through deploying your realtime canvas backend to Heroku from GitHub.

## Prerequisites

1. **Heroku Account**: Sign up at [heroku.com](https://heroku.com)
2. **GitHub Account**: Sign up at [github.com](https://github.com)
3. **Git**: Installed on your local machine
4. **Heroku CLI** (optional, but recommended): [Install Heroku CLI](https://devcenter.heroku.com/articles/heroku-cli)

## Step 1: Push Your Code to GitHub

1. Create a new repository on GitHub (e.g., `realtime-canvas-backend`)

2. Initialize git in your project folder:
```bash
git init
git add .
git commit -m "Initial commit - Socket.IO backend with auth"
```

3. Connect to your GitHub repository:
```bash
git remote add origin https://github.com/YOUR_USERNAME/realtime-canvas-backend.git
git branch -M main
git push -u origin main
```

## Step 2: Create Heroku App

### Option A: Using Heroku Dashboard (Easiest)

1. Go to [dashboard.heroku.com](https://dashboard.heroku.com)
2. Click "New" → "Create new app"
3. Choose a unique app name (e.g., `my-realtime-canvas`)
4. Select a region (US or Europe)
5. Click "Create app"

### Option B: Using Heroku CLI

```bash
heroku login
heroku create my-realtime-canvas
```

## Step 3: Configure Environment Variables

### Via Heroku Dashboard:

1. Go to your app in Heroku Dashboard
2. Click "Settings" tab
3. Click "Reveal Config Vars"
4. Add the following variables:

| Key | Value |
|-----|-------|
| `NODE_ENV` | `production` |
| `JWT_SECRET` | Generate using the command below |
| `CLIENT_URL` | Your frontend URL (or `*` for development) |

To generate a secure JWT secret:
```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

### Via Heroku CLI:

```bash
# Generate and set JWT secret
heroku config:set JWT_SECRET=$(node -e "console.log(require('crypto').randomBytes(32).toString('hex'))")

# Set other variables
heroku config:set NODE_ENV=production
heroku config:set CLIENT_URL=https://your-frontend-url.com

# View all config vars
heroku config
```

## Step 4: Connect GitHub to Heroku

1. In Heroku Dashboard, go to your app
2. Click the "Deploy" tab
3. Under "Deployment method", click "GitHub"
4. Click "Connect to GitHub" and authorize
5. Search for your repository name
6. Click "Connect"

## Step 5: Enable Automatic Deploys (Recommended)

1. Scroll down to "Automatic deploys" section
2. Select the branch you want to deploy (usually `main`)
3. Click "Enable Automatic Deploys"

Now, every time you push to your main branch, Heroku will automatically deploy!

## Step 6: Manual Deploy (First Time)

1. Scroll to "Manual deploy" section
2. Select the branch to deploy
3. Click "Deploy Branch"
4. Wait for the build to complete

## Step 7: Verify Deployment

1. **Open your app**:
```bash
heroku open
# Or click "Open app" in Heroku Dashboard
```

2. **Check health endpoint**:
Visit: `https://your-app-name.herokuapp.com/health`

You should see:
```json
{
  "status": "ok",
  "timestamp": "2024-01-01T00:00:00.000Z",
  "connections": 0
}
```

3. **View logs**:
```bash
heroku logs --tail
# Or view in Dashboard → More → View logs
```

## Step 8: Test Your API

### Register a user:
```bash
curl -X POST https://your-app-name.herokuapp.com/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{"username":"testuser","password":"testpass123"}'
```

### Login:
```bash
curl -X POST https://your-app-name.herokuapp.com/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username":"testuser","password":"testpass123"}'
```

## Step 9: Update Frontend

Update your frontend to connect to the Heroku backend:

```javascript
// Before
const BACKEND_URL = 'http://localhost:3000';

// After
const BACKEND_URL = 'https://your-app-name.herokuapp.com';
```

## Troubleshooting

### App crashes on startup

Check logs:
```bash
heroku logs --tail
```

Common issues:
- Missing environment variables (JWT_SECRET)
- Port binding (use `process.env.PORT`)
- Dependencies not installed (run `npm install`)

### Can't connect to Socket.IO

1. Check CORS settings - update CLIENT_URL:
```bash
heroku config:set CLIENT_URL=https://your-frontend-domain.com
```

2. Verify WebSocket support:
```bash
heroku labs:enable http-session-affinity
```

### Authentication fails

1. Check JWT_SECRET is set:
```bash
heroku config:get JWT_SECRET
```

2. Generate new secret if needed:
```bash
heroku config:set JWT_SECRET=$(node -e "console.log(require('crypto').randomBytes(32).toString('hex'))")
```

### Build fails

1. Check `package.json` has correct start script:
```json
"scripts": {
  "start": "node server.js"
}
```

2. Check Node version in `package.json`:
```json
"engines": {
  "node": "18.x"
}
```

3. Clear build cache:
```bash
heroku repo:purge_cache -a your-app-name
git commit --allow-empty -m "Rebuild"
git push heroku main
```

## Scaling (Optional)

### Check current dynos:
```bash
heroku ps
```

### Scale up:
```bash
heroku ps:scale web=2
```

### Upgrade dyno type:
Go to Dashboard → Resources → Change Dyno Type

## Monitoring

### View metrics:
Dashboard → Metrics tab

### Set up logging:
```bash
heroku addons:create papertrail
heroku addons:open papertrail
```

## Adding a Database (Future)

When ready to add persistent storage:

### PostgreSQL:
```bash
heroku addons:create heroku-postgresql:mini
heroku config:get DATABASE_URL
```

### MongoDB Atlas:
1. Create cluster at [mongodb.com/cloud/atlas](https://www.mongodb.com/cloud/atlas)
2. Get connection string
3. Set config var:
```bash
heroku config:set MONGODB_URI="your-connection-string"
```

## Continuous Deployment Workflow

1. Make changes locally
2. Test locally: `npm start`
3. Commit: `git commit -m "Your changes"`
4. Push: `git push origin main`
5. Heroku automatically deploys!
6. Verify: `heroku logs --tail`

## Environment-Specific Testing

### Test production build locally:
```bash
NODE_ENV=production npm start
```

### View production logs:
```bash
heroku logs --tail --app your-app-name
```

## Custom Domain (Optional)

1. Go to Dashboard → Settings
2. Scroll to "Domains"
3. Click "Add domain"
4. Follow DNS configuration instructions

## Cost Management

- **Free Dyno**: 550-1000 free hours/month
- **Eco Dyno**: $5/month for 1000 hours
- **Basic/Standard**: For production apps

View pricing: [heroku.com/pricing](https://www.heroku.com/pricing)

## Security Checklist

- ✅ JWT_SECRET is secure and not committed to git
- ✅ CORS is configured properly (not using `*` in production)
- ✅ Rate limiting is enabled
- ✅ Environment variables are set
- ✅ HTTPS is enforced (Heroku does this automatically)

## Next Steps

1. Set up a staging environment
2. Add database for persistence
3. Set up Redis for session management
4. Configure custom domain
5. Set up monitoring and alerts
6. Add CI/CD with GitHub Actions

## Useful Commands

```bash
# View app info
heroku info

# Open app in browser
heroku open

# View logs
heroku logs --tail

# Run commands on Heroku
heroku run node

# Restart app
heroku restart

# View environment variables
heroku config

# Access bash shell
heroku run bash
```

## Support

- [Heroku Dev Center](https://devcenter.heroku.com/)
- [Heroku Status](https://status.heroku.com/)
- [Heroku Support](https://help.heroku.com/)

Good luck with your deployment! 🚀
