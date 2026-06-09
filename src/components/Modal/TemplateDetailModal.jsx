import { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { useApp } from '../../context/AppContext'
import { useAuth } from '../../context/AuthContext'
import { useToast } from '../../context/ToastContext'
import { getLicenseDisplay, formatDownloads } from '../../utils/templateData'
import { isPremiumUser, getRemainingFreeDownloads } from '../../utils/membership'
import backgroundData from '../../utils/backgroundData.json'
import logger from '../../utils/logger'

const normalizeTopicForBackground = (topic) => {
  const value = `${topic || ''}`.trim().toLowerCase()
  const topicMap = {
    business: 'Business',
    economics: 'Economics',
    history: 'History',
    geography: 'Geography',
    science: 'Science',
    marketing: 'Marketing',
    'legal studies': 'Legal Studies',
    'political science': 'Political Science',
    'music and dance': 'Music and dance',
    'technology & computer subjects': 'Technology & Computer Subjects',
    'physical & skill subjects': 'Physical & Skill Subjects',
    mathematics: 'Maths',
    maths: 'Maths',
    math: 'Maths',
    finance: 'Finance',
    'financial markets management': 'Finance',
    'fine arts / painting': 'Fine Arts - Painting',
    'fine arts - painting': 'Fine Arts - Painting',
    generic: 'Generic',
    general: 'Generic',
  }
  return topicMap[value] || topic || 'Generic'
}

const isUrlLike = (value) => typeof value === 'string' && /^(https?:\/\/|www\.)/i.test(value.trim())

const getDisplayPreview = (template) => {
  const preview = `${template?.preview || ''}`.trim()
  if (!preview || isUrlLike(preview)) {
    return (template?.title || 'Template').split(' ').slice(0, 3).join(' ')
  }
  return preview
}

const pickTopicBackground = (template) => {
  const topicKey = normalizeTopicForBackground(template?.topic)
  const images = backgroundData[topicKey] || backgroundData.Generic || []
  if (images.length === 0) return null
  const stableKey = `${template?.template_id || template?.id || template?.title || ''}`
  let hash = 0
  for (let i = 0; i < stableKey.length; i += 1) hash = (hash * 31 + stableKey.charCodeAt(i)) >>> 0
  return images[hash % images.length]
}

const TemplateDetailModal = ({ template, onClose, onUpgrade }) => {
  const navigate = useNavigate()
  const toast = useToast()
  const { user } = useAuth()
  const { config, isFavorite, addFavorite, removeFavorite } = useApp()

  const [currentSlide, setCurrentSlide] = useState(0)
  const [favorite, setFavorite] = useState(false)
  const [downloading, setDownloading] = useState(false)
  const [selectedBackground, setSelectedBackground] = useState(null)
  const bgScrollRef = useRef(null)

  // Get available backgrounds for this template's topic
  const topicKey = normalizeTopicForBackground(template?.topic)
  const availableBackgrounds = [
    ...(backgroundData[topicKey] || []),
    ...(topicKey !== 'Generic' ? (backgroundData['Generic'] || []) : []),
  ]

  // Check if template is favorite
  useEffect(() => {
    setFavorite(isFavorite(template.template_id || template.id))
  }, [template, isFavorite])

  const isPaid = template.license === 'PAID' || template.license === 'Premium'
  const isUserPremium = isPremiumUser(user)
  const remainingDownloadsCount = getRemainingFreeDownloads(user, config?.free_downloads_limit ?? 0)
  const hasDownloadsRemaining = isUserPremium || remainingDownloadsCount > 0

  const handleUseTemplate = async () => {
    if (isPaid && !isUserPremium) {
      onUpgrade()
      return
    }

    // Check if free user has downloads remaining
    if (!isUserPremium && !hasDownloadsRemaining) {
      toast.error('You have used all your free downloads. Upgrade to premium for unlimited downloads.')
      onUpgrade()
      return
    }

    setDownloading(true)
    try {
      // Clear autosave to avoid loading previous edits
      localStorage.removeItem('adityanta_autosave')

      if (!template.template_id && !template.id) {
        throw new Error('Invalid template: missing ID')
      }

      // Navigate directly to editor - pass selected background via route state
      toast.success('Opening template...')
      navigate(`/editor/${template.template_id || template.id}`, {
        state: { selectedBackground: selectedBackground || null }
      })
    } catch (error) {
      logger.error('Use template failed:', error)
      toast.error('Failed to open template')
    } finally {
      setDownloading(false)
    }
  }

  const handleBookmarkClick = async () => {
    const templateId = template.template_id || template.id
    try {
      if (favorite) {
        await removeFavorite(templateId)
        setFavorite(false)
        toast.info('Removed from favorites')
      } else {
        await addFavorite(templateId)
        setFavorite(true)
        toast.success('Added to favorites')
      }
    } catch (error) {
      toast.error('Failed to update favorites')
    }
  }

  // Generate slides preview based on template frames count
  const slideCount = Math.max(1, template.frames || 1)
  const slides = Array.from({ length: slideCount }, (_, i) => ({
    preview: i === 0 ? getDisplayPreview(template) : `Slide ${i + 1}`,
    subtitle: i === 0 ? (template.description || 'A very brief description or a subtopic') : 'Additional content',
  }))

  const topicPreviewBackground = pickTopicBackground(template)

  // Get remaining downloads (from user profile - new API fields)
  const remainingDownloads = isUserPremium ? 'Unlimited' : remainingDownloadsCount

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div
        className="bg-white rounded-2xl w-full max-w-4xl max-h-[90vh] overflow-hidden shadow-2xl relative"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Close Button */}
        <button
          onClick={onClose}
          className="absolute top-4 right-4 w-8 h-8 bg-white rounded-full flex items-center justify-center shadow-lg hover:bg-gray-100 transition-all z-10"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M18 6L6 18M6 6l12 12" />
          </svg>
        </button>

        <div className="flex h-full">
          {/* Left Panel - Template Info */}
          <div className="w-1/3 p-6 border-r border-gray-100 overflow-y-auto">
            <h2 className="text-xl font-bold text-gray-900 mb-4">{template.title}</h2>

            {/* Meta Info */}
            <div className="space-y-2 mb-6 text-sm">
              <div className="flex items-center gap-2">
                <span className="text-gray-500">Topic:</span>
                <span className="font-medium text-gray-900">{template.topic}</span>
              </div>
              <div className="flex items-center gap-4">
                <div className="flex items-center gap-2">
                  <span className="text-gray-500">Frames:</span>
                  <span className="font-medium text-gray-900">{template.frames || 4}</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-gray-500">Downloads:</span>
                  <span className="font-medium text-gray-900">{formatDownloads(template.downloads)}</span>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-gray-500">License:</span>
                <span className={`font-medium ${isPaid ? 'text-orange-500' : 'text-primary'}`}>
                  {getLicenseDisplay(template.license)}
                </span>
              </div>
              {template.created_at && (
                <div className="flex items-center gap-2">
                  <span className="text-gray-500">Created:</span>
                  <span className="font-medium text-gray-900">
                    {new Date(template.created_at).toLocaleDateString()}
                  </span>
                </div>
              )}
            </div>

            {/* Action Buttons */}
            <div className="flex items-center gap-3 mb-6">
              <button
                onClick={handleUseTemplate}
                disabled={downloading || (!isUserPremium && !hasDownloadsRemaining)}
                className={`flex-1 py-3 rounded-xl font-semibold text-white transition-all disabled:opacity-70 disabled:cursor-not-allowed ${
                  !isUserPremium && !hasDownloadsRemaining
                    ? 'bg-gray-400'
                    : isPaid && !isUserPremium
                    ? 'bg-orange-500 hover:bg-orange-600'
                    : 'bg-primary hover:bg-primary-dark'
                }`}
              >
                {downloading ? (
                  <span className="flex items-center justify-center gap-2">
                    <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24" fill="none">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"/>
                    </svg>
                    Loading...
                  </span>
                ) : !isUserPremium && !hasDownloadsRemaining ? (
                  'No Downloads Left'
                ) : isPaid && !isUserPremium ? (
                  'Upgrade to Use'
                ) : (
                  'Use Template'
                )}
              </button>
              <button
                onClick={handleBookmarkClick}
                className={`w-12 h-12 rounded-xl border-2 flex items-center justify-center transition-all ${
                  favorite
                    ? 'bg-yellow-50 border-yellow-400 text-yellow-500'
                    : 'border-gray-200 text-gray-400 hover:border-gray-300'
                }`}
                title={favorite ? 'Remove from favorites' : 'Add to favorites'}
              >
                <svg width="20" height="20" viewBox="0 0 24 24" fill={favorite ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="2">
                  <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z" />
                </svg>
              </button>
            </div>

            {/* Remaining Downloads */}
            {!isUserPremium && (
              <div className="text-sm text-gray-500 mb-6 p-3 bg-gray-50 rounded-lg">
                <div className="flex items-center justify-between">
                  <span>Remaining free downloads:</span>
                  <span className="font-semibold text-gray-900">{remainingDownloads}</span>
                </div>
                {remainingDownloads <= 2 && (
                  <p className="text-orange-500 text-xs mt-1">
                    Running low! Upgrade for unlimited downloads.
                  </p>
                )}
              </div>
            )}

            {isUserPremium && (
              <div className="text-sm mb-6 p-3 bg-green-50 text-green-700 rounded-lg flex items-center gap-2">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M12 2L15.09 8.26L22 9.27L17 14.14L18.18 21.02L12 17.77L5.82 21.02L7 14.14L2 9.27L8.91 8.26L12 2Z" />
                </svg>
                Premium member - Unlimited downloads
              </div>
            )}

            {/* About Section */}
            <div>
              <h3 className="font-semibold text-gray-900 mb-2">About the template</h3>
              <p className="text-sm text-gray-600 leading-relaxed">
                {template.description || `A beautifully designed template for ${template.topic || 'educational'} presentations. Perfect for teachers and educators looking to create engaging slide content.`}
              </p>
            </div>

            {/* Background Selection */}
            {availableBackgrounds.length > 0 && (
              <div className="mt-6">
                <div className="flex items-center justify-between mb-2">
                  <h3 className="font-semibold text-gray-900">Choose Background</h3>
                  {selectedBackground && (
                    <span className="text-xs text-primary font-medium bg-primary/10 px-2 py-0.5 rounded-full">
                      Custom selected
                    </span>
                  )}
                </div>
                <p className="text-xs text-gray-500 mb-3">Select a background for your presentation</p>
                <div className="relative">
                  {/* Scroll left button */}
                  <button
                    onClick={() => bgScrollRef.current?.scrollBy({ left: -160, behavior: 'smooth' })}
                    className="absolute left-0 top-1/2 -translate-y-1/2 z-10 w-6 h-8 bg-white/90 border border-gray-200 rounded-md shadow-sm flex items-center justify-center hover:bg-gray-50 transition-all"
                    style={{ marginLeft: '-4px' }}
                  >
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="15 18 9 12 15 6"/></svg>
                  </button>

                  <div
                    ref={bgScrollRef}
                    className="no-scrollbar flex gap-2 overflow-x-auto px-7 pb-1"
                  >
                    {/* Auto / no background option */}
                    <button
                      onClick={() => setSelectedBackground(null)}
                      className={`flex-shrink-0 w-20 h-14 rounded-lg border-2 transition-all flex flex-col items-center justify-center gap-1 text-xs font-medium ${
                        selectedBackground === null
                          ? 'border-primary bg-primary/5 text-primary ring-2 ring-primary/20'
                          : 'border-gray-200 text-gray-400 hover:border-gray-300 hover:bg-gray-50'
                      }`}
                      title="Use automatic background"
                    >
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                        <circle cx="12" cy="12" r="10"/><path d="M12 8v4M12 16h.01"/>
                      </svg>
                      Auto
                    </button>

                    {availableBackgrounds.map((bgPath, idx) => (
                      <button
                        key={idx}
                        onClick={() => setSelectedBackground(bgPath)}
                        className={`flex-shrink-0 w-20 h-14 rounded-lg border-2 overflow-hidden transition-all relative group ${
                          selectedBackground === bgPath
                            ? 'border-primary ring-2 ring-primary/30 shadow-md'
                            : 'border-gray-200 hover:border-gray-400'
                        }`}
                        title={`Background ${idx + 1}`}
                      >
                        <img
                          src={bgPath}
                          alt={`Background ${idx + 1}`}
                          className="w-full h-full object-cover"
                          onError={(e) => {
                            e.target.style.display = 'none'
                            e.target.parentElement.style.backgroundColor = '#f3f4f6'
                          }}
                        />
                        {/* Selected checkmark */}
                        {selectedBackground === bgPath && (
                          <div className="absolute inset-0 bg-primary/20 flex items-center justify-center">
                            <div className="w-5 h-5 rounded-full bg-primary flex items-center justify-center shadow-sm">
                              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3">
                                <polyline points="20 6 9 17 4 12"/>
                              </svg>
                            </div>
                          </div>
                        )}
                        {/* Hover overlay */}
                        {selectedBackground !== bgPath && (
                          <div className="absolute inset-0 bg-black/0 group-hover:bg-black/10 transition-all" />
                        )}
                      </button>
                    ))}
                  </div>

                  {/* Scroll right button */}
                  <button
                    onClick={() => bgScrollRef.current?.scrollBy({ left: 160, behavior: 'smooth' })}
                    className="absolute right-0 top-1/2 -translate-y-1/2 z-10 w-6 h-8 bg-white/90 border border-gray-200 rounded-md shadow-sm flex items-center justify-center hover:bg-gray-50 transition-all"
                    style={{ marginRight: '-4px' }}
                  >
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="9 18 15 12 9 6"/></svg>
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Right Panel - Preview */}
          <div className="flex-1 p-6 bg-gray-50 flex flex-col">
            {/* Preview Area */}
            <div className={`flex-1 rounded-xl bg-gradient-to-br ${template.gradient || 'from-cyan-100 to-blue-100'} flex items-center justify-center relative overflow-hidden`}>
              {/* Selected background always takes priority in preview */}
              {selectedBackground ? (
                <>
                  <img
                    src={selectedBackground}
                    alt="Selected background"
                    className="absolute inset-0 w-full h-full object-cover"
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-black/50 to-transparent" />
                  <div className="text-center z-10 px-8">
                    <h1 className="text-4xl font-black text-white drop-shadow-lg mb-2">{slides[currentSlide].preview}</h1>
                    <p className="text-white/90">{slides[currentSlide].subtitle}</p>
                  </div>
                </>
              ) : template.thumbnail_url ? (
                <>
                  <img
                    src={template.thumbnail_url}
                    alt={template.title}
                    className="absolute inset-0 w-full h-full object-cover"
                    onError={(e) => {
                      e.target.style.display = 'none'
                    }}
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-black/40 to-transparent" />
                </>
              ) : (
                <>
                  {topicPreviewBackground && (
                    <img
                      src={topicPreviewBackground}
                      alt={`${template.topic || 'Generic'} preview background`}
                      className="absolute inset-0 w-full h-full object-cover"
                    />
                  )}
                  <div className="absolute inset-0 bg-gradient-to-t from-black/40 to-transparent" />
                  {/* Fallback Decorative Elements */}
                  <div className="absolute inset-0 opacity-20">
                    <div className="absolute top-4 left-4 w-16 h-4 bg-yellow-400 rounded transform rotate-12" />
                    <div className="absolute top-8 right-8 w-12 h-12">
                      <svg viewBox="0 0 100 100" className="w-full h-full">
                        <circle cx="50" cy="50" r="40" fill="#4CAF50" opacity="0.7" />
                      </svg>
                    </div>
                    <div className="absolute bottom-8 left-8">
                      <svg width="60" height="60" viewBox="0 0 60 60">
                        <path d="M30 50 L20 40 L30 10 L40 40 Z" fill="#FF5722" opacity="0.7" />
                      </svg>
                    </div>
                    <div className="absolute bottom-4 right-4 w-16 h-16">
                      <svg viewBox="0 0 100 100" className="w-full h-full">
                        <circle cx="50" cy="50" r="35" fill="#2196F3" opacity="0.7" />
                        <ellipse cx="50" cy="50" rx="45" ry="15" fill="none" stroke="#FFD700" strokeWidth="3" transform="rotate(-20 50 50)" />
                      </svg>
                    </div>
                  </div>

                  {/* Main Content */}
                  <div className="text-center z-10 px-8">
                    <h1 className="text-4xl font-black text-white drop-shadow-lg mb-2">{slides[currentSlide].preview}</h1>
                    <p className="text-white/90">{slides[currentSlide].subtitle}</p>
                  </div>
                </>
              )}

              {/* Premium Badge */}
              {isPaid && (
                <div className="absolute top-4 right-4 bg-orange-500 text-white text-xs font-semibold px-3 py-1 rounded-full flex items-center gap-1 z-20">
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M12 2L15.09 8.26L22 9.27L17 14.14L18.18 21.02L12 17.77L5.82 21.02L7 14.14L2 9.27L8.91 8.26L12 2Z" />
                  </svg>
                  Premium
                </div>
              )}
            </div>

            {/* Navigation Dots */}
            <div className="flex items-center justify-center gap-2 mt-4">
              <button
                onClick={() => setCurrentSlide(Math.max(0, currentSlide - 1))}
                disabled={currentSlide === 0}
                className="w-8 h-8 rounded-full border border-gray-200 flex items-center justify-center disabled:opacity-50 hover:bg-gray-100 transition-all"
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <polyline points="15 18 9 12 15 6" />
                </svg>
              </button>
              {slides.map((_, index) => (
                <button
                  key={index}
                  onClick={() => setCurrentSlide(index)}
                  className={`h-2 rounded-full transition-all ${
                    currentSlide === index ? 'bg-primary w-6' : 'bg-gray-300 w-2 hover:bg-gray-400'
                  }`}
                />
              ))}
              <button
                onClick={() => setCurrentSlide(Math.min(slides.length - 1, currentSlide + 1))}
                disabled={currentSlide === slides.length - 1}
                className="w-8 h-8 rounded-full border border-gray-200 flex items-center justify-center disabled:opacity-50 hover:bg-gray-100 transition-all"
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <polyline points="9 18 15 12 9 6" />
                </svg>
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

export default TemplateDetailModal
