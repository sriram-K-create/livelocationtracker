import { UserManager, WebStorageStateStore } from 'oidc-client-ts'

/**
 * OIDC Configuration
 * 
 * OIDC (OpenID Connect) is built on top of OAuth 2.0
 * It adds an identity layer on top of OAuth 2.0's authorization framework
 * 
 * Flow:
 * 1. User clicks "Login"
 * 2. Browser redirects to Auth0 login page
 * 3. User enters email/password
 * 4. Auth0 redirects back with authorization code
 * 5. Frontend exchanges code for tokens (ID token + Access token)
 * 6. ID token contains user info (sub, email, name)
 * 7. We use this to authenticate socket connections
 * 
 * Benefits:
 * ✓ No password stored in our database
 * ✓ Single sign-on across multiple apps
 * ✓ Works with Google, GitHub, Facebook logins
 * ✓ Industry standard security
 */

const oidcConfig = {
  // Authority: The OIDC provider URL
  authority: 'http://localhost:8081/realms/location-tracker',
  
  // client_id: Identifies our application to the OIDC provider
  client_id: 'location-tracker-spa',
  
  // Redirect URI: Where Auth0 sends user back after login
  redirect_uri: `${window.location.origin}/auth/callback`,
  
  // Post-logout redirect: Where to go after logout
  post_logout_redirect_uri: window.location.origin,
  
  // Response type: 'code' = Authorization Code Flow (most secure)
  response_type: 'code',
  
  // Scopes: What user info we're requesting
  // Note: Keycloak realm may not have all standard scopes configured
  scope: 'openid',
  
  // Where to store tokens (localStorage)
  stateStore: new WebStorageStateStore({ store: window.localStorage })
}

// Create UserManager instance
// This handles the OIDC flow
export const userManager = new UserManager(oidcConfig)

/**
 * Get current user
 * 
 * Checks if user is logged in and token is still valid
 * If token expired, tries to refresh it
 * 
 * Returns user object with:
 * - access_token: Token to send to backend
 * - id_token: Contains user claims (sub, email, name)
 * - profile: { sub, email, name, ... }
 */
export async function getUser() {
  try {
    const user = await userManager.getUser()
    
    // User is logged in and token is valid
    if (user && !user.expired) {
      return user
    }
    
    // Token expired, try to refresh
    if (user && user.expired) {
      try {
        const refreshedUser = await userManager.signinSilent()
        return refreshedUser
      } catch (error) {
        console.error('Failed to refresh token:', error)
        return null
      }
    }
    
    // Not logged in
    return null
  } catch (error) {
    console.error('Error getting user:', error)
    return null
  }
}

/**
 * Login: Redirect to OIDC provider
 * 
 * This redirects the browser to Auth0's login page
 * After user logs in, Auth0 redirects back to redirect_uri
 */
export function login() {
  userManager.signinRedirect({
    state: 'login'
  })
}

/**
 * Handle callback after login
 * 
 * Auth0 redirects back with ?code=... parameter
 * We exchange this code for tokens
 * 
 * This is called after the user logs in and is redirected back
 */
export async function handleCallback() {
  try {
    const user = await userManager.signinRedirectCallback()
    console.log('✅ Login successful:', user.profile.email)
    return user
  } catch (error) {
    console.error('❌ Login callback error:', error)
    throw error
  }
}

/**
 * Logout: Clear tokens and redirect
 */
export async function logout() {
  try {
    await userManager.signoutRedirect()
  } catch (error) {
    console.error('Logout error:', error)
    // Clear locally even if signoutRedirect fails
    await userManager.removeUser()
    window.location.href = '/'
  }
}

/**
 * Get access token
 * 
 * This token is sent to Socket.IO to authenticate the connection
 * Backend verifies the token using the OIDC provider's public key
 */
export async function getAccessToken() {
  const user = await getUser()
  return user?.access_token || null
}

/**
 * Get user claims
 * 
 * These come from the ID token and contain user info
 * (subject, email, name, etc.)
 */
export async function getUserClaims() {
  const user = await getUser()
  return user?.profile || null
}

export default userManager
