import { useEffect, useState, useRef } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext'
import { useToast } from '../../context/ToastContext'
import { userAPI } from '../../services/api'
import { compressProfileImage, compressCoverImage } from '../../utils/imageUtils'
import logger from '../../utils/logger'
import logo from '../../assets/logo.png'

const TITLES = ['Mr', 'Ms', 'Mrs', 'Dr', 'Prof']
const GENDERS = ['male', 'female', 'other'] // API expects lowercase

const INDIAN_STATES = [
  'Andhra Pradesh', 'Arunachal Pradesh', 'Assam', 'Bihar', 'Chhattisgarh',
  'Goa', 'Gujarat', 'Haryana', 'Himachal Pradesh', 'Jharkhand', 'Karnataka',
  'Kerala', 'Madhya Pradesh', 'Maharashtra', 'Manipur', 'Meghalaya', 'Mizoram',
  'Nagaland', 'Odisha', 'Punjab', 'Rajasthan', 'Sikkim', 'Tamil Nadu',
  'Telangana', 'Tripura', 'Uttar Pradesh', 'Uttarakhand', 'West Bengal',
  'Delhi', 'Jammu and Kashmir', 'Ladakh'
]

export default function ProfileSetupPage() {
  const navigate = useNavigate()
  const location = useLocation()
  const { user, updateProfile } = useAuth()
  const toast = useToast()
  const fileInputRef = useRef(null)
  const coverInputRef = useRef(null)

  const [isLoading, setIsLoading] = useState(false)
  const [profileImage, setProfileImage] = useState(null)
  const [profileImagePreview, setProfileImagePreview] = useState(user?.profilePhoto || user?.picture || null)
  const [coverImage, setCoverImage] = useState(null)
  const [coverImagePreview, setCoverImagePreview] = useState(user?.coverPhoto || null)

  const isEditingProfile = location.pathname === '/profile'
  const isExistingUser = user?.profile_complete || user?.profileComplete || user?.name || user?.email

  const [formData, setFormData] = useState({
    title: user?.title || '',
    fullName: user?.name || '',
    gender: user?.gender || '',
    phone: user?.phone?.replace('+91', '') || '',
    email: user?.email || '',
    city: user?.city || '',
    state: user?.state || '',
    address: user?.address || '',
    pincode: user?.pincode || ''
  })

  const [errors, setErrors] = useState({})

  useEffect(() => {
    if (!user) return
    setFormData({
      title: user?.title || '',
      fullName: user?.name || '',
      gender: user?.gender || '',
      phone: user?.phone?.replace('+91', '') || '',
      email: user?.email || '',
      city: user?.city || '',
      state: user?.state || '',
      address: user?.address || '',
      pincode: user?.pincode || ''
    })
    // Update profile image preview if user has one
    if (user?.profilePhoto || user?.picture) {
      setProfileImagePreview(user?.profilePhoto || user?.picture)
    }
    // Update cover image preview if user has one
    if (user?.coverPhoto) {
      setCoverImagePreview(user?.coverPhoto)
    }
  }, [user])

  const handleInputChange = (e) => {
    const { name, value } = e.target
    setFormData(prev => ({ ...prev, [name]: value }))
    if (errors[name]) {
      setErrors(prev => ({ ...prev, [name]: '' }))
    }
  }

  const handleImageClick = () => {
    fileInputRef.current?.click()
  }

  const handleImageChange = async (e) => {
    const file = e.target.files?.[0]
    if (file) {
      if (file.size > 5 * 1024 * 1024) {
        toast.error('Image size should be less than 5MB')
        return
      }
      setProfileImage(file)
      const reader = new FileReader()
      reader.onloadend = async () => {
        try {
          // Compress image to reduce storage size
          const compressed = await compressProfileImage(reader.result)
          setProfileImagePreview(compressed)
        } catch (error) {
          logger.error('Image compression failed:', error)
          // Fallback to original if compression fails
          setProfileImagePreview(reader.result)
        }
      }
      reader.readAsDataURL(file)
    }
  }

  const handleCoverClick = () => {
    coverInputRef.current?.click()
  }

  const handleCoverChange = async (e) => {
    const file = e.target.files?.[0]
    if (file) {
      if (file.size > 5 * 1024 * 1024) {
        toast.error('Cover image size should be less than 5MB')
        return
      }
      setCoverImage(file)
      const reader = new FileReader()
      reader.onloadend = async () => {
        try {
          // Compress cover image to reduce storage size
          const compressed = await compressCoverImage(reader.result)
          setCoverImagePreview(compressed)
        } catch (error) {
          logger.error('Cover image compression failed:', error)
          // Fallback to original if compression fails
          setCoverImagePreview(reader.result)
        }
      }
      reader.readAsDataURL(file)
    }
  }

  // Check if user signed in via Google (no phone number)
  const isGoogleUser = user?.authProvider === 'google' || user?.email && !user?.phone

  const validateForm = () => {
    const newErrors = {}

    if (!formData.fullName.trim()) newErrors.fullName = 'Full name is required'
    if (!formData.gender) newErrors.gender = 'Please select gender'
    
    // Email is required for Google users, optional for phone users
    if (isGoogleUser && !formData.email.trim()) {
      newErrors.email = 'Email is required'
    } else if (formData.email.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.email)) {
      newErrors.email = 'Please enter a valid email'
    }
    
    if (!formData.address.trim()) newErrors.address = 'Address is required'
    if (!formData.city.trim()) newErrors.city = 'City is required'
    if (!formData.state) newErrors.state = 'Please select state'
    if (!formData.pincode.trim()) {
      newErrors.pincode = 'Pincode is required'
    } else if (!/^\d{6}$/.test(formData.pincode)) {
      newErrors.pincode = 'Please enter valid 6-digit pincode'
    }

    setErrors(newErrors)
    return Object.keys(newErrors).length === 0
  }

  const handleSubmit = async (e) => {
    e.preventDefault()

    if (!validateForm()) {
      toast.error('Please fill all required fields correctly')
      return
    }

    setIsLoading(true)
    try {
      const profileData = {
        name: formData.fullName,
        gender: formData.gender,
        city: formData.city,
        state: formData.state,
        address: formData.address,
        pincode: formData.pincode
      }

      if (formData.title) profileData.title = formData.title
      if (formData.email.trim()) profileData.email = formData.email.trim()

      // Include phone for Google users if they entered one
      if (isGoogleUser && formData.phone.trim()) {
        profileData.phone = '+91' + formData.phone.trim()
      }

      // Upload profile picture to S3 if a new image was selected
      if (profileImage) {
        try {
          const uploadResponse = await userAPI.uploadProfilePicture(profileImage)
          if (uploadResponse?.success && uploadResponse?.profilePictureUrl) {
            profileData.profilePhoto = uploadResponse.profilePictureUrl
          }
        } catch (uploadError) {
          logger.error('Profile picture upload failed:', uploadError)
          toast.error('Failed to upload profile picture')
          setIsLoading(false)
          return
        }
      } else if (profileImagePreview && profileImagePreview.startsWith('http')) {
        // Keep existing URL if no new image was uploaded
        profileData.profilePhoto = profileImagePreview
      }

      // Include cover photo as base64 if uploaded (cover photo doesn't have S3 upload yet)
      if (coverImagePreview && !coverImagePreview.startsWith('http')) {
        profileData.coverPhoto = coverImagePreview
      } else if (coverImagePreview && coverImagePreview.startsWith('http')) {
        // Keep existing URL
        profileData.coverPhoto = coverImagePreview
      }

      const response = await updateProfile(profileData)

      if (response?.success) {
        toast.success(isEditingProfile || isExistingUser ? 'Profile updated!' : 'Profile setup complete!')
        navigate('/home')
      } else {
        toast.error(response?.message || 'Failed to save profile')
      }
    } catch (error) {
      logger.error('Profile setup error:', error)
      toast.error('Failed to save profile. Please try again.')
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-[#FFFDFB] via-[#FFF9F5] to-[#F6E6D4]" style={{ minHeight: '100dvh' }}>
      {/* Fixed Background Layer to prevent cutoff */}
      <div className="fixed inset-0 bg-gradient-to-br from-[#FFFDFB] via-[#FFF9F5] to-[#F6E6D4] -z-10" />
      
      {/* Header */}
      <div className="bg-white/80 backdrop-blur-sm border-b border-gray-100 sticky top-0 z-10">
        <div className="max-w-4xl mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            {(isEditingProfile || isExistingUser) && (
              <button
                onClick={() => navigate('/home')}
                className="flex items-center gap-1.5 text-gray-600 hover:text-gray-900 transition-colors"
              >
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
                </svg>
                <span className="text-sm font-medium">Back</span>
              </button>
            )}
            <img src={logo} alt="Adityanta" className="h-10" />
          </div>
          {!isEditingProfile && !isExistingUser && (
            <div className="text-sm text-gray-500">
              Step 1 of 1 - Complete Your Profile
            </div>
          )}
        </div>
      </div>

      {/* Main Content */}
      <div className="max-w-2xl mx-auto px-4 py-8 pb-16">
        <div className="bg-white rounded-2xl shadow-lg border border-gray-100 overflow-hidden">
          {/* Header Section with Editable Cover */}
          {(() => {
            // Check if all required details are filled
            const hasRequiredDetails = user?.name && user?.gender && user?.address && user?.city && user?.state && user?.pincode
            // Check if photos are uploaded
            const hasProfilePhoto = user?.profilePhoto || user?.picture
            const hasCoverPhoto = user?.coverPhoto || coverImagePreview
            const hasAllPhotos = hasProfilePhoto && hasCoverPhoto

            // Determine what message to show
            let headerTitle = ''
            let headerSubtitle = ''

            if (!isEditingProfile && !isExistingUser) {
              headerTitle = 'Welcome to Adityanta!'
              headerSubtitle = "Let's set up your profile to get started"
            } else if (hasRequiredDetails && !hasAllPhotos) {
              headerTitle = ''
              headerSubtitle = 'Update background and profile photo'
            } else if (hasRequiredDetails && hasAllPhotos) {
              headerTitle = ''
              headerSubtitle = ''
            } else {
              headerTitle = 'Edit Your Profile'
              headerSubtitle = 'Update your details anytime'
            }

            return (
              <div
                className="relative px-6 pt-6 pb-14 text-white text-center overflow-hidden cursor-pointer group"
                onClick={handleCoverClick}
                style={{
                  background: coverImagePreview
                    ? `url(${coverImagePreview}) center/cover no-repeat`
                    : 'linear-gradient(135deg, #006633 0%, #008844 50%, #00aa55 100%)'
                }}
              >
                {/* Dark overlay for text readability */}
                <div className="absolute inset-0 bg-black/40" />

                {/* Edit cover button */}
                <div className="absolute top-3 right-3 opacity-0 group-hover:opacity-100 transition-opacity z-10">
                  <div className="bg-white/90 hover:bg-white text-gray-700 px-3 py-1.5 rounded-lg text-xs font-medium flex items-center gap-1.5 shadow-lg">
                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
                    </svg>
                    {coverImagePreview ? 'Change Cover' : 'Add Cover'}
                  </div>
                </div>

                {/* Content - only show if there's something to display */}
                {(headerTitle || headerSubtitle) && (
                  <div className="relative z-10">
                    {headerTitle && (
                      <h1 className="text-2xl font-bold mb-2 text-white" style={{ textShadow: '0 2px 4px rgba(0,0,0,0.5)' }}>{headerTitle}</h1>
                    )}
                    {headerSubtitle && (
                      <p className="text-sm text-white font-medium" style={{ textShadow: '0 1px 3px rgba(0,0,0,0.6)' }}>
                        {headerSubtitle}
                      </p>
                    )}
                  </div>
                )}

                {/* Hidden file input for cover */}
                <input
                  ref={coverInputRef}
                  type="file"
                  accept="image/*"
                  onChange={handleCoverChange}
                  onClick={(e) => e.stopPropagation()}
                  className="hidden"
                />
              </div>
            )
          })()}

          {/* Profile Photo Section */}
          <div className="flex justify-center -mt-12 mb-4">
            <div
              onClick={handleImageClick}
              className="relative cursor-pointer group"
            >
              <div className="w-28 h-28 rounded-full bg-white border-4 border-white shadow-xl overflow-hidden ring-4 ring-[#006633]/20">
                {profileImagePreview ? (
                  <img
                    src={profileImagePreview}
                    alt="Profile"
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <div className="w-full h-full bg-gradient-to-br from-[#8CB9A3] to-[#6B9A8A] flex items-center justify-center">
                    <svg className="w-12 h-12 text-white/90" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                    </svg>
                  </div>
                )}
              </div>
              {/* Camera icon button */}
              <div className="absolute bottom-1 right-1 w-9 h-9 bg-[#FFA040] rounded-full flex items-center justify-center shadow-lg group-hover:scale-110 group-hover:bg-[#FF8C00] transition-all border-2 border-white">
                <svg className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
                </svg>
              </div>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                onChange={handleImageChange}
                className="hidden"
              />
            </div>
          </div>
          {/* Photo upload hint */}
          <div className="text-center mb-6">
            <p className="text-sm font-medium text-gray-700 mb-1">Profile Photo</p>
            <p className="text-xs text-gray-500">Click to upload or change photo (Max 5MB)</p>
            {profileImagePreview && (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation()
                  setProfileImage(null)
                  setProfileImagePreview(null)
                }}
                className="mt-2 text-xs text-red-500 hover:text-red-600 underline"
              >
                Remove Photo
              </button>
            )}
          </div>

          {/* Form */}
          <form onSubmit={handleSubmit} className="px-4 sm:px-6 pb-8 space-y-5">
            {/* Title & Full Name Row */}
            <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">
                  Title
                </label>
                <select
                  name="title"
                  value={formData.title}
                  onChange={handleInputChange}
                  className={`w-full px-3 py-2.5 rounded-lg border ${errors.title ? 'border-red-300 bg-red-50' : 'border-gray-300'} focus:outline-none focus:ring-2 focus:ring-[#8CB9A3] text-sm`}
                >
                  <option value="">Select</option>
                  {TITLES.map(t => (
                    <option key={t} value={t}>{t}</option>
                  ))}
                </select>
              </div>
              <div className="col-span-3">
                <label className="block text-sm font-medium text-gray-700 mb-1.5">
                  Full Name <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  name="fullName"
                  value={formData.fullName}
                  onChange={handleInputChange}
                  placeholder="Enter your full name"
                  className={`w-full px-3 py-2.5 rounded-lg border ${errors.fullName ? 'border-red-300 bg-red-50' : 'border-gray-300'} focus:outline-none focus:ring-2 focus:ring-[#8CB9A3] text-sm`}
                />
                {errors.fullName && <p className="mt-1 text-xs text-red-500">{errors.fullName}</p>}
              </div>
            </div>

            {/* Gender */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">
                Gender <span className="text-red-500">*</span>
              </label>
              <div className="flex flex-wrap gap-3">
                {GENDERS.map(g => (
                  <label
                    key={g}
                    className={`flex items-center gap-2 px-4 py-2 rounded-lg border cursor-pointer transition-all ${
                      formData.gender === g
                        ? 'border-[#006633] bg-[#006633]/5 text-[#006633]'
                        : 'border-gray-300 hover:border-gray-400'
                    }`}
                  >
                    <input
                      type="radio"
                      name="gender"
                      value={g}
                      checked={formData.gender === g}
                      onChange={handleInputChange}
                      className="sr-only"
                    />
                    <span className={`w-4 h-4 rounded-full border-2 flex items-center justify-center ${
                      formData.gender === g ? 'border-[#006633]' : 'border-gray-400'
                    }`}>
                      {formData.gender === g && (
                        <span className="w-2 h-2 rounded-full bg-[#006633]" />
                      )}
                    </span>
                    <span className="text-sm capitalize">{g}</span>
                  </label>
                ))}
              </div>
              {errors.gender && <p className="mt-1 text-xs text-red-500">{errors.gender}</p>}
            </div>

            {/* Phone & Email Row */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">
                  Phone Number {!isGoogleUser && <span className="text-gray-400 text-xs">(verified)</span>}
                </label>
                {isGoogleUser ? (
                  <>
                    <input
                      type="tel"
                      name="phone"
                      value={formData.phone}
                      onChange={(e) => {
                        const val = e.target.value.replace(/\D/g, '').slice(0, 10)
                        setFormData(prev => ({ ...prev, phone: val }))
                      }}
                      placeholder="Enter 10-digit phone number"
                      maxLength={10}
                      className={`w-full px-3 py-2.5 rounded-lg border ${errors.phone ? 'border-red-300 bg-red-50' : 'border-gray-300'} focus:outline-none focus:ring-2 focus:ring-[#8CB9A3] text-sm`}
                    />
                    {errors.phone && <p className="mt-1 text-xs text-red-500">{errors.phone}</p>}
                    <p className="mt-1 text-xs text-gray-400">Optional - for order updates</p>
                  </>
                ) : (
                  <>
                    <input
                      type="tel"
                      name="phone"
                      value={formData.phone}
                      disabled
                      className="w-full px-3 py-2.5 rounded-lg border border-gray-200 bg-gray-50 text-gray-500 text-sm cursor-not-allowed"
                    />
                    <p className="mt-1 text-xs text-gray-400">Phone number cannot be changed</p>
                  </>
                )}
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">
                  Email {isGoogleUser && <span className="text-red-500">*</span>}
                </label>
                <input
                  type="email"
                  name="email"
                  value={formData.email}
                  onChange={handleInputChange}
                  placeholder="your@email.com"
                  disabled={isGoogleUser && user?.email}
                  className={`w-full px-3 py-2.5 rounded-lg border ${errors.email ? 'border-red-300 bg-red-50' : isGoogleUser && user?.email ? 'border-gray-200 bg-gray-50 text-gray-500 cursor-not-allowed' : 'border-gray-300'} focus:outline-none focus:ring-2 focus:ring-[#8CB9A3] text-sm`}
                />
                {errors.email && <p className="mt-1 text-xs text-red-500">{errors.email}</p>}
                {isGoogleUser && user?.email && <p className="mt-1 text-xs text-gray-400">Email from Google account</p>}
              </div>
            </div>

            {/* Address */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">
                Address <span className="text-red-500">*</span>
              </label>
              <textarea
                name="address"
                value={formData.address}
                onChange={handleInputChange}
                placeholder="Enter your address"
                rows={2}
                className={`w-full px-3 py-2.5 rounded-lg border ${errors.address ? 'border-red-300 bg-red-50' : 'border-gray-300'} focus:outline-none focus:ring-2 focus:ring-[#8CB9A3] text-sm resize-none`}
              />
              {errors.address && <p className="mt-1 text-xs text-red-500">{errors.address}</p>}
            </div>

            {/* City, State, Pincode Row */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">
                  City <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  name="city"
                  value={formData.city}
                  onChange={handleInputChange}
                  placeholder="City"
                  className={`w-full px-3 py-2.5 rounded-lg border ${errors.city ? 'border-red-300 bg-red-50' : 'border-gray-300'} focus:outline-none focus:ring-2 focus:ring-[#8CB9A3] text-sm`}
                />
                {errors.city && <p className="mt-1 text-xs text-red-500">{errors.city}</p>}
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">
                  State <span className="text-red-500">*</span>
                </label>
                <select
                  name="state"
                  value={formData.state}
                  onChange={handleInputChange}
                  className={`w-full px-3 py-2.5 rounded-lg border ${errors.state ? 'border-red-300 bg-red-50' : 'border-gray-300'} focus:outline-none focus:ring-2 focus:ring-[#8CB9A3] text-sm`}
                >
                  <option value="">Select State</option>
                  {INDIAN_STATES.map(s => (
                    <option key={s} value={s}>{s}</option>
                  ))}
                </select>
                {errors.state && <p className="mt-1 text-xs text-red-500">{errors.state}</p>}
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">
                  Pincode <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  name="pincode"
                  value={formData.pincode}
                  onChange={(e) => {
                    const val = e.target.value.replace(/\D/g, '').slice(0, 6)
                    setFormData(prev => ({ ...prev, pincode: val }))
                  }}
                  placeholder="6-digit"
                  maxLength={6}
                  className={`w-full px-3 py-2.5 rounded-lg border ${errors.pincode ? 'border-red-300 bg-red-50' : 'border-gray-300'} focus:outline-none focus:ring-2 focus:ring-[#8CB9A3] text-sm`}
                />
                {errors.pincode && <p className="mt-1 text-xs text-red-500">{errors.pincode}</p>}
              </div>
            </div>

            {/* Submit Button */}
            <div className="pt-4 space-y-3">
              <button
                type="submit"
                disabled={isLoading}
                className={`w-full py-3.5 rounded-lg text-white font-semibold transition-all flex items-center justify-center gap-2 ${
                  isLoading
                    ? 'bg-[#006633]/50 cursor-not-allowed'
                    : 'bg-[#006633] hover:bg-[#004d24] shadow-lg hover:shadow-xl'
                }`}
              >
                {isLoading ? (
                  <>
                    <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                    </svg>
                    Saving...
                  </>
                ) : (
                  <>
                    {isEditingProfile || isExistingUser ? 'Save Changes' : 'Complete Setup'}
                    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" />
                    </svg>
                  </>
                )}
              </button>

              {/* Skip button - only show on profile setup, not edit */}
              {!isEditingProfile && (
                <button
                  type="button"
                  onClick={() => navigate('/home')}
                  className="w-full py-3 rounded-lg text-gray-600 font-medium transition-all hover:bg-gray-100 border border-gray-300"
                >
                  Skip for now
                </button>
              )}
            </div>
          </form>
        </div>

        {/* Footer */}
        <p className="text-center text-xs text-gray-400 mt-6">
          By continuing, you agree to our Terms of Service and Privacy Policy
        </p>
      </div>
    </div>
  )
}
