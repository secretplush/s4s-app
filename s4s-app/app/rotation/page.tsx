'use client'

import { useState, useEffect, useCallback } from 'react'
import Link from 'next/link'
import { useModels } from '@/lib/use-models'
import { getCurrentTimeAST } from '@/lib/rotation-engine'

// Railway backend proxy (avoids CORS)
const RAILWAY_PROXY = '/api/railway'

interface RailwayStats {
  isRunning: boolean
  stats: {
    totalTags: number
    totalDeletes: number
    startedAt: string | null
  }
  modelsActive: number
  pendingDeletes: number
  pinned?: {
    enabled: boolean
    activePosts: number
    activePosts_detail?: { postId: string; promoter: string; featured: string; accountId: string; createdAt: number }[]
    lastRun: string | null
    featuredGirls: string[]
    dayIndex: number
  }
  massDm?: {
    enabled: boolean
    todaySent: number
    todayPending: number
    todayTotal: number
    lastSent: string | null
    schedule: string
  }
}

export default function RotationPage() {
  const { models: CONNECTED_MODELS } = useModels()
  const [currentTimeAST, setCurrentTimeAST] = useState('')
  
  // Railway backend state
  const [railwayStats, setRailwayStats] = useState<RailwayStats | null>(null)
  const [railwayError, setRailwayError] = useState<string | null>(null)
  const [railwayLoading, setRailwayLoading] = useState(false)
  const [runnerLog, setRunnerLog] = useState<string[]>([])
  const [realActiveTags, setRealActiveTags] = useState<{promoter: string, target: string, postId: string, createdAt: string, deletesIn: number}[]>([])
  
  // Dashboard state
  const [lastUpdatedAt, setLastUpdatedAt] = useState<number>(Date.now())
  const [secondsSinceUpdate, setSecondsSinceUpdate] = useState(0)
  const [logExpanded, setLogExpanded] = useState(false)
  
  const addLog = useCallback((msg: string) => {
    const time = new Date().toLocaleTimeString('en-US', { timeZone: 'America/Puerto_Rico' })
    setRunnerLog(prev => [`[${time}] ${msg}`, ...prev.slice(0, 49)])
  }, [])
  
  // Update clock
  useEffect(() => {
    const updateTime = () => {
      const ast = getCurrentTimeAST()
      setCurrentTimeAST(ast.formatted)
    }
    updateTime()
    const interval = setInterval(updateTime, 1000)
    return () => clearInterval(interval)
  }, [])
  
  // Fetch Railway backend stats (via proxy)
  const fetchRailwayStats = useCallback(async () => {
    try {
      const [statsRes, activeRes, pinnedRes] = await Promise.all([
        fetch(`${RAILWAY_PROXY}?endpoint=stats`),
        fetch(`${RAILWAY_PROXY}?endpoint=active`),
        fetch(`${RAILWAY_PROXY}?endpoint=pinned`)
      ])
      const statsData = await statsRes.json()
      const activeData = await activeRes.json()
      const pinnedData = await pinnedRes.json()
      
      if (statsData.error) {
        setRailwayError(statsData.error)
      } else {
        if (pinnedData && !pinnedData.error) {
          statsData.pinned = {
            ...statsData.pinned,
            activePosts_detail: pinnedData.activePosts || []
          }
        }
        setRailwayStats(statsData)
        setRailwayError(null)
      }
      
      if (activeData.tags) {
        setRealActiveTags(activeData.tags)
      }
    } catch (error) {
      setRailwayError('Cannot reach Railway backend')
      console.error('Railway stats error:', error)
    }
  }, [])
  
  // Start rotation on Railway
  const startRotation = useCallback(async () => {
    setRailwayLoading(true)
    addLog('📅 Generating 24h schedule...')
    try {
      const scheduleRes = await fetch('/api/rotation/generate-schedule', { method: 'POST' })
      const scheduleData = await scheduleRes.json()
      
      if (!scheduleData.success) {
        addLog(`❌ Failed to generate schedule: ${scheduleData.error}`)
        setRailwayLoading(false)
        return
      }
      
      addLog(`✅ Schedule pushed: ${scheduleData.models} models, ${scheduleData.totalTags} tags`)
      
      addLog('▶️ Starting Railway rotation service...')
      const response = await fetch(`${RAILWAY_PROXY}?endpoint=start`, { method: 'POST' })
      const data = await response.json()
      if (data.success || data.message?.includes('started') || data.status === 'already running') {
        addLog('✅ Railway rotation STARTED - running 24/7 in cloud')
        addLog('🔄 Schedule auto-refreshes at midnight AST')
        await fetchRailwayStats()
      } else {
        addLog(`❌ Failed to start: ${data.error || data.message}`)
      }
    } catch (error) {
      addLog(`❌ Error starting Railway: ${error}`)
    } finally {
      setRailwayLoading(false)
    }
  }, [addLog, fetchRailwayStats])
  
  // Stop rotation on Railway
  const stopRotation = useCallback(async () => {
    setRailwayLoading(true)
    addLog('⏹️ Stopping Railway rotation service...')
    try {
      const response = await fetch(`${RAILWAY_PROXY}?endpoint=stop`, { method: 'POST' })
      const data = await response.json()
      if (data.success || data.message?.includes('stopped')) {
        addLog('⏹️ Railway rotation STOPPED')
        await fetchRailwayStats()
      } else {
        addLog(`❌ Failed to stop: ${data.error || data.message}`)
      }
    } catch (error) {
      addLog(`❌ Error stopping Railway: ${error}`)
    } finally {
      setRailwayLoading(false)
    }
  }, [addLog, fetchRailwayStats])
  
  // Poll Railway stats every 10 seconds
  useEffect(() => {
    fetchRailwayStats()
    const interval = setInterval(fetchRailwayStats, 10000)
    return () => clearInterval(interval)
  }, [fetchRailwayStats])
  
  // Track last updated timestamp
  useEffect(() => {
    if (railwayStats) setLastUpdatedAt(Date.now())
  }, [railwayStats])
  
  // Count seconds since last update
  useEffect(() => {
    const interval = setInterval(() => {
      setSecondsSinceUpdate(Math.floor((Date.now() - lastUpdatedAt) / 1000))
    }, 1000)
    return () => clearInterval(interval)
  }, [lastUpdatedAt])
  
  return (
    <main className="min-h-screen bg-gradient-to-br from-gray-900 via-purple-900 to-gray-900 p-8">
      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div>
            <Link href="/" className="text-purple-400 hover:text-purple-300 mb-2 inline-block">
              ← Back to Dashboard
            </Link>
            <h1 className="text-3xl font-bold text-white">Rotation Schedule</h1>
            <p className="text-gray-400">{CONNECTED_MODELS.length} models connected</p>
          </div>
          <div className="text-right flex items-center gap-4">
            <button
              onClick={railwayStats?.isRunning ? stopRotation : startRotation}
              disabled={railwayLoading}
              className={`px-6 py-3 rounded-lg font-bold text-lg transition-all ${
                railwayLoading 
                  ? 'bg-gray-600 text-gray-400 cursor-wait'
                  : railwayStats?.isRunning 
                    ? 'bg-red-600 hover:bg-red-700 text-white animate-pulse' 
                    : 'bg-green-600 hover:bg-green-700 text-white'
              }`}
            >
              {railwayLoading ? '⏳ Working...' : railwayStats?.isRunning ? '⏹️ Stop Rotation' : '▶️ Start Rotation'}
            </button>
            <div>
              <div className="text-3xl font-mono text-green-400">
                {currentTimeAST || '--:--:-- AST'}
              </div>
              <div className="text-gray-400 text-sm">Puerto Rico Time (AST)</div>
            </div>
          </div>
        </div>
        
        {/* Unified Live Operations Dashboard */}
        <div className="mb-6 bg-gray-800/70 rounded-xl border border-gray-700 overflow-hidden">
          {/* Dashboard Header */}
          <div className="flex items-center justify-between px-5 py-3 border-b border-gray-700/50">
            <h3 className="text-lg font-bold text-white flex items-center gap-2">
              ⚡ Live Operations Dashboard
            </h3>
            <div className="flex items-center gap-3 text-xs text-gray-500">
              {railwayError && <span className="text-red-400">⚠️ {railwayError}</span>}
              <span>Last updated: {secondsSinceUpdate}s ago</span>
              <span className="w-1.5 h-1.5 bg-green-500 rounded-full animate-pulse" />
            </div>
          </div>
          
          {/* 3-Column Dashboard */}
          <div className="grid grid-cols-1 md:grid-cols-3 divide-y md:divide-y-0 md:divide-x divide-gray-700/50">
            {/* Column 1: Ghost Tags */}
            <div className="p-5">
              <div className="flex items-center gap-2 mb-4">
                <span className="text-lg">👻</span>
                <span className="font-bold text-white">Ghost Tags</span>
                {railwayStats?.isRunning ? (
                  <span className="ml-auto flex items-center gap-1.5 text-xs text-green-400">
                    <span className="w-2 h-2 bg-green-500 rounded-full animate-pulse" />
                    Running
                  </span>
                ) : (
                  <span className="ml-auto flex items-center gap-1.5 text-xs text-red-400">
                    <span className="w-2 h-2 bg-red-500 rounded-full" />
                    Stopped
                  </span>
                )}
              </div>
              <div className="space-y-3">
                <div>
                  <div className="text-3xl font-bold text-purple-400">{railwayStats?.stats.totalTags ?? '—'}</div>
                  <div className="text-gray-500 text-xs">tags today</div>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div className="bg-gray-900/50 rounded-lg p-2 text-center">
                    <div className="text-lg font-bold text-green-400">{realActiveTags.length}</div>
                    <div className="text-gray-500 text-[10px]">active now</div>
                  </div>
                  <div className="bg-gray-900/50 rounded-lg p-2 text-center">
                    <div className="text-lg font-bold text-yellow-400">{railwayStats?.pendingDeletes ?? 0}</div>
                    <div className="text-gray-500 text-[10px]">pending deletes</div>
                  </div>
                </div>
                {railwayStats?.stats.startedAt && (
                  <div className="text-xs text-gray-600">
                    Started: {new Date(railwayStats.stats.startedAt).toLocaleTimeString('en-US', { timeZone: 'America/Puerto_Rico', hour: 'numeric', minute: '2-digit' })}
                  </div>
                )}
              </div>
            </div>

            {/* Column 2: Pinned Posts */}
            <div className="p-5">
              <div className="flex items-center gap-2 mb-4">
                <span className="text-lg">📌</span>
                <span className="font-bold text-white">Pinned Posts</span>
                {railwayStats?.pinned?.enabled ? (
                  <span className="ml-auto flex items-center gap-1.5 text-xs text-green-400">
                    <span className="w-2 h-2 bg-green-500 rounded-full animate-pulse" />
                    ON
                  </span>
                ) : (
                  <span className="ml-auto text-xs text-gray-500">OFF</span>
                )}
              </div>
              <div className="space-y-3">
                <div>
                  <div className="text-3xl font-bold text-yellow-400">{railwayStats?.pinned?.activePosts ?? '—'}</div>
                  <div className="text-gray-500 text-xs">active pins</div>
                </div>
                {railwayStats?.pinned?.featuredGirls && railwayStats.pinned.featuredGirls.length > 0 && (
                  <div>
                    <div className="text-gray-500 text-[10px] mb-1">Featured today:</div>
                    <div className="flex flex-wrap gap-1">
                      {railwayStats.pinned.featuredGirls.map(g => (
                        <span key={g} className="text-[10px] bg-yellow-900/40 text-yellow-300 px-1.5 py-0.5 rounded">@{g}</span>
                      ))}
                    </div>
                  </div>
                )}
                <div className="text-xs text-gray-500">
                  Day {railwayStats?.pinned?.dayIndex ?? '?'} of {Math.ceil(CONNECTED_MODELS.length / 5)} rotation
                </div>
                {railwayStats?.pinned?.lastRun && (
                  <div className="text-xs text-gray-600">
                    Last run: {new Date(railwayStats.pinned.lastRun).toLocaleTimeString('en-US', { timeZone: 'America/Puerto_Rico', hour: 'numeric', minute: '2-digit' })}
                  </div>
                )}
              </div>
            </div>

            {/* Column 3: Mass DMs */}
            <div className="p-5">
              <div className="flex items-center gap-2 mb-4">
                <span className="text-lg">📨</span>
                <span className="font-bold text-white">Mass DMs</span>
                {railwayStats?.massDm?.enabled ? (
                  <span className="ml-auto flex items-center gap-1.5 text-xs text-green-400">
                    <span className="w-2 h-2 bg-green-500 rounded-full animate-pulse" />
                    ON
                  </span>
                ) : (
                  <span className="ml-auto text-xs text-gray-500">OFF</span>
                )}
              </div>
              <div className="space-y-3">
                <div>
                  <div className="text-3xl font-bold text-cyan-400">
                    {railwayStats?.massDm ? `${railwayStats.massDm.todaySent}` : '—'}
                    {railwayStats?.massDm && <span className="text-lg text-gray-500"> / {railwayStats.massDm.todayTotal}</span>}
                  </div>
                  <div className="text-gray-500 text-xs">sent today</div>
                </div>
                {railwayStats?.massDm && railwayStats.massDm.todayTotal > 0 && (
                  <div>
                    <div className="w-full bg-gray-900/50 rounded-full h-2">
                      <div
                        className="bg-cyan-500 h-2 rounded-full transition-all"
                        style={{ width: `${Math.min(100, (railwayStats.massDm.todaySent / railwayStats.massDm.todayTotal) * 100)}%` }}
                      />
                    </div>
                    <div className="text-[10px] text-gray-500 mt-1">
                      {Math.round((railwayStats.massDm.todaySent / railwayStats.massDm.todayTotal) * 100)}% complete
                    </div>
                  </div>
                )}
                <div className="text-xs text-gray-500">
                  {railwayStats?.massDm ? `${railwayStats.massDm.todayPending} pending this window` : 'No data'}
                </div>
                {railwayStats?.massDm?.schedule && (
                  <div className="text-xs text-gray-600">{railwayStats.massDm.schedule}</div>
                )}
                {railwayStats?.massDm?.lastSent && (
                  <div className="text-xs text-gray-600">
                    Last sent: {new Date(railwayStats.massDm.lastSent).toLocaleTimeString('en-US', { timeZone: 'America/Puerto_Rico', hour: 'numeric', minute: '2-digit' })}
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Collapsible Terminal Log */}
          <div className="border-t border-gray-700/50">
            <button
              onClick={() => setLogExpanded(!logExpanded)}
              className="w-full flex items-center justify-between px-5 py-2 text-xs text-gray-500 hover:text-gray-400 transition-colors"
            >
              <span className="flex items-center gap-2">
                <code className="bg-gray-900 px-1 rounded">s4s-worker-production.up.railway.app</code>
                <span>• {runnerLog.length} log entries</span>
              </span>
              <span>{logExpanded ? '▼ Hide Log' : '▶ Show Log'}</span>
            </button>
            {logExpanded && (
              <div className="px-5 pb-4">
                <div className="bg-black/50 rounded-lg p-3 max-h-32 overflow-y-auto font-mono text-xs">
                  {runnerLog.length === 0 ? (
                    <div className="text-gray-500">
                      {railwayStats?.isRunning
                        ? '✅ Rotation running in cloud. Tags will execute according to schedule.'
                        : 'Click "Start Rotation" to begin 24/7 ghost tag automation.'}
                    </div>
                  ) : (
                    runnerLog.map((log, i) => (
                      <div key={i} className={`${
                        log.includes('✅') ? 'text-green-400' :
                        log.includes('❌') ? 'text-red-400' :
                        log.includes('⚠️') ? 'text-yellow-400' :
                        log.includes('🚀') ? 'text-blue-400' :
                        'text-gray-400'
                      }`}>{log}</div>
                    ))
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
        
        {/* Active Ghost Tags Feed (LIVE from Railway) */}
        <div className="bg-gray-800/50 rounded-xl p-6 border border-gray-700">
          <h2 className="text-xl font-bold text-white mb-4 flex items-center gap-2">
            <span className={`px-2 py-0.5 ${realActiveTags.length > 0 ? 'bg-green-600 animate-pulse' : 'bg-gray-600'} text-white text-xs rounded`}>
              {realActiveTags.length > 0 ? 'LIVE' : railwayStats?.isRunning ? 'WAITING' : 'STOPPED'}
            </span>
            👻 Active Ghost Tags ({realActiveTags.length})
          </h2>
          <p className="text-gray-400 text-xs mb-3">Real posts from Railway — auto-delete in 5 min</p>
          {realActiveTags.length > 0 ? (
            <div className="space-y-2 max-h-64 overflow-y-auto">
              {realActiveTags.map((tag) => {
                const time = new Date(tag.createdAt).toLocaleTimeString('en-US', { 
                  hour: 'numeric', 
                  minute: '2-digit',
                  hour12: true,
                  timeZone: 'America/Puerto_Rico'
                })
                return (
                  <div key={tag.postId} className="flex items-center justify-between bg-green-900/30 border border-green-700/50 rounded-lg p-3">
                    <div className="flex items-center gap-2">
                      <span className="text-gray-400">@{tag.promoter}</span>
                      <span className="text-green-500">→</span>
                      <span className="text-gray-200 font-medium">@{tag.target}</span>
                    </div>
                    <div className="text-right">
                      <div className="text-green-500/70 font-mono text-sm">{time}</div>
                      <div className="text-gray-500 text-xs">deletes in {Math.floor(tag.deletesIn / 60)}:{String(tag.deletesIn % 60).padStart(2, '0')}</div>
                    </div>
                  </div>
                )
              })}
            </div>
          ) : (
            <div className="text-gray-500 text-center py-4">
              {railwayStats?.isRunning ? 'Waiting for scheduled tags...' : 'Start rotation to see live tags'}
            </div>
          )}
        </div>
      </div>
    </main>
  )
}
