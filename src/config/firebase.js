import { initializeApp } from 'firebase/app'
import { getAuth, GoogleAuthProvider } from 'firebase/auth'

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
}

// Check if Firebase is configured
const isFirebaseConfigured = Boolean(
  firebaseConfig.apiKey &&
  firebaseConfig.apiKey !== 'YOUR_FIREBASE_API_KEY' &&
  firebaseConfig.authDomain &&
  firebaseConfig.projectId &&
  firebaseConfig.projectId !== 'YOUR_PROJECT_ID' &&
  firebaseConfig.appId
)

// Debug logging for Firebase configuration
console.log('[FirebaseConfig] ===== FIREBASE CONFIGURATION CHECK =====')
console.log('[FirebaseConfig] API Key present:', !!firebaseConfig.apiKey)
console.log('[FirebaseConfig] API Key valid:', firebaseConfig.apiKey !== 'YOUR_FIREBASE_API_KEY')
console.log('[FirebaseConfig] Auth Domain:', firebaseConfig.authDomain)
console.log('[FirebaseConfig] Project ID present:', !!firebaseConfig.projectId)
console.log('[FirebaseConfig] Project ID valid:', firebaseConfig.projectId !== 'YOUR_PROJECT_ID')
console.log('[FirebaseConfig] App ID present:', !!firebaseConfig.appId)
console.log('[FirebaseConfig] isFirebaseConfigured:', isFirebaseConfigured)

if (!isFirebaseConfigured) {
  console.error('[FirebaseConfig] ===== FIREBASE NOT CONFIGURED =====')
  console.error('[FirebaseConfig] Missing or invalid Firebase configuration!')
  console.error('[FirebaseConfig] Please check your .env file and add the actual values from Firebase Console.')
}

let app = null
let auth = null
let googleProvider = null

if (isFirebaseConfigured) {
  try {
    console.log('[FirebaseConfig] ===== INITIALIZING FIREBASE =====')
    console.log('[FirebaseConfig] Config:', {
      apiKey: firebaseConfig.apiKey ? '[PRESENT]' : '[MISSING]',
      authDomain: firebaseConfig.authDomain,
      projectId: firebaseConfig.projectId,
      storageBucket: firebaseConfig.storageBucket,
      messagingSenderId: firebaseConfig.messagingSenderId,
      appId: firebaseConfig.appId ? '[PRESENT]' : '[MISSING]'
    })

    app = initializeApp(firebaseConfig)
    auth = getAuth(app)
    googleProvider = new GoogleAuthProvider()
    googleProvider.addScope('profile')
    googleProvider.addScope('email')
    googleProvider.setCustomParameters({ prompt: 'select_account' })

    console.log('[FirebaseConfig] ===== FIREBASE INITIALIZED SUCCESSFULLY =====')
    console.log('[FirebaseConfig] Auth available:', !!auth)
    console.log('[FirebaseConfig] Google provider available:', !!googleProvider)
  } catch (error) {
    console.error('[FirebaseConfig] ===== FIREBASE INITIALIZATION ERROR =====')
    console.error('[FirebaseConfig] Error:', error.message)
    console.error('[FirebaseConfig] Error code:', error.code)
    console.error('[FirebaseConfig] Error stack:', error.stack)
  }
} else {
  console.log('[FirebaseConfig] ===== SKIPPING FIREBASE INITIALIZATION =====')
  console.log('[FirebaseConfig] Firebase not configured - authentication will not work')
}

// Debug function for testing Firebase configuration
export const testFirebaseConfig = () => {
  console.log('[FirebaseConfig] ===== FIREBASE CONFIG TEST =====')
  console.log('[FirebaseConfig] isFirebaseConfigured:', isFirebaseConfigured)
  console.log('[FirebaseConfig] app initialized:', !!app)
  console.log('[FirebaseConfig] auth available:', !!auth)
  console.log('[FirebaseConfig] googleProvider available:', !!googleProvider)
  console.log('[FirebaseConfig] Environment variables:')
  console.log('[FirebaseConfig] VITE_FIREBASE_API_KEY:', import.meta.env.VITE_FIREBASE_API_KEY ? '[SET]' : '[NOT SET]')
  console.log('[FirebaseConfig] VITE_FIREBASE_AUTH_DOMAIN:', import.meta.env.VITE_FIREBASE_AUTH_DOMAIN)
  console.log('[FirebaseConfig] VITE_FIREBASE_PROJECT_ID:', import.meta.env.VITE_FIREBASE_PROJECT_ID)
  console.log('[FirebaseConfig] VITE_FIREBASE_APP_ID:', import.meta.env.VITE_FIREBASE_APP_ID ? '[SET]' : '[NOT SET]')
  return { isConfigured: isFirebaseConfigured, hasApp: !!app, hasAuth: !!auth, hasProvider: !!googleProvider }
}

export { auth, googleProvider, isFirebaseConfigured }
export default app
