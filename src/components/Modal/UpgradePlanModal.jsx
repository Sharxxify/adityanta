import { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext'
import { useApp } from '../../context/AppContext'
import { useToast } from '../../context/ToastContext'
import { userAPI } from '../../services/api'
import logger from '../../utils/logger'
import crown from '../../assets/crown.png'

const UpgradePlanModal = ({ onClose, onSuccess }) => {
  const navigate = useNavigate()
  const [selectedPlan, setSelectedPlan] = useState('MONTHLY')
  const [loading, setLoading] = useState(false)
  const [paymentId, setPaymentId] = useState(null)
  const [timeRemaining, setTimeRemaining] = useState(0)
  const [paymentWindow, setPaymentWindow] = useState(null)
  const [paymentSuccess, setPaymentSuccess] = useState(false)
  const { refreshUser } = useAuth()
  const { config } = useApp()
  const toast = useToast()
  const pollingIntervalRef = useRef(null)
  const countdownIntervalRef = useRef(null)
  const mockTimeoutRef = useRef(null)
  const mockMode = new URLSearchParams(window.location.search).get('mockPayment') === '1'

  // Generate plans from config.
  // Order: Weekly → Monthly → Quarterly → Yearly.
  // Weekly is only included if the /templates/config response contains a `weekly`
  // pricing entry. This way, until the backend ships weekly, the modal works
  // with the existing 3 plans unchanged.
  const buildPlan = (id, name, pricingEntry) => {
    if (!pricingEntry || typeof pricingEntry.amount !== 'number') return null
    return {
      id,
      name,
      price: Math.round(pricingEntry.amount),
      duration: pricingEntry.duration,
      nextBilling: () => {
        const date = new Date()
        date.setDate(date.getDate() + (pricingEntry.duration || 0))
        return date.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: '2-digit' }).replace(/ /g, ' ')
      }
    }
  }

  const plans = [
    buildPlan('WEEKLY', 'Weekly', config.pricing.weekly),
    buildPlan('MONTHLY', 'Monthly', config.pricing.monthly),
    buildPlan('QUARTERLY', 'Quarterly', config.pricing.quarterly),
    buildPlan('YEARLY', 'Yearly', config.pricing.yearly),
  ].filter(Boolean)

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (pollingIntervalRef.current) {
        clearInterval(pollingIntervalRef.current)
      }
      if (countdownIntervalRef.current) {
        clearInterval(countdownIntervalRef.current)
      }
      if (mockTimeoutRef.current) {
        clearTimeout(mockTimeoutRef.current)
      }
      if (paymentWindow && !paymentWindow.closed) {
        paymentWindow.close()
      }
    }
  }, [paymentWindow])

  // Start polling for payment verification (countdown is already running from handlePayment)
  const startPaymentPolling = (currentPaymentId, startTime) => {
    if (mockMode) {
      return
    }
    const POLL_INTERVAL = 3000 // 3 seconds
    const MAX_DURATION = 90 * 1000 // 1 min 30 sec

    // Clear any existing polling interval
    if (pollingIntervalRef.current) {
      clearInterval(pollingIntervalRef.current)
    }

    // Start polling for payment verification
    pollingIntervalRef.current = setInterval(async () => {
      const elapsed = Date.now() - startTime

      // Check if timeout has passed
      if (elapsed >= MAX_DURATION) {
        clearInterval(pollingIntervalRef.current)
        clearInterval(countdownIntervalRef.current)
        setLoading(false)
        setPaymentId(null)
        setTimeRemaining(0)
        toast.error('Payment verification timeout. Please contact support if payment was deducted.')
        return
      }

      try {
        const result = await userAPI.verifyPayment(currentPaymentId, '')

        if (result.success && result.membership_active) {
          // Payment verified successfully
          clearInterval(pollingIntervalRef.current)
          clearInterval(countdownIntervalRef.current)
          setLoading(false)
          setPaymentId(null)
          setTimeRemaining(0)

          // Refresh user profile to get updated membership
          if (refreshUser) {
            await refreshUser(undefined, { force: true })
          }

          toast.success('Payment successful! You are now Premium!')
          onSuccess?.()

          // Redirect to home after 2 seconds
          setTimeout(() => {
            navigate('/home')
          }, 2000)
        }
      } catch (error) {
        // Continue polling if error (payment might not be completed yet)
        logger.error('Payment verification check:', error)
      }
    }, POLL_INTERVAL)
  }

  const handlePayment = async () => {
    setLoading(true)
    
    // Clear any existing intervals
    if (countdownIntervalRef.current) {
      clearInterval(countdownIntervalRef.current)
    }
    if (pollingIntervalRef.current) {
      clearInterval(pollingIntervalRef.current)
    }

    if (mockMode) {
      // Mock mode - simulate payment without actual Razorpay
      const startTime = Date.now()
      setTimeRemaining(90)
      
      countdownIntervalRef.current = setInterval(() => {
        const elapsed = Math.floor((Date.now() - startTime) / 1000)
        const remaining = Math.max(0, 90 - elapsed)
        setTimeRemaining(remaining)

        if (remaining === 0) {
          clearInterval(countdownIntervalRef.current)
        }
      }, 1000)
      
      const mockPaymentId = `mock_${Date.now()}`
      setPaymentId(mockPaymentId)

      const width = 600
      const height = 700
      const left = (window.screen.width - width) / 2
      const top = (window.screen.height - height) / 2
      const newWindow = window.open(
        '',
        'Payment',
        `width=${width},height=${height},left=${left},top=${top},resizable=yes,scrollbars=yes`
      )
      if (newWindow) {
        newWindow.document.write('<title>Mock Payment</title>')
        newWindow.document.write('<div style="font-family: Arial; padding: 24px;">Mock payment in progress... You can close this window.</div>')
        newWindow.document.close()
      }
      setPaymentWindow(newWindow)

      toast.info('Mock payment started')

      mockTimeoutRef.current = setTimeout(() => {
        clearInterval(pollingIntervalRef.current)
        clearInterval(countdownIntervalRef.current)
        setLoading(false)
        setPaymentId(null)
        setTimeRemaining(0)

        if (newWindow && !newWindow.closed) {
          newWindow.close()
        }

        setPaymentSuccess(true)
        toast.success('Mock payment successful!')
        onSuccess?.()
      }, 3000)

      return
    }

    // Real payment flow - redirect to Razorpay in same tab
    try {
      // Initiate payment - backend will create Razorpay payment link
      // Backend expects uppercase: MONTHLY, QUARTERLY, YEARLY
      logger.info('Initiating payment for plan:', selectedPlan)
      
      const successUrl = `${window.location.origin}/payment-success`
      const response = await userAPI.buyMembership(selectedPlan, successUrl)
      
      logger.info('Buy membership response:', response)

      if (!response || !response.payment_id || !response.payment_link) {
        // Log detailed error for debugging
        logger.error('Invalid payment response:', {
          hasResponse: !!response,
          hasPaymentId: !!(response && response.payment_id),
          hasPaymentLink: !!(response && response.payment_link),
          fullResponse: response
        })
        toast.error('Failed to initiate payment. Please try again.')
        setLoading(false)
        return
      }

      // Store payment ID in localStorage for verification after redirect back
      localStorage.setItem('pending_payment_id', response.payment_id)
      localStorage.setItem('pending_payment_plan', selectedPlan)

      // Redirect to Razorpay payment - same tab, no polling needed
      // After payment, Razorpay will redirect back to /payment-success
      toast.info('Redirecting to payment page...')
      
      // Small delay so user sees the toast
      setTimeout(() => {
        window.location.href = response.payment_link
      }, 500)
    } catch (error) {
      logger.error('Payment error:', error.message)
      toast.error('Failed to initiate payment: ' + error.message)
      setLoading(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div
        className="bg-gradient-to-br from-orange-50 to-white rounded-3xl w-full max-w-5xl shadow-2xl overflow-hidden relative"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Close Button */}
        <button
          onClick={onClose}
          className="absolute top-6 right-6 w-10 h-10 rounded-full border-2 border-gray-800 flex items-center justify-center text-gray-800 hover:bg-gray-100 transition-all z-10"
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
            <path d="M18 6L6 18M6 6l12 12" />
          </svg>
        </button>

        {/* Success Screen */}
        {paymentSuccess ? (
          <div className="p-10 flex flex-col items-center justify-center min-h-[400px]">
            {/* Success Animation */}
            <div className="w-24 h-24 bg-green-100 rounded-full flex items-center justify-center mb-6 animate-bounce">
              <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="#22c55e" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="20 6 9 17 4 12" />
              </svg>
            </div>

            {/* Success Message */}
            <h2 className="text-4xl font-bold text-gray-900 mb-4 text-center">Payment Successful!</h2>
            <p className="text-xl text-gray-600 mb-2 text-center">Congratulations! 🎉</p>
            <p className="text-2xl font-semibold text-green-600 mb-6 text-center">You are now a Premium Member!</p>

            {/* Crown Icon */}
            <div className="flex items-center gap-2 bg-orange-100 px-6 py-3 rounded-full mb-6">
              <img src={crown} alt="Crown" className="w-8 h-8" />
              <span className="text-orange-600 font-semibold text-lg">Premium Activated</span>
            </div>

            {/* Redirecting Message */}
            <p className="text-gray-500 text-sm animate-pulse">Refreshing page in 3 seconds...</p>
          </div>
        ) : (
          <div className="p-10">
            {/* Header */}
            <div className="flex items-center justify-center gap-3 mb-10">
              <img src={crown} alt="Crown" className="w-10 h-10" />
              <h2 className="text-4xl font-bold text-gray-900">Upgrade to Premium</h2>
            </div>

            {/* Main Content Grid */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 mb-8">
            {/* Left Side - Comparison Table */}
            <div className="bg-white rounded-2xl p-6 shadow-sm">
              <table className="w-full border-collapse">
                <thead>
                  <tr className="border-b-2 border-gray-200">
                    <th className="text-left py-4 px-4 text-gray-600 font-semibold border-r border-gray-200">Plan Name</th>
                    <th className="text-center py-4 px-4 text-orange-600 font-bold border-r border-gray-200">Basic</th>
                    <th className="text-center py-4 px-4 text-orange-600 font-bold">Premium</th>
                  </tr>
                </thead>
                <tbody className="text-sm">
                  <tr className="border-b border-gray-100">
                    <td className="py-4 px-4 text-gray-700 border-r border-gray-200">No. of Downloads</td>
                    <td className="text-center py-4 px-4 font-semibold border-r border-gray-200">Limited</td>
                    <td className="text-center py-4 px-4 font-semibold">Unlimited</td>
                  </tr>
                  <tr className="border-b border-gray-100">
                    <td className="py-4 px-4 text-gray-700 border-r border-gray-200">Template Access</td>
                    <td className="text-center py-4 px-4 font-semibold border-r border-gray-200">Limited</td>
                    <td className="text-center py-4 px-4 font-semibold">Unlimited</td>
                  </tr>
                  <tr className="border-b border-gray-100">
                    <td className="py-4 px-4 text-gray-700 border-r border-gray-200">Upload Template</td>
                    <td className="text-center py-4 px-4 border-r border-gray-200">
                      <div className="flex items-center justify-center">
                        <div className="w-6 h-6 rounded-full bg-red-500 flex items-center justify-center">
                          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3">
                            <path d="M18 6L6 18M6 6l12 12" />
                          </svg>
                        </div>
                      </div>
                    </td>
                    <td className="text-center py-4 px-4">
                      <div className="flex items-center justify-center">
                        <div className="w-6 h-6 rounded-full bg-green-500 flex items-center justify-center">
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3">
                            <polyline points="20 6 9 17 4 12" />
                          </svg>
                        </div>
                      </div>
                    </td>
                  </tr>
                  <tr className="border-b border-gray-100">
                    <td className="py-4 px-4 text-gray-700 border-r border-gray-200">Supports MP4/PPT</td>
                    <td className="text-center py-4 px-4 border-r border-gray-200">
                      <div className="flex items-center justify-center">
                        <div className="w-6 h-6 rounded-full bg-red-500 flex items-center justify-center">
                          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3">
                            <path d="M18 6L6 18M6 6l12 12" />
                          </svg>
                        </div>
                      </div>
                    </td>
                    <td className="text-center py-4 px-4">
                      <div className="flex items-center justify-center">
                        <div className="w-6 h-6 rounded-full bg-green-500 flex items-center justify-center">
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3">
                            <polyline points="20 6 9 17 4 12" />
                          </svg>
                        </div>
                      </div>
                    </td>
                  </tr>
                  <tr>
                    <td className="py-4 px-4 text-gray-700 border-r border-gray-200">Offline Download</td>
                    <td className="text-center py-4 px-4 border-r border-gray-200">
                      <div className="flex items-center justify-center">
                        <div className="w-6 h-6 rounded-full bg-red-500 flex items-center justify-center">
                          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3">
                            <path d="M18 6L6 18M6 6l12 12" />
                          </svg>
                        </div>
                      </div>
                    </td>
                    <td className="text-center py-4 px-4">
                      <div className="flex items-center justify-center">
                        <div className="w-6 h-6 rounded-full bg-green-500 flex items-center justify-center">
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3">
                            <polyline points="20 6 9 17 4 12" />
                          </svg>
                        </div>
                      </div>
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>

            {/* Right Side - Pricing Plans */}
            <div className="space-y-4">
              {plans.map((plan) => (
                <button
                  key={plan.id}
                  onClick={() => setSelectedPlan(plan.id)}
                  className={`w-full p-6 rounded-2xl border-2 text-left transition-all ${
                    selectedPlan === plan.id
                      ? 'border-orange-500 bg-white shadow-lg'
                      : 'border-gray-200 bg-white hover:border-orange-300'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-4">
                      <div className={`w-6 h-6 rounded-full border-2 flex items-center justify-center flex-shrink-0 ${
                        selectedPlan === plan.id ? 'border-orange-500' : 'border-gray-300'
                      }`}>
                        {selectedPlan === plan.id && (
                          <div className="w-4 h-4 rounded-full bg-orange-500" />
                        )}
                      </div>
                      <div>
                        <h3 className="text-2xl font-bold text-gray-900">{plan.name}</h3>
                        <p className="text-sm text-gray-500">next billing on {plan.nextBilling()}</p>
                      </div>
                    </div>
                    <div className="text-right">
                      <span className="text-3xl font-bold text-gray-900">₹{plan.price}</span>
                    </div>
                  </div>
                </button>
              ))}
            </div>
          </div>

          {/* Countdown Timer */}
          {loading && timeRemaining > 0 && (
            <div className="mb-6 p-4 bg-blue-50 rounded-xl border-2 border-blue-200">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-medium text-blue-900">Waiting for payment completion</span>
                <span className="text-2xl font-bold text-blue-600">
                  {Math.floor(timeRemaining / 60)}:{(timeRemaining % 60).toString().padStart(2, '0')}
                </span>
              </div>
              <p className="text-xs text-blue-700">
                Complete payment in the popup window. Time remaining before timeout.
              </p>
            </div>
          )}

          {/* Continue Button */}
          <button
            onClick={handlePayment}
            disabled={loading}
            className="w-full py-5 bg-orange-500 hover:bg-orange-600 text-white text-xl rounded-2xl font-bold transition-all disabled:opacity-70 flex items-center justify-center gap-2 shadow-lg"
          >
            {loading ? (
              <>
                <svg className="animate-spin h-6 w-6" viewBox="0 0 24 24" fill="none">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"/>
                </svg>
                {paymentId ? 'Verifying payment...' : 'Processing...'}
              </>
            ) : (
              'Continue'
            )}
          </button>
          </div>
        )}
      </div>
    </div>
  )
}

export default UpgradePlanModal
