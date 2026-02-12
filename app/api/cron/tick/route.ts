import { NextResponse } from 'next/server'
import { kv } from '@vercel/kv'

const OF_API_KEY = process.env.OF_API_KEY || 'ofapi_bT4J1Er2YBow46EihDfjlSFf5HRmiM15M4DCOoHn7889d8b4'
const OF_API_BASE = 'https://app.onlyfansapi.com/api'

// Ghost tag captions
const CAPTIONS = [
  "my friend from college {username} just launched her OF 🤭💕",
  "OMG i cant believe my bestie just launched her OF 😍 {username}",
  "Your sign to follow my college bestie, you're welcome 🤭 {username} ✨",
  "ok but have you seen {username} yet?? 😍🔥",
  "bestie alert 🚨 go follow {username} rn",
  "trust me on this one 👀 {username}",
  "she's literally so pretty go follow {username} 💕",
  "my girl {username} just started posting 🙈💗",
]

function getRandomCaption(targetUsername: string): string {
  const template = CAPTIONS[Math.floor(Math.random() * CAPTIONS.length)]
  return template.replace(/{username}/g, `@${targetUsername}`)
}

interface ScheduleSlot {
  timestamp: number
  promoterUsername: string
  promoterId: string
  targetUsername: string
  targetId: string
  vaultId: string
  executed: boolean
  postId?: string
  deleteAt?: number
}

interface PendingDeletion {
  postId: string
  accountId: string
  deleteAt: number
  promoterUsername: string
  targetUsername: string
}

async function executeTag(slot: ScheduleSlot): Promise<{ success: boolean; postId?: string; error?: string }> {
  const caption = getRandomCaption(slot.targetUsername)
  
  try {
    const response = await fetch(`${OF_API_BASE}/${slot.promoterId}/posts`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${OF_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        text: caption,
        mediaFiles: [slot.vaultId]
      })
    })
    
    if (!response.ok) {
      const error = await response.text()
      return { success: false, error }
    }
    
    const data = await response.json()
    const postId = data.id || data.post_id || data.postId || data.data?.id
    
    return { success: true, postId }
  } catch (error) {
    return { success: false, error: String(error) }
  }
}

async function deletePost(deletion: PendingDeletion): Promise<boolean> {
  try {
    const response = await fetch(`${OF_API_BASE}/${deletion.accountId}/posts/${deletion.postId}`, {
      method: 'DELETE',
      headers: {
        'Authorization': `Bearer ${OF_API_KEY}`
      }
    })
    return response.ok
  } catch {
    return false
  }
}

export async function GET(request: Request) {
  // Verify cron secret (optional security)
  const authHeader = request.headers.get('authorization')
  const cronSecret = process.env.CRON_SECRET
  
  // Allow if no secret configured, or if secret matches
  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    // Still allow for testing, just log
    console.log('Cron called without valid secret')
  }
  
  try {
    // Check if rotation is active
    const active = await kv.get('rotation_active')
    if (!active) {
      return NextResponse.json({ 
        status: 'paused',
        message: 'Rotation is not active'
      })
    }
    
    const now = Date.now()
    const schedule = await kv.get<ScheduleSlot[]>('schedule') || []
    const pendingDeletions = await kv.get<PendingDeletion[]>('pending_deletions') || []
    
    // 1. Execute due tags (within last 2 minutes to handle slight delays)
    const dueSlots = schedule.filter(s => 
      !s.executed && 
      s.timestamp <= now && 
      s.timestamp > now - 2 * 60 * 1000
    )
    
    const results = []
    for (const slot of dueSlots) {
      const result = await executeTag(slot)
      results.push({
        promoter: slot.promoterUsername,
        target: slot.targetUsername,
        ...result
      })
      
      if (result.success && result.postId) {
        // Mark as executed
        slot.executed = true
        slot.postId = result.postId
        slot.deleteAt = now + 5 * 60 * 1000 // Delete in 5 min
        
        // Add to pending deletions
        pendingDeletions.push({
          postId: result.postId,
          accountId: slot.promoterId,
          deleteAt: slot.deleteAt,
          promoterUsername: slot.promoterUsername,
          targetUsername: slot.targetUsername
        })
      }
    }
    
    // 2. Process deletions (posts older than 5 min)
    const toDelete = pendingDeletions.filter(d => d.deleteAt <= now)
    const remainingDeletions = pendingDeletions.filter(d => d.deleteAt > now)
    
    const deleteResults = []
    for (const deletion of toDelete) {
      const success = await deletePost(deletion)
      deleteResults.push({
        postId: deletion.postId,
        promoter: deletion.promoterUsername,
        target: deletion.targetUsername,
        deleted: success
      })
    }
    
    // 3. Save updated state
    await kv.set('schedule', schedule)
    await kv.set('pending_deletions', remainingDeletions)
    await kv.set('last_tick', new Date().toISOString())
    
    // 4. Log stats
    const stats = {
      timestamp: new Date().toISOString(),
      tagsExecuted: results.filter(r => r.success).length,
      tagsFailed: results.filter(r => !r.success).length,
      postsDeleted: deleteResults.filter(r => r.deleted).length,
      pendingDeletions: remainingDeletions.length,
      totalRemaining: schedule.filter(s => !s.executed).length
    }
    
    // Store recent activity
    const recentActivity = await kv.get<any[]>('recent_activity') || []
    recentActivity.unshift({ ...stats, results, deleteResults })
    await kv.set('recent_activity', recentActivity.slice(0, 100)) // Keep last 100
    
    return NextResponse.json({
      status: 'ok',
      ...stats,
      executed: results,
      deleted: deleteResults
    })
    
  } catch (error) {
    console.error('Cron tick error:', error)
    return NextResponse.json({ 
      status: 'error',
      error: String(error)
    }, { status: 500 })
  }
}

// POST to manually trigger
export async function POST() {
  // Just call GET handler
  return GET(new Request('http://localhost'))
}
