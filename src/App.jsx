import { useEffect, useState, lazy, Suspense } from 'react'
import { Routes, Route, Navigate, useLocation } from 'react-router-dom'
import PrivateRoute from './components/PrivateRoute'
import ErrorBoundary from './components/ErrorBoundary'
import { useAuth } from './context/AuthContext'

function lazyWithRetry(importFn) {
  return lazy(() =>
    importFn().catch((error) => {
      const reloaded = sessionStorage.getItem('chunk_reload')
      if (!reloaded) {
        sessionStorage.setItem('chunk_reload', '1')
        window.location.reload()
        return new Promise(() => {})
      }
      sessionStorage.removeItem('chunk_reload')
      throw error
    })
  )
}

// Lazy-loaded page components for code splitting
const LoginPage = lazyWithRetry(() => import('./pages/Auth/LoginPage'))

// When user is logged in and on "/", redirect to home or profile-setup, or the original URI
function LoginRoute() {
  const { user } = useAuth()
  const location = useLocation()

  if (user) {
    const shouldSetupProfile = !user.profile_complete && !user.profileComplete
    if (shouldSetupProfile) {
      return <Navigate to="/profile-setup" replace />
    }
    const from = location.state?.from ? location.state.from.pathname + location.state.from.search + location.state.from.hash : "/home";
    return <Navigate to={from} replace />
  }
  return <LoginPage />
}
const ProfileSetupPage = lazyWithRetry(() => import('./pages/Auth/ProfileSetupPage'))
const HomePage = lazyWithRetry(() => import('./pages/Home/HomePage'))
const EditorPage = lazyWithRetry(() => import('./pages/Editor/EditorPage'))
const PresentationPage = lazyWithRetry(() => import('./pages/Presentation/PresentationPage'))
const SharePage = lazyWithRetry(() => import('./pages/Share/SharePage'))
const PaymentSuccess = lazyWithRetry(() => import('./pages/Payment/PaymentSuccess'))
const NotFoundPage = lazyWithRetry(() => import('./pages/NotFoundPage'))

// Offline detection banner
function OfflineBanner() {
  const [isOffline, setIsOffline] = useState(!navigator.onLine)

  useEffect(() => {
    const goOffline = () => setIsOffline(true)
    const goOnline = () => setIsOffline(false)
    window.addEventListener('offline', goOffline)
    window.addEventListener('online', goOnline)
    return () => {
      window.removeEventListener('offline', goOffline)
      window.removeEventListener('online', goOnline)
    }
  }, [])

  if (!isOffline) return null

  return (
    <div className="fixed top-0 left-0 right-0 z-[200] bg-red-500 text-white text-center py-2 text-sm font-medium">
      You are offline. Some features may not work.
    </div>
  )
}

// Minimal loading fallback
const PageLoader = () => (
  <div className="min-h-screen flex items-center justify-center bg-gray-50">
    <div className="w-8 h-8 border-3 border-gray-200 border-t-primary rounded-full animate-spin" />
  </div>
)

// Component to handle payment redirect globally - uses window.location for reliable redirect
function PaymentRedirectHandler() {
  useEffect(() => {
    // Skip if already on payment-success page
    if (window.location.pathname === '/payment-success') return

    // Check URL for Razorpay payment params
    const urlParams = new URLSearchParams(window.location.search)
    const paymentId = urlParams.get('razorpay_payment_id')
    const paymentLinkId = urlParams.get('razorpay_payment_link_id')
    const status = urlParams.get('razorpay_payment_link_status')

    if (paymentId || paymentLinkId || status === 'paid') {
      // Use window.location for immediate, reliable redirect
      window.location.replace(`/payment-success${window.location.search}`)
    }
  }, [])

  return null
}

function App() {
  return (
    <>
      <OfflineBanner />
      <PaymentRedirectHandler />
      <Suspense fallback={<PageLoader />}>
        <Routes>
          <Route path="/" element={<LoginRoute />} />
          <Route path="/profile-setup" element={<PrivateRoute><ProfileSetupPage /></PrivateRoute>} />
          <Route path="/profile" element={<PrivateRoute><ProfileSetupPage /></PrivateRoute>} />
          <Route path="/home" element={<PrivateRoute><HomePage /></PrivateRoute>} />
          <Route path="/editor/:templateId?" element={<PrivateRoute><ErrorBoundary><EditorPage /></ErrorBoundary></PrivateRoute>} />
          <Route path="/present/:templateId?" element={<PrivateRoute><ErrorBoundary><PresentationPage /></ErrorBoundary></PrivateRoute>} />
          <Route path="/share/:shareId" element={<SharePage />} />
          <Route path="/payment-success" element={<PaymentSuccess />} />
          {/* 404 catch-all route - must be last */}
          <Route path="*" element={<NotFoundPage />} />
        </Routes>
      </Suspense>
    </>
  )
}

export default App
