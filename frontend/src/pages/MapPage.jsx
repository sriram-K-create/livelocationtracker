import React, { useState, useEffect, useRef } from 'react'
import { MapContainer, TileLayer, Marker, Popup, useMap } from 'react-leaflet'
import L from 'leaflet'
import { connectSocket, sendLocation, disconnectSocket } from '../util/socket'
import { startTracking, stopTracking, requestLocationPermission, getCurrentPosition } from '../util/geolocation'
import { getAccessToken, getUserClaims, logout as oidcLogout } from '../util/auth'
import '../styles/MapPage.css'

/**
 * MAP PAGE
 * 
 * Main page after user logs in
 * Shows Leaflet map with user markers
 * Handles location tracking and real-time updates
 * 
 * Flow:
 * 1. User is logged in (JWT token available)
 * 2. Request location permission
 * 3. Get initial location for map center
 * 4. Connect to Socket.IO with JWT
 * 5. Start continuous location tracking
 * 6. Every 10 seconds:
 *    a. Browser gets new GPS location
 *    b. Frontend sends via socket.emit('location', ...)
 *    c. Backend receives, publishes to Kafka
 *    d. Kafka consumers:
 *       - Socket consumer broadcasts to all clients
 *       - DB consumer stores in PostgreSQL
 *    e. This client receives location-update event
 *    f. Update marker on map
 * 7. See other users in real-time as they move
 * 
 * MARKERS:
 * - Blue marker: You (current user)
 * - Red markers: Other users
 */

// Create custom icons for markers
const currentUserIcon = L.icon({
  iconUrl: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-blue.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/0.7.7/images/marker-shadow.png',
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
  shadowSize: [41, 41]
})

const otherUserIcon = L.icon({
  iconUrl: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-red.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/0.7.7/images/marker-shadow.png',
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
  shadowSize: [41, 41]
})

// Default map center (Bangalore, India - can be anywhere)
const DEFAULT_CENTER = [12.9716, 77.5946]

/**
 * Map update component
 * 
 * Small component to update map center when user moves
 * Uses React-Leaflet's useMap hook
 */
function MapUpdater({ center }) {
  const map = useMap()
  useEffect(() => {
    if (center) {
      map.setView(center, 15)
    }
  }, [center, map])
  return null
}

function MapPage({ user, onLogout }) {
  const [locations, setLocations] = useState(new Map())  // userId → location data
  const [onlineUsers, setOnlineUsers] = useState(new Set())  // Set of online user IDs
  const [mapCenter, setMapCenter] = useState(DEFAULT_CENTER)
  const [tracking, setTracking] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const userClaimsRef = useRef(null)
  const currentUserIdRef = useRef(null)

  /**
   * INITIALIZATION
   * 
   * 1. Get user claims from OIDC token
   * 2. Request location permission
   * 3. Get initial location for map center
   * 4. Connect Socket.IO with JWT
   * 5. Start tracking location
   */
  useEffect(() => {
    const initializeMap = async () => {
      try {
        // Get user claims
        const claims = await getUserClaims()
        userClaimsRef.current = claims
        currentUserIdRef.current = claims.sub  // IMPORTANT: Use 'sub' not socket ID
        console.log('👤 Current user:', claims.email, `(${claims.sub})`)

        // Request location permission
        console.log('📍 Requesting location permission...')
        await requestLocationPermission()

        // Get initial position for map center
        console.log('📍 Getting initial location...')
        const position = await getCurrentPosition()
        setMapCenter([position.latitude, position.longitude])

        // Get JWT token
        const token = await getAccessToken()
        if (!token) {
          throw new Error('Failed to get access token')
        }

        // Connect Socket.IO
        console.log('🔌 Connecting to Socket.IO...')
        connectSocket(token, {
          profile: claims,
          // When other users' locations arrive
          onLocationUpdate: (data) => {
            console.log(`📍 Received location: ${data.email} at (${data.lat}, ${data.lng})`)
            
            // Add/update location in map
            setLocations(prev => new Map(prev).set(data.userId, {
              userId: data.userId,
              email: data.email,
              lat: data.lat,
              lng: data.lng,
              accuracy: data.accuracy,
              timestamp: data.timestamp
            }))

            // If it's my location (from Kafka), update map center
            if (data.userId === currentUserIdRef.current) {
              setMapCenter([data.lat, data.lng])
            }
          },

          // When user comes online
          onUserOnline: (data) => {
            console.log(`👤 User online: ${data.email}`)
            setOnlineUsers(prev => new Set(prev).add(data.userId))
          },

          // When user goes offline
          onUserOffline: (data) => {
            console.log(`👋 User offline: ${data.userId}`)
            setOnlineUsers(prev => {
              const newSet = new Set(prev)
              newSet.delete(data.userId)
              return newSet
            })
            // Remove from locations map
            setLocations(prev => {
              const newMap = new Map(prev)
              newMap.delete(data.userId)
              return newMap
            })
          }
        })

        // Start location tracking
        console.log('📍 Starting location tracking...')
        startTracking((location) => {
          // Send location to server every 10 seconds
          sendLocation(location.latitude, location.longitude, location.accuracy)
        }, 10000)  // 10 second interval

        setTracking(true)
        setLoading(false)
      } catch (err) {
        console.error('❌ Initialization error:', err)
        setError(err.message)
        setLoading(false)
      }
    }

    initializeMap()

    // Cleanup on unmount
    return () => {
      stopTracking()
      disconnectSocket()
    }
  }, [])

  const handleLogout = async () => {
    stopTracking()
    disconnectSocket()
    await oidcLogout()
  }

  if (loading) {
    return (
      <div className="map-container loading">
        <div className="loading-content">
          <div className="spinner"></div>
          <h2>Initializing map...</h2>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="map-container error">
        <div className="error-content">
          <h2>❌ Error</h2>
          <p>{error}</p>
          <button onClick={handleLogout}>Logout</button>
        </div>
      </div>
    )
  }

  return (
    <div className="map-container">
      <div className="map-header">
        <h1>📍 Live Location Tracker</h1>
        <div className="header-info">
          <span className="user-info">
            👤 {userClaimsRef.current?.name || userClaimsRef.current?.email}
          </span>
          <span className="tracking-status">
            {tracking ? '✅ Tracking Active' : '❌ Tracking Inactive'}
          </span>
          <span className="users-online">
            👥 {onlineUsers.size} user{onlineUsers.size !== 1 ? 's' : ''} online
          </span>
          <button onClick={handleLogout} className="logout-button">
            Logout
          </button>
        </div>
      </div>

      <MapContainer
        center={mapCenter}
        zoom={15}
        scrollWheelZoom={true}
        style={{ height: 'calc(100vh - 80px)', width: '100%' }}
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        
        <MapUpdater center={mapCenter} />

        {/* Render all user markers */}
        {Array.from(locations.values()).map((location) => (
          <Marker
            key={location.userId}
            position={[location.lat, location.lng]}
            icon={
              location.userId === currentUserIdRef.current
                ? currentUserIcon
                : otherUserIcon
            }
          >
            <Popup>
              <div className="popup-content">
                <strong>{location.email}</strong>
                <p>
                  Lat: {location.lat.toFixed(6)}<br />
                  Lng: {location.lng.toFixed(6)}<br />
                  Accuracy: {location.accuracy?.toFixed(0) || 'N/A'}m<br />
                  {location.userId === currentUserIdRef.current && (
                    <em className="current-user-label">(You)</em>
                  )}
                </p>
              </div>
            </Popup>
          </Marker>
        ))}
      </MapContainer>

      {/* Legend */}
      <div className="map-legend">
        <div className="legend-item">
          <span className="legend-dot" style={{ backgroundColor: '#0080ff' }}></span>
          <span>You</span>
        </div>
        <div className="legend-item">
          <span className="legend-dot" style={{ backgroundColor: '#ff0000' }}></span>
          <span>Other Users</span>
        </div>
      </div>
    </div>
  )
}

export default MapPage
