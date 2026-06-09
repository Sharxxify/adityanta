import { useState, useEffect } from "react";
import { useNavigate, useSearchParams, useLocation } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";
import { useToast } from "../../context/ToastContext";
import logger from "../../utils/logger";
import OTPModal from "../../components/Modal/OTPModal";
import logo from "../../assets/logo.png";
import mandala from "../../assets/mandala.png";

export default function LoginPage() {
  const [phoneNumber, setPhoneNumber] = useState("");
  const [showOTP, setShowOTP] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [otpError, setOtpError] = useState(null);
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { user, isAuthenticated, login, verifyOTP, googleLogin, isFirebaseConfigured } = useAuth();
  const toast = useToast();



  const isProfileComplete = (profile) => {
    if (!profile) return false;

    // Respect explicit backend flags first
    if (profile.profile_complete === true || profile.profileComplete === true) return true;
    if (profile.profile_complete === false || profile.profileComplete === false) return false;

    // Fallback to field-based completeness check
    const hasName = Boolean((profile.name || '').trim());
    const hasGender = Boolean((profile.gender || '').trim());
    const hasAddress = Boolean((profile.address || '').trim());
    const hasCity = Boolean((profile.city || '').trim());
    const hasState = Boolean((profile.state || '').trim());
    const hasPincode = Boolean((profile.pincode || '').trim());
    const isGoogleUser = profile.authProvider === 'google';

    if (isGoogleUser) {
      const hasEmail = Boolean((profile.email || '').trim());
      return hasName && hasEmail && hasGender && hasAddress && hasCity && hasState && hasPincode;
    }

    const hasPhone = Boolean((profile.phone || '').trim());
    return hasName && hasPhone && hasGender && hasAddress && hasCity && hasState && hasPincode;
  };

  const location = useLocation();

  // Redirect to home if already logged in (handles Google redirect return)
  useEffect(() => {
    if (isAuthenticated && user) {
      // For existing sessions, always land on intended page or home page 
      // Users can complete their profile later via settings
      const from = location.state?.from ? location.state.from.pathname + location.state.from.search + location.state.from.hash : "/home";
      navigate(from, { replace: true });
    }
  }, [isAuthenticated, user, navigate, location]);

  // Detect Razorpay payment redirect and forward to PaymentSuccess page
  useEffect(() => {
    const paymentId = searchParams.get('razorpay_payment_id');
    const paymentLinkId = searchParams.get('razorpay_payment_link_id');
    const status = searchParams.get('razorpay_payment_link_status');

    if (paymentId || paymentLinkId || status === 'paid') {
      navigate(`/payment-success?${searchParams.toString()}`, { replace: true });
    }
  }, [searchParams, navigate]);

  const validatePhoneNumber = (phone) => {
    // Indian phone number validation (10 digits, starts with 6-9)
    return /^[6-9]\d{9}$/.test(phone);
  };

  const handleContinue = async (e) => {
    e.preventDefault();
    if (!validatePhoneNumber(phoneNumber)) {
      toast.error("Please enter a valid 10-digit phone number");
      return;
    }

    setIsLoading(true);
    try {
      const response = await login(`+91${phoneNumber}`);
      if (response && response.success !== false) {
        setShowOTP(true);
        toast.success("OTP sent successfully!");
      } else {
        toast.error(response?.message || "Failed to send OTP. Please try again.");
      }
    } catch (error) {
      logger.error("Login error:", error);
      toast.error("Failed to send OTP. Please check your connection and try again.");
    } finally {
      setIsLoading(false);
    }
  };

  const handleOTPSuccess = async (otpValue) => {
    setIsLoading(true);
    setOtpError(null);
    try {
      const response = await verifyOTP(`+91${phoneNumber}`, otpValue);
      if (response && response.success) {
        toast.success("Login successful!");
        const shouldSetupProfile = response?.isNewUser === true || !isProfileComplete(response?.user || {});
        const from = location.state?.from ? location.state.from.pathname + location.state.from.search + location.state.from.hash : "/home";
        navigate(shouldSetupProfile ? "/profile-setup" : from);
      } else {
        setOtpError(response?.message || "Invalid OTP. Please try again.");
      }
    } catch (error) {
      logger.error("OTP verification error:", error);
      setOtpError("Verification failed. Please check your connection and try again.");
    } finally {
      setIsLoading(false);
    }
  };

  const handleResendOTP = async () => {
    try {
      const response = await login(`+91${phoneNumber}`);
      if (response && response.success !== false) {
        toast.success("OTP resent successfully!");
      } else {
        toast.error("Failed to resend OTP");
      }
    } catch (error) {
      logger.error("Resend OTP error:", error);
      toast.error("Failed to resend OTP. Please try again.");
    }
  };

  const handleGoogleLogin = async () => {
    setIsLoading(true);
    try {
      const response = await googleLogin();
      // signInWithRedirect will redirect away from this page
      // If we get a response, it means there was an error
      if (response && !response.success) {
        toast.error(response?.message || "Google sign-in failed. Please try again.");
        setIsLoading(false);
      }
    } catch (error) {
      logger.error("Google login error:", error);
      toast.error("Google sign-in failed. Please try again.");
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col lg:flex-row overflow-hidden">
      {/* LEFT PANEL - Hidden on small screens to prevent overlap */}
      <div className="hidden lg:block w-1/2 relative overflow-hidden min-h-screen px-8">

        {/* MANDALA BACKGROUND */}
        <div
          className="absolute inset-0 bg-repeat bg-center"
          style={{
            backgroundImage: `url(${mandala})`,
            opacity: 1
          }}
        />

        {/* GRADIENT OVERLAY (allows mandala visibility) */}
        <div
          className="absolute inset-0 pointer-events-none"
          style={{
            background: "linear-gradient(to bottom, #F6E6D4 0%, #EAD3BD 45%, #9FC6B2 100%)",
            opacity: 0.75
          }}
        />

        {/* CENTER CIRCLE */}
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="relative flex flex-col items-center">
            <div
              className="
                w-60 h-60
                md:w-64 md:h-64
                rounded-full
                border-2 border-b-0 border-[#FFA040]
                bg-gradient-to-b from-white to-transparent
                flex flex-col items-center justify-center
                text-center
              "
            >
              <img src={logo} alt="logo" className="w-36 md:w-47 mb-3" />
              <p className="text-xs sm:text-sm font-medium text-gray-500 px-6 leading-relaxed max-w-[250px]">
                How does it work and what can you do with it all?
              </p>
            </div>
          </div>
        </div>

        {/* CARDS */}
        <Card
          title="Start with Adityanta"
          text="Adityanta projects feature a quick, interactive, game-like lesson to instantly master navigation controls."
          className="sm:top-14 top-8 sm:left-14 left-6 rotate-[-3deg]"
        />

        <Card
          title="Conclusion"
          text="Adityanta is a simple yet powerful tool with extensive features for creating stunning, interactive presentations."
          className="sm:top-14 top-8 sm:right-14 right-6 rotate-[3deg]"
        />

        <Card
          title="Create it yourself"
          text="Easily adjust size, color, text, and rotation with a single click—it's self-explanatory. Add content (shapes, files, videos) using the 'insert' menu."
          className="sm:bottom-16 bottom-10 sm:left-14 left-6 rotate-[2deg]"
        />

        <Card
          title="Building Frames"
          text="Create your presentation frames by setting fixed points to form a path, highlighting the parts of your canvas you want to showcase."
          className="sm:bottom-16 bottom-10 sm:right-14 right-6 rotate-[-2deg]"
        />
        {/* DECORATIVE ARROWS */}
        {/* CONNECTING ARROW — Start with Adityanta → Create it yourself */}
        <svg
          className="absolute inset-0 pointer-events-none w-full h-full hidden sm:block"
          viewBox="0 00 1750 780"
          preserveAspectRatio="none"
          aria-hidden
        >
          <defs>
            {/* TRANSPARENT AT START → SOLID AT MID */}
            <linearGradient
              id="arrowFade"
              x1="0"
              y1="0"
              x2="0"
              y2="1"
            >
              <stop offset="0%" stopColor="#FFA040" stopOpacity="0" />
              <stop offset="50%" stopColor="#FFA040" stopOpacity="1" />
              <stop offset="100%" stopColor="#FFA040" stopOpacity="1" />
            </linearGradient>
          </defs>

          {/* MAIN CURVED LINE — STARTS AT BORDER, NOT INSIDE */}
          <path
            d="
              M 200 200
              C 190 300, 310 410, 280 560
            "
            stroke="url(#arrowFade)"
            strokeWidth="5"
            fill="none"
            strokeLinecap="round"
          />

          {/* ARROW HEAD — SOLID */}
          <path
            d="
              M 250 545
              L 280 565
              L 310 545
            "
            stroke="#FFA040"
            strokeWidth="5"
            fill="none"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>

        {/* CONNECTING ARROW — Circle → Start with Adityanta */}
        <svg
          className="absolute inset-0 pointer-events-none w-full h-full hidden sm:block"
          viewBox="-51 17 1440 900"
          preserveAspectRatio="none"
          aria-hidden
        >
          <defs>
            <linearGradient
              id="arrowFade2"
              gradientUnits="userSpaceOnUse"
              x1="440"
              y1="430"
              x2="250"
              y2="245"
            >
              <stop offset="0%" stopColor="#FFA040" stopOpacity="0" />
              <stop offset="55%" stopColor="#FFA040" stopOpacity="1" />
              <stop offset="100%" stopColor="#FFA040" stopOpacity="1" />
            </linearGradient>
          </defs>

          {/* MAIN CURVE */}
          <path
            d="
              M 470 430
              C 250 410, 250 310, 250 245
            "
            stroke="url(#arrowFade2)"
            strokeWidth="5"
            fill="none"
            strokeLinecap="round"
          />

          {/* ARROW HEAD */}
          <path
            d="
              M 220 265
              L 250 245
              L 280 265
            "
            stroke="#FFA040"
            strokeWidth="5"
            fill="none"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>

        {/* CONNECTING ARROW — Building Frames → Conclusion */}
        <svg
          className="absolute inset-0 pointer-events-none w-full h-full hidden sm:block"
          viewBox="-80 20 1450 765"
          preserveAspectRatio="none"
          aria-hidden
        >
          <defs>
            {/* Fade starts at Building Frames border */}
            <linearGradient
              id="arrowFade3"
              gradientUnits="userSpaceOnUse"
              x1="1050"
              y1="560"
              x2="1050"
              y2="180"
            >
              <stop offset="0%" stopColor="#FFA040" stopOpacity="0" />
              <stop offset="55%" stopColor="#FFA040" stopOpacity="1" />
              <stop offset="100%" stopColor="#FFA040" stopOpacity="1" />
            </linearGradient>
          </defs>

          {/* MAIN CURVE — MATCHES REFERENCE IMAGE */}
          <path
            d="
              M 1050 560
              C 1020 470, 1050 200, 1050 200
            "
            stroke="url(#arrowFade3)"
            strokeWidth="5"
            fill="none"
            strokeLinecap="round"
          />

          {/* ARROW HEAD — SAME SIZE AS ARROW 1 & 2 */}
          <path
            d="
              M 1020 215
              L 1050 195
              L 1080 215
            "
            stroke="#FFA040"
            strokeWidth="5"
            fill="none"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>

        {/* CONNECTING ARROW — Create it yourself → Building Frames */}
        <svg
          className="absolute inset-0 pointer-events-none w-full h-full hidden sm:block"
          viewBox="-97 -110 1450 750"
          preserveAspectRatio="none"
          aria-hidden
        >
          <defs>
            <linearGradient
              id="arrowFade4"
              gradientUnits="userSpaceOnUse"
              x1="395"
              y1="520"
              x2="760"
              y2="520"
            >
              {/* fade starts AFTER card */}
              <stop offset="0%" stopColor="#FFA040" stopOpacity="0" />
              <stop offset="45%" stopColor="#FFA040" stopOpacity="1" />
              <stop offset="100%" stopColor="#FFA040" stopOpacity="1" />
            </linearGradient>
          </defs>

          {/* MAIN CURVE — start shifted right */}
          <path
            d="
              M 395 520
              C 520 480, 640 550, 760 520
            "
            stroke="url(#arrowFade4)"
            strokeWidth="5"
            fill="none"
            strokeLinecap="round"
          />

          {/* ARROW HEAD — unchanged */}
          <path
            d="
              M 745 505
              L 765 520
              L 745 535
            "
            stroke="#FFA040"
            strokeWidth="5"
            fill="none"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </div>

      {/* RIGHT PANEL */}
      <div className="w-full lg:w-1/2 flex items-center justify-center bg-[#FFFDFB] min-h-screen px-4 sm:px-8 relative">
        {/* Orange tint on right 20% */}
        <div
          className="absolute top-0 right-0 w-[20%] h-full pointer-events-none"
          style={{
            background: 'linear-gradient(to left, rgba(255, 160, 64, 0.08) 0%, transparent 100%)'
          }}
        />
        <div className="w-full max-w-sm md:max-w-md px-4 sm:px-6 relative z-10">
          <img src={logo} alt="logo" className="w-48 mb-12" />

          <h2 className="text-2xl font-bold mb-2 text-gray-900">
            Welcome back
          </h2>
          <p className="text-sm text-gray-600 mb-6">
            Please enter your details to sign in
          </p>

          <form onSubmit={handleContinue} className="space-y-6">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Phone Number
              </label>
              <div className="relative">
                <span className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-500 font-medium">
                  +91
                </span>
                <input
                  type="tel"
                  value={phoneNumber}
                  onChange={(e) =>
                    setPhoneNumber(e.target.value.replace(/\D/g, ""))
                  }
                  placeholder="Enter phone number"
                  maxLength="10"
                  disabled={isLoading}
                  className="w-full pl-14 pr-4 py-3 rounded-md border border-gray-300 focus:outline-none focus:ring-2 focus:ring-[#8CB9A3] disabled:bg-gray-50 disabled:cursor-not-allowed"
                />
              </div>
              {phoneNumber.length > 0 && !validatePhoneNumber(phoneNumber) && (
                <p className="mt-1 text-xs text-red-500">
                  Enter a valid 10-digit mobile number
                </p>
              )}
            </div>

            <button
              type="submit"
              disabled={!validatePhoneNumber(phoneNumber) || isLoading}
              className={`w-full py-3 rounded-md text-white font-semibold transition-all flex items-center justify-center gap-2 ${validatePhoneNumber(phoneNumber) && !isLoading
                ? "bg-[#006633] hover:bg-[#004d24]"
                : "bg-[#006633]/50 cursor-not-allowed"
                }`}
            >
              {isLoading ? (
                <>
                  <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                  </svg>
                  Sending OTP...
                </>
              ) : (
                "Continue"
              )}
            </button>

            {/* Google Sign In */}
            <div className="flex items-center gap-4">
              <div className="flex-1 h-px bg-gray-300" />
              <span className="text-xs text-gray-500 font-medium">OR</span>
              <div className="flex-1 h-px bg-gray-300" />
            </div>

            <button
              type="button"
              onClick={handleGoogleLogin}
              disabled={isLoading}
              className="w-full flex items-center justify-center gap-3 py-3 rounded-md border border-gray-300 bg-white hover:bg-gray-50 text-gray-700 font-medium transition-all disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <svg width="20" height="20" viewBox="0 0 24 24">
                <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4" />
                <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
                <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05" />
                <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
              </svg>
              Sign in with Google
            </button>
          </form>
        </div>
      </div>

      {/* OTP MODAL */}
      {showOTP && (
        <OTPModal
          phoneNumber={phoneNumber}
          onClose={() => {
            setShowOTP(false);
            setOtpError(null);
          }}
          onSuccess={handleOTPSuccess}
          onResend={handleResendOTP}
          isLoading={isLoading}
          error={otpError}
        />
      )}
    </div>
  );
}

function Card({ title, text, className }) {
  return (
    <div
      className={`
        absolute
        w-64 sm:w-[260px] md:w-[280px]
        min-h-[110px] md:min-h-[120px]
        p-4 sm:p-5
        bg-gradient-to-r from-white to-transparent
        rounded-lg
        border-l-2 border-[#FFA040]
        overflow-hidden
        ${className}
      `}
    >
      {/* TOP BORDER */}
      <div className="absolute top-0 left-0 right-0 h-[2.5px] bg-gradient-to-r from-[#FFA040] to-transparent" />

      {/* BOTTOM BORDER */}
      <div className="absolute bottom-0 left-0 right-0 h-[2.5px] bg-gradient-to-r from-[#FFA040] to-transparent" />

      <div className="relative">
        <h4 className="font-semibold text-sm sm:text-[15px] md:text-base mb-1">
          {title}
        </h4>
        <p className="text-gray-600 text-[11px] sm:text-xs leading-relaxed">
          {text}
        </p>
      </div>
    </div>
  );
}
