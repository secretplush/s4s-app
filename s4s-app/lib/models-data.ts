// Model interface and helpers — NO hardcoded model lists

export interface Model {
  id: string
  username: string
  displayName: string
  fans: number
  likes: number
  avatar: string
  connected: boolean
  totalEarnings: number
}

export function calculateLTV(model: Model): number {
  if (model.fans === 0) return 0
  return model.totalEarnings / model.fans
}

const SYNC_CACHE_KEY = 'synced_models'
const SYNC_TIMESTAMP_KEY = 'synced_models_ts'
const CACHE_TTL = 5 * 60 * 1000 // 5 minutes

/**
 * Get cached models synchronously (for initial renders).
 * Returns empty array if no cache exists.
 */
export function loadCachedModels(): Model[] {
  if (typeof window === 'undefined') return []
  try {
    const cached = localStorage.getItem(SYNC_CACHE_KEY)
    if (cached) return JSON.parse(cached)
  } catch {}
  return []
}

/**
 * Fetch models from the OF API via /api/sync-accounts.
 * Caches in localStorage. Returns stale cache on error, empty array if nothing cached.
 */
export async function fetchAndCacheModels(): Promise<Model[]> {
  // Check if cache is still fresh
  if (typeof window !== 'undefined') {
    try {
      const ts = localStorage.getItem(SYNC_TIMESTAMP_KEY)
      const cached = localStorage.getItem(SYNC_CACHE_KEY)
      if (ts && cached && Date.now() - Number(ts) < CACHE_TTL) {
        return JSON.parse(cached)
      }
    } catch {}
  }

  try {
    const res = await fetch('/api/sync-accounts', { cache: 'no-store' })
    if (!res.ok) throw new Error(`Sync API ${res.status}`)
    const { accounts } = await res.json()
    const models: Model[] = accounts.map((a: any) => ({
      id: a.id,
      username: a.username,
      displayName: a.displayName,
      fans: a.fans,
      likes: a.likes,
      avatar: a.avatar,
      connected: a.isAuthenticated,
      totalEarnings: 0,
    }))

    // Cache
    if (typeof window !== 'undefined') {
      localStorage.setItem(SYNC_CACHE_KEY, JSON.stringify(models))
      localStorage.setItem(SYNC_TIMESTAMP_KEY, String(Date.now()))
    }

    return models
  } catch (e) {
    console.error('fetchAndCacheModels failed:', e)
    return loadCachedModels()
  }
}

/**
 * Compute network stats from a models array (dynamic).
 */
export function computeNetworkStats(models: Model[]) {
  if (!models.length) return { totalModels: 0, totalFans: 0, totalLikes: 0, totalEarnings: 0, avgLTV: 0, topPerformer: null, topEarner: null }
  const totalFans = models.reduce((s, m) => s + m.fans, 0)
  const totalEarnings = models.reduce((s, m) => s + m.totalEarnings, 0)
  return {
    totalModels: models.length,
    totalFans,
    totalLikes: models.reduce((s, m) => s + m.likes, 0),
    totalEarnings,
    avgLTV: totalFans > 0 ? totalEarnings / totalFans : 0,
    topPerformer: models.reduce((top, m) => m.fans > (top?.fans ?? 0) ? m : top, models[0]),
    topEarner: models.reduce((top, m) => m.totalEarnings > (top?.totalEarnings ?? 0) ? m : top, models[0]),
  }
}
