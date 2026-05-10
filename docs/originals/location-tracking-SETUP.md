# Setup & Deployment Guide

## Complete Step-by-Step Setup

### Step 1: Prerequisites Check

```bash
# Check Node.js version (need 16+)
node --version

# Check Docker
docker --version
docker-compose --version

# If missing, install:
# Node.js: https://nodejs.org/
# Docker: https://docs.docker.com/get-docker/
```

### Step 2: Clone Repository

```bash
git clone https://github.com/YOUR_USERNAME/location-tracking-system.git
cd location-tracking-system
```

### Step 3: Start Infrastructure (Docker)

```bash
# Start all services
docker-compose up -d

# Wait for services to be healthy
docker-compose ps

# Expected output:
# zookeeper     running
# kafka         running
# postgres      running
# redis         running
# kafka-ui      running
```

**Verify Kafka is Ready:**
```bash
# Test Kafka connectivity
docker exec kafka kafka-broker-api-versions.sh --bootstrap-server localhost:9092

# Visit Kafka UI
# http://localhost:8080
# Should show 1 broker, 0 topics (initially)
```

### Step 4: Setup Auth0 (OIDC Provider)

**Create Free Auth0 Account:**

1. Go to https://auth0.com/signup
2. Create account (choose free tier)
3. Create new application:
   - Name: "Location Tracker"
   - Type: "Single Page Application"
   - Technology: "React"
4. Copy credentials:
   - Domain: `xxxxx.auth0.com`
   - Client ID: `xxxxxxxxxxxxx`
5. Configure settings:
   - Allowed Callback URLs: `http://localhost:3000/auth/callback`
   - Allowed Logout URLs: `http://localhost:3000`
   - Allowed Web Origins: `http://localhost:3000`
6. Go to API settings (get Client Secret)
7. Save all credentials in notes

### Step 5: Configure Backend

```bash
cd backend

# Copy environment template
cp .env.example .env

# Edit .env with your values
nano .env  # or use your editor
```

**Fill in:**
```env
# Auth0 credentials
OAUTH_CLIENT_ID=your_client_id_from_auth0
OAUTH_CLIENT_SECRET=your_secret_from_auth0
OAUTH_ISSUER=https://YOUR_DOMAIN.auth0.com
OAUTH_AUDIENCE=https://your-api-identifier

# Backend config
PORT=3001
NODE_ENV=development
FRONTEND_URL=http://localhost:3000

# JWT fallback (optional if using Auth0)
JWT_SECRET=your_random_secret_key_here

# Kafka (Docker internal address)
KAFKA_BROKERS=localhost:9092

# Database (Docker)
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/location_tracker
```

**Generate JWT Secret:**
```bash
# Optional legacy fallback only
openssl rand -base64 32
# Copy output to JWT_SECRET
```

**Install Dependencies:**
```bash
npm install
```

**Verify Backend Setup:**
```bash
# Create Kafka topic manually (optional, auto-created)
docker exec kafka kafka-topics.sh \
  --create \
  --topic location-updates \
  --bootstrap-server localhost:9092 \
  --partitions 3 \
  --replication-factor 1 \
  --if-not-exists
```

### Step 6: Configure Frontend

```bash
cd ../frontend

# Copy environment template
cp .env.example .env.local

# Edit .env.local
nano .env.local
```

**Fill in:**
```env
VITE_SOCKET_URL=http://localhost:3001
VITE_OAUTH_CLIENT_ID=your_same_client_id
VITE_OAUTH_ISSUER=https://YOUR_DOMAIN.auth0.com
VITE_OAUTH_AUDIENCE=https://your-api-identifier
```

**Install Dependencies:**
```bash
npm install
```

### Step 7: Start Backend

```bash
cd backend

# Start with npm (dev mode with auto-reload)
npm run dev

# Expected output:
# ✅ Server running at http://localhost:3001
# ✅ Kafka Producer connected
# 🔌 Connecting Socket Consumer...
# 💾 DB Consumer listening...
```

Keep this terminal open, you'll see logs as you use the app.

### Step 8: Start Frontend (New Terminal)

```bash
cd frontend

npm run dev

# Expected output:
# VITE v4.x.x  ready in xxx ms
# ➜ Local:   http://localhost:3000/
```

### Step 9: Test the Application

1. **Open Browser**
   - http://localhost:3000

2. **Click Login**
   - Should redirect to Auth0
   - Enter your Auth0 account credentials
   - Should redirect back to map

3. **Allow Location Permission**
   - Browser should ask for location
   - Click "Allow"

4. **See Your Location on Map**
   - Map should show your location
   - Blue marker = you

5. **Check Backend Logs**
   - Should show:
   ```
   ✅ User authenticated: your-email@example.com
   📍 Location from user@example.com: (37.7749, -122.4194)
   📤 Published to Kafka: location-updates
   ```

6. **Check Kafka UI**
   - Visit http://localhost:8080
   - Should show "location-updates" topic
   - Click topic to see messages flowing

### Step 10: Create Demo with Multiple Users

**Terminal 1: Backend** (already running)
```bash
# Keep npm run dev running
```

**Terminal 2: Frontend** (already running)
```bash
# Keep npm run dev running at http://localhost:3000
```

**Browser Window 1: First User**
```
http://localhost:3000
- Login with first account
- Allow location
- You see map with your marker (blue)
```

**Browser Window 2: Second User** (or Private Window)
```
# In new private/incognito window or different browser
http://localhost:3000
- Login with different Auth0 account (create new Auth0 account if needed)
- Allow location
- You see map with both users' markers
```

**Test Real-Time Updates:**
1. In Browser Window 1, move the map
2. In Browser Window 2, your marker should update in real-time
3. Watch backend console for location events
4. Check Kafka UI for messages

## 📹 Creating Your Demo Video

### What You'll Record

**Duration:** 8-10 minutes  
**Quality:** At least 720p  
**Tools:** OBS Studio (free) or ScreenFlow (Mac) or Camtasia

### Recording Checklist

... (omitted in this backup) 
