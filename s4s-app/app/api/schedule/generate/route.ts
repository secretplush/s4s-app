import { NextResponse } from 'next/server'
import { kv } from '@vercel/kv'

const HOUR_WEIGHTS: Record<number, number> = {
  0: 4, 1: 9, 2: 6, 3: 3, 4: 8, 5: 4, 6: 4, 7: 7,
  8: 3, 9: 3, 10: 8, 11: 5, 12: 5, 13: 6, 14: 6, 15: 3,
  16: 6, 17: 3, 18: 3, 19: 4, 20: 3, 21: 4, 22: 3, 23: 3
}

interface ScheduleSlot {
  timestamp: number // Unix timestamp (ms)
  promoterUsername: string
  promoterId: string
  targetUsername: string
  targetId: string
  vaultId: string
  executed: boolean
  postId?: string
  deleteAt?: number
}

function generateDaySchedule(
  dayOffset: number,
  models: { id: string; username: string }[],
  vaultMappings: Record<string, Record<string, string>>
): ScheduleSlot[] {
  const n = models.length
  if (n < 2) return []
  
  const slots: ScheduleSlot[] = []
  const baseDate = new Date()
  baseDate.setHours(0, 0, 0, 0)
  baseDate.setDate(baseDate.getDate() + dayOffset)
  
  const MAX_OUTBOUND_PER_MODEL = 56
  const targetsPerModel = n - 1
  const TAGS_PER_PAIR = Math.max(1, Math.floor(MAX_OUTBOUND_PER_MODEL / targetsPerModel))
  const tagsPerModel = targetsPerModel * TAGS_PER_PAIR
  
  // Build hour distribution
  const totalWeight = Object.values(HOUR_WEIGHTS).reduce((a, b) => a + b, 0)
  const hoursPool: number[] = []
  for (let h = 0; h < 24; h++) {
    const count = Math.round((HOUR_WEIGHTS[h] / totalWeight) * tagsPerModel * n)
    for (let i = 0; i < count; i++) hoursPool.push(h)
  }
  
  // Shuffle
  for (let i = hoursPool.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [hoursPool[i], hoursPool[j]] = [hoursPool[j], hoursPool[i]]
  }
  
  let poolIdx = 0
  
  for (let promoterIdx = 0; promoterIdx < n; promoterIdx++) {
    const promoter = models[promoterIdx]
    const promoterMappings = vaultMappings[promoter.username] || {}
    
    for (let tagIdx = 0; tagIdx < tagsPerModel && poolIdx < hoursPool.length; tagIdx++) {
      const targetIdx = (promoterIdx + (tagIdx % (n - 1)) + 1) % n
      if (targetIdx === promoterIdx) continue
      
      const target = models[targetIdx]
      const vaultId = promoterMappings[target.username]
      
      if (!vaultId) continue // Skip if no vault mapping
      
      const hour = hoursPool[poolIdx++]
      const minute = Math.floor(Math.random() * 60)
      
      const timestamp = baseDate.getTime() + hour * 60 * 60 * 1000 + minute * 60 * 1000
      
      slots.push({
        timestamp,
        promoterUsername: promoter.username,
        promoterId: promoter.id,
        targetUsername: target.username,
        targetId: target.id,
        vaultId,
        executed: false
      })
    }
  }
  
  return slots.sort((a, b) => a.timestamp - b.timestamp)
}

export async function POST(request: Request) {
  try {
    const body = await request.json()
    const { days = 14 } = body
    
    // Load models and vault mappings from KV
    const models = await kv.get<{ id: string; username: string }[]>('models')
    const vaultMappings = await kv.get<Record<string, Record<string, string>>>('vault_mappings')
    
    if (!models || models.length < 2) {
      return NextResponse.json({ 
        error: 'Need at least 2 models synced. Run vault sync first.'
      }, { status: 400 })
    }
    
    if (!vaultMappings || Object.keys(vaultMappings).length === 0) {
      return NextResponse.json({ 
        error: 'No vault mappings found. Run vault sync first.'
      }, { status: 400 })
    }
    
    // Generate schedule for each day
    const allSlots: ScheduleSlot[] = []
    for (let day = 0; day < days; day++) {
      const daySlots = generateDaySchedule(day, models, vaultMappings)
      allSlots.push(...daySlots)
    }
    
    // Save to KV
    await kv.set('schedule', allSlots)
    await kv.set('schedule_generated_at', new Date().toISOString())
    await kv.set('schedule_days', days)
    await kv.set('rotation_active', false) // Start paused
    
    return NextResponse.json({
      success: true,
      totalSlots: allSlots.length,
      days,
      avgPerDay: Math.round(allSlots.length / days),
      startsAt: new Date(allSlots[0]?.timestamp).toISOString(),
      endsAt: new Date(allSlots[allSlots.length - 1]?.timestamp).toISOString(),
      message: `Generated ${allSlots.length} ghost tags over ${days} days`
    })
    
  } catch (error) {
    console.error('Generate schedule error:', error)
    return NextResponse.json({ 
      error: 'Failed to generate schedule',
      details: String(error)
    }, { status: 500 })
  }
}

export async function GET() {
  try {
    const schedule = await kv.get<ScheduleSlot[]>('schedule') || []
    const generatedAt = await kv.get('schedule_generated_at')
    const days = await kv.get('schedule_days')
    const active = await kv.get('rotation_active')
    
    const now = Date.now()
    const upcoming = schedule.filter(s => !s.executed && s.timestamp > now).slice(0, 20)
    const executed = schedule.filter(s => s.executed).length
    const pending = schedule.filter(s => !s.executed && s.timestamp <= now).length
    
    return NextResponse.json({
      success: true,
      totalSlots: schedule.length,
      executed,
      pending,
      remaining: schedule.length - executed,
      generatedAt,
      days,
      active,
      upcoming: upcoming.map(s => ({
        ...s,
        scheduledFor: new Date(s.timestamp).toISOString()
      }))
    })
  } catch (error) {
    return NextResponse.json({ 
      error: 'Failed to get schedule',
      details: String(error)
    }, { status: 500 })
  }
}
