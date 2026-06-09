import { createContext, useContext, useState, useEffect, useCallback, useMemo, useRef } from 'react'
import { signInWithPopup } from 'firebase/auth'
import { auth as firebaseAuth, googleProvider, isFirebaseConfigured } from '../config/firebase'
import { API_CONFIG, AUTH_CONFIG, ENV } from '../config'
import { fetchWithRateLimit } from '../services/api'
import { safeJSONParse } from '../utils/imageUtils'
import { safeSetItem as safePut } from '../utils/safeStorage'
import { normalizeMembership } from '../utils/membership'
import logger from '../utils/logger'

const AuthContext = createContext(null)

export const useAuth = () => {
  const context = useContext(AuthContext)
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider')
  }
  return context
}

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null)
  const [token, setToken] = useState(localStorage.getItem(AUTH_CONFIG.tokenKey))
  const [isLoading, setIsLoading] = useState(true)
  const profileFetchRef = useRef({ inFlight: null, lastFetchedAt: 0, lastToken: null })

  const isProfileComplete = useCallback((profile) => {
    if (!profile) return false
    const name = (profile.name || '').trim()
    const gender = (profile.gender || '').trim()
    const address = (profile.address || '').trim()
    const city = (profile.city || '').trim()
    const state = (profile.state || '').trim()
    const pincode = (profile.pincode || '').trim()
    
    // For Google users, check authProvider explicitly (not just email presence)
    const isGoogleUser = profile.authProvider === 'google'
    if (isGoogleUser) {
      const email = (profile.email || '').trim()
      return Boolean(name && email && gender && address && city && state && pincode)
    }
    
    // For phone users, phone is required
    const phone = (profile.phone || '').trim()
    return Boolean(name && phone && gender && address && city && state && pincode)
  }, [])

  useEffect(() => {
    let isMounted = true

    const initAuth = async () => {
      const storedToken = localStorage.getItem(AUTH_CONFIG.tokenKey)

      if (storedToken) {
        // Try to load saved profile from localStorage first (with safe parsing)
        const savedProfile = localStorage.getItem('user_profile')
        let localUser = safeJSONParse(savedProfile, null)

        // Always use local profile if available during refresh to maintain session
        if (localUser && isMounted) {
          setUser(localUser)
          setToken(storedToken)
        }

        // Verify token with backend if backend is configured (optional refresh)
        if (ENV.hasBackend && localUser && isMounted) {
          try {
            const response = await fetchWithRateLimit(`${API_CONFIG.baseURL}/user/profile`, {
              headers: { 'Authorization': `Bearer ${storedToken}` }
            })
            if (response.ok) {
              const data = await response.json()
              if (data.success && data.user && isMounted) {
                const normalizedUser = normalizeMembership(data.user)
                // Update with fresh data from backend
                const mergedUser = { ...localUser, ...normalizedUser }
                setUser(mergedUser)
                // Update saved profile with latest data
                localStorage.setItem('user_profile', JSON.stringify(mergedUser))
              }
            } else if (response.status === 401 && isMounted) {
              // Token expired - clear session
              localStorage.removeItem(AUTH_CONFIG.tokenKey)
              localStorage.removeItem('user_profile')
              setToken(null)
              setUser(null)
            }
            // For other errors, keep the loaded local user
          } catch (error) {
            logger.error('Auth init error:', error)
            // Keep local user data on error
          }
        } else if (!localUser && isMounted) {
          // No local user and no backend - clear invalid token
          localStorage.removeItem(AUTH_CONFIG.tokenKey)
          setToken(null)
        }
      }
      
      if (isMounted) {
        setIsLoading(false)
      }
    }

    initAuth()

    // Cleanup function to prevent state updates after unmount
    return () => {
      isMounted = false
    }
  }, [])

  const fetchUserProfile = useCallback(async (authToken = token, options = {}) => {
    if (!authToken) return null

    const { force = false } = options

    // Dedupe and throttle profile requests to avoid hammering the backend
    if (!force && profileFetchRef.current.inFlight && profileFetchRef.current.lastToken === authToken) {
      return profileFetchRef.current.inFlight
    }

    const now = Date.now()
    if (!force && profileFetchRef.current.lastToken === authToken && now - profileFetchRef.current.lastFetchedAt < 10000) {
      return user || null
    }

    const requestPromise = (async () => {
      try {
        const response = await fetchWithRateLimit(`${API_CONFIG.baseURL}/user/profile`, {
          headers: { 'Authorization': `Bearer ${authToken}` }
        })

        // Validate response is JSON
        const contentType = response.headers.get('content-type')
        if (!contentType || !contentType.includes('application/json')) {
          throw new Error('Invalid server response')
        }

        if (!response.ok) {
          throw new Error(`Profile fetch failed: ${response.status}`)
        }

        const data = await response.json()
        if (data.success) {
          const normalizedUser = normalizeMembership(data.user)
          setUser(normalizedUser)
          // Also save to localStorage for offline access
          safePut('user_profile', normalizedUser)
          return normalizedUser
        }
        return null
      } catch (error) {
        logger.error('Fetch profile error:', error)
        return null
      } finally {
        profileFetchRef.current.inFlight = null
        profileFetchRef.current.lastFetchedAt = Date.now()
        profileFetchRef.current.lastToken = authToken
      }
    })()

    profileFetchRef.current.inFlight = requestPromise
    profileFetchRef.current.lastToken = authToken
    return requestPromise
  }, [token, user])

  const login = useCallback(async (phone) => {
    setIsLoading(true)

    try {
      const response = await fetch(`${API_CONFIG.baseURL}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone })
      })

      const contentType = response.headers.get('content-type') || ''
      const isJson = contentType.includes('application/json')
      const data = isJson ? await response.json() : null

      if (!response.ok) {
        if (response.status === 429) {
          setIsLoading(false)
          return {
            success: false,
            message: data?.message || 'Too many OTP attempts. Please wait a minute and try again.'
          }
        }
        setIsLoading(false)
        return {
          success: false,
          message: data?.message || `Login failed (${response.status}). Please try again.`
        }
      }

      if (!isJson) {
        setIsLoading(false)
        return { success: false, message: 'Server returned an unexpected response. Please try again.' }
      }

      setIsLoading(false)
      return data
    } catch (error) {
      logger.error('Login error:', error)
      setIsLoading(false)
      return { success: false, message: 'Failed to send OTP. Please check your connection.' }
    }
  }, [])

  const verifyOTP = useCallback(async (phone, otp) => {
    setIsLoading(true)

    try {
      const response = await fetch(`${API_CONFIG.baseURL}/auth/verify`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone, otp })
      })

      const contentType = response.headers.get('content-type') || ''
      const isJson = contentType.includes('application/json')
      const data = isJson ? await response.json() : null

      if (!response.ok) {
        if (response.status === 429) {
          setIsLoading(false)
          return {
            success: false,
            message: data?.message || 'Too many verification attempts. Please wait and try again.'
          }
        }
        setIsLoading(false)
        return {
          success: false,
          message: data?.message || `OTP verification failed (${response.status}). Please try again.`
        }
      }

      if (!isJson) {
        setIsLoading(false)
        return { success: false, message: 'Server returned an unexpected response. Please try again.' }
      }

      if (data.success && data.token) {
        localStorage.setItem(AUTH_CONFIG.tokenKey, data.token)
        setToken(data.token)
        await fetchUserProfile(data.token)
      }
      setIsLoading(false)
      return data
    } catch (error) {
      logger.error('OTP verification error:', error)
      setIsLoading(false)
      return { success: false, message: 'Failed to verify OTP. Please try again.' }
    }
  }, [fetchUserProfile])

  const updateProfile = useCallback(async (profileData) => {
    if (!token) return { success: false, message: 'Not authenticated' }

    // Store original user for rollback if backend fails
    const originalUser = user

    // Try backend API call FIRST (before local update)
    try {
      const response = await fetchWithRateLimit(`${API_CONFIG.baseURL}/user/profile`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(profileData)
      })

      // Validate response is JSON
      const contentType = response.headers.get('content-type')
      if (!contentType || !contentType.includes('application/json')) {
        throw new Error('Invalid server response')
      }

      if (!response.ok) {
        throw new Error(`Profile update failed: ${response.status}`)
      }

      const data = await response.json()
      if (data.success && data.user) {
        // Backend success - update local state with backend response
        setUser(data.user)
        safePut('user_profile', data.user)
        return data
      } else {
        throw new Error(data.message || 'Update failed')
      }
    } catch (error) {
      logger.error('Update profile error:', error)
      
      // Backend failed - update locally as backup and retry later
      const updateLocalUser = (prev) => {
        const merged = { ...prev, ...profileData }
        const updatedUser = {
          ...merged,
          profile_complete: isProfileComplete(merged)
        }
        safePut('user_profile', updatedUser)
        return updatedUser
      }
      setUser(updateLocalUser)
      
      // Return warning - local save worked but backend failed
      return { success: false, message: 'Saved locally, sync failed. Will retry when online.', retry: true }
    }
  }, [token, user, isProfileComplete])

  const logout = useCallback(() => {
    localStorage.removeItem(AUTH_CONFIG.tokenKey)
    localStorage.removeItem(AUTH_CONFIG.googleTokenKey)
    localStorage.removeItem('user_profile')
    localStorage.removeItem('adityanta_recent_templates')  // Clear recently viewed
    localStorage.removeItem('adityanta_filter_prefs')      // Clear filter preferences
    setToken(null)
    setUser(null)
  }, [])

  // Google Sign-In handler using Firebase
  const googleLogin = useCallback(async () => {
    // Check if Firebase is configured
    if (!isFirebaseConfigured || !firebaseAuth || !googleProvider) {
      return { success: false, message: 'Google Sign-In is not configured. Please contact support.' }
    }

    setIsLoading(true)

    try {
      // Sign in with Firebase Google popup
      const result = await signInWithPopup(firebaseAuth, googleProvider)
      const firebaseUser = result.user

      // Get the Firebase ID token to send to backend
      const idToken = await firebaseUser.getIdToken()

      // Extract user info from Firebase result
      const googleUser = {
        name: firebaseUser.displayName || 'User',
        email: firebaseUser.email,
        picture: firebaseUser.photoURL,
        googleId: firebaseUser.uid,
        email_verified: firebaseUser.emailVerified,
      }

      // Validate required fields
      if (!googleUser.email) {
        setIsLoading(false)
        return { success: false, message: 'Email not provided by Google' }
      }

      // Send Firebase ID token to backend for verification
      try {
        const response = await fetch(`${API_CONFIG.baseURL}/auth/google`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            firebaseToken: idToken
          })
        })

        // Validate response is JSON
        const contentType = response.headers.get('content-type')
        if (!contentType || !contentType.includes('application/json')) {
          throw new Error('Invalid server response')
        }

        if (!response.ok) {
          throw new Error(`Google auth failed: ${response.status}`)
        }

        const data = await response.json()

        if (data.success && data.token) {
          localStorage.setItem(AUTH_CONFIG.tokenKey, data.token)
          localStorage.setItem(AUTH_CONFIG.googleTokenKey, idToken)
          setToken(data.token)
          const userData = {
            ...googleUser,
            ...data.user,
            authProvider: 'google'
          }
          setUser(userData)
          safePut('user_profile', userData)
          setIsLoading(false)
          return { success: true, user: userData }
        } else {
          setIsLoading(false)
          return { success: false, message: data.message || 'Google sign-in failed' }
        }
      } catch (fetchError) {
        logger.error('Backend verification error:', fetchError)
        setIsLoading(false)
        return { success: false, message: 'Failed to verify Google credentials with server' }
      }
    } catch (error) {
      // User closed the popup or other Firebase error
      if (error.code === 'auth/popup-closed-by-user') {
        setIsLoading(false)
        return { success: false, message: 'Sign-in cancelled' }
      }
      logger.error('Google login error:', error)
      setIsLoading(false)
      return { success: false, message: 'Google sign-in failed. Please try again.' }
    }
  }, [])

  const value = useMemo(() => ({
    user,
    token,
    isLoading,
    isAuthenticated: !!token,
    isFirebaseConfigured,
    login,
    verifyOTP,
    googleLogin,
    logout,
    fetchUserProfile,
    refreshUser: fetchUserProfile,
    updateProfile
  }), [
    user,
    token,
    isLoading,
    isFirebaseConfigured,
    login,
    verifyOTP,
    googleLogin,
    logout,
    fetchUserProfile,
    updateProfile
  ])

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  )
}

export default AuthContext
