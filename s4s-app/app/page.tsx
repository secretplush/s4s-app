'use client'

import { useState, useEffect, Suspense } from 'react'
import { useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { CONNECTED_MODELS, NETWORK_STATS, Model, calculateLTV } from '@/lib/models-data'
import { getImageCounts, migrateFromLocalStorage, loadImages, getAllUsernames, syncToKV } from '@/lib/indexed-db'

function DashboardContent() {
  const searchParams = useSearchParams()
  const tabParam = searchParams.get('tab') as 'dashboard' | 'models' | 'rotation' | 'analytics' | 'settings' | null
  const [activeTab, setActiveTab] = useState<'dashboard' | 'models' | 'rotation' | 'analytics' | 'settings'>('dashboard')
  
  // Sync tab from URL
  useEffect(() => {
    if (tabParam && ['dashboard', 'models', 'analytics', 'settings'].includes(tabParam)) {
      setActiveTab(tabParam)
    }
  }, [tabParam])
  const [rotationStatus, setRotationStatus] = useState<'stopped' | 'running'>('stopped')

  return (
    <div className="min-h-screen bg-gray-950">
      {/* Header */}
      <header className="bg-gray-900 border-b border-gray-800 px-6 py-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span className="text-2xl">🔄</span>
            <h1 className="text-xl font-bold text-white">S4S Manager</h1>
            <span className="text-xs bg-blue-600 text-white px-2 py-0.5 rounded">Plush</span>
          </div>
          <div className="flex items-center gap-4">
            <div className="text-sm">
              <span className="text-gray-400">API Credits:</span>
              <span className="text-green-400 ml-2 font-mono">89,234</span>
            </div>
            <div className={`px-3 py-1 rounded-full text-sm font-medium ${
              rotationStatus === 'running' 
                ? 'bg-green-500/20 text-green-400' 
                : 'bg-gray-700 text-gray-400'
            }`}>
              {rotationStatus === 'running' ? '● Running' : '○ Stopped'}
            </div>
          </div>
        </div>
      </header>

      <div className="flex">
        {/* Sidebar */}
        <nav className="w-56 bg-gray-900 min-h-[calc(100vh-73px)] border-r border-gray-800 p-4">
          <ul className="space-y-1">
            {[
              { id: 'dashboard', icon: '📊', label: 'Dashboard', href: '/?tab=dashboard' },
              { id: 'models', icon: '👩', label: 'Models', href: '/?tab=models' },
              { id: 'rotation', icon: '🔄', label: 'Rotation', href: '/rotation' },
              { id: 'captions', icon: '💬', label: 'Captions', href: '/captions' },
              { id: 'mass-dm', icon: '📨', label: 'Mass DMs', href: '/mass-dm' },
              { id: 'network', icon: '🔌', label: 'Network', href: '/network' },
              { id: 'analytics', icon: '📈', label: 'Analytics', href: '/?tab=analytics' },
              { id: 'settings', icon: '⚙️', label: 'Settings', href: '/?tab=settings' },
            ].map(item => (
              <li key={item.id}>
                <Link
                  href={item.href}
                  className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg text-left transition ${
                    activeTab === item.id
                      ? 'bg-blue-600 text-white'
                      : 'text-gray-400 hover:bg-gray-800 hover:text-white'
                  }`}
                >
                  <span>{item.icon}</span>
                  {item.label}
                </Link>
              </li>
            ))}
          </ul>

          <div className="mt-8 pt-4 border-t border-gray-800">
            <div className="text-xs text-gray-500 uppercase tracking-wider mb-3">Quick Actions</div>
            <button 
              onClick={() => setRotationStatus(rotationStatus === 'running' ? 'stopped' : 'running')}
              className={`w-full py-2 px-3 rounded-lg font-medium text-sm transition ${
                rotationStatus === 'running'
                  ? 'bg-red-600 hover:bg-red-700 text-white'
                  : 'bg-green-600 hover:bg-green-700 text-white'
              }`}
            >
              {rotationStatus === 'running' ? '⏹ Stop Rotation' : '▶ Start Rotation'}
            </button>
          </div>
        </nav>

        {/* Main Content */}
        <main className="flex-1 p-6">
          {activeTab === 'dashboard' && <DashboardView rotationStatus={rotationStatus} />}
          {activeTab === 'models' && <ModelsView models={CONNECTED_MODELS} />}
          {activeTab === 'rotation' && <RotationView />}
          {activeTab === 'analytics' && <AnalyticsView />}
          {activeTab === 'settings' && <SettingsView />}
        </main>
      </div>
    </div>
  )
}

export default function Dashboard() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-gray-950 flex items-center justify-center text-white">Loading...</div>}>
      <DashboardContent />
    </Suspense>
  )
}

function DashboardView({ rotationStatus }: { rotationStatus: string }) {
  const sortedByFans = [...CONNECTED_MODELS].sort((a, b) => b.fans - a.fans)
  
  return (
    <div className="space-y-6">
      <h2 className="text-2xl font-bold text-white">Dashboard</h2>
      
      {/* Stats Grid */}
      <div className="grid grid-cols-5 gap-4">
        <div className="bg-gray-900 rounded-xl p-4 border border-gray-800">
          <div className="flex items-center justify-between mb-2">
            <span className="text-2xl">👩</span>
          </div>
          <div className="text-3xl font-bold text-white">{NETWORK_STATS.totalModels}</div>
          <div className="text-sm text-gray-400">Models Active</div>
        </div>
        <div className="bg-gray-900 rounded-xl p-4 border border-gray-800">
          <div className="flex items-center justify-between mb-2">
            <span className="text-2xl">👥</span>
          </div>
          <div className="text-3xl font-bold text-white">{NETWORK_STATS.totalFans.toLocaleString()}</div>
          <div className="text-sm text-gray-400">Total Fans</div>
        </div>
        <div className="bg-gray-900 rounded-xl p-4 border border-gray-800">
          <div className="flex items-center justify-between mb-2">
            <span className="text-2xl">💰</span>
          </div>
          <div className="text-3xl font-bold text-white">${NETWORK_STATS.totalEarnings.toLocaleString()}</div>
          <div className="text-sm text-gray-400">Total Earnings</div>
        </div>
        <div className="bg-gray-900 rounded-xl p-4 border border-gray-800">
          <div className="flex items-center justify-between mb-2">
            <span className="text-2xl">📊</span>
          </div>
          <div className="text-3xl font-bold text-white">${NETWORK_STATS.avgLTV.toFixed(2)}</div>
          <div className="text-sm text-gray-400">Avg LTV/Fan</div>
        </div>
        <div className="bg-gray-900 rounded-xl p-4 border border-gray-800">
          <div className="flex items-center justify-between mb-2">
            <span className="text-2xl">👻</span>
          </div>
          <div className="text-3xl font-bold text-white">0</div>
          <div className="text-sm text-gray-400">Ghost Tags Today</div>
        </div>
      </div>

      {/* Top Models */}
      <div className="bg-gray-900 rounded-xl p-6 border border-gray-800">
        <h3 className="text-lg font-semibold text-white mb-4">🏆 Top Models by Fans</h3>
        <div className="space-y-3">
          {sortedByFans.slice(0, 5).map((model, i) => {
            const ltv = calculateLTV(model)
            return (
              <div key={model.id} className="flex items-center gap-4">
                <span className="text-xl w-8">{i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `${i + 1}.`}</span>
                <img 
                  src={model.avatar} 
                  alt={model.displayName}
                  className="w-10 h-10 rounded-full object-cover"
                />
                <div className="flex-1">
                  <div className="text-white font-medium">{model.displayName}</div>
                  <div className="text-sm text-gray-400">@{model.username}</div>
                </div>
                <div className="text-right w-20">
                  <div className="text-white font-bold">{model.fans.toLocaleString()}</div>
                  <div className="text-xs text-gray-400">fans</div>
                </div>
                <div className="text-right w-20">
                  <div className={`font-bold ${ltv > 0 ? 'text-green-400' : 'text-gray-500'}`}>
                    {ltv > 0 ? `$${ltv.toFixed(2)}` : '—'}
                  </div>
                  <div className="text-xs text-gray-400">LTV</div>
                </div>
              </div>
            )
          })}
        </div>
      </div>

      {/* Network Status */}
      <div className="grid grid-cols-2 gap-4">
        <div className="bg-gray-900 rounded-xl p-6 border border-gray-800">
          <h3 className="text-lg font-semibold text-white mb-4">🔄 Ghost Tag Rotation</h3>
          <div className="space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-gray-400">Status</span>
              <span className={rotationStatus === 'running' ? 'text-green-400' : 'text-gray-500'}>
                {rotationStatus === 'running' ? 'Active' : 'Inactive'}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-400">Interval</span>
              <span className="text-white">4.3 min (15 models)</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-400">Delete After</span>
              <span className="text-white">5 minutes</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-400">Posts Today</span>
              <span className="text-white">0</span>
            </div>
          </div>
        </div>

        <div className="bg-gray-900 rounded-xl p-6 border border-gray-800">
          <h3 className="text-lg font-semibold text-white mb-4">📌 24hr Pinned Posts</h3>
          <div className="space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-gray-400">Status</span>
              <span className="text-gray-500">Not configured</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-400">Models/Day</span>
              <span className="text-white">10-11</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-400">Active Posts</span>
              <span className="text-white">0</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-400">API Parameter</span>
              <span className="text-white font-mono text-xs">expireDays: 1</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

interface VaultGap {
  targetUsername: string
  missingFrom: string[]
}

function VaultGapsModal({ models, onClose }: { models: Model[]; onClose: () => void }) {
  const [checking, setChecking] = useState(false)
  const [gaps, setGaps] = useState<VaultGap[] | null>(null)
  const [totalGaps, setTotalGaps] = useState(0)
  const [modelsWithGaps, setModelsWithGaps] = useState(0)
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  const [fixing, setFixing] = useState(false)
  const [fixProgress, setFixProgress] = useState<{ current: number; total: number; label: string } | null>(null)
  const [fixResults, setFixResults] = useState<{ label: string; success: boolean; error?: string }[]>([])

  const checkGaps = async () => {
    setChecking(true)
    setGaps(null)
    setFixResults([])
    setFixProgress(null)
    try {
      // Scan IndexedDB AND cross-reference KV as fallback
      const allUsernames = models.map(m => m.username)

      // Fetch KV mappings as fallback source
      let kvMappings: Record<string, Record<string, string>> = {}
      try {
        const kvRes = await fetch('/api/vault-gaps?raw=1')
        const kvData = await kvRes.json()
        if (kvData.mappings) kvMappings = kvData.mappings
      } catch (e) {
        console.warn('Could not fetch KV mappings, using IndexedDB only:', e)
      }

      const gapsFound: VaultGap[] = []
      let total = 0

      for (const target of allUsernames) {
        const missing: string[] = []
        for (const source of allUsernames) {
          if (source === target) continue
          // Check IndexedDB first
          const images = await loadImages(source)
          const activeImg = images.find(img => img.isActive)
          const hasInIdb = activeImg?.vaultIds?.[target]
          // Fallback: check KV mappings
          const hasInKv = kvMappings[source]?.[target]
          if (!hasInIdb && !hasInKv) {
            missing.push(source)
          }
        }
        if (missing.length > 0) {
          gapsFound.push({ targetUsername: target, missingFrom: missing })
          total += missing.length
        }
      }

      setGaps(gapsFound)
      setTotalGaps(total)
      setModelsWithGaps(gapsFound.length)
    } catch (e) {
      console.error(e)
    }
    setChecking(false)
  }

  // Auto-check on mount
  useEffect(() => { checkGaps() }, [])

  const toggleExpand = (username: string) => {
    setExpanded(prev => {
      const next = new Set(prev)
      next.has(username) ? next.delete(username) : next.add(username)
      return next
    })
  }

  const fixAllGaps = async () => {
    if (!gaps || totalGaps === 0) return
    setFixing(true)
    setFixResults([])

    // Reorganize gaps by SOURCE model instead of target
    // This lets us use /api/distribute which processes targets in PARALLEL (fast)
    // instead of /api/sync-new-model which processes sequentially (times out)
    const sourceToTargets: Record<string, string[]> = {}
    for (const gap of gaps) {
      for (const sourceUsername of gap.missingFrom) {
        if (!sourceToTargets[sourceUsername]) sourceToTargets[sourceUsername] = []
        sourceToTargets[sourceUsername].push(gap.targetUsername)
      }
    }

    let completed = 0
    const results: { label: string; success: boolean; error?: string }[] = []
    const sourceModels = Object.keys(sourceToTargets)

    for (const sourceUsername of sourceModels) {
      const targetUsernames = sourceToTargets[sourceUsername]

      // Load source image from IndexedDB
      const images = await loadImages(sourceUsername)
      const activeImg = images.find(img => img.isActive && img.base64)

      if (!activeImg || !activeImg.base64) {
        for (const t of targetUsernames) {
          completed++
          results.push({ label: `${sourceUsername} → ${t}`, success: false, error: 'No promo image in browser' })
        }
        setFixProgress({ current: completed, total: totalGaps, label: '' })
        setFixResults([...results])
        continue
      }

      setFixProgress({ current: completed, total: totalGaps, label: `📤 ${sourceUsername} → ${targetUsernames.length} models (parallel)` })

      try {
        // Use /api/distribute — uploads to all targets in PARALLEL
        const res = await fetch('/api/distribute', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            imageBase64: activeImg.base64,
            filename: activeImg.filename || `${sourceUsername}_promo.jpg`,
            sourceUsername,
            targetUsernames
          })
        })
        const data = await res.json()

        if (data.success && data.results) {
          // Update vaultIds in IndexedDB image
          const newVaultIds: Record<string, string> = {}
          for (const r of data.results) {
            completed++
            results.push({
              label: `${sourceUsername} → ${r.username}`,
              success: !!r.vaultId,
              error: r.error
            })
            if (r.vaultId) {
              newVaultIds[r.username] = r.vaultId
            }
          }

          // Save updated vaultIds back to IndexedDB
          if (Object.keys(newVaultIds).length > 0) {
            const { saveImages } = await import('@/lib/indexed-db')
            const updatedImages = images.map(img =>
              img.id === activeImg.id
                ? { ...img, vaultIds: { ...img.vaultIds, ...newVaultIds } }
                : img
            )
            await saveImages(sourceUsername, updatedImages)
          }
        } else {
          for (const t of targetUsernames) {
            completed++
            results.push({ label: `${sourceUsername} → ${t}`, success: false, error: data.error || 'API error' })
          }
        }
      } catch (e) {
        for (const t of targetUsernames) {
          completed++
          results.push({ label: `${sourceUsername} → ${t}`, success: false, error: String(e) })
        }
      }

      setFixProgress({ current: completed, total: totalGaps, label: '' })
      setFixResults([...results])
    }

    // Re-sync to KV after all fixes
    setFixProgress({ current: totalGaps, total: totalGaps, label: 'Syncing to server...' })
    await syncToKV()

    setFixProgress({ current: totalGaps, total: totalGaps, label: 'Done! Re-scanning...' })
    setFixing(false)

    // Auto re-scan after fixing to refresh gap list
    await checkGaps()
  }

  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50" onClick={onClose}>
      <div className="bg-gray-900 rounded-xl border border-gray-700 p-6 w-[650px] max-h-[85vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-xl font-bold text-white">🔍 Vault Gap Scanner</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-white text-xl">✕</button>
        </div>

        <p className="text-sm text-gray-400 mb-4">
          Scans all {models.length} models to find missing vault mappings. Fix all gaps to ensure every model&apos;s promo image exists in every other model&apos;s vault.
        </p>

        {/* Loading state */}
        {checking && <p className="text-sm text-gray-400 mb-4 animate-pulse">🔍 Scanning vault mappings across all models...</p>}

        {/* Results summary */}
        {gaps !== null && !checking && (
          <>
            {totalGaps === 0 ? (
              <div className="mb-4 p-4 rounded-lg bg-green-500/10 border border-green-500/30 text-center">
                <p className="text-green-400 text-lg font-bold">✅ All vaults are fully synced!</p>
                <p className="text-green-400/70 text-sm mt-1">Every model&apos;s promo image exists in every other model&apos;s vault.</p>
              </div>
            ) : (
              <div className="mb-4 p-3 rounded-lg bg-yellow-500/10 border border-yellow-500/30">
                <p className="text-yellow-400 font-bold text-lg">
                  {totalGaps} gaps found across {modelsWithGaps} models
                </p>
              </div>
            )}

            {/* Expandable per-model list */}
            {gaps.length > 0 && (
              <div className="mb-4 space-y-1 max-h-60 overflow-y-auto">
                {gaps.map(g => (
                  <div key={g.targetUsername} className="border border-gray-700 rounded-lg overflow-hidden">
                    <button
                      onClick={() => toggleExpand(g.targetUsername)}
                      className="w-full flex items-center justify-between px-3 py-2 bg-gray-800 hover:bg-gray-750 text-left"
                    >
                      <span className="text-sm text-white">@{g.targetUsername}</span>
                      <span className="text-xs text-yellow-400">{g.missingFrom.length} missing {expanded.has(g.targetUsername) ? '▲' : '▼'}</span>
                    </button>
                    {expanded.has(g.targetUsername) && (
                      <div className="px-3 py-2 bg-gray-800/50 flex flex-wrap gap-1">
                        {g.missingFrom.map(m => (
                          <span key={m} className="text-xs px-2 py-0.5 bg-yellow-500/20 text-yellow-400 rounded">@{m}</span>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </>
        )}

        {/* Fix progress */}
        {fixProgress && (
          <div className="mb-4 p-3 rounded-lg bg-gray-800 border border-gray-700">
            <div className="flex justify-between text-sm mb-1">
              <span className="text-gray-300">Fixing gaps</span>
              <span className="text-white">{fixProgress.current}/{fixProgress.total}</span>
            </div>
            <div className="w-full bg-gray-700 rounded-full h-2 mb-2">
              <div
                className="bg-blue-500 h-2 rounded-full transition-all"
                style={{ width: `${fixProgress.total > 0 ? (fixProgress.current / fixProgress.total) * 100 : 0}%` }}
              />
            </div>
            {fixProgress.label && <p className="text-xs text-gray-400">{fixProgress.label}</p>}
          </div>
        )}

        {/* Fix results */}
        {fixResults.length > 0 && (
          <div className="mb-4 space-y-1 max-h-48 overflow-y-auto">
            {fixResults.map((r, i) => (
              <div key={i} className={`text-sm px-2 py-1 rounded ${r.success ? 'text-green-400 bg-green-500/10' : 'text-red-400 bg-red-500/10'}`}>
                {r.success ? '✅' : '❌'} {r.label}{r.error ? ` — ${r.error}` : ''}
              </div>
            ))}
          </div>
        )}

        {/* Actions */}
        <div className="flex gap-2 justify-end">
          <button onClick={onClose} className="px-4 py-2 rounded-lg text-sm text-gray-400 hover:text-white hover:bg-gray-800">
            Close
          </button>
          {gaps !== null && totalGaps > 0 && !fixing && (
            <button
              onClick={fixAllGaps}
              className="px-4 py-2 rounded-lg text-sm font-medium bg-green-600 hover:bg-green-700 text-white"
            >
              🔧 Fix All {totalGaps} Gaps
            </button>
          )}
          {!checking && (
            <button
              onClick={checkGaps}
              disabled={fixing}
              className="px-4 py-2 rounded-lg text-sm font-medium bg-blue-600 hover:bg-blue-700 text-white disabled:opacity-50"
            >
              🔍 Re-scan
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

function ModelsView({ models: initialModels }: { models: Model[] }) {
  // Load synced models from localStorage, falling back to hardcoded
  const [models, setModels] = useState<Model[]>(() => {
    if (typeof window !== 'undefined') {
      try {
        const cached = localStorage.getItem('synced_models')
        if (cached) return JSON.parse(cached)
      } catch {}
    }
    return initialModels
  })
  const sortedModels = [...models].sort((a, b) => b.fans - a.fans)
  const [imageCounts, setImageCounts] = useState<{[key: string]: { total: number; active: number; needsDistribution?: boolean; vaultStatus?: string }}>({})
  const [showSyncModal, setShowSyncModal] = useState(false)
  const [syncing, setSyncing] = useState(false)
  const [syncResult, setSyncResult] = useState<{ total: number; newCount: number; needsPhotos: number } | null>(null)
  
  // Load image counts from IndexedDB
  useEffect(() => {
    const loadCounts = async () => {
      await migrateFromLocalStorage()
      const counts = await getImageCounts(models.length)
      setImageCounts(counts)
    }
    loadCounts()
  }, [models.length])

  const handleSyncAccounts = async () => {
    setSyncing(true)
    setSyncResult(null)
    try {
      const res = await fetch('/api/sync-accounts')
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      
      const liveModels: Model[] = data.accounts.map((a: any) => {
        // Preserve earnings from static data if available
        const existing = initialModels.find(m => m.username === a.username)
        return {
          id: a.id,
          username: a.username,
          displayName: a.displayName,
          fans: a.fans,
          likes: a.likes,
          avatar: a.avatar,
          connected: a.isAuthenticated,
          totalEarnings: existing?.totalEarnings || 0,
        }
      })
      
      const existingUsernames = new Set(initialModels.map(m => m.username))
      const newAccounts = liveModels.filter(m => !existingUsernames.has(m.username))
      const needsPhotos = liveModels.filter(m => !imageCounts[m.username]?.total)
      
      setModels(liveModels)
      // Persist to localStorage so model pages can find synced models
      localStorage.setItem('synced_models', JSON.stringify(liveModels))
      setSyncResult({ total: liveModels.length, newCount: newAccounts.length, needsPhotos: needsPhotos.length })
    } catch (e) {
      console.error('Sync failed:', e)
      alert(`Sync failed: ${e}`)
    }
    setSyncing(false)
  }
  
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold text-white">Models ({models.length})</h2>
        <div className="flex gap-2">
          <button
            onClick={handleSyncAccounts}
            disabled={syncing}
            className="bg-green-600 hover:bg-green-700 disabled:opacity-50 text-white px-4 py-2 rounded-lg text-sm font-medium"
          >
            {syncing ? '⏳ Syncing...' : '🔄 Sync Accounts'}
          </button>
          <button
            onClick={() => setShowSyncModal(true)}
            className="bg-purple-600 hover:bg-purple-700 text-white px-4 py-2 rounded-lg text-sm font-medium"
          >
            🔍 Check Vault Gaps
          </button>
          <button className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg text-sm font-medium">
            + Add Model
          </button>
        </div>
      </div>

      {syncResult && (
        <div className="bg-green-500/10 border border-green-500/30 rounded-lg p-4 flex items-center justify-between">
          <div className="text-sm text-green-400">
            ✅ Synced <strong>{syncResult.total}</strong> accounts from OF API
            {syncResult.newCount > 0 && <> · <strong>{syncResult.newCount}</strong> new</>}
            {syncResult.needsPhotos > 0 && <> · <strong>{syncResult.needsPhotos}</strong> need promo photos</>}
          </div>
          <button onClick={() => setSyncResult(null)} className="text-green-400/60 hover:text-green-400">✕</button>
        </div>
      )}

      {showSyncModal && <VaultGapsModal models={models} onClose={() => setShowSyncModal(false)} />}

      <div className="bg-gray-900 rounded-xl border border-gray-800 overflow-hidden">
        <table className="w-full">
          <thead className="bg-gray-800/50">
            <tr>
              <th className="text-left px-4 py-3 text-sm font-medium text-gray-400">Model</th>
              <th className="text-right px-4 py-3 text-sm font-medium text-gray-400">Fans</th>
              <th className="text-right px-4 py-3 text-sm font-medium text-gray-400">Earnings</th>
              <th className="text-right px-4 py-3 text-sm font-medium text-gray-400">LTV</th>
              <th className="text-left px-4 py-3 text-sm font-medium text-gray-400">Promo Images</th>
              <th className="text-left px-4 py-3 text-sm font-medium text-gray-400">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-800">
            {sortedModels.map(model => {
              const ltv = calculateLTV(model)
              return (
                <tr key={model.id} className="hover:bg-gray-800/30">
                  <td className="px-4 py-3">
                    <Link href={`/models/${model.username}`} className="flex items-center gap-3 hover:opacity-80">
                      <img 
                        src={model.avatar} 
                        alt={model.displayName}
                        className="w-10 h-10 rounded-full object-cover"
                      />
                      <div>
                        <div className="text-white font-medium">{model.displayName}</div>
                        <div className="text-sm text-gray-400">@{model.username}</div>
                      </div>
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <span className="text-white font-medium">{model.fans.toLocaleString()}</span>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <span className={model.totalEarnings > 0 ? 'text-green-400 font-medium' : 'text-gray-500'}>
                      {model.totalEarnings > 0 ? `$${model.totalEarnings.toLocaleString()}` : '—'}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <span className={ltv > 0 ? 'text-green-400 font-medium' : 'text-gray-500'}>
                      {ltv > 0 ? `$${ltv.toFixed(2)}` : '—'}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <span className={`text-sm ${imageCounts[model.username]?.total ? 'text-green-400' : 'text-gray-400'}`}>
                        {imageCounts[model.username]?.total || 0} images
                        {imageCounts[model.username]?.active ? (
                          <span className="text-xs text-gray-500 ml-1">({imageCounts[model.username].active} active)</span>
                        ) : null}
                      </span>
                      {imageCounts[model.username]?.needsDistribution && (
                        <span className="px-2 py-0.5 bg-yellow-500/20 text-yellow-400 text-xs rounded-full" title={imageCounts[model.username]?.vaultStatus}>
                          ⚠️ {imageCounts[model.username]?.vaultStatus}
                        </span>
                      )}
                      {!imageCounts[model.username]?.total && (
                        <span className="px-2 py-0.5 bg-red-500/20 text-red-400 text-xs rounded-full">
                          ⚠️ No images
                        </span>
                      )}
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <Link 
                        href={`/models/${model.username}`}
                        className="text-purple-400 hover:text-purple-300 text-sm px-3 py-1 rounded bg-purple-500/20 hover:bg-purple-500/30"
                      >
                        📸 Upload
                      </Link>
                      <button className="text-gray-400 hover:text-white text-sm px-2 py-1 rounded hover:bg-gray-700">
                        Stats
                      </button>
                    </div>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function RotationView() {
  const modelCount = CONNECTED_MODELS.length
  const interval = 60 / (modelCount - 1)
  const postsPerHour = modelCount * (modelCount - 1)
  
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold text-white">Rotation Settings</h2>
        <a 
          href="/rotation" 
          className="bg-purple-600 hover:bg-purple-700 text-white px-4 py-2 rounded-lg text-sm font-medium"
        >
          View Live Schedule →
        </a>
      </div>
      
      {/* Quick Stats */}
      <div className="grid grid-cols-4 gap-4">
        <div className="bg-purple-900/30 rounded-xl p-4 border border-purple-700">
          <div className="text-2xl font-bold text-white">{interval.toFixed(1)} min</div>
          <div className="text-sm text-purple-300">Tag Interval</div>
        </div>
        <div className="bg-green-900/30 rounded-xl p-4 border border-green-700">
          <div className="text-2xl font-bold text-white">{postsPerHour}</div>
          <div className="text-sm text-green-300">Posts/Hour</div>
        </div>
        <div className="bg-yellow-900/30 rounded-xl p-4 border border-yellow-700">
          <div className="text-2xl font-bold text-white">5 min</div>
          <div className="text-sm text-yellow-300">Delete Delay</div>
        </div>
        <div className="bg-blue-900/30 rounded-xl p-4 border border-blue-700">
          <div className="text-2xl font-bold text-white">24/7</div>
          <div className="text-sm text-blue-300">Operation</div>
        </div>
      </div>
      
      <div className="grid grid-cols-2 gap-6">
        {/* Ghost Tags Config */}
        <div className="bg-gray-900 rounded-xl p-6 border border-gray-800">
          <h3 className="text-lg font-semibold text-white mb-4">👻 Ghost Tags</h3>
          <div className="space-y-4">
            <div>
              <label className="block text-sm text-gray-400 mb-1">Delete After (minutes)</label>
              <input 
                type="number" 
                defaultValue={5}
                className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white"
              />
            </div>
            <div>
              <label className="block text-sm text-gray-400 mb-1">Active Hours</label>
              <div className="flex gap-2">
                <input 
                  type="time" 
                  defaultValue="08:00"
                  className="flex-1 bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white"
                />
                <span className="text-gray-400 py-2">to</span>
                <input 
                  type="time" 
                  defaultValue="23:00"
                  className="flex-1 bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white"
                />
              </div>
            </div>
            <div className="pt-2">
              <p className="text-sm text-gray-400">
                Interval: <span className="text-white font-mono">60 / (15 - 1) = 4.3 min</span>
              </p>
            </div>
          </div>
        </div>

        {/* 24hr Pinned Config */}
        <div className="bg-gray-900 rounded-xl p-6 border border-gray-800">
          <h3 className="text-lg font-semibold text-white mb-4">📌 24hr Pinned Posts</h3>
          <div className="space-y-4">
            <div>
              <label className="block text-sm text-gray-400 mb-1">Models Per Day</label>
              <input 
                type="number" 
                defaultValue={11}
                className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white"
              />
            </div>
            <div>
              <label className="block text-sm text-gray-400 mb-1">Assignment Time</label>
              <input 
                type="time" 
                defaultValue="06:00"
                className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white"
              />
            </div>
            <div className="pt-2">
              <p className="text-sm text-gray-400">
                Uses API parameter: <span className="text-white font-mono">expireDays: 1</span>
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* VA Schedule */}
      <div className="bg-gray-900 rounded-xl p-6 border border-gray-800">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold text-white">📋 VA Story Schedule</h3>
          <button className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg text-sm font-medium">
            Generate Schedule
          </button>
        </div>
        <p className="text-gray-400 text-sm">
          Stories with clickable @tags require manual posting (API limitation). 
          Generate a daily schedule for VAs with exact times and tags.
        </p>
      </div>
    </div>
  )
}

function AnalyticsView() {
  const sortedByFans = [...CONNECTED_MODELS].sort((a, b) => b.fans - a.fans)
  const sortedByLTV = [...CONNECTED_MODELS].sort((a, b) => calculateLTV(b) - calculateLTV(a))
  
  return (
    <div className="space-y-6">
      <h2 className="text-2xl font-bold text-white">Analytics</h2>
      
      <div className="grid grid-cols-4 gap-4">
        <div className="bg-gray-900 rounded-xl p-4 border border-gray-800">
          <div className="text-3xl font-bold text-white">{NETWORK_STATS.totalFans.toLocaleString()}</div>
          <div className="text-sm text-gray-400">Total Network Fans</div>
        </div>
        <div className="bg-gray-900 rounded-xl p-4 border border-gray-800">
          <div className="text-3xl font-bold text-white">${NETWORK_STATS.totalEarnings.toLocaleString()}</div>
          <div className="text-sm text-gray-400">Total Earnings</div>
        </div>
        <div className="bg-gray-900 rounded-xl p-4 border border-gray-800">
          <div className="text-3xl font-bold text-white">${NETWORK_STATS.avgLTV.toFixed(2)}</div>
          <div className="text-sm text-gray-400">Network Avg LTV</div>
        </div>
        <div className="bg-gray-900 rounded-xl p-4 border border-gray-800">
          <div className="text-3xl font-bold text-white">{Math.round(NETWORK_STATS.totalFans / 15).toLocaleString()}</div>
          <div className="text-sm text-gray-400">Avg Fans/Model</div>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-6">
        <div className="bg-gray-900 rounded-xl p-6 border border-gray-800">
          <h3 className="text-lg font-semibold text-white mb-4">Fan Distribution</h3>
          <div className="space-y-3">
            {sortedByFans.map(model => {
              const percentage = (model.fans / NETWORK_STATS.totalFans) * 100
              return (
                <div key={model.id} className="flex items-center gap-3">
                  <img 
                    src={model.avatar} 
                    alt={model.displayName}
                    className="w-6 h-6 rounded-full object-cover"
                  />
                  <div className="w-24 text-xs text-white truncate">{model.displayName}</div>
                  <div className="flex-1 bg-gray-800 rounded-full h-2">
                    <div 
                      className="bg-gradient-to-r from-pink-500 to-purple-500 h-2 rounded-full"
                      style={{ width: `${percentage}%` }}
                    />
                  </div>
                  <div className="w-16 text-right text-xs text-gray-400">
                    {model.fans.toLocaleString()}
                  </div>
                </div>
              )
            })}
          </div>
        </div>

        <div className="bg-gray-900 rounded-xl p-6 border border-gray-800">
          <h3 className="text-lg font-semibold text-white mb-4">LTV by Model</h3>
          <div className="space-y-3">
            {sortedByLTV.map(model => {
              const ltv = calculateLTV(model)
              const maxLTV = Math.max(...CONNECTED_MODELS.map(m => calculateLTV(m)), 1)
              const percentage = (ltv / maxLTV) * 100
              return (
                <div key={model.id} className="flex items-center gap-3">
                  <img 
                    src={model.avatar} 
                    alt={model.displayName}
                    className="w-6 h-6 rounded-full object-cover"
                  />
                  <div className="w-24 text-xs text-white truncate">{model.displayName}</div>
                  <div className="flex-1 bg-gray-800 rounded-full h-2">
                    <div 
                      className="bg-gradient-to-r from-green-500 to-emerald-400 h-2 rounded-full"
                      style={{ width: `${percentage}%` }}
                    />
                  </div>
                  <div className="w-16 text-right text-xs text-gray-400">
                    {ltv > 0 ? `$${ltv.toFixed(2)}` : '—'}
                  </div>
                </div>
              )
            })}
          </div>
          {NETWORK_STATS.totalEarnings === 0 && (
            <p className="text-xs text-gray-500 mt-4 italic">
              Input earnings data to see LTV metrics
            </p>
          )}
        </div>
      </div>
    </div>
  )
}

function SettingsView() {
  return (
    <div className="space-y-6">
      <h2 className="text-2xl font-bold text-white">Settings</h2>
      
      <div className="bg-gray-900 rounded-xl p-6 border border-gray-800">
        <h3 className="text-lg font-semibold text-white mb-4">OnlyFans API</h3>
        <div className="space-y-4">
          <div>
            <label className="block text-sm text-gray-400 mb-1">API Key</label>
            <input 
              type="password" 
              defaultValue="ofapi_bT4J1Er2YBow46EihDfjlSFf5HRmiM15M4DCOoHn7889d8b4"
              className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white font-mono text-sm"
            />
          </div>
          <div className="flex items-center gap-4 text-sm">
            <span className="text-gray-400">Status:</span>
            <span className="text-green-400">● Connected</span>
            <span className="text-gray-400">|</span>
            <span className="text-gray-400">Accounts:</span>
            <span className="text-white">15</span>
            <span className="text-gray-400">|</span>
            <span className="text-gray-400">Plan:</span>
            <span className="text-white">Pro ($299/mo)</span>
          </div>
        </div>
      </div>

      <div className="bg-gray-900 rounded-xl p-6 border border-gray-800">
        <h3 className="text-lg font-semibold text-white mb-4">Google Drive Integration</h3>
        <div className="space-y-4">
          <p className="text-gray-400 text-sm">
            Connect Google Drive to use your existing model content folders.
            Promo images will be pulled from Drive and uploaded to OF vaults.
          </p>
          <button className="bg-white text-gray-900 px-4 py-2 rounded-lg text-sm font-medium flex items-center gap-2">
            <svg className="w-5 h-5" viewBox="0 0 24 24">
              <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
              <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
              <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
              <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
            </svg>
            Connect Google Drive
          </button>
        </div>
      </div>
    </div>
  )
}
