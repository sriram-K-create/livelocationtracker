/**
 * GEOLOCATION SERVICE
 * 
 * Gets user's current GPS location using browser's Geolocation API
 * Starts continuous tracking (updates every 10 seconds by default)
 * 
 * Privacy Note:
 * - Browser asks for permission first
 * - User can deny location access
 * - Location data only leaves device if user explicitly grants permission
 * - Location is sent to your server, not to third parties
 */

let watchId = null
let locationCallback = null

/**
 * Request location permission
 * 
 * Browser shows a popup asking user to allow/deny location sharing
 * User must grant permission before location can be accessed
 * 
 * Possible outcomes:
 * - User clicks "Allow": Returns coordinates
 * - User clicks "Deny": Returns error with code = 1
 * - User dismisses: Returns error with code = 2
 */
export function requestLocationPermission() {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) {
      reject(new Error('Geolocation not supported by this browser'))
      return
    }

    // Get single location
    navigator.geolocation.getCurrentPosition(
      (position) => {
        console.log('✅ Location permission granted')
        resolve(position)
      },
      (error) => {
        switch (error.code) {
          case error.PERMISSION_DENIED:
            reject(new Error('Location permission denied by user'))
            break
          case error.POSITION_UNAVAILABLE:
            reject(new Error('Location information unavailable'))
            break
          case error.TIMEOUT:
            reject(new Error('Location request timed out'))
            break
          default:
            reject(new Error(`Location error: ${error.message}`))
        }
      },
      {
        enableHighAccuracy: true,  // Request high accuracy (uses GPS)
        timeout: 10000,  // Wait up to 10 seconds
        maximumAge: 0  // Don't use cached location
      }
    )
  })
}

/**
 * Start continuous location tracking
 * 
 * @param {function} callback - Called with { latitude, longitude, accuracy, timestamp }
 * @param {number} interval - Update interval in seconds (default: 10)
 * 
 * This is called when user is viewing the map
 * Sends updates every 10 seconds to Socket.IO
 * 
 * Flow:
 * 1. User grants location permission
 * 2. startTracking() called with callback
 * 3. Every 10 seconds, callback fired with new location
 * 4. Callback sends location via socket.emit('location', ...)
 * 5. Location goes to backend → Kafka → broadcast to other users
 */
export function startTracking(callback, interval = 10000) {
  if (watchId) {
    console.warn('⚠️  Tracking already started')
    return
  }

  if (!navigator.geolocation) {
    throw new Error('Geolocation not supported')
  }

  locationCallback = callback

  console.log(`📍 Starting location tracking (interval: ${interval}ms)`)

  // watchPosition continuously updates location at intervals
  // Unlike getCurrentPosition (one-time), this keeps updating
  watchId = navigator.geolocation.watchPosition(
    (position) => {
      const { latitude, longitude, accuracy } = position.coords

      console.log(`📍 Location update: (${latitude.toFixed(4)}, ${longitude.toFixed(4)}) ±${accuracy.toFixed(0)}m`)

      // Call user's callback with location data
      if (callback) {
        callback({
          latitude,
          longitude,
          accuracy,
          timestamp: position.timestamp,
          updatedAt: Date.now()
        })
      }
    },
    (error) => {
      console.error('❌ Tracking error:', error.message)
      // Don't stop tracking on error, keep trying
    },
    {
      enableHighAccuracy: true,  // Use GPS for better accuracy
      timeout: 5000,  // Timeout per position update
      maximumAge: 0  // Always get fresh position (not cached)
    }
  )
}

/**
 * Stop continuous location tracking
 * 
 * Call this when:
 * - User logs out
 * - User closes map
 * - Browser tab is closed/minimized
 */
export function stopTracking() {
  if (watchId !== null) {
    navigator.geolocation.clearWatch(watchId)
    watchId = null
    locationCallback = null
    console.log('🛑 Location tracking stopped')
  }
}

/**
 * Get current position once
 * 
 * Useful for getting initial location for map center
 */
export function getCurrentPosition() {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) {
      reject(new Error('Geolocation not supported'))
      return
    }

    navigator.geolocation.getCurrentPosition(
      (position) => {
        const { latitude, longitude, accuracy } = position.coords
        resolve({ latitude, longitude, accuracy })
      },
      (error) => {
        reject(new Error(`Failed to get current position: ${error.message}`))
      },
      {
        enableHighAccuracy: true,
        timeout: 10000
      }
    )
  })
}

/**
 * Check if tracking is active
 */
export function isTracking() {
  return watchId !== null
}

export default {
  requestLocationPermission,
  startTracking,
  stopTracking,
  getCurrentPosition,
  isTracking
}
