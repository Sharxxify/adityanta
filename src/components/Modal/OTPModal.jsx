import { useState, useRef, useEffect } from 'react'

const OTPModal = ({ phoneNumber, onClose, onSuccess, onResend, isLoading = false, error = null }) => {
  const [otp, setOtp] = useState(['', '', '', '', '', ''])
  const [resendTimer, setResendTimer] = useState(30)
  const [canResend, setCanResend] = useState(false)
  const [localError, setLocalError] = useState(null)
  const [showTerms, setShowTerms] = useState(false)
  const [showPrivacy, setShowPrivacy] = useState(false)
  const inputRefs = useRef([])

  useEffect(() => {
    // Focus first input on mount
    inputRefs.current[0]?.focus()
  }, [])

  // Resend timer countdown
  useEffect(() => {
    if (resendTimer > 0) {
      const timer = setTimeout(() => setResendTimer(resendTimer - 1), 1000)
      return () => clearTimeout(timer)
    } else {
      setCanResend(true)
    }
  }, [resendTimer])

  // Clear error when user types
  useEffect(() => {
    if (otp.some(d => d !== '')) {
      setLocalError(null)
    }
  }, [otp])

  const handleChange = (index, value) => {
    if (value.length > 1) {
      value = value[0]
    }

    if (!/^\d*$/.test(value)) return

    const newOtp = [...otp]
    newOtp[index] = value
    setOtp(newOtp)

    // Auto-focus next input
    if (value && index < 5) {
      inputRefs.current[index + 1]?.focus()
    }
  }

  const handleKeyDown = (index, e) => {
    if (e.key === 'Backspace' && !otp[index] && index > 0) {
      inputRefs.current[index - 1]?.focus()
    }
  }

  const handlePaste = (e) => {
    e.preventDefault()
    const pastedData = e.clipboardData.getData('text').slice(0, 6)
    if (!/^\d+$/.test(pastedData)) return

    const newOtp = [...otp]
    pastedData.split('').forEach((char, index) => {
      if (index < 6) newOtp[index] = char
    })
    setOtp(newOtp)

    // Focus last filled input or submit
    const lastIndex = Math.min(pastedData.length - 1, 5)
    inputRefs.current[lastIndex]?.focus()
  }

  const handleSubmit = (e) => {
    e.preventDefault()
    const otpValue = otp.join('')
    if (otpValue.length === 6) {
      onSuccess(otpValue)
    } else {
      setLocalError('Please enter the complete 6-digit code')
    }
  }

  const handleResend = () => {
    if (canResend && onResend) {
      onResend()
      setResendTimer(30)
      setCanResend(false)
      setOtp(['', '', '', '', '', ''])
      inputRefs.current[0]?.focus()
    }
  }

  const isComplete = otp.every(digit => digit !== '')
  const displayError = error || localError

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-white rounded-2xl p-8 w-full max-w-md mx-4 shadow-2xl relative">
        {/* Close button - now inside relative container */}
        <button
          onClick={onClose}
          className="absolute top-4 right-4 text-gray-400 hover:text-gray-600 transition-colors"
          disabled={isLoading}
        >
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M18 6L6 18M6 6l12 12" />
          </svg>
        </button>

        {/* Header */}
        <div className="text-center mb-8">
          <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#2E7D32" strokeWidth="2">
              <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z" />
            </svg>
          </div>
          <h2 className="text-2xl font-bold text-gray-900 mb-2">Enter OTP</h2>
          <p className="text-gray-500 text-sm">
            We've sent a verification code to
          </p>
          <p className="text-primary font-semibold">+91 {phoneNumber}</p>
        </div>

        {/* Error Message */}
        {displayError && (
          <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg flex items-center gap-2">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#DC2626" strokeWidth="2">
              <circle cx="12" cy="12" r="10" />
              <line x1="12" y1="8" x2="12" y2="12" />
              <line x1="12" y1="16" x2="12.01" y2="16" />
            </svg>
            <span className="text-sm text-red-600">{displayError}</span>
          </div>
        )}

        {/* OTP Form */}
        <form onSubmit={handleSubmit}>
          <div className="mb-6">
            <label className="block text-sm font-semibold text-gray-900 mb-4 text-center">
              Verification Code
            </label>
            <div className="flex gap-3 justify-center">
              {otp.map((digit, index) => (
                <input
                  key={index}
                  ref={(el) => (inputRefs.current[index] = el)}
                  type="text"
                  inputMode="numeric"
                  maxLength={1}
                  value={digit}
                  onChange={(e) => handleChange(index, e.target.value)}
                  onKeyDown={(e) => handleKeyDown(index, e)}
                  onPaste={handlePaste}
                  disabled={isLoading}
                  className={`w-12 h-14 text-center text-xl font-bold border-2 rounded-xl focus:outline-none transition-all ${
                    displayError
                      ? 'border-red-300 focus:border-red-500 focus:ring-2 focus:ring-red-500/20'
                      : 'border-gray-200 focus:border-primary focus:ring-2 focus:ring-primary/20'
                  } ${isLoading ? 'bg-gray-50 cursor-not-allowed' : ''}`}
                />
              ))}
            </div>
          </div>

          <button
            type="submit"
            disabled={!isComplete || isLoading}
            className={`w-full py-4 rounded-xl text-white font-semibold transition-all flex items-center justify-center gap-2 ${
              isComplete && !isLoading
                ? 'bg-primary hover:bg-primary-dark'
                : 'bg-primary/50 cursor-not-allowed'
            }`}
          >
            {isLoading ? (
              <>
                <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                </svg>
                Verifying...
              </>
            ) : (
              'Submit'
            )}
          </button>
        </form>

        {/* Resend OTP */}
        <div className="mt-6 text-center">
          <p className="text-sm text-gray-500">
            Didn't receive the code?{' '}
            {canResend ? (
              <button
                onClick={handleResend}
                disabled={isLoading}
                className="text-primary font-semibold hover:text-primary-dark transition-colors"
              >
                Resend OTP
              </button>
            ) : (
              <span className="text-gray-400">
                Resend in <span className="font-semibold text-gray-600">{resendTimer}s</span>
              </span>
            )}
          </p>
        </div>

        {/* Terms of Service and Privacy Policy */}
        <div className="mt-6 pt-4 border-t border-gray-100">
          <p className="text-xs text-gray-500 text-center leading-relaxed">
            By verifying your phone number and continuing, you acknowledge that you have read and agree to our{' '}
            <button
              type="button"
              onClick={() => setShowTerms(true)}
              className="text-primary font-medium hover:underline"
            >
              Terms of Service
            </button>
            {' '}and{' '}
            <button
              type="button"
              onClick={() => setShowPrivacy(true)}
              className="text-primary font-medium hover:underline"
            >
              Privacy Policy
            </button>
            . We collect and process your data in accordance with applicable laws to provide you with our services.
          </p>
        </div>

        {/* Terms of Service Modal */}
        {showTerms && (
          <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-[60]">
            <div className="bg-white rounded-2xl p-6 w-full max-w-lg mx-4 max-h-[80vh] overflow-y-auto">
              <div className="flex justify-between items-center mb-4">
                <h3 className="text-lg font-bold text-gray-900">Terms of Service</h3>
                <button onClick={() => setShowTerms(false)} className="text-gray-400 hover:text-gray-600">
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M18 6L6 18M6 6l12 12" />
                  </svg>
                </button>
              </div>
              <div className="text-sm text-gray-600 space-y-4">
                <p><strong>Last Updated:</strong> January 2025</p>

                <div>
                  <h4 className="font-semibold text-gray-800 mb-1">1. Acceptance of Terms</h4>
                  <p>By accessing and using Adityanta ("the Platform"), you accept and agree to be bound by these Terms of Service. If you do not agree to these terms, please do not use our services.</p>
                </div>

                <div>
                  <h4 className="font-semibold text-gray-800 mb-1">2. Description of Service</h4>
                  <p>Adityanta provides an online platform for creating, editing, and sharing educational presentations and teaching materials. Our services include template access, presentation tools, and collaboration features.</p>
                </div>

                <div>
                  <h4 className="font-semibold text-gray-800 mb-1">3. User Accounts</h4>
                  <p>You are responsible for maintaining the confidentiality of your account credentials and for all activities that occur under your account. You must provide accurate and complete information during registration.</p>
                </div>

                <div>
                  <h4 className="font-semibold text-gray-800 mb-1">4. User Content</h4>
                  <p>You retain ownership of content you create. By uploading content, you grant Adityanta a non-exclusive license to host, display, and distribute your content solely for providing our services.</p>
                </div>

                <div>
                  <h4 className="font-semibold text-gray-800 mb-1">5. Acceptable Use</h4>
                  <p>You agree not to use the platform for any unlawful purpose, to upload harmful content, or to infringe upon the intellectual property rights of others.</p>
                </div>

                <div>
                  <h4 className="font-semibold text-gray-800 mb-1">6. Intellectual Property</h4>
                  <p>All platform features, templates, and design elements are owned by Adityanta. Users may use templates for personal and educational purposes but may not redistribute them commercially without permission.</p>
                </div>

                <div>
                  <h4 className="font-semibold text-gray-800 mb-1">7. Limitation of Liability</h4>
                  <p>Adityanta shall not be liable for any indirect, incidental, or consequential damages arising from your use of the platform.</p>
                </div>

                <div>
                  <h4 className="font-semibold text-gray-800 mb-1">8. Contact</h4>
                  <p>For questions about these Terms, please contact us at support@adityanta.com</p>
                </div>
              </div>
              <button
                onClick={() => setShowTerms(false)}
                className="w-full mt-6 py-3 bg-primary text-white rounded-lg font-medium hover:bg-primary-dark transition-colors"
              >
                I Understand
              </button>
            </div>
          </div>
        )}

        {/* Privacy Policy Modal */}
        {showPrivacy && (
          <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-[60]">
            <div className="bg-white rounded-2xl p-6 w-full max-w-lg mx-4 max-h-[80vh] overflow-y-auto">
              <div className="flex justify-between items-center mb-4">
                <h3 className="text-lg font-bold text-gray-900">Privacy Policy</h3>
                <button onClick={() => setShowPrivacy(false)} className="text-gray-400 hover:text-gray-600">
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M18 6L6 18M6 6l12 12" />
                  </svg>
                </button>
              </div>
              <div className="text-sm text-gray-600 space-y-4">
                <p><strong>Last Updated:</strong> January 2025</p>

                <div>
                  <h4 className="font-semibold text-gray-800 mb-1">1. Information We Collect</h4>
                  <p>We collect information you provide directly, including your phone number, name, email address (if using Google Sign-In), and any content you create on our platform.</p>
                </div>

                <div>
                  <h4 className="font-semibold text-gray-800 mb-1">2. How We Use Your Information</h4>
                  <p>We use your information to provide and improve our services, authenticate your identity, send important notifications, and enhance your user experience.</p>
                </div>

                <div>
                  <h4 className="font-semibold text-gray-800 mb-1">3. Data Storage and Security</h4>
                  <p>Your data is stored securely using industry-standard encryption. We implement appropriate technical and organizational measures to protect your personal information.</p>
                </div>

                <div>
                  <h4 className="font-semibold text-gray-800 mb-1">4. Information Sharing</h4>
                  <p>We do not sell your personal information. We may share data with service providers who assist in operating our platform, subject to confidentiality agreements.</p>
                </div>

                <div>
                  <h4 className="font-semibold text-gray-800 mb-1">5. Cookies and Analytics</h4>
                  <p>We use cookies and similar technologies to improve functionality and analyze usage patterns. You can manage cookie preferences through your browser settings.</p>
                </div>

                <div>
                  <h4 className="font-semibold text-gray-800 mb-1">6. Your Rights</h4>
                  <p>You have the right to access, correct, or delete your personal data. You may also request a copy of your data or withdraw consent for processing.</p>
                </div>

                <div>
                  <h4 className="font-semibold text-gray-800 mb-1">7. Data Retention</h4>
                  <p>We retain your data for as long as your account is active or as needed to provide services. You may request deletion of your account and associated data at any time.</p>
                </div>

                <div>
                  <h4 className="font-semibold text-gray-800 mb-1">8. Contact Us</h4>
                  <p>For privacy-related inquiries, please contact our Data Protection Officer at privacy@adityanta.com</p>
                </div>
              </div>
              <button
                onClick={() => setShowPrivacy(false)}
                className="w-full mt-6 py-3 bg-primary text-white rounded-lg font-medium hover:bg-primary-dark transition-colors"
              >
                I Understand
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

export default OTPModal
