'use client'

import { useState, useEffect, useCallback } from 'react'
import Link from 'next/link'
import { loadCachedModels } from '@/lib/models-data'
import { loadImages } from '@/lib/indexed-db'

interface Status {
  active: boolean
  lastTick: string | null
  scheduleGeneratedAt: string | null
  totalSlots: number
  executed: number
  remaining: number
  pendingDeletions: number
  recentActivity: any[]
}

export default function ControlPanel() {
  const [status, setStatus] = useState<Status | null>(null)
  const [syncing, setSyncing] = useState(false)
  const [generating, setGenerating] = useState(false)
  const [syncResult, setSyncResult] = useState<string | null>(null)
  const [scheduleResult, setScheduleResult] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  
  const fetchStatus = useCallback(async () => {
    try {
      const res = await fetch('/api/rotation/control')
      const data = await res.json()
      setStatus(data)
    } catch (e) {
      console.error('Failed to fetch status:', e)
    } finally {
      setLoading(false)
    }
  }, [])
  
  useEffect(() => {
    fetchStatus()
    const interval = setInterval(fetchStatus, 10000) // Refresh every 10s
    return () => clearInterval(interval)
  }, [fetchStatus])
  
  const syncVaultMappings = async () => {
    setSyncing(true)
    setSyncResult(null)
    
    try {
      // Build vault mappings from IndexedDB
      // Structure: { promoterUsername: { targetUsername: vaultId } }
      const mappings: Record<string, Record<string, string>> = {}
      const models: { id: string; username: string }[] = []
      
      const MODELS = loadCachedModels()
      for (const model of MODELS) {
        models.push({ id: model.id, username: model.username })
        
        // Load images for this model (as target - they uploaded promos of themselves)
        const images = await loadImages(model.username)
        
        for (const img of images) {
          if (!img.isActive || !img.vaultIds) continue
          
          // For each vault ID, the key is the PROMOTER (where the image was distributed to)
          for (const [promoterUsername, vaultId] of Object.entries(img.vaultIds)) {
            if (!mappings[promoterUsername]) {
              mappings[promoterUsername] = {}
            }
            // This promoter has a vault ID to tag this target
            mappings[promoterUsername][model.username] = vaultId
          }
        }
      }
      
      // Send to server
      const res = await fetch('/api/sync/vault-mappings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mappings, models })
      })
      
      const data = await res.json()
      
      if (data.success) {
        setSyncResult(`✅ Synced ${data.modelCount} models with ${data.totalVaultIds} vault mappings`)
      } else {
        setSyncResult(`❌ ${data.error}`)
      }
    } catch (e) {
      setSyncResult(`❌ Error: ${e}`)
    } finally {
      setSyncing(false)
    }
  }
  
  const generateSchedule = async (days: number = 14) => {
    setGenerating(true)
    setScheduleResult(null)
    
    try {
      const res = await fetch('/api/schedule/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ days })
      })
      
      const data = await res.json()
      
      if (data.success) {
        setScheduleResult(`✅ Generated ${data.totalSlots} tags over ${data.days} days (~${data.avgPerDay}/day)`)
        fetchStatus()
      } else {
        setScheduleResult(`❌ ${data.error}`)
      }
    } catch (e) {
      setScheduleResult(`❌ Error: ${e}`)
    } finally {
      setGenerating(false)
    }
  }
  
  const controlRotation = async (action: 'start' | 'stop' | 'reset') => {
    try {
      const res = await fetch('/api/rotation/control', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action })
      })
      
      await res.json()
      fetchStatus()
    } catch (e) {
      console.error('Control error:', e)
    }
  }
  
  const triggerTick = async () => {
    try {
      const res = await fetch('/api/cron/tick')
      const data = await res.json()
      console.log('Manual tick result:', data)
      fetchStatus()
    } catch (e) {
      console.error('Tick error:', e)
    }
  }
  
  if (loading) {
    return (
      <main className="min-h-screen bg-gradient-to-br from-gray-900 via-purple-900 to-gray-900 p-8 flex items-center justify-center">
        <div className="text-white text-xl">Loading...</div>
      </main>
    )
  }
  
  return (
    <main className="min-h-screen bg-gradient-to-br from-gray-900 via-purple-900 to-gray-900 p-8">
      <div className="max-w-4xl mx-auto">
        <div className="flex items-center justify-between mb-8">
          <div>
            <Link href="/" className="text-purple-400 hover:text-purple-300 mb-2 inline-block">
              ← Back to Dashboard
            </Link>
            <h1 className="text-3xl font-bold text-white">🎛️ Rotation Control Panel</h1>
            <p className="text-gray-400">Set it and forget it — runs autonomously</p>
          </div>
          <div className={`px-4 py-2 rounded-full text-lg font-bold ${
            status?.active ? 'bg-green-600 text-white animate-pulse' : 'bg-gray-600 text-gray-300'
          }`}>
            {status?.active ? '🟢 RUNNING' : '⏸️ PAUSED'}
          </div>
        </div>
        
        {/* Status Cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
          <div className="bg-gray-800/50 rounded-lg p-4 border border-gray-700">
            <div className="text-2xl font-bold text-white">{status?.totalSlots || 0}</div>
            <div className="text-gray-400 text-sm">Total Scheduled</div>
          </div>
          <div className="bg-gray-800/50 rounded-lg p-4 border border-gray-700">
            <div className="text-2xl font-bold text-green-400">{status?.executed || 0}</div>
            <div className="text-gray-400 text-sm">Executed</div>
          </div>
          <div className="bg-gray-800/50 rounded-lg p-4 border border-gray-700">
            <div className="text-2xl font-bold text-yellow-400">{status?.remaining || 0}</div>
            <div className="text-gray-400 text-sm">Remaining</div>
          </div>
          <div className="bg-gray-800/50 rounded-lg p-4 border border-gray-700">
            <div className="text-2xl font-bold text-purple-400">{status?.pendingDeletions || 0}</div>
            <div className="text-gray-400 text-sm">Pending Deletes</div>
          </div>
        </div>
        
        {/* Setup Steps */}
        <div className="bg-gray-800/50 rounded-xl p-6 border border-gray-700 mb-6">
          <h2 className="text-xl font-bold text-white mb-4">📋 Setup Steps</h2>
          
          {/* Step 1: Sync */}
          <div className="mb-6">
            <div className="flex items-center justify-between mb-2">
              <div>
                <h3 className="text-lg font-medium text-white">1. Sync Vault Mappings</h3>
                <p className="text-gray-400 text-sm">Push your local vault IDs to the server</p>
              </div>
              <button
                onClick={syncVaultMappings}
                disabled={syncing}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium disabled:opacity-50"
              >
                {syncing ? '⏳ Syncing...' : '📤 Sync Now'}
              </button>
            </div>
            {syncResult && (
              <div className={`p-3 rounded-lg text-sm ${
                syncResult.includes('✅') ? 'bg-green-900/30 text-green-400' : 'bg-red-900/30 text-red-400'
              }`}>
                {syncResult}
              </div>
            )}
          </div>
          
          {/* Step 2: Generate Schedule */}
          <div className="mb-6">
            <div className="flex items-center justify-between mb-2">
              <div>
                <h3 className="text-lg font-medium text-white">2. Generate 14-Day Schedule</h3>
                <p className="text-gray-400 text-sm">Create the rotation plan</p>
              </div>
              <button
                onClick={() => generateSchedule(14)}
                disabled={generating}
                className="px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded-lg font-medium disabled:opacity-50"
              >
                {generating ? '⏳ Generating...' : '📅 Generate'}
              </button>
            </div>
            {scheduleResult && (
              <div className={`p-3 rounded-lg text-sm ${
                scheduleResult.includes('✅') ? 'bg-green-900/30 text-green-400' : 'bg-red-900/30 text-red-400'
              }`}>
                {scheduleResult}
              </div>
            )}
            {status?.scheduleGeneratedAt && (
              <div className="text-gray-500 text-xs mt-1">
                Last generated: {new Date(status.scheduleGeneratedAt).toLocaleString()}
              </div>
            )}
          </div>
          
          {/* Step 3: Start Rotation */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <div>
                <h3 className="text-lg font-medium text-white">3. Start Rotation</h3>
                <p className="text-gray-400 text-sm">Begin autonomous posting</p>
              </div>
              <div className="flex gap-2">
                {!status?.active ? (
                  <button
                    onClick={() => controlRotation('start')}
                    disabled={!status?.totalSlots}
                    className="px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg font-medium disabled:opacity-50"
                  >
                    ▶️ Start
                  </button>
                ) : (
                  <button
                    onClick={() => controlRotation('stop')}
                    className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg font-medium"
                  >
                    ⏹️ Stop
                  </button>
                )}
                <button
                  onClick={triggerTick}
                  className="px-4 py-2 bg-gray-600 hover:bg-gray-700 text-white rounded-lg font-medium"
                  title="Manually trigger one tick"
                >
                  🔄 Manual Tick
                </button>
              </div>
            </div>
            {status?.lastTick && (
              <div className="text-gray-500 text-xs">
                Last tick: {new Date(status.lastTick).toLocaleString()}
              </div>
            )}
          </div>
        </div>
        
        {/* Cron Setup Instructions */}
        <div className="bg-yellow-900/20 border border-yellow-700/50 rounded-xl p-6 mb-6">
          <h3 className="text-lg font-bold text-yellow-400 mb-2">⚠️ External Cron Required</h3>
          <p className="text-gray-300 mb-3">
            For true "set and forget", set up a free cron service to ping this URL every minute:
          </p>
          <code className="block bg-black/50 p-3 rounded text-green-400 text-sm mb-3 break-all">
            GET https://s4s-app.vercel.app/api/cron/tick
          </code>
          <p className="text-gray-400 text-sm">
            Recommended: <a href="https://cron-job.org" target="_blank" className="text-blue-400 hover:underline">cron-job.org</a> (free) 
            or <a href="https://easycron.com" target="_blank" className="text-blue-400 hover:underline">EasyCron</a>
          </p>
        </div>
        
        {/* Recent Activity */}
        {status?.recentActivity && status.recentActivity.length > 0 && (
          <div className="bg-gray-800/50 rounded-xl p-6 border border-gray-700">
            <h2 className="text-xl font-bold text-white mb-4">📊 Recent Activity</h2>
            <div className="space-y-2 max-h-64 overflow-y-auto">
              {status.recentActivity.map((activity, i) => (
                <div key={i} className="bg-gray-700/30 rounded-lg p-3 text-sm">
                  <div className="flex justify-between text-gray-400">
                    <span>{new Date(activity.timestamp).toLocaleString()}</span>
                    <span>
                      ✅ {activity.tagsExecuted} tags | 🗑️ {activity.postsDeleted} deleted
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
        
        {/* Reset Button */}
        <div className="mt-6 text-center">
          <button
            onClick={() => {
              if (confirm('Reset all schedule data? This cannot be undone.')) {
                controlRotation('reset')
              }
            }}
            className="text-red-400 hover:text-red-300 text-sm"
          >
            🗑️ Reset All Schedule Data
          </button>
        </div>
      </div>
    </main>
  )
}
