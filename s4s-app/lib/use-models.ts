'use client'

import { useState, useEffect } from 'react'
import { Model, loadCachedModels, fetchAndCacheModels } from './models-data'

/**
 * Shared hook for loading models dynamically.
 * Reads from localStorage cache first, then fetches from /api/sync-accounts in background.
 */
export function useModels(): { models: Model[]; loading: boolean; refresh: () => Promise<Model[]> } {
  const [models, setModels] = useState<Model[]>(() => loadCachedModels())
  const [loading, setLoading] = useState(models.length === 0)

  const refresh = async (): Promise<Model[]> => {
    setLoading(true)
    // Bust the timestamp cache to force a fresh fetch
    if (typeof window !== 'undefined') {
      localStorage.removeItem('synced_models_ts')
    }
    const fresh = await fetchAndCacheModels()
    if (fresh.length > 0) setModels(fresh)
    setLoading(false)
    return fresh
  }

  useEffect(() => {
    if (models.length === 0) {
      refresh()
    } else {
      // Background refresh
      fetchAndCacheModels().then(fresh => {
        if (fresh.length > 0) setModels(fresh)
      })
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  return { models, loading, refresh }
}
