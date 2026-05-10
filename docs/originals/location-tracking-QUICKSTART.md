# ⚡ Quick Start (5 Minutes)

If you just want to get the system running quickly:

## 1. Prerequisites
```bash
# Make sure you have Node.js 16+
node --version

# Make sure Docker is running
docker --version
```

## 2. Clone Repo
```bash
git clone <your-repo-url>
cd location-tracking-system
```

## 3. Start Infrastructure
```bash
docker-compose up -d
# Wait 10 seconds for services to start
```

## 4. Create Auth0 Account (5 mins)
Go to https://auth0.com/signup (free)
- Create app → Single Page App → React
- Copy Client ID and Domain
- Add Callback: `http://localhost:3000/auth/callback`

## 5. Configure Backend
```bash
cd backend
cp .env.example .env

# Edit .env:
# OAUTH_CLIENT_ID=YOUR_CLIENT_ID
# OAUTH_CLIENT_SECRET=YOUR_SECRET
# OAUTH_ISSUER=https://YOUR_DOMAIN.auth0.com
# JWT_SECRET=any_random_string

npm install
npm run dev
```

## 6. Configure Frontend (New Terminal)
```bash
cd frontend
cp .env.example .env.local

# Edit .env.local:
# VITE_OAUTH_CLIENT_ID=YOUR_CLIENT_ID
# VITE_OAUTH_ISSUER=https://YOUR_DOMAIN.auth0.com

npm install
npm run dev
```

## 7. Open Browser
- Go to http://localhost:3000
- Click Login
- Allow location permission
- See map with your location!

## 8. Test Multiple Users
- Open second browser window (private mode)
- Login with different Auth0 account
- See both users on map in real-time

## 9. Verify Kafka
- Visit http://localhost:8080
- See `location-updates` topic
- Watch messages flow in real-time

## Done! 🎉

You now have a fully working real-time location tracking system!

**Next Steps:**
- Read full README.md for architecture details
- Watch for Kafka messages in UI
- Check database: `psql` on localhost:5432
- Create your demo video
- Push to GitHub

**System is running:**
- Frontend: http://localhost:3000
- Backend: http://localhost:3001
- Kafka UI: http://localhost:8080
- Database: localhost:5432
