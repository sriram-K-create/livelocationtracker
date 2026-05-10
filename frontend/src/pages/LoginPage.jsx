import React from 'react'
import { login } from '../util/auth'
import '../styles/LoginPage.css'

/**
 * LOGIN PAGE
 * 
 * Simple login interface
 * Redirects to OIDC provider on button click
 * 
 * Flow:
 * 1. User clicks "Login with OIDC"
 * 2. login() function redirects to Auth0/other provider
 * 3. User logs in with email/password
 * 4. OIDC provider redirects back with code
 * 5. App handles callback and shows map
 */

function LoginPage() {
  const handleLogin = async () => {
    try {
      console.log('🔐 Initiating login...')
      login()
    } catch (error) {
      console.error('Login error:', error)
      alert(`Login failed: ${error.message}`)
    }
  }

  return (
    <div className="login-container">
      <div className="login-card">
        <h1>📍 Real-Time Location Tracker</h1>
        <p className="subtitle">
          Share your location and see others on the map
        </p>

        <div className="features">
          <div className="feature">
            <span className="icon">🔐</span>
            <p>Secure OIDC Authentication</p>
          </div>
          <div className="feature">
            <span className="icon">📡</span>
            <p>Real-Time Location Streaming</p>
          </div>
          <div className="feature">
            <span className="icon">🗺️</span>
            <p>Live Map with Markers</p>
          </div>
          <div className="feature">
            <span className="icon">⚡</span>
            <p>Powered by Kafka Event Streaming</p>
          </div>
        </div>

        <button
          onClick={handleLogin}
          className="login-button"
          aria-label="Login with OIDC provider"
        >
          🔐 Login
        </button>

        <div className="tech-stack">
          <h3>Tech Stack</h3>
          <ul>
            <li>✅ React + Leaflet (Frontend)</li>
            <li>✅ Socket.IO (Real-time)</li>
            <li>✅ Apache Kafka (Event Streaming)</li>
            <li>✅ Node.js + Express (Backend)</li>
            <li>✅ PostgreSQL (Database)</li>
            <li>✅ OIDC/OAuth 2.0 (Auth)</li>
          </ul>
        </div>

        <div className="info">
          <p>
            <strong>Data Privacy:</strong> Your location is stored on our server.
            You control location sharing via browser permissions.
          </p>
        </div>
      </div>
    </div>
  )
}

export default LoginPage
