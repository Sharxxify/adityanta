import { Navigate, useLocation } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'

/**
 * PrivateRoute component - protects routes that require authentication
 * Redirects to login page if user is not authenticated
 */
const PrivateRoute = ({ children }) => {
  const { user, isLoading } = useAuth()
  const location = useLocation()



  // Show nothing while checking authentication status
  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-[#FFFDFB] via-[#FFF9F5] to-[#F6E6D4]">
        <div className="text-center">
          <div className="w-16 h-16 border-4 border-[#006633] border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-gray-600">Loading...</p>
        </div>
      </div>
    )
  }

  // Redirect to login if not authenticated
  if (!user) {
    return <Navigate to="/" state={{ from: location }} replace />
  }

  // Render the protected component
  return children
}

export default PrivateRoute
