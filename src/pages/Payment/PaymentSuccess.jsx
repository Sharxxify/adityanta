import { useEffect, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext'
import { API_CONFIG } from '../../config'
import { isPremiumUser } from '../../utils/membership'
import { userAPI } from '../../services/api'
import crown from '../../assets/crown.png'
import logger from '../../utils/logger'

const PaymentSuccess = () => {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const { refreshUser, user, token } = useAuth()
  const [countdown, setCountdown] = useState(5)
  const [isRefreshing, setIsRefreshing] = useState(true)
  const [originMismatch, setOriginMismatch] = useState(false)

  // Get payment details from URL params (Razorpay sends these)
  const paymentId = searchParams.get('razorpay_payment_id')
  const paymentLinkId = searchParams.get('razorpay_payment_link_id')
  const razorpaySignature = searchParams.get('razorpay_signature') || ''
  const status = searchParams.get('razorpay_payment_link_status')
  const returnOrigin = searchParams.get('origin') // Check if redirected from different origin
  const authToken = token || localStorage.getItem('auth_token')
  const pendingPaymentId = localStorage.getItem('pending_payment_id')
  const resolvedPaymentId = paymentId || pendingPaymentId

  // Persist signature so HomePage fallback can use it
  if (razorpaySignature) {
    localStorage.setItem('pending_payment_signature', razorpaySignature)
  }

  useEffect(() => {
    // If user is on EC2 but should be on localhost (origin mismatch), redirect back
    if (returnOrigin && returnOrigin !== window.location.origin && !window.opener) {
      setOriginMismatch(true)
      // Redirect back to original origin with payment params
      const params = new URLSearchParams({
        razorpay_payment_id: paymentId || '',
        razorpay_payment_link_id: paymentLinkId || '',
        razorpay_payment_link_status: status || '',
        razorpay_signature: razorpaySignature || ''
      })
      setTimeout(() => {
        window.location.href = `${returnOrigin}/payment-success?${params.toString()}`
      }, 500)
      return
    }

    // If this page is opened in a popup/child window (from Razorpay redirect),
    // close the popup and let the original tab handle the success via polling
    if (window.opener) {
      try { window.opener.focus() } catch (e) { /* cross-origin */ }
      window.close()
      return
    }

    let timer = null

    // Poll backend until webhook sets is_member = true, then refresh user state
    const waitForPremiumAndRedirect = async () => {
      const MAX_POLLS = 10
      const POLL_INTERVAL = 3000 // 3 seconds between polls
      let confirmed = false

      // Step 1: Try explicit payment verification first (fast-path)
      if (resolvedPaymentId) {
        try {
          const verifyRes = await userAPI.verifyPayment(resolvedPaymentId, razorpaySignature)
          if (verifyRes?.success && (verifyRes.membership_active || verifyRes.plan)) {
            confirmed = true
            logger.info('✅ Payment verified via /user/membership/verify')
          }
        } catch (error) {
          logger.warn('PaymentSuccess: verify endpoint not ready yet:', error?.message || error)
        }
      }

      // Step 2: Fallback poll profile for webhook propagation
      for (let i = 0; i < MAX_POLLS && !confirmed; i++) {
        try {
          logger.info(`Checking payment status (attempt ${i + 1}/${MAX_POLLS})...`)
          if (!authToken) {
            logger.warn('PaymentSuccess: no auth token available for profile check')
            break
          }
          const response = await fetch(`${API_CONFIG.baseURL}/user/profile`, {
            method: 'GET',
            headers: {
              'Authorization': `Bearer ${authToken}`,
              'Content-Type': 'application/json'
            }
          })

          if (response.ok) {
            const data = await response.json()
            if (data.user && isPremiumUser(data.user)) {
              logger.info('✅ Payment verified - User is now premium')
              confirmed = true
              break
            }
          }
        } catch (error) {
          logger.error('Payment status check error:', error)
        }

        // Wait before next poll
        await new Promise(resolve => setTimeout(resolve, POLL_INTERVAL))
      }

      // Refresh user state so localStorage + React state have is_member: true
      if (refreshUser) {
        try {
          await refreshUser(authToken, { force: true })
          if (confirmed) {
            localStorage.removeItem('pending_payment_id')
            localStorage.removeItem('pending_payment_plan')
            localStorage.removeItem('pending_payment_signature')
          }
        } catch (e) {
          logger.error('refreshUser error:', e)
        }
      }

      setIsRefreshing(false)

      if (!confirmed) {
        logger.warn('Payment webhook may not have processed yet. Redirecting anyway.')
      }

      // Signal HomePage to do ONE forced refresh on landing
      sessionStorage.setItem('adityanta_force_profile_refresh', '1')

      // Start countdown after verification
      timer = setInterval(() => {
        setCountdown((prev) => {
          if (prev <= 1) {
            clearInterval(timer)
            window.location.href = '/home'
            return 0
          }
          return prev - 1
        })
      }, 1000)
    }

    waitForPremiumAndRedirect()

    // Cleanup
    return () => {
      if (timer) clearInterval(timer)
    }
  }, [refreshUser, navigate, paymentId, paymentLinkId, razorpaySignature, status, returnOrigin, authToken, resolvedPaymentId])

  const handleGoHome = () => {
    // Clear any stale cache and force fresh data
    localStorage.removeItem('adityanta_recent_templates')
    localStorage.removeItem('adityanta_filter_prefs')
    // Reload page to ensure fresh data from backend
    window.location.href = '/home'
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-orange-50 to-white flex items-center justify-center p-4">
      <div className="bg-white rounded-3xl shadow-2xl p-10 max-w-md w-full text-center">
        {/* Success Animation */}
        <div className="w-24 h-24 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-6 animate-bounce">
          <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="#22c55e" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="20 6 9 17 4 12" />
          </svg>
        </div>

        {/* Success Message */}
        <h1 className="text-3xl font-bold text-gray-900 mb-4">Payment Successful!</h1>
        <p className="text-xl text-gray-600 mb-2">Congratulations! 🎉</p>
        <p className="text-2xl font-semibold text-green-600 mb-6">You are now a Premium Member!</p>

        {/* Crown Icon */}
        <div className="flex items-center justify-center gap-2 bg-orange-100 px-6 py-3 rounded-full mb-6 mx-auto w-fit">
          <img src={crown} alt="Crown" className="w-8 h-8" />
          <span className="text-orange-600 font-semibold text-lg">Premium Activated</span>
        </div>

        {/* Payment Details */}
        {paymentId && (
          <div className="bg-gray-50 rounded-xl p-4 mb-6 text-left">
            <p className="text-sm text-gray-500 mb-1">Payment ID</p>
            <p className="text-sm font-mono text-gray-700 break-all">{paymentId}</p>
          </div>
        )}

        {/* Go Home Button */}
        <button
          onClick={handleGoHome}
          className="w-full py-4 bg-orange-500 hover:bg-orange-600 text-white text-lg rounded-xl font-bold transition-all shadow-lg"
        >
          Go to Home
        </button>

        {/* Auto redirect message */}
        <p className="text-gray-500 text-sm mt-4">
          Redirecting to home in {countdown} seconds...
        </p>
      </div>
    </div>
  )
}

export default PaymentSuccess
