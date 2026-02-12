/**
 * S4S Rotation Engine - Mirrors Competitor's Exact Method
 * 
 * Ghost Tags: Each model tags ~56x/day (matches Nina's ~57 outbound tags)
 * - 15 models = 14 targets each × 4 tags/pair = 56 outbound/day
 * - Interval: ~25 min between each model's posts
 * - Deletion: 5 minutes after posting
 * - Operation: 24/7 continuous
 * - Total network: 840 tags/day
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
  hourOffset?: number     // 0-23 for daily schedules
}

export interface GhostTagConfig {
  deletionDelayMs: number      // 5 minutes = 300000ms
  intervalSeconds: number      // 60*60 / 14 = 257.14 seconds
}

/**
 * Get day of year (1-365) for rotation seed
 */
function getDayOfYear(): number {
  const now = new Date()
  const start = new Date(now.getFullYear(), 0, 0)
  const diff = now.getTime() - start.getTime()
  return Math.floor(diff / (1000 * 60 * 60 * 24))
}

/**
 * Hour weights based on competitor analysis (AST timezone)
 * Peaks: 1AM, 4AM, 10AM
 * Dead: 6-8PM
 * Total weights should sum to ~100 for easy percentage calc
 */
export const HOUR_WEIGHTS: Record<number, number> = {
  0: 4,   // 12 AM
  1: 9,   // 1 AM - PEAK
  2: 6,   // 2 AM
  3: 3,   // 3 AM
  4: 8,   // 4 AM - PEAK
  5: 4,   // 5 AM
  6: 4,   // 6 AM
  7: 7,   // 7 AM
  8: 3,   // 8 AM
  9: 3,   // 9 AM
  10: 8,  // 10 AM - PEAK
  11: 5,  // 11 AM
  12: 5,  // 12 PM
  13: 6,  // 1 PM
  14: 6,  // 2 PM
  15: 3,  // 3 PM (raised from 2)
  16: 6,  // 4 PM
  17: 3,  // 5 PM (raised from 2)
  18: 3,  // 6 PM - LOW but not dead (raised from 1)
  19: 4,  // 7 PM
  20: 3,  // 8 PM - LOW but not dead (raised from 1)
  21: 4,  // 9 PM
  22: 3,  // 10 PM (raised from 2)
  23: 3,  // 11 PM (raised from 2)
}

/**
 * Calculate daily ghost tag schedule with competitor-matched hour weighting
 * CAPPED at ~56 outbound tags/model/day to avoid spammy pages
 * With small networks: tag each model multiple times
 * With large networks: tag fewer times per model to stay under cap
 */
export function calculateDailyGhostSchedule(models: Model[]): ScheduleSlot[] {
  const n = models.length
  if (n < 2) return []
  
  const dayOfYear = getDayOfYear()
  const schedule: ScheduleSlot[] = []
  const MAX_OUTBOUND_PER_MODEL = 56 // Cap at ~56 to match Nina, avoid spam
  const targetsPerModel = n - 1
  
  // Calculate tags per pair to stay near cap
  // If 15 models: 56 / 14 = 4 tags per pair ✓
  // If 30 models: 56 / 29 = ~2 tags per pair ✓
  // If 60 models: 56 / 59 = ~1 tag per pair ✓
  const TAGS_PER_PAIR_PER_DAY = Math.max(1, Math.round(MAX_OUTBOUND_PER_MODEL / targetsPerModel))
  const tagsPerModel = Math.min(targetsPerModel * TAGS_PER_PAIR_PER_DAY, MAX_OUTBOUND_PER_MODEL)
  
  // Seeded random for daily variation
  const seededRandom = (seed: number) => {
    const x = Math.sin(seed) * 10000
    return x - Math.floor(x)
  }
  
  // For each model, spread their 28 tags evenly across the day (2 per target)
  for (let promoterIdx = 0; promoterIdx < n; promoterIdx++) {
    // Base spacing: 24 hours / 28 tags = ~51 min apart
    const baseSpacingMinutes = (24 * 60) / tagsPerModel
    
    // Daily offset so each model starts at different time
    const modelDayOffset = ((promoterIdx + dayOfYear) * 37) % (24 * 60)
    
    for (let tagIdx = 0; tagIdx < tagsPerModel; tagIdx++) {
      // Target rotates daily, with 2 passes through all targets
      const targetOffset = tagIdx % (n - 1)
      const targetIdx = (promoterIdx + targetOffset + 1 + dayOfYear) % n
      if (targetIdx === promoterIdx) continue // skip self
      
      // Calculate base time for this tag
      let baseMinutes = (tagIdx * baseSpacingMinutes + modelDayOffset) % (24 * 60)
      
      // Apply hour weighting: nudge toward peak hours if in dead zone
      const currentHour = Math.floor(baseMinutes / 60)
      const weight = HOUR_WEIGHTS[currentHour] || 5
      
      if (weight <= 2) {
        // Shift to nearby higher-weight hour
        const shifts = [-1, 1, -2, 2, -3, 3]
        for (const shift of shifts) {
          const newHour = (currentHour + shift + 24) % 24
          if (HOUR_WEIGHTS[newHour] > 3) {
            baseMinutes = newHour * 60 + (baseMinutes % 60)
            break
          }
        }
      }
      
      // Add small random jitter (0-10 min) for natural feel
      const jitter = Math.floor(seededRandom(dayOfYear * 1000 + promoterIdx * 100 + tagIdx) * 10)
      baseMinutes = (baseMinutes + jitter) % (24 * 60)
      
      const hour = Math.floor(baseMinutes / 60)
      const minute = Math.floor(baseMinutes % 60)
      const second = Math.floor(seededRandom(dayOfYear * 500 + tagIdx) * 60)
      
      schedule.push({
        promoterId: models[promoterIdx].id,
        promoterUsername: models[promoterIdx].username,
        targetId: models[targetIdx].id,
        targetUsername: models[targetIdx].username,
        minuteOffset: minute,
        secondOffset: second,
        hourOffset: hour
      })
    }
  }
  
  return schedule.sort((a, b) => {
    const aTime = (a.hourOffset || 0) * 3600 + a.minuteOffset * 60 + a.secondOffset
    const bTime = (b.hourOffset || 0) * 3600 + b.minuteOffset * 60 + b.secondOffset
    return aTime - bTime
  })
}

/**
 * Calculate the ghost tag rotation schedule for N models
 * BALANCED + RANDOMIZED VERSION:
 * 1. Each promoter posts evenly (~4.3 min apart for 15 models)
 * 2. Each target receives tags evenly spread across the hour  
 * 3. No two promoters tag the same target at the same minute
 * 4. DAILY ROTATION: Schedule shifts each day for maximum fan coverage
 * 
 * Uses Latin square rotation + daily offset for controlled randomization
 */
export function calculateGhostSchedule(models: Model[]): ScheduleSlot[] {
  const n = models.length
  if (n < 2) return []
  
  const dayOfYear = getDayOfYear()
  const schedule: ScheduleSlot[] = []
  const totalSlots = n * (n - 1) // each model tags every other model once
  const slotDurationSeconds = 3600 / totalSlots // spread evenly across the hour
  
  // Daily offsets for controlled randomization
  const timeOffsetSeconds = (dayOfYear * 137) % 3600 // shifts timing each day (137 is prime for good distribution)
  const promoterOffset = dayOfYear % n // rotates which promoter starts first
  const targetOffset = (dayOfYear * 3) % (n - 1) // rotates target pairing order
  
  // Build a balanced schedule using offset rotation
  for (let slotIdx = 0; slotIdx < totalSlots; slotIdx++) {
    // Apply daily promoter rotation
    const promoterIdx = (slotIdx + promoterOffset) % n
    const round = Math.floor(slotIdx / n) // which round (0 to n-2)
    
    // Apply daily target rotation for varied pairings
    const adjustedRound = (round + targetOffset) % (n - 1)
    let targetIdx = (promoterIdx + adjustedRound + 1) % n
    
    // Skip if somehow targeting self
    if (targetIdx === promoterIdx) {
      targetIdx = (targetIdx + 1) % n
    }
    
    const promoter = models[promoterIdx]
    const target = models[targetIdx]
    
    // Apply daily time offset
    const baseSeconds = slotIdx * slotDurationSeconds
    const adjustedSeconds = (baseSeconds + timeOffsetSeconds) % 3600
    
    schedule.push({
      promoterId: promoter.id,
      promoterUsername: promoter.username,
      targetId: target.id,
      targetUsername: target.username,
      minuteOffset: Math.floor(adjustedSeconds / 60),
      secondOffset: Math.floor(adjustedSeconds % 60)
    })
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
 * Simple 1:1 wheel: each model pins exactly 1 other model
 * Rotates daily for full coverage over (n-1) days
 */
export function calculateDailyPinnedAssignments(
  models: Model[],
  dayOffset: number = 0 // 0 = today, 1 = tomorrow, etc.
): { promoter: Model; target: Model }[] {
  const n = models.length
  if (n < 2) return []
  
  // Use actual day of year for consistent rotation
  const today = new Date()
  const dayOfYear = Math.floor((today.getTime() - new Date(today.getFullYear(), 0, 0).getTime()) / (1000 * 60 * 60 * 24))
  const rotationDay = dayOfYear + dayOffset
  
  const assignments: { promoter: Model; target: Model }[] = []
  
  for (let i = 0; i < n; i++) {
    const promoter = models[i]
    // Each day, shift the target by rotationDay
    // Model i promotes model (i + 1 + rotationDay) mod n
    let targetIndex = (i + 1 + rotationDay) % n
    // Avoid self-promotion
    if (targetIndex === i) targetIndex = (targetIndex + 1) % n
    
    assignments.push({
      promoter,
      target: models[targetIndex]
    })
  }
  
  return assignments
}

/**
 * Get current time in AST timezone
 */
export function getCurrentTimeAST(): { hours: number; minutes: number; seconds: number; formatted: string } {
  const now = new Date()
  // AST is UTC-4
  const astOffset = -4 * 60 // minutes
  const utcMinutes = now.getUTCHours() * 60 + now.getUTCMinutes()
  const astMinutes = utcMinutes + astOffset
  
  let astHours = Math.floor(((astMinutes % 1440) + 1440) % 1440 / 60)
  const astMins = ((astMinutes % 60) + 60) % 60
  const astSecs = now.getUTCSeconds()
  
  const period = astHours >= 12 ? 'PM' : 'AM'
  const displayHours = astHours === 0 ? 12 : astHours > 12 ? astHours - 12 : astHours
  
  return {
    hours: astHours,
    minutes: astMins,
    seconds: astSecs,
    formatted: `${displayHours}:${String(astMins).padStart(2, '0')}:${String(astSecs).padStart(2, '0')} ${period} AST`
  }
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
  const MAX_OUTBOUND_PER_MODEL = 56 // Cap to avoid spam
  const TAGS_PER_PAIR = Math.max(1, Math.round(MAX_OUTBOUND_PER_MODEL / targetsPerModel))
  const tagsPerModelPerDay = Math.min(targetsPerModel * TAGS_PER_PAIR, MAX_OUTBOUND_PER_MODEL)
  const totalTagsPerDay = modelCount * tagsPerModelPerDay
  const avgIntervalMinutes = (24 * 60) / tagsPerModelPerDay // How often each model posts
  
  // Peak hours info
  const peakHours = [1, 4, 10] // 1AM, 4AM, 10AM AST
  const deadHours = [18, 20] // 6PM, 8PM AST
  
  // Daily randomization info
  const dayOfYear = getDayOfYear()
  
  // Calculate actual hourly distribution for the agency
  const totalWeight = Object.values(HOUR_WEIGHTS).reduce((a, b) => a + b, 0)
  const hourlyDistribution: Record<number, number> = {}
  for (let h = 0; h < 24; h++) {
    const weight = HOUR_WEIGHTS[h] || 5
    hourlyDistribution[h] = Math.round((weight / totalWeight) * totalTagsPerDay)
  }
  
  return {
    modelCount,
    targetsPerModel,
    tagsPerModelPerDay,
    totalTagsPerDay,
    avgIntervalMinutes: Math.round(avgIntervalMinutes),
    avgIntervalFormatted: `${Math.floor(avgIntervalMinutes / 60)}h ${Math.round(avgIntervalMinutes % 60)}m`,
    peakHours,
    deadHours,
    dayOfYear,
    rotationType: 'daily-weighted',
    hourlyDistribution, // actual tags per hour for agency
    tagsPerPair: TAGS_PER_PAIR
  }
}
