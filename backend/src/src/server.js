import express from 'express'
import { createServer } from 'http'
import { Server } from 'socket.io'
import jwt from 'jsonwebtoken'
import jwksClient from 'jwks-rsa'
import dotenv from 'dotenv'
import cors from 'cors'
import KafkaProducer from './kafka/producer.js'
import { initDatabase, getConnection } from './database/db.js'

dotenv.config()

const app = express()
const httpServer = createServer(app)
const io = new Server(httpServer, {
  cors: {
    origin: process.env.FRONTEND_URL || 'http://localhost:3000',
    credentials: true
  }
})

const auth0Issuer = process.env.OAUTH_ISSUER ? process.env.OAUTH_ISSUER.replace(/\/$/, '') : null
const auth0Audience = process.env.OAUTH_AUDIENCE || null
const auth0JwksClient = auth0Issuer
  ? jwksClient({
      jwksUri: `${auth0Issuer}/.well-known/jwks.json`,
      cache: true,
      rateLimit: true
    })
  : null
const legacyJwtSecret = process.env.JWT_SECRET || null

function verifyToken(token) {
  if (auth0JwksClient && auth0Audience) {
    return new Promise((resolve, reject) => {
      jwt.verify(
        token,
        (header, callback) => {
          if (!header.kid) {
            callback(new Error('Missing kid in token header'))
            return
          }

          auth0JwksClient.getSigningKey(header.kid, (error, key) => {
            if (error) {
              callback(error)
              return
            }

            callback(null, key.getPublicKey())
          })
        },
        {
          algorithms: ['RS256'],
          audience: auth0Audience,
          issuer: auth0Issuer ? [auth0Issuer, `${auth0Issuer}/`] : undefined
        },
        (error, decoded) => {
          if (error) {
            reject(error)
            return
          }

          resolve(decoded)
        }
      )
    })
  }

  if (legacyJwtSecret) {
    return Promise.resolve(jwt.verify(token, legacyJwtSecret))
  }

  return Promise.reject(new Error('No Auth0 or legacy JWT configuration available'))
}

// Middleware
app.use(cors())
app.use(express.json())

// Initialize Kafka producer
const kafkaProducer = new KafkaProducer()

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'healthy', timestamp: new Date().toISOString() })
})

/**
 * MIDDLEWARE: Socket.IO Authentication
 * 
 * WHY: We need to verify JWT token on every socket connection
 * HOW: Extract token from handshake, verify with JWT_SECRET, attach user to socket
 * This ensures only authenticated users can send location data
 */
const socketAuthMiddleware = async (socket, next) => {
  try {
    // Token comes from client via socket.connect({ auth: { token: ... } })
    const token = socket.handshake.auth.token

    if (!token) {
      return next(new Error('Authentication error: No token provided'))
    }

    // Verify Auth0 JWT signature and expiry, with legacy fallback if needed
    const decoded = await verifyToken(token)
    
    // Attach user info to socket object for later use
    socket.user = {
      id: decoded.sub,           // User ID from OIDC provider
      email: socket.handshake.auth.email || decoded.email || decoded.sub,
      name: socket.handshake.auth.name || decoded.name || null
    }

    console.log(`✅ User authenticated: ${socket.user.email}`)
    next()
  } catch (error) {
    console.error('❌ Socket auth error:', error.message)
    next(new Error(`Authentication error: ${error.message}`))
  }
}

// Apply authentication middleware
io.use(socketAuthMiddleware)

/**
 * SOCKET.IO EVENTS
 * 
 * Connection lifecycle:
 * 1. Client connects with token
 * 2. Server verifies token (middleware)
 * 3. Server emits 'user-online' to all clients
 * 4. Client sends 'location' updates periodically
 * 5. Server publishes to Kafka
 * 6. Kafka consumers broadcast back to clients
 * 7. On disconnect, emit 'user-offline'
 */
io.on('connection', (socket) => {
  const userId = socket.user.id
  const userEmail = socket.user.email

  console.log(`👤 New connection: ${userEmail} (ID: ${userId})`)

  // Notify all clients that a user is online
  io.emit('user-online', {
    userId,
    email: userEmail,
    timestamp: Date.now()
  })

  /**
   * EVENT: location
   * 
   * Client sends GPS coordinates at regular intervals (every 10 seconds)
   * Server validates and publishes to Kafka instead of direct DB write
   * 
   * WHY Kafka?
   * - Buffer for high-frequency updates (thousands of users * 360 updates/hour)
   * - Decouple real-time broadcast from database writes
   * - Allow multiple consumers (socket broadcaster + db writer)
   * - Enable replayability and analytics
   */
  socket.on('location', async (data) => {
    try {
      // Validate location data
      if (
        data.lat === undefined || 
        data.lng === undefined || 
        !data.timestamp
      ) {
        socket.emit('error', {
          message: 'Invalid location data: missing lat, lng, or timestamp'
        })
        return
      }

      // Validate coordinate ranges
      if (data.lat < -90 || data.lat > 90 || data.lng < -180 || data.lng > 180) {
        socket.emit('error', {
          message: 'Invalid coordinates'
        })
        return
      }

      // Create location event object
      const locationEvent = {
        userId,           // User ID (stable, not socket ID)
        email: userEmail,
        lat: parseFloat(data.lat),
        lng: parseFloat(data.lng),
        accuracy: data.accuracy || null,
        timestamp: data.timestamp,
        serverTimestamp: Date.now()
      }

      console.log(`📍 Location from ${userEmail}: (${locationEvent.lat}, ${locationEvent.lng})`)

      /**
       * PUBLISH TO KAFKA
       * 
       * Key benefits:
       * - Non-blocking: producer.send() is async
       * - Partitioning by userId ensures messages from same user stay ordered
       * - Multiple consumers can process same message independently
       */
      await kafkaProducer.send('location-updates', locationEvent)

      // Send acknowledgement to client
      socket.emit('location-ack', {
        timestamp: locationEvent.timestamp,
        serverTimestamp: locationEvent.serverTimestamp
      })
    } catch (error) {
      console.error('❌ Error processing location:', error.message)
      socket.emit('error', {
        message: 'Server error processing location'
      })
    }
  })

  /**
   * EVENT: disconnect
   * 
   * Fired when client closes connection or loses network
   * Notify all other clients to remove this user's marker
   */
  socket.on('disconnect', () => {
    console.log(`👋 User disconnected: ${userEmail}`)
    io.emit('user-offline', { userId })
  })

  /**
   * EVENT: error
   * 
   * Handle any socket errors
   */
  socket.on('error', (error) => {
    console.error(`Socket error for ${userEmail}:`, error)
  })
})

/**
 * KAFKA CONSUMER SETUP
 * 
 * We'll create consumers in separate files and start them here
 * This allows:
 * - Socket consumer: broadcasts location updates to connected clients
 * - DB consumer: persists location history (can be scaled independently)
 */
async function startConsumers() {
  console.log('🚀 Starting Kafka consumers...')
  
  // Import consumers dynamically
  const { startSocketConsumer } = await import('./kafka/consumer-socket.js')
  const { startDbConsumer } = await import('./kafka/consumer-db.js')

  // Start both consumers
  // They share the same topic but different consumer groups
  // This means both get all messages independently
  startSocketConsumer(io)
  startDbConsumer()
}

/**
 * STARTUP SEQUENCE
 * 
 * 1. Initialize database (create tables if needed)
 * 2. Start Kafka consumers
 * 3. Start HTTP server with Socket.IO
 */
async function start() {
  try {
    console.log('🔄 Initializing database...')
    await initDatabase()

    console.log('🔄 Starting Kafka consumers...')
    await startConsumers()

    const PORT = process.env.PORT || 3001
    const authMode = auth0JwksClient && auth0Audience
      ? `Auth0 JWKS (${auth0Audience})`
      : legacyJwtSecret
        ? 'Legacy JWT secret fallback'
        : '❌ MISSING'

    httpServer.listen(PORT, () => {
      console.log(`
✅ Server running at http://localhost:${PORT}

📊 Architecture:
  ├─ Socket.IO: ${process.env.FRONTEND_URL || 'http://localhost:3000'}
  ├─ Kafka: ${process.env.KAFKA_BROKERS}
  ├─ Database: ${process.env.DATABASE_URL}
  └─ Auth: ${authMode}

Ready to receive location updates!
      `)
    })
  } catch (error) {
    console.error('❌ Startup error:', error.message)
    process.exit(1)
  }
}

start()

// Graceful shutdown
process.on('SIGINT', async () => {
  console.log('\n⏹ Shutting down gracefully...')
  await kafkaProducer.disconnect()
  process.exit(0)
})
