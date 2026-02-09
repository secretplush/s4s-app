import { NextResponse } from 'next/server'
import { kv } from '@vercel/kv'

export async function GET() {
  try {
    const active = await kv.get('rotation_active') || false
    const lastTick = await kv.get('last_tick')
    const scheduleGeneratedAt = await kv.get('schedule_generated_at')
    const pendingDeletions = await kv.get<any[]>('pending_deletions') || []
    const schedule = await kv.get<any[]>('schedule') || []
    const recentActivity = await kv.get<any[]>('recent_activity') || []
    
    const executed = schedule.filter((s: any) => s.executed).length
    const remaining = schedule.filter((s: any) => !s.executed).length
    
    return NextResponse.json({
      active,
      lastTick,
      scheduleGeneratedAt,
      totalSlots: schedule.length,
      executed,
      remaining,
      pendingDeletions: pendingDeletions.length,
      recentActivity: recentActivity.slice(0, 10)
    })
  } catch (error) {
    return NextResponse.json({ 
      error: 'Failed to get status',
      details: String(error)
    }, { status: 500 })
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json()
    const { action } = body
    
    if (action === 'start') {
      // Check if schedule exists
      const schedule = await kv.get<any[]>('schedule') || []
      if (schedule.length === 0) {
        return NextResponse.json({ 
          error: 'No schedule found. Generate a schedule first.'
        }, { status: 400 })
      }
      
      await kv.set('rotation_active', true)
      await kv.set('rotation_started_at', new Date().toISOString())
      
      return NextResponse.json({
        success: true,
        active: true,
        message: 'Rotation started! Make sure external cron is hitting /api/cron/tick every minute.'
      })
    }
    
    if (action === 'stop') {
      await kv.set('rotation_active', false)
      await kv.set('rotation_stopped_at', new Date().toISOString())
      
      return NextResponse.json({
        success: true,
        active: false,
        message: 'Rotation stopped.'
      })
    }
    
    if (action === 'reset') {
      await kv.set('rotation_active', false)
      await kv.set('schedule', [])
      await kv.set('pending_deletions', [])
      await kv.set('recent_activity', [])
      
      return NextResponse.json({
        success: true,
        message: 'Schedule and state reset. Generate a new schedule to continue.'
      })
    }
    
    return NextResponse.json({ 
      error: 'Invalid action',
      validActions: ['start', 'stop', 'reset']
    }, { status: 400 })
    
  } catch (error) {
    return NextResponse.json({ 
      error: 'Failed to control rotation',
      details: String(error)
    }, { status: 500 })
  }
}
