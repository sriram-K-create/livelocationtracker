import React, { useEffect, useState } from 'react'
import { handleCallback } from '../util/auth'

/**
 * CALLBACK PAGE
 * 
 * Handles redirect from OIDC provider after user logs in
 * 
 * Flow:
 * 1. User logs in at OIDC provider (Auth0, etc.)
 * 2. OIDC provider redirects to this page with ?code=...&state=...
 * 3. handleCallback() exchanges code for tokens
 * 4. Tokens stored in localStorage
 * 5. Redirect to home page (shows map)
 * 
 * This happens automatically, user just sees a loading screen briefly
 */

function CallbackPage({ onSuccess }) {
  const [error, setError] = useState(null)
  const [processing, setProcessing] = useState(true)

  useEffect(() => {
    let mounted = true
    
    const processCallback = async () => {
      try {
        console.log('🔄 Processing OIDC callback...')
        const user = await handleCallback()
        
        if (!mounted) return
        
        console.log('✅ User logged in:', user.profile.email)
        setProcessing(false)
        
        // Redirect to home page
        window.location.href = '/'
      } catch (err) {
        if (!mounted) return
        
        console.error('❌ Callback error:', err)
        setError(err.message)
        setProcessing(false)
      }
    }

    processCallback()
    
    return () => {
      mounted = false
    }
  }, [])

  if (processing) {
    return (
      <div style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        height: '100vh',
        fontFamily: 'sans-serif'
      }}>
        <div className="spinner"></div>
        <h2>Processing login...</h2>
      </div>
    )
  }

  if (error) {
    return (
      <div style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        height: '100vh',
        fontFamily: 'sans-serif',
        padding: '20px'
      }}>
        <h2>❌ Login Failed</h2>
        <p style={{ color: 'red', marginTop: '10px' }}>{error}</p>
        <button
          onClick={() => window.location.href = '/'}
          style={{
            marginTop: '20px',
            padding: '10px 20px',
            fontSize: '16px',
            cursor: 'pointer'
          }}
        >
          Go Back
        </button>
      </div>
    )
  }

  return null
}

export default CallbackPage
