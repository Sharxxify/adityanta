/**
 * Firebase Configuration Diagnostic Tool
 * Use this to test Google Sign-In setup
 */

import { testFirebaseConfig } from './firebase'

export const runFirebaseDiagnostics = async () => {
  console.log('\n=== 🔍 GOOGLE SIGN-IN DIAGNOSTIC REPORT ===\n')

  // Test 1: Firebase Configuration
  console.log('TEST 1: Firebase Configuration')
  const firebaseTest = testFirebaseConfig()
  console.log('✓ Result:', firebaseTest)
  console.log('Status:', firebaseTest.isConfigured ? '✅ PASS' : '❌ FAIL')

  // Test 2: Check environment variables
  console.log('\nTEST 2: Environment Variables')
  const envVars = {
    VITE_FIREBASE_API_KEY: import.meta.env.VITE_FIREBASE_API_KEY ? '✅ SET' : '❌ MISSING',
    VITE_FIREBASE_AUTH_DOMAIN: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN || '❌ MISSING',
    VITE_FIREBASE_PROJECT_ID: import.meta.env.VITE_FIREBASE_PROJECT_ID || '❌ MISSING',
    VITE_API_BASE_URL: import.meta.env.VITE_API_BASE_URL || '❌ MISSING',
  }
  console.table(envVars)

  // Test 3: Backend connectivity
  console.log('\nTEST 3: Backend Connectivity')
  try {
    const response = await fetch(`${import.meta.env.VITE_API_BASE_URL}/health`, {
      method: 'GET'
    })
    console.log('Backend response:', response.status, response.statusText)
    console.log('Status:', response.ok ? '✅ PASS' : '⚠️ Check response')
  } catch (error) {
    console.error('❌ FAIL - Backend not accessible:', error.message)
  }

  // Test 4: Firebase Google Provider
  console.log('\nTEST 4: Firebase Google Provider')
  console.log('Status:', firebaseTest.hasProvider ? '✅ PASS' : '❌ FAIL')

  console.log('\n=== 📋 CHECKLIST ===')
  console.log('1. ✅ Firebase credentials configured')
  console.log('2. [ ] Google provider ENABLED in Firebase Console')
  console.log('3. [ ] Domain added to Firebase Authorized Domains')
  console.log('4. [ ] Backend running on:', import.meta.env.VITE_API_BASE_URL)
  console.log('5. [ ] No browser popup blocker')
  console.log('\n=== 🆘 If Still Failing ===')
  console.log('Check: https://console.firebase.google.com/project/adityanta-c27ca')
  console.log('Enable: Authentication > Sign-in method > Google')
}

// Auto-run on page load (optional)
if (typeof window !== 'undefined') {
  window.runFirebaseDiagnostics = runFirebaseDiagnostics
  console.log('💡 Run: window.runFirebaseDiagnostics() in console to test Google Sign-In')
}

export default runFirebaseDiagnostics
