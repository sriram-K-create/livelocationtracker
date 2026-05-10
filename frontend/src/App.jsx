import React, { useState, useEffect } from 'react'
import { getUser, logout } from './util/auth'
import LoginPage from './pages/LoginPage'
import CallbackPage from './pages/CallbackPage'
import MapPage from './pages/MapPage'
import './styles/App.css'

/**
 * APP COMPONENT
 * 
 * Main app router based on auth state
 * 
 * Routes:
 * /: Show login or map based on auth state
 * /auth/callback: Handle OIDC redirect
 * 
 * State management:
 * - user: Current logged-in user info
 * - loading: App loading state
 * - showMap: Whether to show map or login
 */

function App() {
  const [user, setUser] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  // Check if user is already logged in (on page load/refresh)
  useEffect(() => {
    const checkUser = async () => {
      try {
        const currentUser = await getUser()
        setUser(currentUser)
        console.log('User state:', currentUser ? '✅ Logged in' : '❌ Not logged in')
      } catch (err) {
        console.error('Error checking user:', err)
        setError(err.message)
      } finally {
        setLoading(false)
      }
    }

    checkUser()
  }, [])

  // Check if we're on callback page
  const isCallback = window.location.pathname === '/auth/callback'

  if (loading) {
    return (
      <div className="app-container loading">
        <div className="spinner"></div>
        <h2>Loading...</h2>
      </div>
    )
  }

  if (isCallback) {
    return <CallbackPage onSuccess={(user) => setUser(user)} />
  }

  if (error) {
    return (
      <div className="app-container error">
        <h2>Error</h2>
        <p>{error}</p>
      </div>
    )
  }

  // Not logged in: show login page
  if (!user) {
    return <LoginPage />
  }

  // Logged in: show map
  return (
    <MapPage
      user={user}
      onLogout={async () => {
        await logout()
        setUser(null)
      }}
    />
  )
}

export default App
