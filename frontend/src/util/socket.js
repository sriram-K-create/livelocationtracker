import { io } from 'socket.io-client'

/**
 * SOCKET.IO CLIENT
 * 
 * Handles real-time WebSocket connection to backend
 * 
 * Connection Flow:
 * 1. Get JWT token from OIDC provider
 * 2. Connect to Socket.IO server with token
 * 3. Server verifies token (middleware)
 * 4. Connection authenticated, can now send location
 * 5. Listen for location-update events (other users)
 * 6. Send location every 10 seconds
 * 
 * WHY Socket.IO instead of raw WebSocket?
 * ✓ Automatic reconnection on disconnect
 * ✓ Fallback to polling if WebSocket unavailable
 * ✓ Heartbeat to detect dead connections
 * ✓ Built-in error handling
 * ✓ Rooms/namespaces for organizing events
 */

let socket = null

/**
 * Connect to Socket.IO server
 * 
 * @param {string} token - JWT token from OIDC provider
 * @param {function} onLocationUpdate - Callback when other users' locations arrive
 * @param {function} onUserOnline - Callback when user comes online
 * @param {function} onUserOffline - Callback when user goes offline
 */
export function connectSocket(token, { profile, onLocationUpdate, onUserOnline, onUserOffline }) {
  if (socket?.connected) {
    console.log('⚠️  Socket already connected')
    return socket
  }

  console.log('🔌 Connecting to Socket.IO server...')

  /**
   * Socket.IO client options
   */
  socket = io(import.meta.env.VITE_SOCKET_URL || 'http://localhost:3001', {
    // Authentication: Send token in connection request
    // Backend will verify this in socketAuth middleware
    auth: {
      token,  // This goes to socket.handshake.auth.token on server
      email: profile?.email,
      name: profile?.name
    },
    
    // Reconnection settings
    reconnection: true,
    reconnectionDelay: 1000,  // Start with 1 second
    reconnectionDelayMax: 5000,  // Max 5 seconds
    reconnectionAttempts: 10,  // Try 10 times then stop
    
    // Other settings
    transports: ['websocket', 'polling'],  // Use WebSocket primarily, fallback to polling
    upgrade: true,  // Allow upgrade from polling to WebSocket
    forceNew: false,
    autoConnect: true,
    ackTimeout: 10000
  })

  /**
   * EVENT: connect
   * 
   * Fired when socket successfully connects to server
   */
  socket.on('connect', () => {
    console.log('✅ Connected to Socket.IO server')
    console.log(`   Socket ID: ${socket.id}`)
  })

  /**
   * EVENT: location-update
   * 
   * Broadcast from server when ANY user's location changes
   * Other users' locations arrive here (including yours via Kafka!)
   * 
   * Data structure:
   * {
   *   userId: "auth0|123",
   *   email: "user@example.com",
   *   lat: 37.7749,
   *   lng: -122.4194,
   *   timestamp: 1234567890,
   *   accuracy: 5.0
   * }
   */
  socket.on('location-update', (data) => {
    console.log(`📍 Location update: ${data.email} at (${data.lat}, ${data.lng})`)
    if (onLocationUpdate) {
      onLocationUpdate(data)
    }
  })

  /**
   * EVENT: user-online
   * 
   * Someone just connected (including you on first connection)
   * Create a marker for them on the map
   */
  socket.on('user-online', (data) => {
    console.log(`👤 User online: ${data.email}`)
    if (onUserOnline) {
      onUserOnline(data)
    }
  })

  /**
   * EVENT: user-offline
   * 
   * Someone disconnected
   * Remove their marker from the map
   */
  socket.on('user-offline', (data) => {
    console.log(`👋 User offline: ${data.userId}`)
    if (onUserOffline) {
      onUserOffline(data)
    }
  })

  /**
   * EVENT: location-ack
   * 
   * Acknowledgement from server that location was received
   * Useful for latency monitoring
   */
  socket.on('location-ack', (data) => {
    const latency = Date.now() - data.timestamp
    console.log(`⏱️  Location acknowledged (latency: ${latency}ms)`)
  })

  /**
   * EVENT: error
   * 
   * Socket error occurred
   */
  socket.on('error', (error) => {
    console.error('❌ Socket error:', error)
  })

  /**
   * EVENT: disconnect
   * 
   * Lost connection to server
   * Socket.IO will automatically attempt to reconnect
   */
  socket.on('disconnect', (reason) => {
    console.warn(`⚠️  Disconnected: ${reason}`)
    if (reason === 'io server disconnect') {
      // Server disconnected you, try to reconnect
      socket.connect()
    }
  })

  /**
   * EVENT: reconnect
   * 
   * Successfully reconnected after disconnect
   */
  socket.on('reconnect', () => {
    console.log('✅ Reconnected to server')
  })

  return socket
}

/**
 * Send location to server
 * 
 * Called periodically (every 10 seconds) by geolocation service
 * Location goes to Socket.IO → Kafka → consumers
 * 
 * @param {number} latitude
 * @param {number} longitude
 * @param {number} accuracy - GPS accuracy in meters
 */
export function sendLocation(latitude, longitude, accuracy = null) {
  if (!socket || !socket.connected) {
    console.warn('⚠️  Socket not connected, location not sent')
    return
  }

  const locationData = {
    lat: latitude,
    lng: longitude,
    accuracy,
    timestamp: Date.now()
  }

  console.log(`📤 Sending location: (${latitude}, ${longitude})`)
  socket.emit('location', locationData)
}

/**
 * Disconnect socket
 */
export function disconnectSocket() {
  if (socket) {
    socket.disconnect()
    socket = null
    console.log('🔌 Socket disconnected')
  }
}

/**
 * Get socket instance
 * 
 * Useful if you need to emit custom events
 */
export function getSocket() {
  return socket
}

/**
 * Check if socket is connected
 */
export function isSocketConnected() {
  return socket?.connected || false
}

export default {
  connectSocket,
  sendLocation,
  disconnectSocket,
  getSocket,
  isSocketConnected
}
