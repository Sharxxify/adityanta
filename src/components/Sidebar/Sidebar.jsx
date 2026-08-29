import { useNavigate } from 'react-router-dom'
import Logo from '../Logo'

const Sidebar = ({ activeTab, setActiveTab, onUpgrade, user }) => {
  const navigate = useNavigate()

  const getDisplayUserName = (value) => {
    const resolved = [
      value?.name,
      value?.displayName,
      value?.username,
      value?.full_name,
      value?.fullName,
    ].find((v) => typeof v === 'string' && v.trim())

    if (resolved) return resolved.trim()
    const email = `${value?.email || ''}`.trim()
    if (email.includes('@')) return email.split('@')[0]
    return 'Guest User'
  }

  // Get user display info
  const userName = getDisplayUserName(user)
  const userInitials = userName.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2)
  const isPremium = user?.membership_type === 'PREMIUM' || user?.membership_type === 'premium' || user?.is_member

  const navItems = [
    { id: 'templates', label: 'Templates', icon: 'grid' },
    { id: 'files', label: 'Your Files', icon: 'file' },
    { id: 'favourites', label: 'Favourites', icon: 'star' },
    { id: 'trash', label: 'Trash', icon: 'trash' },
  ]

  const getIcon = (type) => {
    switch (type) {
      case 'grid':
        return (
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <rect x="3" y="3" width="7" height="7" />
            <rect x="14" y="3" width="7" height="7" />
            <rect x="14" y="14" width="7" height="7" />
            <rect x="3" y="14" width="7" height="7" />
          </svg>
        )
   case 'file':
        return (
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M13 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z" />
            <polyline points="13 2 13 9 20 9" />
          </svg>
        )
      case 'store':
        return (
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M3 9l1-5h16l1 5" />
            <path d="M5 9v11a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V9" />
            <path d="M3 9h18" />
            <path d="M9 13h6" />
          </svg>
        )
      case 'star':
        return (
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
          </svg>
        )
      case 'trash':
        return (
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <polyline points="3 6 5 6 21 6" />
            <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
          </svg>
        )
      default:
        return null
    }
  }

  return (
    <aside className="w-[260px] border-r border-gray-100 h-screen flex flex-col fixed left-0 top-0 overflow-hidden">
      {/* Orange gradient tint background */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background: 'linear-gradient(to bottom, #FFF5EB 0%, #FFF9F3 30%, #FFFDFB 60%, #FFFFFF 100%)',
        }}
      />

      {/* Content wrapper */}
      <div className="relative z-10 flex flex-col h-full">
        {/* Logo */}
        <div
          className="flex items-center gap-3 p-5 cursor-pointer"
          onClick={() => navigate('/')}
        >
          <Logo />
        </div>

        {/* User Profile */}
        <div className="mx-4 p-3 bg-white/70 backdrop-blur-sm rounded-xl mb-4 border border-orange-100/50">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-primary flex items-center justify-center text-white font-semibold">
              {userInitials}
            </div>
            <div className="flex flex-col">
              <span className="text-sm font-semibold text-gray-900">{userName}</span>
              <div className="flex items-center gap-1.5 text-xs text-gray-500">
                <span className={`px-1.5 py-0.5 rounded text-[10px] font-semibold ${isPremium ? 'bg-orange-100 text-orange-600' : 'bg-green-100 text-primary'}`}>
                  {isPremium ? 'Premium' : 'Free'}
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Upgrade Button - Only show for non-premium users */}
        {!isPremium && (
          <button
            onClick={onUpgrade}
            className="mx-4 mb-6 py-3 bg-orange-500 hover:bg-orange-600 text-white rounded-xl font-semibold flex items-center justify-center gap-2 transition-all shadow-lg shadow-orange-500/20"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
            </svg>
            Upgrade Now
          </button>
        )}

        {/* Navigation */}
        <nav className="flex flex-col gap-1 px-3">
          {navItems.map((item) => (
            <button
              key={item.id}
              onClick={() => setActiveTab(item.id)}
              className={`flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium transition-all ${activeTab === item.id
                  ? 'bg-green-50/80 text-primary'
                  : 'text-gray-600 hover:bg-white/50'
                }`}
            >
              <span className={activeTab === item.id ? 'text-primary' : 'text-gray-500'}>
                {getIcon(item.icon)}
              </span>
              {item.label}
            </button>
          ))}
        </nav>
      </div>
    </aside>
  )
}

export default Sidebar
