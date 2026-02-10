import { NextResponse } from 'next/server'
import { kv } from '@vercel/kv'

// Models data - must match CONNECTED_MODELS in lib/models-data.ts
const CONNECTED_MODELS = [
  { id: 'acct_ebca85077e0a4b7da04cf14176466411', username: 'milliexhart' },
  { id: 'acct_f05bf7874c974a5d875a1ef01c5bbc3b', username: 'zoepriceee' },
  { id: 'acct_9ee32f0bac4e4e8394a09f2c9fa2fbb7', username: 'novaleighh' },
  { id: 'acct_0653d6e6c3984bea8d3adc84cc616c7c', username: 'lucymonroee' },
  { id: 'acct_6bb6d77ac2c741ecb54d865237bb04f4', username: 'chloecookk' },
  { id: 'acct_bd6a75d6943141589cf5e43586653258', username: 'jackiesmithh' },
  { id: 'acct_749c75e13d7e4685813f2a2867ce614d', username: 'brookeewest' },
  { id: 'acct_b0b0698a614643c5932cfccd23f7c430', username: 'ayaaann' },
  { id: 'acct_b5e739f9f40a4da99b2f5ca559168012', username: 'chloeecavalli' },
  { id: 'acct_cfb853d0ba714aeaa9a89e3026ec6190', username: 'sadieeblake' },
  { id: 'acct_bde8d615937548f18c4e54b7cedf8c1d', username: 'lolasinclairr' },
  { id: 'acct_a50799a789a6422c8389d7d055fcbd1a', username: 'maddieharperr' },
  { id: 'acct_fbd172e2681f4dfbb6026ce806ecaa28', username: 'zoeemonroe' },
  { id: 'acct_54e3119e77da4429b6537f7dd2883a05', username: 'biancaawoods' },
  { id: 'acct_2648cedf59644b0993ade9608bd868a1', username: 'aviannaarose' },
]

const HOUR_WEIGHTS: Record<number, number> = {
  0: 4, 1: 9, 2: 6, 3: 3, 4: 8, 5: 4, 6: 4, 7: 7, 8: 3, 9: 3,
  10: 8, 11: 5, 12: 5, 13: 6, 14: 6, 15: 3, 16: 6, 17: 3, 18: 3,
  19: 4, 20: 3, 21: 4, 22: 3, 23: 3,
}

interface ScheduleItem {
  target: string
  scheduledTime: number
  executed: boolean
}

/**
 * Generate a 24h Railway-compatible schedule
 * Returns: { modelUsername: [{ target, scheduledTime, executed }, ...], ... }
 */
function generateRailwaySchedule(): Record<string, ScheduleItem[]> {
  const models = CONNECTED_MODELS
  const n = models.length
  const schedule: Record<string, ScheduleItem[]> = {}
  
  const MAX_OUTBOUND_PER_MODEL = 56
  const targetsPerModel = n - 1
  const TAGS_PER_PAIR = Math.max(1, Math.floor(MAX_OUTBOUND_PER_MODEL / targetsPerModel))
  const tagsPerModel = targetsPerModel * TAGS_PER_PAIR
  
  const now = Date.now()
  const dayOfYear = Math.floor((now - new Date(new Date().getFullYear(), 0, 0).getTime()) / (1000 * 60 * 60 * 24))
  
  // Seeded random for consistent daily variation
  const seededRandom = (seed: number) => {
    const x = Math.sin(seed) * 10000
    return x - Math.floor(x)
  }
  
  for (let promoterIdx = 0; promoterIdx < n; promoterIdx++) {
    const promoter = models[promoterIdx]
    schedule[promoter.username] = []
    
    // Spacing: 24 hours / 56 tags ≈ 25.7 minutes
    const baseSpacingMs = (24 * 60 * 60 * 1000) / tagsPerModel
    
    // Stagger start times so models don't all start at once
    // First tag starts 1-5 minutes from now + model offset
    const startOffset = (1 + Math.random() * 4) * 60 * 1000
    const modelOffset = (promoterIdx * 2 * 60 * 1000) // 2 min stagger per model
    
    for (let tagIdx = 0; tagIdx < tagsPerModel; tagIdx++) {
      // Rotate through targets
      const targetOffset = tagIdx % (n - 1)
      let targetIdx = (promoterIdx + targetOffset + 1) % n
      if (targetIdx === promoterIdx) targetIdx = (targetIdx + 1) % n
      
      const target = models[targetIdx]
      
      // Base time for this tag
      let scheduledTime = now + startOffset + modelOffset + (tagIdx * baseSpacingMs)
      
      // Add jitter (-3 to +3 minutes) for natural feel
      const jitterMs = (seededRandom(dayOfYear * 1000 + promoterIdx * 100 + tagIdx) - 0.5) * 6 * 60 * 1000
      scheduledTime += jitterMs
      
      // Hour weighting: check if this falls in a low-weight hour
      const hour = new Date(scheduledTime).getHours()
      const weight = HOUR_WEIGHTS[hour] || 5
      
      // If low weight hour, shift slightly
      if (weight <= 2) {
        // Push to next higher-weight hour
        const shifts = [1, 2, -1, -2]
        for (const shift of shifts) {
          const newHour = (hour + shift + 24) % 24
          if (HOUR_WEIGHTS[newHour] > 3) {
            scheduledTime += shift * 60 * 60 * 1000
            break
          }
        }
      }
      
      schedule[promoter.username].push({
        target: target.username,
        scheduledTime,
        executed: false,
      })
    }
    
    // Sort by time
    schedule[promoter.username].sort((a, b) => a.scheduledTime - b.scheduledTime)
  }
  
  return schedule
}

export async function GET() {
  const schedule = generateRailwaySchedule()
  
  const totalTags = Object.values(schedule).reduce((sum, s) => sum + s.length, 0)
  const models = Object.keys(schedule).length
  
  // Preview: first 3 tags per model
  const preview: Record<string, { target: string; inMinutes: number }[]> = {}
  const now = Date.now()
  for (const [model, slots] of Object.entries(schedule)) {
    preview[model] = slots.slice(0, 3).map(s => ({
      target: s.target,
      inMinutes: Math.round((s.scheduledTime - now) / 60000)
    }))
  }
  
  return NextResponse.json({
    models,
    totalTags,
    tagsPerModel: Math.round(totalTags / models),
    preview,
  })
}

export async function POST() {
  const RAILWAY_URL = process.env.RAILWAY_URL || 'https://s4s-worker-production.up.railway.app'
  
  try {
    // Generate fresh 24h schedule
    const schedule = generateRailwaySchedule()
    
    const totalTags = Object.values(schedule).reduce((sum, s) => sum + s.length, 0)
    const models = Object.keys(schedule).length
    
    console.log(`📅 Generated schedule: ${models} models, ${totalTags} total tags`)
    
    // Push to Railway
    const response = await fetch(`${RAILWAY_URL}/schedule`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ schedule })
    })
    
    if (!response.ok) {
      const err = await response.text()
      return NextResponse.json({ 
        success: false, 
        error: `Railway rejected schedule: ${err}` 
      }, { status: 500 })
    }
    
    const data = await response.json()
    
    // Store last generation time for tracking
    await kv.set('s4s:last-schedule-generation', {
      timestamp: Date.now(),
      models,
      totalTags,
    })
    
    return NextResponse.json({
      success: true,
      models,
      totalTags,
      message: `Schedule pushed to Railway: ${models} models, ${totalTags} tags`,
      railway: data
    })
  } catch (error) {
    console.error('Schedule generation error:', error)
    return NextResponse.json({ 
      success: false, 
      error: `Failed to generate/push schedule: ${error}` 
    }, { status: 500 })
  }
}
