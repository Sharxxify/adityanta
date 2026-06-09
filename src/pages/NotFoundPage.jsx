import { useNavigate } from 'react-router-dom'
import logo from '../assets/logo.png'

export default function NotFoundPage() {
  const navigate = useNavigate()

  return (
    <div className="min-h-screen bg-gradient-to-br from-[#FFFDFB] via-[#FFF9F5] to-[#F6E6D4] flex items-center justify-center px-4">
      <div className="text-center">
        <img src={logo} alt="Adityanta" className="h-16 mx-auto mb-8" />

        <div className="mb-8">
          <h1 className="text-9xl font-bold text-[#006633] mb-4">404</h1>
          <h2 className="text-3xl font-semibold text-gray-800 mb-2">Page Not Found</h2>
          <p className="text-gray-600 max-w-md mx-auto">
            Oops! The page you're looking for doesn't exist. It might have been moved or deleted.
          </p>
        </div>

        <div className="flex gap-4 justify-center">
          <button
            onClick={() => navigate(-1)}
            className="px-6 py-3 rounded-lg border-2 border-[#006633] text-[#006633] font-semibold hover:bg-[#006633]/5 transition-colors"
          >
            Go Back
          </button>
          <button
            onClick={() => navigate('/home')}
            className="px-6 py-3 rounded-lg bg-[#006633] text-white font-semibold hover:bg-[#004d24] transition-colors shadow-lg"
          >
            Go to Home
          </button>
        </div>

        <div className="mt-12 text-sm text-gray-500">
          <p>Need help? Contact support or check our documentation.</p>
        </div>
      </div>
    </div>
  )
}
