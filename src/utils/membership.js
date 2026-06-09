const TRUE_VALUES = new Set(['true', '1', 'yes', 'y', 'on', 'active'])

function toNumberLike(value) {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string') {
    const parsed = Number(value.trim())
    if (Number.isFinite(parsed)) return parsed
  }
  return null
}

export function toBooleanLike(value) {
  if (typeof value === 'boolean') return value
  if (typeof value === 'number') return value === 1
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase()
    return TRUE_VALUES.has(normalized)
  }
  return false
}

export function isPremiumUser(user) {
  if (!user) return false

  const membershipType = String(user.membership_type || user.membershipType || '').trim().toUpperCase()
  const plan = String(user.plan || '').trim().toUpperCase()

  return (
    toBooleanLike(user.is_member) ||
    toBooleanLike(user.isMember) ||
    toBooleanLike(user.membership_active) ||
    membershipType === 'PREMIUM' ||
    membershipType === 'PAID' ||
    plan === 'MONTHLY' ||
    plan === 'QUARTERLY' ||
    plan === 'YEARLY'
  )
}

export function getRemainingFreeDownloads(user, fallback = 0) {
  if (!user) return fallback

  const candidates = [
    user.free_downloads_remaining,
    user.freeDownloadsRemaining,
    user.downloads_remaining,
    user.remaining_downloads,
    user.remainingDownloads,
    user.free_downloads,
    user.no,
  ]

  for (const candidate of candidates) {
    const normalized = toNumberLike(candidate)
    if (normalized != null) {
      return Math.max(0, Math.floor(normalized))
    }
  }

  return fallback
}

export function normalizeMembership(user = {}) {
  const premium = isPremiumUser(user)
  const normalizedDownloads = getRemainingFreeDownloads(user, undefined)
  return {
    ...user,
    is_member: premium,
    membership_active: premium,
    membership_type: premium ? 'PREMIUM' : 'FREE',
    ...(normalizedDownloads != null ? { free_downloads_remaining: normalizedDownloads } : {}),
  }
}
