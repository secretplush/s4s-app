'use client'

import { useState, useEffect, useCallback } from 'react'
import Link from 'next/link'

const RAILWAY_PROXY = '/api/railway'

interface MassDMStatus {
  enabled: boolean
  date: string
  todaySent: number
  todayPending: number
  todayFailed: number
  todayTotal: number
  lastSent: string | null
  models: string[]
  schedule: Record<string, any[]>
  debug?: any
}

interface ScheduleEntry {
  target: string
  scheduledTime: string
  status: string
  sentAt?: string
  error?: string
}

interface SentEntry {
  promoter: string
  target: string
  accountId: string
  queueId: string
  sentAt: string
  success: boolean
}

function toAST(utc: string | null | undefined): string {
  if (!utc) return '—'
  try {
    return new Date(utc).toLocaleString('en-US', {
      timeZone: 'America/Puerto_Rico',
      hour: 'numeric',
      minute: '2-digit',
      second: '2-digit',
      hour12: true,
    })
  } catch {
    return utc
  }
}

function toASTShort(utc: string | null | undefined): string {
  if (!utc) return '—'
  try {
    return new Date(utc).toLocaleTimeString('en-US', {
      timeZone: 'America/Puerto_Rico',
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
    })
  } catch {
    return utc
  }
}

const TIME_WINDOWS = [
  '12:00 AM', '1:00 AM', '2:00 AM', '3:00 AM',
  '4:00 AM', '5:00 AM', '6:00 AM', '7:00 AM',
  '8:00 AM', '9:00 AM', '10:00 AM', '11:00 AM',
]

function getWindowHour(label: string): number {
  const match = label.match(/^(\d+):00\s*(AM|PM)$/i)
  if (!match) return -1
  let h = parseInt(match[1])
  const ampm = match[2].toUpperCase()
  if (ampm === 'AM' && h === 12) h = 0
  if (ampm === 'PM' && h !== 12) h += 12
  return h
}

export default function MassDMPage() {
  const [status, setStatus] = useState<MassDMStatus | null>(null)
  const [scheduleData, setScheduleData] = useState<Record<string, ScheduleEntry[]>>({})
  const [sentEntries, setSentEntries] = useState<SentEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [actionLoading, setActionLoading] = useState(false)
  const [expandedModels, setExpandedModels] = useState<Set<string>>(new Set())
  const [confirmUnsend, setConfirmUnsend] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const fetchAll = useCallback(async () => {
    try {
      const [statusRes, scheduleRes, sentRes] = await Promise.all([
        fetch(`${RAILWAY_PROXY}?endpoint=mass-dm`),
        fetch(`${RAILWAY_PROXY}?endpoint=mass-dm/schedule`),
        fetch(`${RAILWAY_PROXY}?endpoint=mass-dm/sent`),
      ])
      const statusData = await statusRes.json()
      const schedData = await scheduleRes.json()
      const sentData = await sentRes.json()

      if (statusData.error) {
        setError(statusData.error)
      } else {
        setStatus(statusData)
        setError(null)
      }
      if (schedData.schedule) setScheduleData(schedData.schedule)
      if (sentData.entries) setSentEntries(sentData.entries.slice(0, 50))
    } catch (e) {
      setError('Cannot reach Railway backend')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchAll()
    const interval = setInterval(fetchAll, 30000)
    return () => clearInterval(interval)
  }, [fetchAll])

  const toggleSystem = async () => {
    if (!status) return
    setActionLoading(true)
    try {
      const endpoint = status.enabled ? 'mass-dm/disable' : 'mass-dm/enable'
      await fetch(`${RAILWAY_PROXY}?endpoint=${endpoint}`, { method: 'POST' })
      await fetchAll()
    } catch {
      setError('Failed to toggle system')
    } finally {
      setActionLoading(false)
    }
  }

  const unsendAll = async () => {
    setActionLoading(true)
    setConfirmUnsend(false)
    try {
      await fetch(`${RAILWAY_PROXY}?endpoint=mass-dm/unsend-all`, { method: 'POST' })
      await fetchAll()
    } catch {
      setError('Failed to unsend')
    } finally {
      setActionLoading(false)
    }
  }

  const toggleModel = (model: string) => {
    setExpandedModels(prev => {
      const next = new Set(prev)
      next.has(model) ? next.delete(model) : next.add(model)
      return next
    })
  }

  // Compute window stats from schedule data
  const windowStats = TIME_WINDOWS.map(label => {
    const windowHour = getWindowHour(label)
    let sent = 0, pending = 0, failed = 0, total = 0
    Object.values(scheduleData).forEach(entries => {
      entries.forEach(e => {
        const eHour = new Date(e.scheduledTime).getUTCHours() - 4 // rough AST
        const normalizedHour = ((eHour % 24) + 24) % 24
        if (normalizedHour === windowHour) {
          total++
          if (e.status === 'sent') sent++
          else if (e.status === 'pending') pending++
          else if (e.status === 'failed') failed++
        }
      })
    })
    return { label, sent, pending, failed, total }
  })

  const currentASTHour = new Date().getUTCHours() - 4

  if (loading) {
    return (
      <main className="min-h-screen bg-gray-950 flex items-center justify-center">
        <div className="text-gray-400 text-lg animate-pulse">Loading Mass DM data...</div>
      </main>
    )
  }

  return (
    <main className="min-h-screen bg-gray-950 p-6">
      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <Link href="/" className="text-blue-400 hover:text-blue-300 text-sm mb-1 inline-block">
              ← Back to Dashboard
            </Link>
            <h1 className="text-2xl font-bold text-white">📨 Mass DM Promos</h1>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={toggleSystem}
              disabled={actionLoading}
              className={`px-5 py-2 rounded-lg font-bold text-sm transition-all ${
                actionLoading
                  ? 'bg-gray-700 text-gray-400 cursor-wait'
                  : status?.enabled
                    ? 'bg-red-600 hover:bg-red-700 text-white'
                    : 'bg-green-600 hover:bg-green-700 text-white'
              }`}
            >
              {actionLoading ? '⏳...' : status?.enabled ? '⏹ Disable' : '▶ Enable'}
            </button>
            {!confirmUnsend ? (
              <button
                onClick={() => setConfirmUnsend(true)}
                className="px-4 py-2 rounded-lg text-sm font-medium bg-red-900/50 text-red-400 border border-red-700/50 hover:bg-red-900"
              >
                🗑 Unsend All
              </button>
            ) : (
              <div className="flex items-center gap-2">
                <span className="text-red-400 text-sm">Are you sure?</span>
                <button
                  onClick={unsendAll}
                  disabled={actionLoading}
                  className="px-3 py-1.5 rounded-lg text-sm font-bold bg-red-600 hover:bg-red-700 text-white"
                >
                  Yes, Unsend
                </button>
                <button
                  onClick={() => setConfirmUnsend(false)}
                  className="px-3 py-1.5 rounded-lg text-sm text-gray-400 hover:text-white"
                >
                  Cancel
                </button>
              </div>
            )}
          </div>
        </div>

        {error && (
          <div className="mb-4 p-3 rounded-lg bg-red-900/30 border border-red-700/50 text-red-400 text-sm">
            ⚠️ {error}
          </div>
        )}

        {/* Status Cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
          <div className="bg-gray-900 rounded-xl p-4 border border-gray-800">
            <div className="flex items-center gap-2 mb-2">
              <span className={`w-3 h-3 rounded-full ${status?.enabled ? 'bg-green-500 animate-pulse' : 'bg-red-500'}`} />
              <span className="text-sm text-gray-400">Status</span>
            </div>
            <div className={`text-xl font-bold ${status?.enabled ? 'text-green-400' : 'text-red-400'}`}>
              {status?.enabled ? 'Enabled' : 'Disabled'}
            </div>
          </div>

          <div className="bg-gray-900 rounded-xl p-4 border border-gray-800">
            <div className="text-sm text-gray-400 mb-2">Today&apos;s Stats</div>
            <div className="flex items-baseline gap-3">
              <span className="text-xl font-bold text-green-400">{status?.todaySent || 0}</span>
              <span className="text-xs text-gray-500">sent</span>
              <span className="text-xl font-bold text-yellow-400">{status?.todayPending || 0}</span>
              <span className="text-xs text-gray-500">pending</span>
            </div>
            <div className="flex items-baseline gap-3 mt-1">
              <span className="text-sm font-bold text-red-400">{status?.todayFailed || 0}</span>
              <span className="text-xs text-gray-500">failed</span>
              <span className="text-sm text-gray-500">/ {status?.todayTotal || 0} total</span>
            </div>
          </div>

          <div className="bg-gray-900 rounded-xl p-4 border border-gray-800">
            <div className="text-sm text-gray-400 mb-2">Last Sent</div>
            <div className="text-lg font-bold text-white">{toAST(status?.lastSent)}</div>
            <div className="text-xs text-gray-500">AST</div>
          </div>

          <div className="bg-gray-900 rounded-xl p-4 border border-gray-800">
            <div className="text-sm text-gray-400 mb-2">Models Active</div>
            <div className="text-2xl font-bold text-white">{status?.models?.length || 0}</div>
          </div>
        </div>

        {/* Schedule Timeline */}
        <div className="bg-gray-900 rounded-xl p-6 border border-gray-800 mb-6">
          <h2 className="text-lg font-bold text-white mb-4">📅 Schedule Timeline (AST)</h2>
          <div className="space-y-2">
            {windowStats.map(w => {
              const windowHour = getWindowHour(w.label)
              const normalizedCurrent = ((currentASTHour % 24) + 24) % 24
              const isCurrent = windowHour === normalizedCurrent
              const isPast = windowHour < normalizedCurrent
              const pct = w.total > 0 ? (w.sent / w.total) * 100 : 0
              const failPct = w.total > 0 ? (w.failed / w.total) * 100 : 0
              const pendingPct = w.total > 0 ? (w.pending / w.total) * 100 : 0

              return (
                <div key={w.label} className={`flex items-center gap-3 rounded-lg p-2 ${isCurrent ? 'bg-blue-900/30 border border-blue-700/50' : ''}`}>
                  <div className={`w-24 text-sm font-mono ${isCurrent ? 'text-blue-400 font-bold' : isPast ? 'text-gray-600' : 'text-gray-400'}`}>
                    {w.label}
                  </div>
                  <div className="flex-1 bg-gray-800 rounded-full h-4 overflow-hidden flex">
                    {w.sent > 0 && <div className="bg-green-500 h-full" style={{ width: `${pct}%` }} />}
                    {w.pending > 0 && <div className="bg-yellow-500 h-full" style={{ width: `${pendingPct}%` }} />}
                    {w.failed > 0 && <div className="bg-red-500 h-full" style={{ width: `${failPct}%` }} />}
                  </div>
                  <div className="w-20 text-right text-xs text-gray-500">
                    {w.total > 0 ? `${w.sent}/${w.total}` : '—'}
                  </div>
                </div>
              )
            })}
          </div>
          <div className="flex gap-6 mt-3 text-xs text-gray-500 justify-center">
            <span className="flex items-center gap-1"><span className="w-3 h-3 bg-green-500 rounded" /> Sent</span>
            <span className="flex items-center gap-1"><span className="w-3 h-3 bg-yellow-500 rounded" /> Pending</span>
            <span className="flex items-center gap-1"><span className="w-3 h-3 bg-red-500 rounded" /> Failed</span>
          </div>
        </div>

        <div className="grid md:grid-cols-2 gap-6">
          {/* Activity Feed */}
          <div className="bg-gray-900 rounded-xl p-6 border border-gray-800">
            <h2 className="text-lg font-bold text-white mb-4">📬 Today&apos;s Activity ({sentEntries.length})</h2>
            {sentEntries.length === 0 ? (
              <div className="text-gray-500 text-center py-8">No DMs sent yet today</div>
            ) : (
              <div className="space-y-1.5 max-h-96 overflow-y-auto">
                {sentEntries.map((e, i) => (
                  <div key={i} className="flex items-center justify-between bg-gray-800/50 rounded-lg px-3 py-2 text-sm">
                    <div className="flex items-center gap-2">
                      <span className={e.success ? 'text-green-400' : 'text-red-400'}>{e.success ? '✅' : '❌'}</span>
                      <span className="text-gray-400">@{e.promoter}</span>
                      <span className="text-gray-600">→</span>
                      <span className="text-white">@{e.target}</span>
                    </div>
                    <span className="text-gray-500 text-xs font-mono">{toASTShort(e.sentAt)}</span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Per-Model Schedule */}
          <div className="bg-gray-900 rounded-xl p-6 border border-gray-800">
            <h2 className="text-lg font-bold text-white mb-4">👩 Per-Model Schedule</h2>
            {Object.keys(scheduleData).length === 0 ? (
              <div className="text-gray-500 text-center py-8">No schedule data</div>
            ) : (
              <div className="space-y-1 max-h-96 overflow-y-auto">
                {Object.entries(scheduleData).map(([model, entries]) => {
                  const sent = entries.filter(e => e.status === 'sent').length
                  const failed = entries.filter(e => e.status === 'failed').length
                  const isExpanded = expandedModels.has(model)

                  return (
                    <div key={model} className="border border-gray-800 rounded-lg overflow-hidden">
                      <button
                        onClick={() => toggleModel(model)}
                        className="w-full flex items-center justify-between px-3 py-2 bg-gray-800/50 hover:bg-gray-800 text-left"
                      >
                        <span className="text-sm text-white font-medium">@{model}</span>
                        <div className="flex items-center gap-2">
                          <span className="text-xs text-green-400">{sent}✓</span>
                          {failed > 0 && <span className="text-xs text-red-400">{failed}✗</span>}
                          <span className="text-xs text-gray-500">{entries.length} total</span>
                          <span className="text-gray-600">{isExpanded ? '▲' : '▼'}</span>
                        </div>
                      </button>
                      {isExpanded && (
                        <div className="px-3 py-2 space-y-1 bg-gray-900/50">
                          {entries.map((e, j) => (
                            <div key={j} className="flex items-center justify-between text-xs">
                              <div className="flex items-center gap-2">
                                <span>
                                  {e.status === 'sent' ? '✅' : e.status === 'pending' ? '🕐' : e.status === 'failed' ? '❌' : '⬜'}
                                </span>
                                <span className="text-gray-300">@{e.target}</span>
                              </div>
                              <span className="text-gray-500 font-mono">{toASTShort(e.scheduledTime)}</span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        </div>
      </div>
    </main>
  )
}
