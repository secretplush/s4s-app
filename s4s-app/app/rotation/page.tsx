'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { CONNECTED_MODELS } from '@/lib/models-data'
import { 
  calculateGhostSchedule, 
  getRotationStats, 
  calculateDailyPinnedAssignments,
  type ScheduleSlot 
} from '@/lib/rotation-engine'

export default function RotationPage() {
  const [schedule, setSchedule] = useState<ScheduleSlot[]>([])
  const [stats, setStats] = useState<ReturnType<typeof getRotationStats> | null>(null)
  const [currentMinute, setCurrentMinute] = useState(new Date().getMinutes())
  const [pinnedAssignments, setPinnedAssignments] = useState<{ promoter: any; target: any }[]>([])
  
  useEffect(() => {
    const models = CONNECTED_MODELS.map(m => ({
      id: m.id,
      username: m.username,
      displayName: m.displayName
    }))
    
    setSchedule(calculateGhostSchedule(models))
    setStats(getRotationStats(models.length))
    setPinnedAssignments(calculateDailyPinnedAssignments(models))
    
    // Update current minute every second
    const interval = setInterval(() => {
      setCurrentMinute(new Date().getMinutes())
    }, 1000)
    
    return () => clearInterval(interval)
  }, [])
  
  const currentSlots = schedule.filter(s => s.minuteOffset === currentMinute)
  const nextSlots = schedule.filter(s => s.minuteOffset === (currentMinute + 1) % 60)
  
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
          <div className="text-right">
            <div className="text-4xl font-mono text-green-400">
              :{String(currentMinute).padStart(2, '0')}
            </div>
            <div className="text-gray-400 text-sm">Current Minute</div>
          </div>
        </div>
        
        {/* Stats Cards */}
        {stats && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
            <div className="bg-gray-800/50 rounded-lg p-4 border border-gray-700">
              <div className="text-3xl font-bold text-white">{stats.modelCount}</div>
              <div className="text-gray-400 text-sm">Models in Network</div>
            </div>
            <div className="bg-gray-800/50 rounded-lg p-4 border border-gray-700">
              <div className="text-3xl font-bold text-purple-400">{stats.intervalMinutes} min</div>
              <div className="text-gray-400 text-sm">Between Tags</div>
            </div>
            <div className="bg-gray-800/50 rounded-lg p-4 border border-gray-700">
              <div className="text-3xl font-bold text-green-400">{stats.postsPerHour}</div>
              <div className="text-gray-400 text-sm">Posts/Hour</div>
            </div>
            <div className="bg-gray-800/50 rounded-lg p-4 border border-gray-700">
              <div className="text-3xl font-bold text-yellow-400">~{stats.totalConcurrentPosts}</div>
              <div className="text-gray-400 text-sm">Active Ghost Tags</div>
            </div>
          </div>
        )}
        
        <div className="grid md:grid-cols-2 gap-8">
          {/* Ghost Tags - Current */}
          <div className="bg-gray-800/50 rounded-xl p-6 border border-gray-700">
            <h2 className="text-xl font-bold text-white mb-4 flex items-center gap-2">
              <span className="w-3 h-3 bg-green-500 rounded-full animate-pulse"></span>
              Firing Now (Minute :{String(currentMinute).padStart(2, '0')})
            </h2>
            {currentSlots.length > 0 ? (
              <div className="space-y-2">
                {currentSlots.map((slot, i) => (
                  <div key={i} className="flex items-center justify-between bg-gray-700/50 rounded-lg p-3">
                    <div className="flex items-center gap-2">
                      <span className="text-gray-400">@{slot.promoterUsername}</span>
                      <span className="text-purple-400">→</span>
                      <span className="text-white font-medium">@{slot.targetUsername}</span>
                    </div>
                    <span className="text-gray-500 font-mono text-sm">
                      :{String(slot.secondOffset).padStart(2, '0')}
                    </span>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-gray-500 text-center py-4">No tags this minute</div>
            )}
            
            <h3 className="text-lg font-medium text-gray-300 mt-6 mb-3">
              Next (Minute :{String((currentMinute + 1) % 60).padStart(2, '0')})
            </h3>
            {nextSlots.length > 0 ? (
              <div className="space-y-2 opacity-60">
                {nextSlots.slice(0, 5).map((slot, i) => (
                  <div key={i} className="flex items-center justify-between bg-gray-700/30 rounded-lg p-2 text-sm">
                    <div className="flex items-center gap-2">
                      <span className="text-gray-400">@{slot.promoterUsername}</span>
                      <span className="text-purple-400">→</span>
                      <span className="text-gray-300">@{slot.targetUsername}</span>
                    </div>
                  </div>
                ))}
                {nextSlots.length > 5 && (
                  <div className="text-gray-500 text-sm text-center">
                    +{nextSlots.length - 5} more
                  </div>
                )}
              </div>
            ) : (
              <div className="text-gray-500 text-center py-2 text-sm">None queued</div>
            )}
          </div>
          
          {/* 24hr Pinned Posts */}
          <div className="bg-gray-800/50 rounded-xl p-6 border border-gray-700">
            <h2 className="text-xl font-bold text-white mb-4 flex items-center gap-2">
              📌 Today's Pinned Posts
            </h2>
            <p className="text-gray-400 text-sm mb-4">
              Each model pins promos for {Math.ceil(14/5)} other models. Full rotation every 5 days.
            </p>
            <div className="space-y-2 max-h-96 overflow-y-auto">
              {pinnedAssignments.map((a, i) => (
                <div key={i} className="flex items-center justify-between bg-gray-700/50 rounded-lg p-3">
                  <div className="flex items-center gap-2">
                    <span className="text-gray-400">@{a.promoter.username}</span>
                    <span className="text-yellow-400">📌</span>
                    <span className="text-white font-medium">@{a.target.username}</span>
                  </div>
                  <span className="text-xs text-gray-500">24hr</span>
                </div>
              ))}
            </div>
          </div>
        </div>
        
        {/* Full Schedule */}
        <div className="mt-8 bg-gray-800/50 rounded-xl p-6 border border-gray-700">
          <h2 className="text-xl font-bold text-white mb-4">Full Hour Schedule ({schedule.length} tags)</h2>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2 max-h-96 overflow-y-auto text-sm">
            {schedule.map((slot, i) => (
              <div 
                key={i} 
                className={`flex items-center justify-between rounded p-2 ${
                  slot.minuteOffset === currentMinute 
                    ? 'bg-green-900/50 border border-green-500' 
                    : 'bg-gray-700/30'
                }`}
              >
                <span className="font-mono text-gray-400">
                  {String(slot.minuteOffset).padStart(2, '0')}:{String(slot.secondOffset).padStart(2, '0')}
                </span>
                <span className="text-gray-300 truncate ml-2">
                  {slot.promoterUsername.slice(0, 8)}→{slot.targetUsername.slice(0, 8)}
                </span>
              </div>
            ))}
          </div>
        </div>
        
        {/* How It Works */}
        <div className="mt-8 bg-gray-800/50 rounded-xl p-6 border border-gray-700">
          <h2 className="text-xl font-bold text-white mb-4">How It Works (Competitor's Method)</h2>
          <div className="grid md:grid-cols-2 gap-6 text-gray-300">
            <div>
              <h3 className="font-medium text-purple-400 mb-2">Ghost Tags (24/7)</h3>
              <ul className="space-y-1 text-sm">
                <li>• Each model posts a tag every {stats?.intervalMinutes} minutes</li>
                <li>• Post includes promo image + @mention caption</li>
                <li>• Post auto-deletes after 5 minutes</li>
                <li>• Cycle repeats every hour (same targets, same order)</li>
                <li>• Result: constant visibility without feed clutter</li>
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
