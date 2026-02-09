/**
 * Caption Templates for S4S
 * 
 * GHOST TAGS: Quick, casual, ephemeral (deleted after 5 min)
 * PINNED POSTS: More genuine, recommendation-style (stay up 24h)
 * 
 * Use {username} as placeholder - will be replaced with @username
 */

// ============================================
// GHOST TAG CAPTIONS (casual, quick, deleted fast)
// ============================================
export const GHOST_CAPTIONS = [
  // College/bestie theme
  "my friend from college {username} just launched her OF 🤭💕",
  "OMG i cant believe my bestie just launched her OF 😍 {username}",
  "Your sign to follow my college bestie, you're welcome 🤭 {username} ✨",
  "my roommate {username} finally made an OF and im obsessed 🙈💕",
  "everyone's college crush finally launched her OF 🤭💕 {username}",
  "my bestie {username} is SO bad at promoting herself so im doing it for her 😂💕",
  
  // New/just launched theme
  "{username} is new to OF and is sending FREE content! 🙈",
  "{username} just launched her FREE VIP for 24 hours. Don't miss it! 🥰",
  "she literally JUST turned 18 and dropped her OF! 🤭 go say hi to {username} 💕",
  "{username} just started and she's already going crazy in DMs 🙈🔥",
  "{username} is brand new and already posting daily 😍",
  
  // Recommendation theme  
  "ok but {username} is actually so pretty go sub to her 🥰",
  "{username} is so underrated honestly 🙈 go show her some love 💕",
  "you NEED to check out {username} 🤭 you'll thank me later",
  "{username} is that girl fr fr 💕✨",
  
  // Cute/petite theme
  "{username} is so petite & cute 💕 sub to her VIP for FREE! 🌸",
  "the cutest girl on OF?? {username} 🥰💕",
  "{username} gives such innocent vibes but... 🙈😏",
  "ok {username} is literally adorable go follow her 💕",
  
  // Hype/excitement theme
  "obsessed with {username} lately 😍 you should be too",
  "the way {username} is taking over OF rn 🔥",
  "{username} is about to blow up i swear 📈💕",
  "caught {username} slipping into my DMs and wow 🙈🔥",
  
  // Simple/casual theme
  "go follow {username} 💕",
  "{username} 🤭💕",
  "{username} tho 😍",
  "her: {username} 💕✨",
]

/**
 * Get a random caption with username inserted
 */
export function getRandomCaption(username: string): string {
  const template = GHOST_CAPTIONS[Math.floor(Math.random() * GHOST_CAPTIONS.length)]
  return template.replace(/{username}/g, `@${username}`)
}

/**
 * Get a seeded random caption (same seed = same caption)
 * Useful for consistent rotation scheduling
 */
export function getSeededCaption(username: string, seed: number): string {
  const index = Math.abs(seed) % GHOST_CAPTIONS.length
  const template = GHOST_CAPTIONS[index]
  return template.replace(/{username}/g, `@${username}`)
}

/**
 * Get caption by index (for manual selection)
 */
export function getCaptionByIndex(username: string, index: number): string {
  const template = GHOST_CAPTIONS[index % GHOST_CAPTIONS.length]
  return template.replace(/{username}/g, `@${username}`)
}

// ============================================
// PINNED POST CAPTIONS (genuine, stays up 24h)
// ============================================
export const PINNED_CAPTIONS = [
  // Genuine recommendation style
  "I've been friends with {username} forever and she finally made an OF 🥹 Go show her love, she's the sweetest 💕",
  "Okay but {username} is genuinely one of my favorite people and her content is 🔥 You're welcome in advance",
  "Not me forcing {username} to finally start posting... you guys are gonna love her trust me 💕",
  "Been telling y'all about {username} for months, she's finally here and she does NOT disappoint 😍",
  
  // Best friend / roommate style
  "My roommate {username} finally listened to me and made an OF 🙈 She's nervous so go be nice to her 💕",
  "Living with {username} means I see the behind the scenes... trust me when I say go subscribe 🤭",
  "{username} is literally my best friend and I'm so proud of her for starting this journey 🥹💕",
  "POV: Your bestie {username} finally takes your advice and starts an OF 😭💕 Go support her!",
  
  // Hype / endorsement style
  "If you only subscribe to one new creator this month, make it {username} 💕 You'll see why",
  "The prettiest girl I know just dropped her OF 😍 {username} is about to take over fr",
  "{username} asked me to share her page and honestly... easiest yes ever. She's stunning 💕",
  "I don't promote just anyone but {username} is different. Go see for yourself 🔥",
  
  // Personal touch style
  "Fun fact: {username} and I have been planning this collab forever 🤭 Go follow her so we can make it happen 💕",
  "Y'all keep asking who my prettiest friend is... it's {username} and now she has an OF 😍",
  "{username} helped me when I first started, now it's my turn to help her 💕 Go subscribe!",
  "Story time: Met {username} at a party and instantly knew she needed to be on here 🙈💕",
]

/**
 * Get a random pinned caption with username inserted
 */
export function getRandomPinnedCaption(username: string): string {
  const template = PINNED_CAPTIONS[Math.floor(Math.random() * PINNED_CAPTIONS.length)]
  return template.replace(/{username}/g, `@${username}`)
}

/**
 * Get a seeded random pinned caption
 */
export function getSeededPinnedCaption(username: string, seed: number): string {
  const index = Math.abs(seed) % PINNED_CAPTIONS.length
  const template = PINNED_CAPTIONS[index]
  return template.replace(/{username}/g, `@${username}`)
}
