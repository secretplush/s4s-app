/**
 * S4S Rotation Engine - Mirrors Competitor's Exact Method
 * 
 * Ghost Tags: Every model tags every other model once per hour
 * - 15 models = 14 targets each
 * - Interval: 60 / 14 = 4.286 minutes between posts per model
 * - Deletion: 5 minutes after posting
 * - Operation: 24/7 continuous
 * 
 * 24hr Pinned: Daily batch of pinned promo posts
 * - Each model pins 2-3 promos for other models
 * - Rotate daily for full network coverage
 * - Auto-expire via expireDays: 1
 */

export interface Model {
  id: string
  username: string
  displayName: string
}

export interface ScheduleSlot {
  promoterId: string      // Model doing the tagging
  promoterUsername: string
  targetId: string        // Model being tagged
  targetUsername: string
  minuteOffset: number    // 0-59 within the hour
  secondOffset: number    // 0-59 for precision
}

export interface GhostTagConfig {
  deletionDelayMs: number      // 5 minutes = 300000ms
  intervalSeconds: number      // 60*60 / 14 = 257.14 seconds
}

/**
 * Calculate the ghost tag rotation schedule for N models
 * Each model tags every other model once per hour
 */
export function calculateGhostSchedule(models: Model[]): ScheduleSlot[] {
  const n = models.length
  if (n < 2) return []
  
  const schedule: ScheduleSlot[] = []
  const intervalSeconds = (60 * 60) / (n - 1) // seconds between each model's posts
  
  for (let i = 0; i < n; i++) {
    const promoter = models[i]
    let slotIndex = 0
    
    for (let j = 0; j < n; j++) {
      if (i === j) continue // skip self
      
      const target = models[j]
      const totalSeconds = slotIndex * intervalSeconds
      
      // Stagger each model's start by their index to distribute load
      const staggerSeconds = i * (intervalSeconds / n)
      const adjustedSeconds = (totalSeconds + staggerSeconds) % 3600
      
      schedule.push({
        promoterId: promoter.id,
        promoterUsername: promoter.username,
        targetId: target.id,
        targetUsername: target.username,
        minuteOffset: Math.floor(adjustedSeconds / 60),
        secondOffset: Math.floor(adjustedSeconds % 60)
      })
      
      slotIndex++
    }
  }
  
  return schedule.sort((a, b) => {
    const aTime = a.minuteOffset * 60 + a.secondOffset
    const bTime = b.minuteOffset * 60 + b.secondOffset
    return aTime - bTime
  })
}

/**
 * Get config for ghost tags based on number of models
 */
export function getGhostConfig(modelCount: number): GhostTagConfig {
  return {
    deletionDelayMs: 5 * 60 * 1000, // 5 minutes
    intervalSeconds: (60 * 60) / (modelCount - 1)
  }
}

/**
 * Calculate which slots should fire in the current minute
 */
export function getCurrentSlots(
  schedule: ScheduleSlot[],
  currentMinute: number
): ScheduleSlot[] {
  return schedule.filter(slot => slot.minuteOffset === currentMinute)
}

/**
 * Generate daily 24hr pinned post assignments
 * Each model pins promos for ~2-3 other models
 * Rotates to ensure full coverage over multiple days
 */
export function calculateDailyPinnedAssignments(
  models: Model[],
  dayOffset: number = 0 // 0 = today, 1 = tomorrow, etc.
): { promoter: Model; target: Model }[] {
  const n = models.length
  const pinsPerModel = Math.ceil((n - 1) / 5) // ~2-3 pins each, full rotation in 5 days
  
  const assignments: { promoter: Model; target: Model }[] = []
  
  for (let i = 0; i < n; i++) {
    const promoter = models[i]
    
    for (let p = 0; p < pinsPerModel; p++) {
      // Rotate through targets based on day offset
      const targetIndex = (i + 1 + p + (dayOffset * pinsPerModel)) % n
      if (targetIndex === i) continue // skip self
      
      assignments.push({
        promoter,
        target: models[targetIndex]
      })
    }
  }
  
  return assignments
}

/**
 * Format schedule for display
 */
export function formatScheduleForDisplay(schedule: ScheduleSlot[]): string {
  const lines: string[] = ['Ghost Tag Schedule (1 hour cycle):', '']
  
  for (const slot of schedule) {
    const time = `${String(slot.minuteOffset).padStart(2, '0')}:${String(slot.secondOffset).padStart(2, '0')}`
    lines.push(`${time} - @${slot.promoterUsername} → @${slot.targetUsername}`)
  }
  
  return lines.join('\n')
}

/**
 * Stats for the rotation
 */
export function getRotationStats(modelCount: number) {
  const targetsPerModel = modelCount - 1
  const intervalMinutes = 60 / targetsPerModel
  const postsPerHour = modelCount * targetsPerModel
  const deletesPerHour = postsPerHour
  const concurrentPosts = Math.ceil(5 / intervalMinutes) // posts alive at any moment per model
  
  return {
    modelCount,
    targetsPerModel,
    intervalMinutes: Math.round(intervalMinutes * 100) / 100,
    intervalSeconds: Math.round((intervalMinutes * 60) * 100) / 100,
    postsPerHour,
    deletesPerHour,
    concurrentPostsPerModel: concurrentPosts,
    totalConcurrentPosts: concurrentPosts * modelCount
  }
}
