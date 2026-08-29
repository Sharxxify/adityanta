/**
 * Reusable skeleton loading component
 */
const Skeleton = ({ variant = 'card', count = 1, className = '' }) => {
  const skeletons = Array.from({ length: count })

  const renderSkeleton = () => {
    switch (variant) {
      case 'card':
        return (
          <div className={`bg-white rounded-xl p-4 ${className}`}>
            <div className="animate-pulse">
              {/* Gradient thumbnail */}
              <div className="w-full h-36 bg-gradient-to-br from-gray-200 to-gray-300 rounded-lg mb-3"></div>
              {/* Title */}
              <div className="h-5 bg-gray-200 rounded w-3/4 mb-2"></div>
              {/* Subtitle */}
              <div className="h-4 bg-gray-200 rounded w-1/2"></div>
            </div>
          </div>
        )

      case 'list':
        return (
          <div className={`bg-white rounded-lg p-4 ${className}`}>
            <div className="animate-pulse flex items-center gap-4">
              {/* Icon/Thumbnail */}
              <div className="w-12 h-12 bg-gray-200 rounded"></div>
              {/* Content */}
              <div className="flex-1">
                <div className="h-5 bg-gray-200 rounded w-2/3 mb-2"></div>
                <div className="h-4 bg-gray-200 rounded w-1/2"></div>
              </div>
            </div>
          </div>
        )

      case 'text':
        return (
          <div className={`animate-pulse ${className}`}>
            <div className="h-4 bg-gray-200 rounded w-full mb-2"></div>
            <div className="h-4 bg-gray-200 rounded w-5/6"></div>
          </div>
        )

      case 'circle':
        return (
          <div className={`animate-pulse ${className}`}>
            <div className="w-12 h-12 bg-gray-200 rounded-full"></div>
          </div>
        )

      case 'avatar':
        return (
          <div className={`animate-pulse flex items-center gap-3 ${className}`}>
            <div className="w-10 h-10 bg-gray-200 rounded-full"></div>
            <div className="flex-1">
              <div className="h-4 bg-gray-200 rounded w-24 mb-1"></div>
              <div className="h-3 bg-gray-200 rounded w-16"></div>
            </div>
          </div>
        )

      default:
        return (
          <div className={`animate-pulse bg-gray-200 rounded ${className}`}>
            <div className="h-full w-full"></div>
          </div>
        )
    }
  }

  return (
    <>
      {skeletons.map((_, index) => (
        <div key={index}>{renderSkeleton()}</div>
      ))}
    </>
  )
}

export default Skeleton
