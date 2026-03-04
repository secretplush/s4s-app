'use client'

import { useState, useEffect, useCallback, Suspense } from 'react'
import { useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { Model, calculateLTV, computeNetworkStats } from '@/lib/models-data'
import { useModels } from '@/lib/use-models'
import { getImageCounts, migrateFromLocalStorage, loadImages, getAllUsernames, syncToKV } from '@/lib/indexed-db'
import { compressImage } from '@/lib/image-utils'

function DashboardContent() {
  const searchParams = useSearchParams()
  const tabParam = searchParams.get('tab') as 'dashboard' | 'models' | null
  const [activeTab, setActiveTab] = useState<'dashboard' | 'models'>('dashboard')
  const { models: allModels, loading: modelsLoading, refresh: refreshModels } = useModels()
  
  // Sync tab from URL
  useEffect(() => {
    if (tabParam && ['dashboard', 'models'].includes(tabParam)) {
      setActiveTab(tabParam)
    }
  }, [tabParam])
  const [rotationStatus, setRotationStatus] = useState<'stopped' | 'running'>('stopped')
  const [stats, setStats] = useState<any>(null)

  // Fetch stats for rotation status and circuit breaker
  const fetchStats = useCallback(async () => {
    try {
      const res = await fetch('/api/railway?endpoint=stats', { cache: 'no-store' })
      if (res.ok) {
        const data = await res.json()
        setStats(data)
        setRotationStatus(data.isRunning ? 'running' : 'stopped')
      }
    } catch {}
  }, [])
  
  useEffect(() => {
    fetchStats()
    const interval = setInterval(fetchStats, 30000) // Update every 30s
    return () => clearInterval(interval)
  }, [fetchStats])

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
              { id: 'rotation', icon: '🔄', label: 'Live Ops', href: '/rotation' },
              { id: 'captions', icon: '💬', label: 'Captions', href: '/captions' },
              { id: 'mass-dm', icon: '📨', label: 'Mass DMs', href: '/mass-dm' },
              { id: 'network', icon: '🔌', label: 'Network', href: '/network' },
              { id: 'add-model', icon: '➕', label: 'Add Model', href: '/add-model' },
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
              onClick={async () => {
                const endpoint = rotationStatus === 'running' ? 'stop' : 'start'
                try {
                  const res = await fetch(`/api/railway?endpoint=${endpoint}`, { method: 'POST' })
                  if (res.ok) {
                    const data = await res.json()
                    setRotationStatus(endpoint === 'start' ? 'running' : 'stopped')
                    // Refresh stats after action
                    setTimeout(fetchStats, 1000)
                  }
                } catch (e) {
                  console.error('Failed to toggle rotation:', e)
                }
              }}
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
          {activeTab === 'dashboard' && (
            <>
              <CircuitBreakerBanner stats={stats} />
              <DashboardView rotationStatus={rotationStatus} models={allModels} stats={stats} />
            </>
          )}
          {activeTab === 'models' && <ModelsView models={allModels} onRefresh={refreshModels} />}
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

function CircuitBreakerBanner({ stats }: { stats: any }) {
  if (!stats?.deleteCircuitBreaker) return null
  
  const { consecutiveFailures, threshold, trippedAt, lastFailure } = stats.deleteCircuitBreaker
  
  // Show red banner if circuit breaker is tripped
  if (trippedAt) {
    return (
      <div className="mb-6 bg-red-600 border border-red-500 rounded-xl p-4 text-white">
        <div className="flex items-center gap-3">
          <span className="text-2xl">🛑</span>
          <div className="flex-1">
            <div className="font-bold text-lg">CIRCUIT BREAKER TRIPPED</div>
            <div className="text-red-100">
              Rotation auto-stopped. Delete endpoint is failing. Contact OF API team.
            </div>
            <div className="text-xs text-red-200 mt-1">
              Tripped at: {new Date(trippedAt).toLocaleString()}
            </div>
          </div>
        </div>
      </div>
    )
  }
  
  // Show yellow warning if failures detected but not tripped
  if (consecutiveFailures > 0) {
    return (
      <div className="mb-6 bg-yellow-600 border border-yellow-500 rounded-xl p-4 text-white">
        <div className="flex items-center gap-3">
          <span className="text-2xl">⚠️</span>
          <div className="flex-1">
            <div className="font-bold">Delete failures detected ({consecutiveFailures}/{threshold})</div>
            <div className="text-yellow-100">
              Rotation will auto-stop if this continues
            </div>
          </div>
        </div>
      </div>
    )
  }
  
  return null
}

function LiveS4SStatus() {
  const [stats, setStats] = useState<any>(null)
  
  const fetchStats = useCallback(async () => {
    try {
      const res = await fetch('/api/railway?endpoint=stats', { cache: 'no-store' })
      if (res.ok) setStats(await res.json())
    } catch {}
  }, [])
  
  useEffect(() => {
    fetchStats()
    const interval = setInterval(fetchStats, 15000)
    return () => clearInterval(interval)
  }, [fetchStats])
  
  if (!stats) return <div className="text-gray-500 text-sm">Loading...</div>
  
  return (
    <div className="grid grid-cols-3 gap-4">
      <div className="space-y-2">
        <div className="flex items-center gap-2">
          <span>👻</span>
          <span className="text-white font-medium">Ghost Tags</span>
          {stats.isRunning ? (
            <span className="w-2 h-2 bg-green-500 rounded-full animate-pulse" />
          ) : (
            <span className="w-2 h-2 bg-red-500 rounded-full" />
          )}
        </div>
        <div className="text-2xl font-bold text-purple-400">{stats.stats?.totalTags ?? 0}</div>
        <div className="text-xs text-gray-500">tags today • {stats.modelsActive} models</div>
      </div>
      <div className="space-y-2">
        <div className="flex items-center gap-2">
          <span>📌</span>
          <span className="text-white font-medium">Pinned Posts</span>
          {stats.pinned?.enabled ? (
            <span className="w-2 h-2 bg-green-500 rounded-full animate-pulse" />
          ) : (
            <span className="w-2 h-2 bg-gray-500 rounded-full" />
          )}
        </div>
        <div className="text-2xl font-bold text-yellow-400">{stats.pinned?.activePosts ?? 0}</div>
        <div className="text-xs text-gray-500">active pins • day {stats.pinned?.dayIndex ?? '?'}</div>
      </div>
      <div className="space-y-2">
        <div className="flex items-center gap-2">
          <span>📨</span>
          <span className="text-white font-medium">Mass DMs</span>
          {stats.massDm?.enabled ? (
            <span className="w-2 h-2 bg-green-500 rounded-full animate-pulse" />
          ) : (
            <span className="w-2 h-2 bg-gray-500 rounded-full" />
          )}
        </div>
        <div className="text-2xl font-bold text-cyan-400">
          {stats.massDm?.todaySent ?? 0}
          <span className="text-sm text-gray-500"> / {stats.massDm?.todayTotal ?? 0}</span>
        </div>
        <div className="text-xs text-gray-500">sent today</div>
      </div>
    </div>
  )
}

function SystemStatusBar({ stats: propStats }: { stats?: any }) {
  const [stats, setStats] = useState<any>(propStats)

  const fetchStats = useCallback(async () => {
    try {
      const res = await fetch('/api/railway?endpoint=stats', { cache: 'no-store' })
      if (res.ok) setStats(await res.json())
    } catch {}
  }, [])

  useEffect(() => {
    if (!propStats) {
      fetchStats()
      const interval = setInterval(fetchStats, 60000)
      return () => clearInterval(interval)
    } else {
      setStats(propStats)
    }
  }, [fetchStats, propStats])

  if (!stats) return <div className="bg-gray-900 rounded-xl p-3 border border-gray-800 animate-pulse h-14" />

  const pending = stats.pendingDeletes ?? 0
  const maxOverdue = stats.pendingDeletesList?.reduce((max: number, d: any) => Math.max(max, d.overdueBy ?? 0), 0) ?? 0
  const pendingColor = pending > 300 ? 'text-red-400' : pending > 100 ? 'text-yellow-400' : 'text-green-400'
  const overdueColor = maxOverdue > 600 ? 'text-red-400' : 'text-green-400'

  // Calculate delete success rate
  const totalDeletes = stats.stats?.totalDeletes ?? 0
  const totalDeleteFailures = stats.stats?.totalDeleteFailures ?? 0
  const successRate = totalDeletes + totalDeleteFailures > 0 ? 
    (totalDeletes / (totalDeletes + totalDeleteFailures) * 100) : 0
  const successRateColor = successRate > 95 ? 'text-green-400' : successRate > 80 ? 'text-yellow-400' : 'text-red-400'

  // Format average post life
  const avgLatency = stats.avgDeleteLatency ?? null
  let avgLifeText = '—'
  let avgLifeColor = 'text-gray-400'
  if (avgLatency) {
    const minutes = Math.floor(avgLatency / 60)
    const seconds = avgLatency % 60
    avgLifeText = `${minutes}m ${seconds}s`
    avgLifeColor = avgLatency < 360 ? 'text-green-400' : avgLatency < 600 ? 'text-yellow-400' : 'text-red-400' // <6min green, <10min yellow, >10min red
  }

  // Check for stale posts (>10 min overdue)
  const stalePosts = stats.pendingDeletesList?.filter((p: any) => p.overdueBy > 600) ?? []

  return (
    <div className="space-y-3">
      {/* Stale Post Alert */}
      {stalePosts.length > 0 && (
        <div className="bg-red-600 border border-red-500 rounded-xl p-3 text-white">
          <div className="flex items-center gap-2">
            <span className="text-lg">🔴</span>
            <span className="font-bold">{stalePosts.length} posts overdue by &gt;10min</span>
            <span className="text-red-200">— posts still visible on profiles!</span>
          </div>
        </div>
      )}
      
      {/* Main Status Bar */}
      <div className="bg-gray-900 rounded-xl p-3 border border-gray-800 flex items-center justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-2">
          <span className={`w-2 h-2 rounded-full ${stats.isRunning ? 'bg-green-500 animate-pulse' : 'bg-red-500'}`} />
          <span className="text-sm text-gray-400">Models Active:</span>
          <span className="text-sm font-bold text-white">{stats.modelsActive ?? '?'}</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-sm text-gray-400">Success Rate:</span>
          <span className={`text-sm font-bold ${successRateColor}`}>{successRate.toFixed(1)}%</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-sm text-gray-400">Avg Post Life:</span>
          <span className={`text-sm font-bold ${avgLifeColor}`}>{avgLifeText}</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-sm text-gray-400">Pending Deletes:</span>
          <span className={`text-sm font-bold ${pendingColor}`}>{pending}</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-sm text-gray-400">Tags Today:</span>
          <span className="text-sm font-bold text-purple-400">{(stats.stats?.totalTags ?? 0).toLocaleString()}</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-sm text-gray-400">Deletes Today:</span>
          <span className="text-sm font-bold text-cyan-400">{(stats.stats?.totalDeletes ?? 0).toLocaleString()}</span>
        </div>
      </div>
    </div>
  )
}

function ModelHealthGrid() {
  const [data, setData] = useState<any>(null)
  const [loading, setLoading] = useState(true)

  const fetchHealth = useCallback(async () => {
    try {
      const res = await fetch('/api/vault-health', { cache: 'no-store' })
      if (res.ok) setData(await res.json())
    } catch {}
    setLoading(false)
  }, [])

  useEffect(() => {
    fetchHealth()
    const interval = setInterval(fetchHealth, 60000)
    return () => clearInterval(interval)
  }, [fetchHealth])

  if (loading) return <div className="bg-gray-900 rounded-xl p-6 border border-gray-800 animate-pulse h-40" />
  if (!data) return <div className="text-red-400 text-sm">Failed to load vault health</div>

  const allModels = [...(data.unhealthy || []), ...(data.healthy || [])]

  return (
    <div className="bg-gray-900 rounded-xl border border-gray-800 overflow-hidden">
      <div className="px-6 py-4 border-b border-gray-800 flex items-center justify-between">
        <h3 className="text-lg font-semibold text-white">🏥 Model Health Grid</h3>
        <div className="flex items-center gap-3 text-sm">
          <span className="text-green-400">✅ {data.summary?.healthy ?? 0} healthy</span>
          <span className="text-red-400">❌ {data.summary?.unhealthy ?? 0} unhealthy</span>
        </div>
      </div>
      <div className="max-h-96 overflow-y-auto">
        <table className="w-full">
          <thead className="bg-gray-800/50 sticky top-0">
            <tr>
              <th className="text-left px-4 py-2 text-sm font-medium text-gray-400">Model</th>
              <th className="text-right px-4 py-2 text-sm font-medium text-gray-400">Vault</th>
              <th className="text-center px-4 py-2 text-sm font-medium text-gray-400">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-800">
            {allModels.map((m: any) => {
              const ratio = m.expected > 0 ? m.targets / m.expected : 1
              const isHealthy = ratio >= 0.9
              return (
                <tr key={m.username} className="hover:bg-gray-800/30">
                  <td className="px-4 py-2 text-sm text-white font-medium">@{m.username}</td>
                  <td className="px-4 py-2 text-sm text-right font-mono">
                    <span className={isHealthy ? 'text-green-400' : 'text-red-400'}>
                      {m.completeness} {isHealthy ? '✅' : '❌'}
                    </span>
                  </td>
                  <td className="px-4 py-2 text-center">
                    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                      isHealthy ? 'bg-green-500/20 text-green-400' : 'bg-red-500/20 text-red-400'
                    }`}>
                      {Math.round(ratio * 100)}%
                    </span>
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

function PromotionBalance() {
  const [data, setData] = useState<{ models: { username: string; scheduled: number; executed: number }[]; total: number; avg: number } | null>(null)
  const [loading, setLoading] = useState(true)

  const fetchPromo = useCallback(async () => {
    try {
      const res = await fetch('/api/railway?endpoint=dashboard', { cache: 'no-store' })
      if (!res.ok) return
      const dash = await res.json()
      const gt = dash.ghostTags || {}
      const perModel = gt.perModel || {}
      const models = Object.entries(perModel).map(([username, data]: [string, any]) => ({
        username,
        scheduled: data.total || 0,
        executed: data.executed || 0,
      })).sort((a, b) => a.scheduled - b.scheduled)
      setData({ models, total: gt.totalTagsToday || 0, avg: gt.avgPerModel || 0 })
    } catch {}
    setLoading(false)
  }, [])

  useEffect(() => {
    fetchPromo()
    const interval = setInterval(fetchPromo, 60000)
    return () => clearInterval(interval)
  }, [fetchPromo])

  if (loading) return <div className="bg-gray-900 rounded-xl p-6 border border-gray-800 animate-pulse h-40" />
  if (!data) return null

  const minScheduled = data.models.length > 0 ? Math.min(...data.models.map(m => m.scheduled)) : 0
  const maxScheduled = data.models.length > 0 ? Math.max(...data.models.map(m => m.scheduled)) : 0
  const isBalanced = maxScheduled - minScheduled <= 2

  return (
    <div className="bg-gray-900 rounded-xl border border-gray-800 overflow-hidden">
      <div className="px-6 py-4 border-b border-gray-800">
        <h3 className="text-lg font-semibold text-white">📊 Promotion Balance</h3>
        <p className="text-xs text-gray-500 mt-1">Scheduled ghost tags per model today — {data.total} total across {data.models.length} models</p>
      </div>
      <div className="px-6 py-3 border-b border-gray-800">
        <div className="flex items-center gap-4">
          <span className={`text-sm font-medium ${isBalanced ? 'text-green-400' : 'text-yellow-400'}`}>
            {isBalanced ? '✅ Balanced' : '⚠️ Imbalanced'} — each model gets {minScheduled === maxScheduled ? minScheduled : `${minScheduled}-${maxScheduled}`} tags/day
          </span>
          <span className="text-xs text-gray-500">avg: {data.avg}/model</span>
        </div>
      </div>
      <div className="max-h-64 overflow-y-auto">
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-1 p-4">
          {data.models.map(({ username, scheduled, executed }) => (
            <div key={username} className="flex items-center justify-between px-2 py-1 rounded bg-gray-800/50 text-sm">
              <span className="text-gray-300 truncate">@{username}</span>
              <span className="text-white font-mono ml-2">{executed}/{scheduled}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

function DashboardView({ rotationStatus, models, stats }: { rotationStatus: string; models: Model[]; stats?: any }) {
  const NETWORK_STATS = computeNetworkStats(models)
  const sortedByFans = [...models].sort((a, b) => b.fans - a.fans)
  
  return (
    <div className="space-y-6">
      <h2 className="text-2xl font-bold text-white">Dashboard</h2>

      {/* System Status Bar */}
      <SystemStatusBar stats={stats} />
      
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
            <span className="text-2xl">❤️</span>
          </div>
          <div className="text-3xl font-bold text-white">{NETWORK_STATS.totalLikes.toLocaleString()}</div>
          <div className="text-sm text-gray-400">Total Likes</div>
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

      {/* Live S4S Status — links to /rotation for full dashboard */}
      <a href="/rotation" className="block">
        <div className="bg-gray-900 rounded-xl p-6 border border-gray-800 hover:border-purple-500/50 transition-colors cursor-pointer">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold text-white">⚡ S4S Operations</h3>
            <span className="text-xs text-gray-500">Click for full dashboard →</span>
          </div>
          <LiveS4SStatus />
        </div>
      </a>

      {/* Model Health Grid */}
      <ModelHealthGrid />

      {/* Promotion Balance */}
      <PromotionBalance />
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
      // Fetch server-side vault mappings (KV) — this is what the rotation actually uses
      const res = await fetch('/api/vault-gaps')
      if (!res.ok) throw new Error(`Server error: ${res.status}`)
      const data = await res.json()

      setGaps(data.gaps || [])
      setTotalGaps(data.totalGaps || 0)
      setModelsWithGaps(data.modelsWithGaps || 0)
    } catch (e) {
      console.error(e)
    }
    setChecking(false)
  }

  const dismissGap = async (sourceUsername: string, targetUsername: string) => {
    try {
      // Save synthetic vault ID to IndexedDB
      const images = await loadImages(sourceUsername)
      const activeImg = images.find(img => img.isActive)
      if (activeImg) {
        const { saveImages } = await import('@/lib/indexed-db')
        const updatedImages = images.map(img =>
          img.id === activeImg.id
            ? { ...img, vaultIds: { ...img.vaultIds, [targetUsername]: 'manual_verified' } }
            : img
        )
        await saveImages(sourceUsername, updatedImages)
      }
      // Sync to KV
      await syncToKV()
      // Re-scan
      await checkGaps()
    } catch (e) {
      console.error('Failed to dismiss gap:', e)
    }
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

    // Gap format: {targetUsername: "X", missingFrom: ["A","B"]}
    // Means: A and B don't have X's photo in their vault (can't promote X)
    // Fix: load X's promo image, distribute to A and B's vaults
    // Group by the model whose photo we need (targetUsername = image source)
    const imageSourceToVaults: Record<string, string[]> = {}
    for (const gap of gaps) {
      if (!imageSourceToVaults[gap.targetUsername]) imageSourceToVaults[gap.targetUsername] = []
      imageSourceToVaults[gap.targetUsername].push(...gap.missingFrom)
    }
    // Rename for compatibility with rest of function
    const sourceToTargets = imageSourceToVaults

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

      setFixProgress({ current: completed, total: totalGaps, label: `📤 ${sourceUsername} → ${targetUsernames.length} models` })

      try {
        // Chunk targets into groups of 3 to avoid API timeouts and rate limits
        setFixProgress({ current: completed, total: totalGaps, label: `📤 ${sourceUsername} → ${targetUsernames.length} models` })

        const res = await fetch('/api/distribute', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            imageBase64: await compressImage(activeImg.base64),
            filename: activeImg.filename || `${sourceUsername}_promo.jpg`,
            sourceUsername,
            targetUsernames
          })
        })
        const text = await res.text()
        let allChunkResults: any[]
        try {
          const parsed = JSON.parse(text)
          allChunkResults = parsed.results || []
        } catch {
          throw new Error(text.slice(0, 100))
        }
        
        // Update vaultIds in IndexedDB image
        const newVaultIds: Record<string, string> = {}
        for (const r of allChunkResults) {
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
          Shows which models can&apos;t promote others because they&apos;re missing photos. e.g. &quot;@lindsay — can&apos;t promote 67 models&quot; means lindsay needs photos of those models distributed to her vault.
        </p>

        {/* Loading state */}
        {checking && <p className="text-sm text-gray-400 mb-4 animate-pulse">🔍 Scanning vault mappings across all models...</p>}

        {/* Results summary */}
        {gaps !== null && !checking && (
          <>
            {totalGaps === 0 ? (
              <div className="mb-4 p-4 rounded-lg bg-green-500/10 border border-green-500/30 text-center">
                <p className="text-green-400 text-lg font-bold">✅ All vaults are fully synced!</p>
                <p className="text-green-400/70 text-sm mt-1">Every model can promote every other model.</p>
              </div>
            ) : (
              <div className="mb-4 p-3 rounded-lg bg-yellow-500/10 border border-yellow-500/30">
                <p className="text-yellow-400 font-bold text-lg">
                  {totalGaps} gaps found across {modelsWithGaps} models
                </p>
              </div>
            )}

            {/* Regroup: by promoter (missingFrom) instead of by target */}
            {gaps.length > 0 && (() => {
              // Invert: gaps is [{targetUsername, missingFrom[]}] → we want [{promoter, cantPromote[]}]
              const promoterGaps: Record<string, string[]> = {}
              for (const g of gaps) {
                for (const src of g.missingFrom) {
                  if (!promoterGaps[src]) promoterGaps[src] = []
                  promoterGaps[src].push(g.targetUsername)
                }
              }
              const sorted = Object.entries(promoterGaps).sort((a, b) => b[1].length - a[1].length)

              return (
                <div className="mb-4 space-y-1 max-h-60 overflow-y-auto">
                  {sorted.map(([promoter, cantPromote]) => (
                    <div key={promoter} className="border border-gray-700 rounded-lg overflow-hidden">
                      <button
                        onClick={() => toggleExpand(promoter)}
                        className="w-full flex items-center justify-between px-3 py-2 bg-gray-800 hover:bg-gray-750 text-left"
                      >
                        <span className="text-sm text-white">@{promoter}</span>
                        <span className="text-xs text-red-400">can&apos;t promote {cantPromote.length} models {expanded.has(promoter) ? '▲' : '▼'}</span>
                      </button>
                      {expanded.has(promoter) && (
                        <div className="px-3 py-2 bg-gray-800/50">
                          <p className="text-xs text-gray-500 mb-2">@{promoter} needs these models&apos; photos distributed to her vault:</p>
                          <div className="flex flex-wrap gap-1">
                          {cantPromote.map(t => (
                            <span key={t} className="text-xs px-2 py-0.5 bg-red-500/20 text-red-400 rounded inline-flex items-center gap-1">
                              @{t}
                              <button
                                onClick={(e) => { e.stopPropagation(); dismissGap(promoter, t) }}
                                className="ml-0.5 hover:text-green-400 text-red-300"
                                title="Dismiss"
                              >✕</button>
                            </span>
                          ))}
                          </div>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )
            })()}
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

function ModelsView({ models, onRefresh }: { models: Model[]; onRefresh: () => Promise<Model[]> }) {
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
      const prevUsernames = new Set(models.map(m => m.username))
      const liveModels = await onRefresh()
      const newAccounts = liveModels.filter(m => !prevUsernames.has(m.username))
      const needsPhotos = liveModels.filter(m => !imageCounts[m.username]?.total)
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
          <button
            onClick={async () => {
              const btn = document.activeElement as HTMLButtonElement
              if (btn) btn.textContent = '⏳ Pushing...'
              const result = await syncToKV()
              if (btn) btn.textContent = result.success ? `✅ ${result.message}` : `❌ ${result.message}`
              setTimeout(() => { if (btn) btn.textContent = '🚀 Push to Railway' }, 5000)
            }}
            className="bg-orange-600 hover:bg-orange-700 text-white px-4 py-2 rounded-lg text-sm font-medium"
          >
            🚀 Push to Railway
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

      {showSyncModal && <VaultGapsModal models={models} onClose={async () => {
        setShowSyncModal(false)
        // Refresh image counts after gap fixes
        const counts = await getImageCounts(models.length)
        setImageCounts(counts)
      }} />}

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

