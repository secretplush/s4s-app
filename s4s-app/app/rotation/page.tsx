'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import Link from 'next/link'
import { useModels } from '@/lib/use-models'
import { 
  calculateDailyGhostSchedule,
  getRotationStats, 
  calculateDailyPinnedAssignments,
  getCurrentTimeAST,
  HOUR_WEIGHTS,
  type ScheduleSlot 
} from '@/lib/rotation-engine'
import { loadImages, type PromoImage } from '@/lib/indexed-db'
import { getRandomCaption } from '@/lib/ghost-captions'

// Railway backend proxy (avoids CORS)
const RAILWAY_PROXY = '/api/railway'

interface ExecutedTag {
  promoter: string
  target: string
  postId: string
  createdAt: number
  deleteAt: number
  status: 'active' | 'deleted' | 'error'
}

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
}

export default function RotationPage() {
  const { models: CONNECTED_MODELS } = useModels()
  const [schedule, setSchedule] = useState<ScheduleSlot[]>([])
  const [stats, setStats] = useState<ReturnType<typeof getRotationStats> | null>(null)
  const [currentHour, setCurrentHour] = useState(0)
  const [currentMinute, setCurrentMinute] = useState(0)
  const [currentTimeAST, setCurrentTimeAST] = useState('')
  const [pinnedAssignments, setPinnedAssignments] = useState<{ promoter: any; target: any }[]>([])
  
  // Railway backend state (24/7 cloud runner)
  const [railwayStats, setRailwayStats] = useState<RailwayStats | null>(null)
  const [railwayError, setRailwayError] = useState<string | null>(null)
  const [railwayLoading, setRailwayLoading] = useState(false)
  const [runnerLog, setRunnerLog] = useState<string[]>([])
  const [realActiveTags, setRealActiveTags] = useState<{promoter: string, target: string, postId: string, createdAt: string, deletesIn: number}[]>([])
  
  // Legacy local state (for test tags only now)
  const [executedTags, setExecutedTags] = useState<ExecutedTag[]>([])
  
  // Test tag state
  const [testPromoter, setTestPromoter] = useState('')
  const [testTarget, setTestTarget] = useState('')
  const [testVaultId, setTestVaultId] = useState<string | null>(null)
  const [testLoading, setTestLoading] = useState(false)
  const [testResult, setTestResult] = useState<string | null>(null)
  
  const addLog = useCallback((msg: string) => {
    const time = new Date().toLocaleTimeString('en-US', { timeZone: 'America/Puerto_Rico' })
    setRunnerLog(prev => [`[${time}] ${msg}`, ...prev.slice(0, 49)])
  }, [])
  
  // Look up vault ID when test promoter/target change
  // The vault ID is stored in TARGET's images, keyed by PROMOTER
  // (because target distributed their promo image TO promoter's vault)
  const lookupVaultId = useCallback(async (promoterUsername: string, targetUsername: string) => {
    if (!promoterUsername || !targetUsername) {
      setTestVaultId(null)
      return
    }
    // Load TARGET's images - they distributed to promoter's vault
    const images = await loadImages(targetUsername)
    const activeImage = images.find(img => img.isActive && img.vaultIds?.[promoterUsername])
    setTestVaultId(activeImage?.vaultIds?.[promoterUsername] || null)
  }, [])
  
  // Execute test tag using vault ID from target's distributed images
  const executeTestTag = useCallback(async () => {
    if (!testPromoter || !testTarget || !testVaultId) return
    
    const promoter = CONNECTED_MODELS.find(m => m.username === testPromoter)
    const target = CONNECTED_MODELS.find(m => m.username === testTarget)
    if (!promoter || !target) return
    
    setTestLoading(true)
    setTestResult('⏳ Creating post...')
    
    const caption = getRandomCaption(target.username)
    
    try {
      const response = await fetch('/api/rotation/execute-tag', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          promoterUsername: promoter.username,
          targetUsername: target.username,
          vaultId: testVaultId,
          caption,
          account: promoter.id
        })
      })
      
      const data = await response.json()
      
      if (data.success) {
        setTestResult(`✅ SUCCESS! Post ID: ${data.postId}\nCaption: "${caption}"\nUsing vault ID: ${testVaultId}\n⏳ Auto-deleting in 5 minutes...`)
        addLog(`🧪 TEST: ${promoter.username} → @${target.username} = ${data.postId}`)
        
        // Schedule deletion after 5 minutes
        setTimeout(async () => {
          addLog(`🗑️ Deleting test post ${data.postId}...`)
          try {
            const delResponse = await fetch('/api/rotation/delete-post', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ postId: data.postId, account: promoter.id })
            })
            const delData = await delResponse.json()
            if (delData.success) {
              addLog(`✅ Test post deleted: ${data.postId}`)
              setTestResult(prev => prev + '\n✅ Post deleted!')
            } else {
              addLog(`❌ Delete failed: ${delData.error}`)
            }
          } catch (e) {
            addLog(`❌ Delete error: ${e}`)
          }
        }, 5 * 60 * 1000) // 5 minutes
      } else {
        setTestResult(`❌ FAILED: ${data.error}\n${JSON.stringify(data.details || '')}`)
      }
    } catch (error) {
      setTestResult(`❌ ERROR: ${error}`)
    } finally {
      setTestLoading(false)
    }
  }, [testPromoter, testTarget, testVaultId, addLog])
  
  // Update vault ID lookup when test selections change
  useEffect(() => {
    if (testPromoter && testTarget) {
      // Pass username, not ID - vault IDs are keyed by username
      lookupVaultId(testPromoter, testTarget)
    } else {
      setTestVaultId(null)
    }
  }, [testPromoter, testTarget, lookupVaultId])
  
  useEffect(() => {
    const models = CONNECTED_MODELS.map(m => ({
      id: m.id,
      username: m.username,
      displayName: m.displayName
    }))
    
    setSchedule(calculateDailyGhostSchedule(models))
    setStats(getRotationStats(models.length))
    setPinnedAssignments(calculateDailyPinnedAssignments(models))
    
    // Update current time every second (AST)
    const updateTime = () => {
      const ast = getCurrentTimeAST()
      setCurrentHour(ast.hours)
      setCurrentMinute(ast.minutes)
      setCurrentTimeAST(ast.formatted)
    }
    updateTime()
    const interval = setInterval(updateTime, 1000)
    
    return () => clearInterval(interval)
  }, [])
  
  // Execute a single ghost tag
  const executeTag = useCallback(async (slot: ScheduleSlot) => {
    const promoter = CONNECTED_MODELS.find(m => m.username === slot.promoterUsername)
    const target = CONNECTED_MODELS.find(m => m.username === slot.targetUsername)
    
    if (!promoter || !target) {
      addLog(`❌ Model not found: ${slot.promoterUsername} or ${slot.targetUsername}`)
      return
    }
    
    // Load images for promoter from IndexedDB
    const images = await loadImages(promoter.username)
    // Vault IDs are keyed by USERNAME, not account ID
    const activeImage = images.find(img => img.isActive && img.vaultIds?.[target.username])
    
    if (!activeImage) {
      addLog(`⚠️ No vault ID for ${promoter.username} → ${target.username}`)
      return
    }
    
    const vaultId = activeImage.vaultIds[target.username]
    const caption = getRandomCaption(target.username)
    
    addLog(`🚀 Posting: ${promoter.username} → @${target.username}`)
    
    try {
      const response = await fetch('/api/rotation/execute-tag', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          promoterUsername: promoter.username,
          targetUsername: target.username,
          vaultId,
          caption,
          account: promoter.id
        })
      })
      
      const data = await response.json()
      
      if (data.success) {
        addLog(`✅ Posted! ID: ${data.postId} (delete in 5 min)`)
        setExecutedTags(prev => [...prev, {
          promoter: promoter.username,
          target: target.username,
          postId: data.postId,
          createdAt: Date.now(),
          deleteAt: data.deleteAt,
          status: 'active'
        }])
        
        // Schedule deletion
        setTimeout(async () => {
          addLog(`🗑️ Deleting ghost tag ${data.postId}...`)
          try {
            await fetch('/api/rotation/delete-post', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ postId: data.postId, account: promoter.id })
            })
            addLog(`✅ Deleted ${data.postId}`)
            setExecutedTags(prev => prev.map(t => 
              t.postId === data.postId ? { ...t, status: 'deleted' } : t
            ))
          } catch (e) {
            addLog(`❌ Delete failed: ${e}`)
          }
        }, 5 * 60 * 1000)
      } else {
        addLog(`❌ Failed: ${data.error}`)
      }
    } catch (error) {
      addLog(`❌ Error: ${error}`)
    }
  }, [addLog])
  
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
        // Merge pinned detail into stats
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
  
  // Start rotation on Railway (24/7 cloud) via proxy
  // 1. Generate fresh 24h schedule
  // 2. Push schedule to Railway
  // 3. Start Railway runner
  const startRotation = useCallback(async () => {
    setRailwayLoading(true)
    addLog('📅 Generating 24h schedule...')
    try {
      // Step 1: Generate and push schedule
      const scheduleRes = await fetch('/api/rotation/generate-schedule', { method: 'POST' })
      const scheduleData = await scheduleRes.json()
      
      if (!scheduleData.success) {
        addLog(`❌ Failed to generate schedule: ${scheduleData.error}`)
        setRailwayLoading(false)
        return
      }
      
      addLog(`✅ Schedule pushed: ${scheduleData.models} models, ${scheduleData.totalTags} tags`)
      
      // Step 2: Start Railway runner
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
  
  // Stop rotation on Railway via proxy
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
    fetchRailwayStats() // Initial fetch
    const interval = setInterval(fetchRailwayStats, 10000)
    return () => clearInterval(interval)
  }, [fetchRailwayStats])
  
  // Ghost tags only live ~5 minutes, so "active" = posted in last 5 min
  const currentTimeMinutes = currentHour * 60 + currentMinute
  const activeSlots = schedule.filter(s => {
    const slotTime = (s.hourOffset || 0) * 60 + s.minuteOffset
    // Active = posted within last 5 minutes (still visible before deletion)
    return slotTime <= currentTimeMinutes && slotTime > currentTimeMinutes - 5
  })
  const upcomingSlots = schedule.filter(s => {
    const slotTime = (s.hourOffset || 0) * 60 + s.minuteOffset
    return slotTime > currentTimeMinutes && slotTime < currentTimeMinutes + 30 // next 30 min
  }).slice(0, 10)
  
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
            <p className="text-gray-400">Mirrors competitor's exact S4S method</p>
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
        
        {/* Railway Backend Status Panel */}
        <div className="mb-6 bg-gray-800/70 rounded-xl p-4 border border-gray-700">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-lg font-bold text-white flex items-center gap-2">
              {railwayStats?.isRunning && <span className="w-3 h-3 bg-green-500 rounded-full animate-pulse" />}
              {!railwayStats?.isRunning && <span className="w-3 h-3 bg-gray-500 rounded-full" />}
              Railway Backend (24/7 Cloud)
            </h3>
            <div className="text-sm text-gray-400">
              {railwayError ? (
                <span className="text-red-400">⚠️ {railwayError}</span>
              ) : railwayStats ? (
                <>
                  Status: <span className={railwayStats.isRunning ? 'text-green-400' : 'text-yellow-400'}>
                    {railwayStats.isRunning ? '🟢 Running' : '🟡 Stopped'}
                  </span> • 
                  Total tags: {railwayStats.stats.totalTags} • 
                  Pending deletes: {railwayStats.pendingDeletes}
                  {railwayStats.stats.startedAt && (
                    <> • Started: {new Date(railwayStats.stats.startedAt).toLocaleTimeString()}</>
                  )}
                </>
              ) : (
                <span className="text-gray-500">Connecting...</span>
              )}
            </div>
          </div>
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
          <div className="mt-2 text-xs text-gray-500">
            Backend: <code className="bg-gray-900 px-1 rounded">s4s-worker-production.up.railway.app</code>
          </div>
        </div>
        
        {/* Test Single Tag */}
        <div className="mb-6 bg-gray-800/50 rounded-xl p-4 border border-yellow-700/30">
          <h3 className="text-lg font-bold text-yellow-400 mb-3">🧪 Test Single Tag</h3>
          <p className="text-gray-400 text-sm mb-4">Verify vault IDs work before running full rotation</p>
          
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4 items-end">
            <div>
              <label className="text-gray-400 text-sm block mb-1">Promoter (who posts)</label>
              <select 
                value={testPromoter}
                onChange={(e) => setTestPromoter(e.target.value)}
                className="w-full bg-gray-700 text-white rounded px-3 py-2"
              >
                <option value="">Select promoter...</option>
                {CONNECTED_MODELS.map(m => (
                  <option key={m.id} value={m.username}>@{m.username}</option>
                ))}
              </select>
            </div>
            
            <div>
              <label className="text-gray-400 text-sm block mb-1">Target (who gets tagged)</label>
              <select 
                value={testTarget}
                onChange={(e) => setTestTarget(e.target.value)}
                className="w-full bg-gray-700 text-white rounded px-3 py-2"
              >
                <option value="">Select target...</option>
                {CONNECTED_MODELS.filter(m => m.username !== testPromoter).map(m => (
                  <option key={m.id} value={m.username}>@{m.username}</option>
                ))}
              </select>
            </div>
            
            <div>
              <label className="text-gray-400 text-sm block mb-1">Vault ID</label>
              <div className={`px-3 py-2 rounded font-mono text-sm ${
                testVaultId ? 'bg-green-900/30 text-green-400' : 'bg-red-900/30 text-red-400'
              }`}>
                {testVaultId || (testPromoter && testTarget ? '❌ No vault ID found' : '...')}
              </div>
            </div>
            
            <button
              onClick={executeTestTag}
              disabled={!testVaultId || testLoading}
              className={`px-4 py-2 rounded font-bold transition-all ${
                testVaultId && !testLoading
                  ? 'bg-yellow-600 hover:bg-yellow-700 text-white'
                  : 'bg-gray-600 text-gray-400 cursor-not-allowed'
              }`}
            >
              {testLoading ? '⏳ Posting...' : '🚀 Test Post'}
            </button>
          </div>
          
          {testResult && (
            <pre className={`mt-4 p-3 rounded text-sm whitespace-pre-wrap ${
              testResult.includes('SUCCESS') ? 'bg-green-900/30 text-green-400' : 'bg-red-900/30 text-red-400'
            }`}>
              {testResult}
            </pre>
          )}
        </div>
        
        {/* Stats Cards */}
        {stats && (
          <>
            {/* Primary Stats - Outbound/Inbound at top */}
            <div className="grid grid-cols-2 gap-4 mb-4">
              <div className="bg-gradient-to-r from-purple-900/50 to-purple-800/30 rounded-xl p-6 border border-purple-500/30">
                <div className="text-4xl font-bold text-purple-400">~{stats.tagsPerModelPerDay}</div>
                <div className="text-gray-300 font-medium">Outbound Ghost Tags / Model Page / Day</div>
                <div className="text-gray-500 text-sm mt-1">Posts made ON each model's page</div>
              </div>
              <div className="bg-gradient-to-r from-cyan-900/50 to-cyan-800/30 rounded-xl p-6 border border-cyan-500/30">
                <div className="text-4xl font-bold text-cyan-400">~{stats.tagsPerModelPerDay}</div>
                <div className="text-gray-300 font-medium">Inbound Ghost Tags / Model / Day</div>
                <div className="text-gray-500 text-sm mt-1">Tags received by each model (varies daily)</div>
              </div>
            </div>
            
            {/* Secondary Stats */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
              <div className="bg-gray-800/50 rounded-lg p-4 border border-gray-700">
                <div className="text-2xl font-bold text-white">{stats.modelCount}</div>
                <div className="text-gray-400 text-sm">Models in Network</div>
              </div>
              <div className="bg-gray-800/50 rounded-lg p-4 border border-gray-700">
                <div className="text-2xl font-bold text-gray-300">{stats.avgIntervalFormatted}</div>
                <div className="text-gray-400 text-sm">Avg Between Posts</div>
              </div>
              <div className="bg-gray-800/50 rounded-lg p-4 border border-gray-700">
                <div className="text-2xl font-bold text-green-400">{stats.totalTagsPerDay}</div>
                <div className="text-gray-400 text-sm">Total Tags/Day (Agency)</div>
              </div>
              <div className="bg-gray-800/50 rounded-lg p-4 border border-gray-700">
                <div className="text-2xl font-bold text-gray-300">{stats.tagsPerPair || 4}x</div>
                <div className="text-gray-400 text-sm">Tags Per Pair/Day</div>
              </div>
            </div>
            {/* Hour Distribution Chart - Agency Wide (from actual schedule) */}
            {(() => {
              // Count actual scheduled slots per hour
              const hourCounts: Record<number, number> = {}
              for (let h = 0; h < 24; h++) hourCounts[h] = 0
              schedule.forEach(s => {
                const h = s.hourOffset || 0
                hourCounts[h] = (hourCounts[h] || 0) + 1
              })
              const maxCount = Math.max(...Object.values(hourCounts), 1)
              
              return (
                <div className="bg-gray-800/50 rounded-xl p-6 border border-gray-700 mb-8">
                  <h3 className="text-lg font-bold text-white mb-1">📊 Agency Tag Distribution by Hour</h3>
                  <p className="text-gray-400 text-sm mb-4">
                    {schedule.length} total tags/day across {stats.modelCount} models • 
                    Based on actual schedule
                  </p>
                  <div className="flex items-end gap-2 h-48 px-2">
                    {Array.from({ length: 24 }, (_, h) => {
                      const tagCount = hourCounts[h] || 0
                      const isPeak = [1, 4, 10].includes(h)
                      const isLow = [18, 20].includes(h)
                      const isCurrent = h === currentHour
                      const heightPercent = maxCount > 0 ? (tagCount / maxCount) * 100 : 0
                      return (
                        <div key={h} className="flex-1 flex flex-col items-center group">
                          {/* Tooltip */}
                          <div className="relative mb-1 opacity-0 group-hover:opacity-100 transition-opacity">
                            <div className="absolute bottom-0 left-1/2 -translate-x-1/2 bg-gray-900 px-2 py-1 rounded text-xs text-white whitespace-nowrap z-20">
                              {tagCount} tags
                            </div>
                          </div>
                          {/* Bar container */}
                          <div className="w-full h-36 flex items-end">
                            <div 
                              className={`w-full rounded-t-sm transition-all ${
                                isCurrent ? 'bg-yellow-500 shadow-lg shadow-yellow-500/30' : 
                                isPeak ? 'bg-purple-500' : 
                                isLow ? 'bg-orange-500/50' : 'bg-gray-500'
                              }`}
                              style={{ height: `${Math.max(heightPercent, 3)}%` }}
                            />
                          </div>
                          {/* Hour label */}
                          <div className={`text-xs mt-2 ${isCurrent ? 'text-yellow-400 font-bold' : 'text-gray-500'}`}>
                            {h === 0 ? '12a' : h === 12 ? '12p' : h > 12 ? `${h-12}p` : `${h}a`}
                          </div>
                        </div>
                      )
                    })}
                  </div>
                  <div className="flex gap-6 mt-4 text-sm justify-center">
                    <span className="flex items-center gap-2"><span className="w-4 h-4 bg-purple-500 rounded"></span> Peak hours</span>
                    <span className="flex items-center gap-2"><span className="w-4 h-4 bg-orange-500/50 rounded"></span> Low activity</span>
                    <span className="flex items-center gap-2"><span className="w-4 h-4 bg-yellow-500 rounded"></span> Current hour</span>
                  </div>
                </div>
              )
            })()}
          </>
        )}
        
        {/* Preview Mode Banner */}
        <div className="bg-yellow-900/30 border border-yellow-600/50 rounded-xl p-4 mb-6">
          <div className="flex items-center gap-3">
            <span className="text-2xl">⚠️</span>
            <div>
              <div className="text-yellow-400 font-medium">Preview Mode — Automation Not Running</div>
              <div className="text-yellow-200/70 text-sm">This shows the PLANNED schedule. No posts are being made until you start the rotation.</div>
            </div>
          </div>
        </div>
        
        <div className="grid md:grid-cols-2 gap-8">
          {/* Ghost Tags - Active Now (REAL from Railway) */}
          <div className="bg-gray-800/50 rounded-xl p-6 border border-gray-700">
            <h2 className="text-xl font-bold text-white mb-4 flex items-center gap-2">
              <span className={`px-2 py-0.5 ${realActiveTags.length > 0 ? 'bg-green-600 animate-pulse' : 'bg-gray-600'} text-white text-xs rounded`}>
                {realActiveTags.length > 0 ? 'LIVE' : railwayStats?.isRunning ? 'WAITING' : 'STOPPED'}
              </span>
              👻 Active Ghost Tags ({realActiveTags.length})
            </h2>
            <p className="text-gray-400 text-xs mb-3">Real posts from Railway — auto-delete in 5 min</p>
            {realActiveTags.length > 0 ? (
              <div className="space-y-2 max-h-48 overflow-y-auto">
                {realActiveTags.map((tag, i) => {
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
            
            <h3 className="text-lg font-medium text-gray-300 mt-6 mb-3">
              ⏳ Coming Up (Next 30 min)
            </h3>
            {upcomingSlots.length > 0 ? (
              <div className="space-y-2 opacity-80">
                {upcomingSlots.map((slot, i) => {
                  const h = slot.hourOffset || 0
                  const formatTime = `${h === 0 ? 12 : h > 12 ? h - 12 : h}:${String(slot.minuteOffset).padStart(2, '0')} ${h >= 12 ? 'PM' : 'AM'}`
                  return (
                    <div key={i} className="flex items-center justify-between bg-gray-700/30 rounded-lg p-2 text-sm">
                      <div className="flex items-center gap-2">
                        <span className="text-gray-400">@{slot.promoterUsername}</span>
                        <span className="text-purple-400">→</span>
                        <span className="text-gray-300">@{slot.targetUsername}</span>
                      </div>
                      <span className="text-gray-500 font-mono text-xs">{formatTime}</span>
                    </div>
                  )
                })}
              </div>
            ) : (
              <div className="text-gray-500 text-center py-2 text-sm">None in next 30 min</div>
            )}
          </div>
          
          {/* 24hr Pinned Posts - Live from Railway */}
          <div className="bg-gray-800/50 rounded-xl p-6 border border-gray-700">
            <h2 className="text-xl font-bold text-white mb-4 flex items-center gap-2">
              📌 Today&apos;s Pinned Posts
            </h2>
            <p className="text-gray-400 text-sm mb-4">
              5 featured girls × 6 accounts each • Rotates daily • New accounts each cycle • Full rotation every {Math.ceil(CONNECTED_MODELS.length / 5)} days
            </p>
            {railwayStats?.pinned ? (
              <>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
                  <div className="bg-gray-700/30 rounded-lg p-3 text-center">
                    <div className="text-xl font-bold text-yellow-400">{railwayStats.pinned!.activePosts || 0}</div>
                    <div className="text-gray-400 text-xs">Active Pins</div>
                  </div>
                  <div className="bg-gray-700/30 rounded-lg p-3 text-center">
                    <div className="text-xl font-bold text-white">5 × 6</div>
                    <div className="text-gray-400 text-xs">Girls × Accounts</div>
                  </div>
                  <div className="bg-gray-700/30 rounded-lg p-3 text-center">
                    <div className="text-xl font-bold text-green-400">{railwayStats.pinned!.enabled ? 'ON' : 'OFF'}</div>
                    <div className="text-gray-400 text-xs">Auto-Pin</div>
                  </div>
                  <div className="bg-gray-700/30 rounded-lg p-3 text-center">
                    <div className="text-xl font-bold text-purple-400">Day {railwayStats.pinned!.dayIndex || 0}</div>
                    <div className="text-gray-400 text-xs">of {Math.ceil(CONNECTED_MODELS.length / 5)}</div>
                  </div>
                </div>
                {(railwayStats.pinned!.featuredGirls || []).length > 0 && (
                  <div className="space-y-3 max-h-96 overflow-y-auto">
                    {railwayStats.pinned!.featuredGirls.map((girl: string) => {
                      const pins = (railwayStats.pinned!.activePosts_detail || []).filter((p: any) => p.featured === girl);
                      return (
                        <div key={girl} className="bg-gray-700/30 rounded-lg p-3">
                          <div className="flex items-center gap-2 mb-2">
                            <span className="text-yellow-400 text-lg">📌</span>
                            <span className="text-white font-bold">@{girl}</span>
                            <span className="text-gray-500 text-xs">({pins.length} pins)</span>
                          </div>
                          <div className="flex flex-wrap gap-1 ml-7">
                            {pins.map((p: any, j: number) => (
                              <span key={j} className="text-xs bg-gray-600/50 text-gray-300 px-2 py-0.5 rounded">
                                @{p.promoter}
                              </span>
                            ))}
                            {pins.length === 0 && (
                              <span className="text-xs text-gray-500 italic">Loading pin details...</span>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </>
            ) : (
              <div className="text-gray-500 text-sm">Loading pinned post data from Railway...</div>
            )}
            <div className="mt-4 pt-4 border-t border-gray-700 text-sm text-gray-400">
              <strong>Schedule:</strong> Posts at 6:00 AM AST daily • Staggered over ~8 min • Auto-expires after 24hr • Different accounts each cycle
            </div>
          </div>
        </div>
        
        {/* Full Daily Schedule */}
        <div className="mt-8 bg-gray-800/50 rounded-xl p-6 border border-gray-700">
          <div className="flex items-center gap-3 mb-4">
            <h2 className="text-xl font-bold text-white">👻 Full Day Ghost Tag Schedule ({schedule.length} tags)</h2>
            <span className="px-2 py-0.5 bg-gray-600 text-gray-300 text-xs rounded">PREVIEW</span>
          </div>
          <p className="text-gray-400 text-sm mb-4">All times in AST • Weighted toward peak hours (1AM, 4AM, 10AM) • Each post expires 5 min after posting</p>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2 max-h-96 overflow-y-auto text-sm">
            {schedule.map((slot, i) => {
              const h = slot.hourOffset || 0
              const slotTimeMin = h * 60 + slot.minuteOffset
              const nowMin = currentHour * 60 + currentMinute
              // Past = more than 5 min ago, Active = within last 5 min, Future = hasn't happened
              const isPast = slotTimeMin < nowMin - 5
              const isActive = slotTimeMin <= nowMin && slotTimeMin > nowMin - 5
              const formatTime = `${h === 0 ? 12 : h > 12 ? h - 12 : h}:${String(slot.minuteOffset).padStart(2, '0')} ${h >= 12 ? 'PM' : 'AM'}`
              return (
                <div 
                  key={i} 
                  className={`flex items-center justify-between rounded p-2 ${
                    isActive 
                      ? 'bg-green-900/30 border border-green-600/50' 
                      : isPast
                        ? 'bg-gray-800/30 opacity-40'
                        : 'bg-gray-700/30'
                  }`}
                >
                  <span className={`font-mono text-xs ${
                    isActive ? 'text-green-400' : isPast ? 'text-gray-600' : 'text-gray-500'
                  }`}>
                    {formatTime}
                  </span>
                  <span className={`truncate ml-2 ${isPast ? 'text-gray-600' : 'text-gray-400'}`}>
                    {slot.promoterUsername.slice(0, 8)}→{slot.targetUsername.slice(0, 8)}
                  </span>
                </div>
              )
            })}
          </div>
        </div>
        
        {/* How It Works */}
        <div className="mt-8 bg-gray-800/50 rounded-xl p-6 border border-gray-700">
          <h2 className="text-xl font-bold text-white mb-4">How It Works (Competitor-Matched)</h2>
          <div className="grid md:grid-cols-2 gap-6 text-gray-300">
            <div>
              <h3 className="font-medium text-purple-400 mb-2">Ghost Tags (Daily Rotation)</h3>
              <ul className="space-y-1 text-sm">
                <li>• Each model tags each other model once/day</li>
                <li>• {stats?.tagsPerModelPerDay} tags per model per day (~{stats?.avgIntervalFormatted} apart)</li>
                <li>• Weighted toward peak hours: 1 AM, 4 AM, 10 AM AST</li>
                <li>• Dead zones: 6-8 PM AST (minimal activity)</li>
                <li>• Post auto-deletes after 5 minutes</li>
                <li>• Result: matches competitor's proven pattern</li>
              </ul>
            </div>
            <div>
              <h3 className="font-medium text-yellow-400 mb-2">Pinned 24hr Posts (Daily)</h3>
              <ul className="space-y-1 text-sm">
                <li>• Posted at 6am daily</li>
                <li>• Pinned to top of profile</li>
                <li>• Uses expireDays: 1 for auto-removal</li>
                <li>• Rotates targets so everyone gets promoted</li>
                <li>• Result: profile visitors see promos</li>
              </ul>
            </div>
          </div>
        </div>
      </div>
    </main>
  )
}
