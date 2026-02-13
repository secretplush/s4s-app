'use client'

import { useState, useEffect, useCallback } from 'react'
import Link from 'next/link'
import { useModels } from '@/lib/use-models'

interface RailwayStats {
  isRunning: boolean
  modelsActive: number
  stats: { totalTags: number; totalDeletes: number; startedAt: string | null }
  pinned?: { enabled: boolean; activePosts: number; featuredGirls: string[] }
  massDm?: { enabled: boolean; todaySent: number; todayTotal: number }
}

export default function NetworkPage() {
  const { models, loading: modelsLoading } = useModels()
  const [railwayStats, setRailwayStats] = useState<RailwayStats | null>(null)
  const [error, setError] = useState<string | null>(null)

  const loadRailway = useCallback(async () => {
    try {
      const res = await fetch('/api/railway?endpoint=stats')
      const data = await res.json().catch(() => null)
      if (data) setRailwayStats(data)
      setError(null)
    } catch (err: any) {
      setError(err.message)
    }
  }, [])

  useEffect(() => {
    loadRailway()
    const interval = setInterval(loadRailway, 30000)
    return () => clearInterval(interval)
  }, [loadRailway])

  const sortedModels = [...models].sort((a, b) => (b.totalEarnings || 0) - (a.totalEarnings || 0))
  const connectedCount = models.length
  const totalFans = models.reduce((sum, m) => sum + (m.fans || 0), 0)
  const totalEarnings = models.reduce((sum, m) => sum + (m.totalEarnings || 0), 0)
  const loading = modelsLoading

  if (loading) {
    return (
      <div className="min-h-screen bg-black text-white flex items-center justify-center">
        <div className="text-gray-400">Loading network from API...</div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-black text-white">
      {/* Header */}
      <div className="border-b border-gray-800 p-4">
        <div className="max-w-5xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Link href="/" className="text-gray-400 hover:text-white">← Back</Link>
            <h1 className="text-xl font-bold">🔌 Network Overview</h1>
            <span className="text-xs text-gray-500">Live from OF API + Railway</span>
          </div>
          <div className="flex gap-2">
            <Link href="/add-model" className="px-3 py-1.5 bg-green-600 hover:bg-green-700 rounded text-sm font-medium">
              ➕ Add Model
            </Link>
            <button
              onClick={() => loadRailway()}
              className="px-3 py-1.5 bg-gray-800 hover:bg-gray-700 rounded text-sm"
            >
              🔄 Refresh
            </button>
          </div>
        </div>
      </div>

      <div className="max-w-5xl mx-auto p-4 space-y-6">
        {error && (
          <div className="p-3 bg-red-900/30 border border-red-700 rounded-lg text-red-300 text-sm">
            ❌ {error}
          </div>
        )}

        {/* Stats */}
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
          <div className="bg-gray-900 rounded-xl p-4 border border-gray-800">
            <div className="text-3xl font-bold text-white">{connectedCount}</div>
            <div className="text-gray-400 text-sm">Connected Models</div>
          </div>
          <div className="bg-gray-900 rounded-xl p-4 border border-gray-800">
            <div className="text-3xl font-bold text-green-400">{railwayStats?.modelsActive || 0}</div>
            <div className="text-gray-400 text-sm">In Rotation</div>
          </div>
          <div className="bg-gray-900 rounded-xl p-4 border border-gray-800">
            <div className="text-3xl font-bold text-blue-400">{totalFans.toLocaleString()}</div>
            <div className="text-gray-400 text-sm">Total Fans</div>
          </div>
          <div className="bg-gray-900 rounded-xl p-4 border border-gray-800">
            <div className="text-3xl font-bold text-emerald-400">${totalEarnings > 1000000 ? `${(totalEarnings / 1000000).toFixed(1)}M` : totalEarnings.toLocaleString()}</div>
            <div className="text-gray-400 text-sm">Total Earnings (net)</div>
          </div>
          <div className="bg-gray-900 rounded-xl p-4 border border-gray-800">
            <div className="text-3xl font-bold text-purple-400">{totalFans > 0 ? `$${(totalEarnings / totalFans).toFixed(2)}` : '—'}</div>
            <div className="text-gray-400 text-sm">Avg LTV</div>
          </div>
        </div>

        {/* Railway Status */}
        {railwayStats && (
          <div className="bg-gray-900 rounded-xl p-4 border border-gray-800">
            <h3 className="font-semibold text-white mb-3">⚡ Railway Systems</h3>
            <div className="grid grid-cols-3 gap-4 text-sm">
              <div className="flex items-center gap-2">
                <span className={`w-2 h-2 rounded-full ${railwayStats.isRunning ? 'bg-green-500' : 'bg-red-500'}`} />
                <span className="text-gray-400">Ghost Tags:</span>
                <span className="text-white font-medium">{railwayStats.isRunning ? `Running (${railwayStats.stats.totalTags} today)` : 'Stopped'}</span>
              </div>
              <div className="flex items-center gap-2">
                <span className={`w-2 h-2 rounded-full ${railwayStats.pinned?.enabled ? 'bg-green-500' : 'bg-red-500'}`} />
                <span className="text-gray-400">Pinned Posts:</span>
                <span className="text-white font-medium">{railwayStats.pinned?.enabled ? `Active (${railwayStats.pinned.activePosts} live)` : 'Disabled'}</span>
              </div>
              <div className="flex items-center gap-2">
                <span className={`w-2 h-2 rounded-full ${railwayStats.massDm?.enabled ? 'bg-green-500' : 'bg-red-500'}`} />
                <span className="text-gray-400">Mass DMs:</span>
                <span className="text-white font-medium">{railwayStats.massDm?.enabled ? `${railwayStats.massDm.todaySent}/${railwayStats.massDm.todayTotal} sent` : 'Disabled'}</span>
              </div>
            </div>
          </div>
        )}

        {/* Models Table */}
        <div className="bg-gray-900 rounded-xl border border-gray-800 overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-800 text-gray-400 text-left">
                <th className="px-4 py-3">#</th>
                <th className="px-4 py-3">Model</th>
                <th className="px-4 py-3 text-right">Fans</th>
                <th className="px-4 py-3 text-right">Earnings (net)</th>
                <th className="px-4 py-3 text-right">LTV</th>
                <th className="px-4 py-3 text-center">Status</th>
              </tr>
            </thead>
            <tbody>
              {sortedModels.map((model, i) => {
                const ltv = model.fans > 0 && model.totalEarnings > 0 ? model.totalEarnings / model.fans : 0
                const isFeatured = railwayStats?.pinned?.featuredGirls?.includes(model.username)
                return (
                  <tr key={model.username} className="border-b border-gray-800/50 hover:bg-gray-800/30">
                    <td className="px-4 py-3 text-gray-500">{i + 1}</td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        {model.avatar ? (
                          <img src={model.avatar} alt="" className="w-8 h-8 rounded-full object-cover" />
                        ) : (
                          <div className="w-8 h-8 rounded-full bg-gray-700 flex items-center justify-center text-xs">👩</div>
                        )}
                        <div>
                          <div className="text-white font-medium">{model.displayName}</div>
                          <div className="text-gray-500 text-xs">@{model.username}</div>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-right text-white">{model.fans?.toLocaleString() || '—'}</td>
                    <td className="px-4 py-3 text-right text-emerald-400">
                      {model.totalEarnings > 0 ? `$${model.totalEarnings > 1000000 ? `${(model.totalEarnings / 1000000).toFixed(1)}M` : model.totalEarnings.toLocaleString()}` : '—'}
                    </td>
                    <td className="px-4 py-3 text-right text-gray-300">
                      {ltv > 0 ? `$${ltv.toFixed(2)}` : '—'}
                    </td>
                    <td className="px-4 py-3 text-center">
                      <div className="flex items-center justify-center gap-1">
                        <span className="w-2 h-2 rounded-full bg-green-500" title="Connected" />
                        {isFeatured && <span className="text-xs" title="Featured today">📌</span>}
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>

        {/* Info */}
        <div className="text-xs text-gray-600 text-center">
          Data from OF API (sync-accounts) • Railway stats refresh every 30s • Earnings cached 1hr
        </div>
      </div>
    </div>
  )
}
