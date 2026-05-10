import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import './styles/App.css'

// Note: React.StrictMode is disabled because it causes the OIDC callback
// to run twice in development, leading to "code already used" errors from Keycloak.
// For production, consider enabling it with proper handling of side effects.
ReactDOM.createRoot(document.getElementById('root')).render(
  <App />
)
