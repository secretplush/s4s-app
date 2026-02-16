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
  "she literally JUST started her OF and its already fire! 🤭 go say hi to {username} 💕",
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
  "omg {username} go follow her 🤭",
  "{username} is so fine why is no one talking about her",
  "my bestie {username} just posted and im dead 😭",
  "go look at {username} rn trust me 💕",
  "{username} has free vip today go go go",
  "this girl {username} from my school is crazy pretty 👀",
  "{username} just dropped something insane on her page",
  "why is {username} so underrated go sub 💕",
  "cant believe {username} is real honestly 🤭",
  "{username} just started an of and im shook",
  "free sub to {username} today shes new",
  "my roommate {username} is way too pretty for this app 😩",
  "{username} posting daily and nobody knows yet 👀",
  "go be nice to {username} shes brand new 💕",
  "{username} has the cutest page go see",
  "college bestie {username} finally made one 🙈",
  "{username} is free rn dont sleep on her",
  "ok but {username} tho 😍",
  "everyone sleeping on {username} fr",
  "my girl {username} just started go show love 💕",
  "{username} is giving everything rn 🔥",
  "go sub to {username} before she blows up 👀",
  "freshman {username} just launched and wow",
  "{username} from my dorm is so bad omg 🙈",
  "free vip on {username} go quick",
  "{username} is the prettiest girl on here no cap 💕",
  "someone tell {username} shes famous now 😭",
  "just found {username} and im obsessed",
  "{username} is new and already killing it 🔥",
  "subscribe to {username} its free and shes gorgeous 💕",
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
  "{username} just made her page and its free rn 🤭",
  "my roommate {username} has free vip for 24 hrs go look",
  "{username} literally just started go sub its free 💕",
  "free vip on {username} today shes brand new",
  "{username} from my college just made her page free",
  "shes new and free vip for today only {username} 👀",
  "my sorority sister {username} just dropped a free page",
  "{username} just started and made a free of go see",
  "free 24hr vip on {username} shes so cute",
  "{username} just launched her page its free rn go",
  "this girl from my dorm {username} has free vip today 🙈",
  "college girl {username} just made her vip free go sub",
  "{username} is brand new and free for 24 hours",
  "my friend {username} just started and shes free rn",
  "go sub to {username} its free she just started 💕",
  "{username} from campus just launched a free page omg",
  "freshman {username} has free vip up for today",
  "{username} is new and giving free access go look 👀",
  "my college bestie {username} made her page free today",
  "free vip {username} she just started posting 🤭",
  "{username} doing free subs for today shes so new",
  "this girl {username} from my class has a free page now",
  "{username} just started her of and its free rn go",
  "my dorm mate {username} is free for 24 hrs 💕",
  "go follow {username} shes free and brand new",
  "{username} launched today with free vip shes adorable",
  "college cutie {username} free vip for today only",
  "{username} is new and her page is free go see 👀",
  "my girl {username} from school just went free for 24hrs",
  "{username} just started free vip go before she changes it",
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

// ============================================
// MASS DM CAPTIONS (sent to fans via mass message)
// ============================================
export const MASS_DM_CAPTIONS = [
  "Have you seen my friend {username}? 😍",
  "You NEED to check out my girl {username} 🔥",
  "My friend {username} is so hot omg go see her 😩",
  "Go say hi to my bestie {username} 💕",
  "Ok but have you seen {username} yet?? 👀",
  "My girl {username} is so fine it's not even fair 🥵",
  "You'd love my friend {username} trust me 😘",
  "Obsessed with my girl {username} rn go follow her 💋",
  "If you like me you'll LOVE {username} 😍",
  "Go show some love to {username} for me babe 💗",
  "My friend {username} just started and she's already killing it 🔥",
  "Seriously go check out {username} before everyone else does 👀",
  "I can't stop looking at {username}'s page omg 🥵",
  "Do me a favor and go follow my girl {username} 😘",
  "You're welcome in advance… {username} 🫣",
  "My bestie {username} is too fine to not share 💕",
  "Tell {username} I sent you 😏",
  "Just wait until you see {username} 🤤",
  "Go subscribe to my girl {username} you won't regret it 😍",
  "Sharing my fav girl {username} with you because I'm nice like that 😘",
  "My college roommate {username} finally made one 😍",
  "This girl from my class {username} just started… go look 👀",
  "My sorority sister {username} is so bad omg 🥵",
  "Ok so {username} just made an OF… you're welcome 🫣",
  "{username} literally just started posting and she's already so hot 🔥",
  "My friend {username} from school finally caved and made one 😩",
  "College girls do it better… go see {username} 💋",
  "This freshman {username} is about to blow up go follow now 👀",
  "{username} just started and I can't believe her page 🤤",
  "My dorm mate {username} started an OF and I'm obsessed 😍",
  "{username} is brand new… go see her before she blows up 🔥",
  "{username} is brand new and already hotter than everyone 🥵",
  "My study buddy {username} finally made a page go show her love 💕",
  "Just found out {username} from my campus made one… omg 👀",
  "Newest girl on campus {username} just dropped her first posts 😘",
  "This college girl {username} is unreal go look 🫣",
  "{username} just started her page and she's so nervous go be nice 🥺",
  "My girl {username} is brand new to this and already killing it 🔥",
  "Campus cutie {username} finally joined… trust me on this one 😏",
  "She just started and already this fine?? go see {username} 😩",
]
