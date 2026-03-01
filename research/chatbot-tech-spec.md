# Biancawoods AI Chatbot — Phase 1 Technical Spec

> **Model:** biancawoods  
> **Account ID:** `acct_54e3119e77da4429b6537f7dd2883a05`  
> **Status:** Draft — v1.0, 2026-02-17  
> **Author:** OpenClaw

---

## Table of Contents

1. [Overview](#1-overview)
2. [Architecture](#2-architecture)
3. [Core Loops](#3-core-loops)
4. [Content Selection Engine](#4-content-selection-engine)
5. [Data Structures](#5-data-structures)
6. [API Endpoints](#6-api-endpoints)
7. [Safety Rails](#7-safety-rails)
8. [Deployment & Configuration](#8-deployment--configuration)
9. [Flow Diagrams](#9-flow-diagrams)

---

## 1. Overview

An AI chatbot for the **biancawoods** OnlyFans account that autonomously:
- Responds to fan messages using Claude Sonnet 4 with the chatbot-brain-v3 playbook
- Sends bump messages hourly to drive engagement
- Welcomes new subscribers
- Re-engages dormant spenders
- Selects and sends content (free hooks, bundles, sexting chains, upsells) with dynamic pricing
- Logs all interactions for analysis

The bot extends the existing **s4s-rotation-service** on Railway.

---

## 2. Architecture

### 2.1 System Diagram

```
┌──────────────────────────────────────────────────────────┐
│                   Railway Service (s4s-rotation-service)  │
│                                                          │
│  ┌──────────────┐   ┌────────────────────────────────┐   │
│  │  index.js     │   │  chatbot-engine.js (NEW)       │   │
│  │  (S4S, ghost  │   │                                │   │
│  │   tags, mass  │◄──┤  - Message Polling Loop        │   │
│  │   DM, pinned  │   │  - Bump Loop                   │   │
│  │   posts,      │   │  - Welcome Loop                │   │
│  │   chatbot     │   │  - Retarget Loop               │   │
│  │   relay for   │   │  - Content Selector            │   │
│  │   millie)     │   │  - Pricing Engine              │   │
│  └──────┬───────┘   │  - Safety Filter                │   │
│         │           └──────┬──────────┬───────────────┘   │
│         │                  │          │                    │
└─────────┼──────────────────┼──────────┼───────────────────┘
          │                  │          │
          ▼                  ▼          ▼
   ┌──────────┐     ┌──────────┐  ┌──────────┐
   │ OF API   │     │ Claude   │  │ Upstash  │
   │ (OFAPI)  │     │ Sonnet 4 │  │ Redis    │
   └──────────┘     └──────────┘  └──────────┘
```

### 2.2 Module: `chatbot-engine.js`

New file added to the s4s-rotation-service. Exports:

```js
module.exports = {
  startChatbot,    // Initialize all loops
  stopChatbot,     // Stop all loops
  getChatbotStatus,
  getFanProfiles,
  getConversationLogs,
  addToExcludeList,
};
```

### 2.3 External Dependencies

| Service | Purpose | Key Reference |
|---------|---------|---------------|
| **Anthropic Claude Sonnet 4** | AI response generation | `ANTHROPIC_API_KEY` env var (in MEMORY.md) |
| **OnlyFans API (onlyfansapi.com)** | All OF operations | `OF_API_KEY` = `ofapi_bT4J1Er2YBow46EihDfjlSFf5HRmiM15M4DCOoHn7889d8b4` |
| **Upstash Redis** | State persistence | Existing `KV_REST_API_URL` + `KV_REST_API_TOKEN` |

### 2.4 Existing Infrastructure

The s4s-rotation-service already has:
- Express server on `PORT` (default 3000)
- Upstash Redis client
- `node-cron` scheduling
- OF API helpers (`loadModelAccounts`, `deletePost`, etc.)
- A chatbot system for **milliexhart** (different model, different vault, different prompt)
- Webhook handler for incoming messages
- Relay mode infrastructure

The biancawoods chatbot is a **separate, independent module** that shares Redis/Express but has its own loops, state, and configuration.

---

## 3. Core Loops

### 3.1 Message Polling Loop

**Interval:** Every 30 seconds  
**Redis key for last poll:** `chatbot:bianca:last_poll_ts`

```
┌─────────────────────────────────────────────────────┐
│                  MESSAGE POLL CYCLE                   │
│                  (every 30 seconds)                   │
└──────────┬──────────────────────────────────────────┘
           │
           ▼
   Poll GET /api/{accountId}/chats
   (unread messages only)
           │
           ▼
   For each unread message:
           │
           ├── Is fan on EXCLUDE list? ──YES──► Skip, mark read
           │
           ├── NO
           │
           ▼
   Fetch fan context:
   ┌───────────────────────────────┐
   │ - GET /api/{acct}/chats/{uid}/messages (history)
   │ - GET /api/{acct}/users/{uid} (profile, lists)
   │ - Check fan-profiles in Redis
   │ - Determine buyer type
   │ - Get spend history
   │ - Get sexting chain progress
   │ - Get which bundles already sent
   └───────────────┬───────────────┘
                   │
                   ▼
   Build Claude prompt:
   ┌───────────────────────────────┐
   │ SYSTEM: chatbot-brain-v3      │
   │ + Fan context (type, spend,   │
   │   sexting step, bundles seen)  │
   │ + Available content categories │
   │ + Time of day context          │
   │                                │
   │ MESSAGES: conversation history │
   │ + new fan message              │
   └───────────────┬───────────────┘
                   │
                   ▼
   Claude responds with JSON:
   {
     "messages": [
       { "text": "...", "action": "message" },
       { "text": "...", "action": "ppv",
         "contentCategory": "sexting1_vid2",
         "price": 24 }
     ]
   }
                   │
                   ▼
   Safety filter (Section 7)
                   │
                   ▼
   Execute via OF API:
   - Send text messages
   - Send PPV with vault items + price
   - Max 1 PPV per turn
                   │
                   ▼
   Log everything to Redis
   Update fan profile
   Mark messages as read
```

#### OF API Calls

```
GET  /api/{accountId}/chats?limit=50&order=recent
GET  /api/{accountId}/chats/{userId}/messages?limit=50
POST /api/{accountId}/chats/{userId}/messages
     Body: { text, price?, mediaFiles? }
GET  /api/{accountId}/users/{userId}
```

#### Debounce

Same pattern as millie chatbot: batch rapid messages from the same fan within 3 seconds before sending to Claude.

```js
const BIANCA_DEBOUNCE_MS = 3000;
const pendingBiancaMessages = {};
// { fanId: { messages: [], timer, accountId } }
```

### 3.2 Hourly Bump Loop

**Interval:** Every 60 minutes  
**Redis key:** `chatbot:bianca:bump_state`

```
┌──────────────────────────────────────────┐
│              HOURLY BUMP LOOP             │
│              (every 60 minutes)           │
└──────────┬───────────────────────────────┘
           │
           ▼
   Delete previous bump message
   (tracked in bump_state.lastBumpMessageId)
           │
           ▼
   Fetch random photo from vault category:
   "bump message (jack)" — ID: 27535987
           │
           ▼
   Pick random bump text from rotation:
   ┌────────────────────────────────┐
   │ "heyy how are u 😊"           │
   │ "hey babe what are u up to rn" │
   │ "hiii 💕"                      │
   │ "heyyy whatcha doing 😊"       │
   │ "miss talking to u 🥺"         │
   │ "hey handsome 😏"              │
   │ "bored rn... entertain me? 😊" │
   │ "heyy stranger 💕"             │
   └────────────────────────────────┘
           │
           ▼
   Send mass message via OF API:
   POST /api/{accountId}/messages/mass
   {
     text: "<bump text>",
     mediaFiles: [<vault item ID>],
     excludeListIds: [
       1231455148,  // Timewasters
       1232110158,  // Broke/Student
       1258116798,  // Lowballers
     ],
     excludeUserIds: [
       483664969,   // Antonio (whale)
       482383508,   // Brandon (whale)
       // nij444 + tylerd34 resolved to IDs at startup
     ]
   }
           │
           ▼
   Save new bump message ID to Redis
   bump_state.lastBumpMessageId = response.id
   bump_state.lastBumpAt = Date.now()
```

#### Bump Text Rotation

Stored in-memory array. Each bump picks a random entry. Track last 3 used to avoid repeats:

```js
const BUMP_TEXTS = [
  "heyy how are u 😊",
  "hey babe what are u up to rn",
  "hiii 💕",
  "heyyy whatcha doing 😊",
  "miss talking to u 🥺",
  "hey handsome 😏",
  "bored rn... entertain me? 😊",
  "heyy stranger 💕",
  "thinking about u rn 😊",
  "hey cutie wyd 💕",
];
```

#### Exclude from Bumps

In addition to list-based exclusion, maintain an **active conversations set** in Redis:

```
chatbot:bianca:active_convos  →  Set of fan IDs with activity in last 2 hours
```

Fans in active conversations are excluded from bumps to avoid interrupting ongoing chats.

### 3.3 New Subscriber Welcome Loop

**Interval:** Every 2 minutes  
**Redis key:** `chatbot:bianca:welcomed_fans` (Set of fan IDs already welcomed)

```
┌──────────────────────────────────────────────┐
│          NEW SUBSCRIBER WELCOME LOOP          │
│              (every 2 minutes)                │
└──────────┬───────────────────────────────────┘
           │
           ▼
   Check "New Subs (Clear every 8AM)" list
   GET /api/{accountId}/user-lists/1239250956/users
           │
           ▼
   For each user NOT in welcomed_fans set:
           │
           ▼
   Is fan on EXCLUDE list? ──YES──► Add to welcomed_fans, skip
           │
           ├── NO
           │
           ▼
   Send welcome message (NO PPV):
   ┌─────────────────────────────────────────┐
   │ Pick from welcome templates:             │
   │                                          │
   │ "hiii 🥰 omg thank u for subbing, i     │
   │  actually get so excited when someone    │
   │  new joins lol"                          │
   │                                          │
   │ "heyyy welcome babe 💕 tell me about     │
   │  urself, what made u sub?"               │
   │                                          │
   │ "omg hi!! i was literally just posting   │
   │  new stuff, ur timing is perfect haha"   │
   └─────────────────────────────────────────┘
           │
           ▼
   Add fan ID to welcomed_fans set
   Initialize fan profile in Redis
```

**Note:** Welcome messages are template-based, NOT sent through Claude. This saves API credits and ensures consistent first impressions per chatbot-brain-v3 Section 4A.

### 3.4 Spender Retarget Loop

**Interval:** Once daily at 9 PM AST (01:00 UTC)  
**Redis key:** `chatbot:bianca:retarget_state`

```
┌──────────────────────────────────────────────────┐
│           SPENDER RETARGET LOOP                   │
│           (daily at 9 PM AST)                     │
└──────────┬───────────────────────────────────────┘
           │
           ▼
   Pull fans from "$101-$500" list
   GET /api/{accountId}/user-lists/1254929000/users
   (66 fans currently)
           │
           ▼
   For each fan (sorted by total spend, highest first):
           │
           ├── Already retargeted today (max 10/day)? ──YES──► Skip
           │
           ├── In active conversation (last msg < 7 days)? ──YES──► Skip
           │
           ├── On EXCLUDE list? ──YES──► Skip
           │
           ├── Already retargeted 2x with no response? ──YES──► Skip (30-day cooldown)
           │
           ▼
   Send re-engagement message via Claude:
   Provide fan's spend history + last conversation context
   Claude picks from Section 13 retarget strategies:
   
   $500+ dormant → personal, reference history
   $100-500 dormant → warm, FOMO
   $20-100 dormant → casual, low-pressure
           │
           ▼
   Log retarget attempt
   Increment retarget counter for today
   Update fan profile with retarget timestamp
```

---

## 4. Content Selection Engine

### 4.1 Content Escalation Ladder

```
Level 0: FREE HOOKS (no purchase needed)
   │  GFE Selfies (26201789)
   │  CB Promotion Selfies (26373605)
   │  Sexting pic 1s (27535606, 27535650, 27535691)
   │  Preview Bumps (26358364)
   │  Rekindle Vid/VM (26359465)
   │  Bump Messages Jack (27535987)
   │
Level 1: BUNDLES (entry-level PPV, $15-25)
   │  Bundles 1-26 (bikini → lingerie → implied nude)
   │
Level 2: SEXTING CHAINS (mid-tier drip, $15-100)
   │  Sexting 1: 6 steps (free → 5 vids)
   │  Sexting 2: 6 steps (free → 5 vids)
   │  Sexting 3: 7 steps (free → 6 vids)
   │
Level 3: SCREENSHOTS FOR UPSELL (teaser PPV, $10-20)
   │  Screenshots 1-7 (explicit teasers for proven spenders)
   │
Level 4: CUSTOM UPSELL VIDEOS (high-ticket, $50-100)
   │  Upsell 1-7 (shower → bedroom → titty fuck → cumming)
   │
Level 5: BODY CATEGORIES (supplemental)
   │  Booty, Feet, Implied Nudity, Lingerie/Bikini
   │  Boobs VIPs only (nipples) → Fully Nude → Pussy
   │
   ╳  NEVER SELL (hard block)
      25942142, 25942144, 27174580, 26278056
```

### 4.2 How Claude Selects Content

The system prompt includes a **content menu** derived from `biancawoods-content-map.json`:

```
AVAILABLE CONTENT FOR THIS FAN:

FREE HOOKS (send to start conversations):
- gfe_selfies: casual selfies for rapport
- sexting1_pic1: quarter zip, cleavage (free preview)
- sexting2_pic1: glasses, quarter zip (free preview)
- sexting3_pic1: bra, lots of cleavage (free preview)

BUNDLES (entry-level PPV):
- bundle_1 through bundle_26 (bikini/lingerie/striptease/implied nude)
- Fan has NOT seen: bundle_3, bundle_7, bundle_12, ...
- Fan HAS seen: bundle_1, bundle_5

SEXTING CHAINS (sequential drip — ORDER MATTERS):
- sexting1: Fan is on STEP 2 (vid 2, price $24)
- sexting2: Fan has NOT started (step 0, free pic)
- sexting3: Fan has NOT started (step 0, free pic)

CUSTOM UPSELLS (high-ticket — proven spenders only):
- Only offer if fan has spent $100+
- Available: shower, bedroom_boobs, bedroom_topless, ...
```

Claude's response JSON specifies which content to send:

```json
{
  "messages": [
    { "text": "ok dont judge me 🙈", "action": "message" },
    {
      "text": "i just made this for u...",
      "action": "ppv",
      "contentCategory": "bundle_7",
      "price": 18
    }
  ]
}
```

### 4.3 Sexting Chain State Machine

Per fan, track progress through each sexting chain:

```json
{
  "fanId": "534923333",
  "sextingProgress": {
    "sexting1": { "currentStep": 2, "lastStepAt": "2026-02-17T20:30:00Z" },
    "sexting2": { "currentStep": 0, "lastStepAt": null },
    "sexting3": { "currentStep": 0, "lastStepAt": null }
  }
}
```

**Rules:**
- Never skip steps. Step 0 → 1 → 2 → 3 → 4 → 5 (→ 6 for sexting3)
- Step 0 is always free (pic). Steps 1+ are paid videos.
- Prices per step are fixed: $0, $15, $24, $38, $54, $75, $100

### 4.4 Bundle Tracking

Track which bundles each fan has already been sent (regardless of whether they bought):

```
Redis key: chatbot:bianca:sent_bundles:{fanId}
Value: Set of bundle category IDs
```

When Claude requests a bundle, the engine:
1. Checks if fan has already received that bundle
2. If yes, picks the next unsent bundle in the same tier
3. Fetches vault items from the selected category via API:
   ```
   GET /api/{accountId}/media/vault?categoryId={catId}&limit=20
   ```
4. Sends all items as a single PPV message

### 4.5 Content Fetching

```js
async function fetchVaultItems(accountId, categoryId, limit = 20) {
  const res = await fetch(
    `${OF_API_BASE}/${accountId}/media/vault?categoryId=${categoryId}&limit=${limit}`,
    { headers: { Authorization: `Bearer ${OF_API_KEY}` } }
  );
  const data = await res.json();
  const items = data.data || data.list || data || [];
  return items.map(item => item.id);
}
```

**Caching:** Vault items per category are cached in Redis for 1 hour to avoid repeated API calls:
```
Redis key: chatbot:bianca:vault_cache:{categoryId}
TTL: 3600 seconds
```

---

## 5. Data Structures

### 5.1 Fan Profile

**Redis key:** `chatbot:bianca:fan:{fanId}`

```json
{
  "fanId": "534923333",
  "username": "coolguy123",
  "buyerType": "emotional_chaser",
  "totalSpent": 57.00,
  "purchaseCount": 3,
  "avgPurchasePrice": 19.00,
  "lastPurchasePrice": 24.00,
  "estimatedCeiling": 30,
  "lastTestedAbove": 38,

  "priceHistory": [
    { "offered": 15, "opened": true, "ts": "2026-02-15T14:00:00Z", "category": "bundle_3", "hook": "vulnerability" },
    { "offered": 24, "opened": true, "ts": "2026-02-16T21:00:00Z", "category": "sexting1_vid1", "hook": "scarcity" },
    { "offered": 38, "opened": false, "ts": "2026-02-17T10:00:00Z", "category": "sexting1_vid2", "hook": "challenge" }
  ],

  "sextingProgress": {
    "sexting1": { "currentStep": 2, "lastStepAt": "2026-02-16T21:00:00Z" },
    "sexting2": { "currentStep": 0, "lastStepAt": null },
    "sexting3": { "currentStep": 0, "lastStepAt": null }
  },

  "sentBundles": [25942141, 25942197],
  "sentUpsellScreenshots": [],
  "sentCustomUpsells": [],

  "lastMessageAt": "2026-02-17T15:00:00Z",
  "lastBotReplyAt": "2026-02-17T15:01:00Z",
  "firstSeenAt": "2026-02-14T12:00:00Z",
  "isTimewaster": false,
  "timewasterScore": 0,
  "botMessageCount": 12,
  "fanMessageCount": 8,
  "retargetCount": 0,
  "lastRetargetAt": null,
  "preferredHook": "vulnerability",
  "preferredTime": "night",
  "welcomed": true,

  "flags": {
    "humanHandoff": false,
    "humanHandoffReason": null
  }
}
```

### 5.2 Bump State

**Redis key:** `chatbot:bianca:bump_state`

```json
{
  "lastBumpMessageId": "msg_abc123",
  "lastBumpAt": "2026-02-17T14:00:00Z",
  "lastBumpText": "heyy how are u 😊",
  "recentTexts": ["heyy how are u 😊", "hey babe what are u up to rn"],
  "totalBumpsSent": 47
}
```

### 5.3 Conversation Log Entry

**Redis key:** `chatbot:bianca:log` (list, LPUSH, cap at 5000 entries)

```json
{
  "id": "log_001",
  "ts": "2026-02-17T15:01:23Z",
  "fanId": "534923333",
  "direction": "inbound",
  "fanMessage": "hey gorgeous",
  "botResponse": [
    { "text": "hiii 🥰 omg how are u", "action": "message" }
  ],
  "contentSent": null,
  "priceSent": null,
  "hookUsed": null,
  "buyerType": "emotional_chaser",
  "claudeLatencyMs": 1230,
  "totalSpentAtTime": 57.00
}
```

### 5.4 Retarget State

**Redis key:** `chatbot:bianca:retarget_state`

```json
{
  "lastRunDate": "2026-02-17",
  "retargetedToday": ["fan1", "fan2", "fan3"],
  "retargetCount": 3,
  "fanCooldowns": {
    "fan1": { "attempts": 1, "lastAt": "2026-02-17T01:00:00Z" },
    "fan2": { "attempts": 2, "lastAt": "2026-02-10T01:00:00Z", "cooldownUntil": "2026-03-10" }
  }
}
```

### 5.5 Chatbot Global State

**Redis key:** `chatbot:bianca:state`

```json
{
  "enabled": false,
  "startedAt": null,
  "stats": {
    "messagesReceived": 0,
    "messagesSent": 0,
    "ppvsSent": 0,
    "ppvRevenue": 0,
    "bumpsSent": 0,
    "welcomesSent": 0,
    "retargetsSent": 0,
    "errors": 0,
    "lastActivityAt": null
  }
}
```

### 5.6 Excluded Fans List

**Redis key:** `chatbot:bianca:excluded_fans`  
**Type:** Hash — `{ fanId: reason }`

Hardcoded at startup:

| Fan ID | Username | Reason |
|--------|----------|--------|
| `483664969` | @u483664969 (Antonio) | $1000+ whale, human-only |
| `482383508` | @u482383508 (Brandon) | $1000+ whale, human-only |
| *(resolve)* | @nij444 (Ferdy) | DO NOT MESSAGE |
| *(resolve)* | @tylerd34 (VIP Tyler) | $1000+ whale, human-only |

On startup, resolve `nij444` and `tylerd34` usernames to numeric IDs via:
```
GET /api/{accountId}/users?search=nij444
GET /api/{accountId}/users?search=tylerd34
```

---

## 6. API Endpoints

Added to the existing Express app in `index.js`:

### 6.1 Status

```
GET /chatbot/bianca/status
```

**Response:**
```json
{
  "enabled": true,
  "uptime": "4h 23m",
  "startedAt": "2026-02-17T10:00:00Z",
  "stats": {
    "messagesReceived": 142,
    "messagesSent": 198,
    "ppvsSent": 34,
    "ppvRevenue": 612.00,
    "bumpsSent": 4,
    "welcomesSent": 12,
    "retargetsSent": 7,
    "errors": 2,
    "lastActivityAt": "2026-02-17T14:58:00Z"
  },
  "loops": {
    "messagePolling": { "status": "running", "interval": "30s", "lastRun": "..." },
    "bumpLoop": { "status": "running", "interval": "60m", "lastRun": "..." },
    "welcomeLoop": { "status": "running", "interval": "2m", "lastRun": "..." },
    "retargetLoop": { "status": "idle", "nextRun": "2026-02-18T01:00:00Z" }
  },
  "activeFans": 23,
  "excludedFans": 4
}
```

### 6.2 Start / Stop

```
POST /chatbot/bianca/start
POST /chatbot/bianca/stop
```

**Start response:**
```json
{ "ok": true, "message": "Biancawoods chatbot started", "startedAt": "2026-02-17T15:00:00Z" }
```

**Stop response:**
```json
{ "ok": true, "message": "Biancawoods chatbot stopped", "stats": { ... } }
```

### 6.3 Fan Profiles

```
GET /chatbot/bianca/fans?limit=50&offset=0&sort=totalSpent
```

**Response:**
```json
{
  "total": 142,
  "fans": [
    {
      "fanId": "534923333",
      "username": "coolguy123",
      "buyerType": "emotional_chaser",
      "totalSpent": 57.00,
      "purchaseCount": 3,
      "lastMessageAt": "2026-02-17T15:00:00Z",
      "isTimewaster": false,
      "sextingProgress": { "sexting1": 2, "sexting2": 0, "sexting3": 0 }
    }
  ]
}
```

### 6.4 Conversation Logs

```
GET /chatbot/bianca/logs?limit=100&fanId=534923333
```

**Response:**
```json
{
  "total": 342,
  "logs": [
    {
      "ts": "2026-02-17T15:01:23Z",
      "fanId": "534923333",
      "fanMessage": "hey gorgeous",
      "botResponse": "hiii 🥰 omg how are u",
      "contentSent": null,
      "priceSent": null
    }
  ]
}
```

### 6.5 Exclude Fan

```
POST /chatbot/bianca/exclude/:fanId
Body: { "reason": "whale - human only" }
```

**Response:**
```json
{ "ok": true, "fanId": "534923333", "excluded": true }
```

### 6.6 Remove Exclusion

```
DELETE /chatbot/bianca/exclude/:fanId
```

---

## 7. Safety Rails

### 7.1 Hard Blocks

| Rule | Implementation |
|------|----------------|
| Never message excluded fans | Check `chatbot:bianca:excluded_fans` hash before ANY outbound message |
| Never pull from "Never Sell" categories | Hardcoded blocklist: `[25942142, 25942144, 27174580, 26278056]`. Checked in content selector. |
| Max 1 PPV per conversation turn | If Claude returns multiple PPV actions, only execute the first. Log the skipped ones. |

### 7.2 Rate Limits

| Limit | Value | Scope |
|-------|-------|-------|
| Outbound messages per hour | 50 | Global across all fans |
| PPVs per fan per hour | 3 | Per fan |
| Retargets per day | 10 | Global |
| Bump messages per day | 24 | Global (1/hour) |
| Claude API calls per minute | 20 | Anthropic rate limit buffer |

Rate limit tracking:
```
Redis key: chatbot:bianca:rate:{window}
  e.g., chatbot:bianca:rate:msg:2026021715  (messages sent in hour 15)
  TTL: 7200 seconds
```

### 7.3 Restricted Words Filter

Before sending ANY outbound message, scan against the restricted words list from chatbot-brain-v3 Section 10 (250+ words).

```js
const RESTRICTED_WORDS = new Set([
  'abduct', 'animal', 'asphyxia', 'bait', 'ballbusting', 'bareback',
  'beastiality', 'bestiality', 'blackmail', 'blood', 'bukkake',
  'child', 'chloroform', 'choking', 'consent', 'cp', 'diapers',
  'dog', 'drunk', 'enema', 'escort', 'forced', 'gangbang',
  'golden', 'hooker', 'hypno', 'incest', 'jail', 'kidnap',
  'lactate', 'lolita', 'meet', 'meeting', 'meetup', 'molest',
  'necrophilia', 'nigger', 'pedo', 'pee', 'pegging', 'piss',
  'preteen', 'prostitut', 'rape', 'scat', 'snuff', 'strangl',
  'suffocate', 'teen', 'toilet', 'torture', 'trance', 'unconscious',
  'underage', 'unwilling', 'vomit', 'watersports', 'whipping',
  'young', 'zoophilia'
  // ... full list from Section 10
]);

function containsRestricted(text) {
  const lower = text.toLowerCase();
  for (const word of RESTRICTED_WORDS) {
    if (lower.includes(word)) return true;
  }
  return false;
}
```

**If Claude's response contains restricted words:**
1. Block the message
2. Log the violation
3. Retry Claude with additional instruction: `"Your previous response contained restricted words. Rephrase without using any restricted terms."`
4. Max 2 retries. If still failing, skip this fan's message and log for human review.

### 7.4 Human Handoff Triggers

Per chatbot-brain-v3 Section 8, flag for human review if:
- Self-harm / suicidal mentions
- Threats or aggression
- Minor / age concerns
- Restricted content requests (persistent)
- Fan claims to know model's identity
- Legal threats
- Incoherent / mental health crisis

**Implementation:** Claude includes a `"flag"` field in its JSON response:
```json
{
  "messages": [...],
  "flag": {
    "reason": "self_harm_mention",
    "severity": "critical"
  }
}
```

When flagged:
1. Do NOT send Claude's response
2. Set `fan.flags.humanHandoff = true`
3. Store flag reason
4. Keep conversation light and non-committal (template response)
5. Alert via webhook/notification (future: Telegram alert to Kiefer)

### 7.5 Logging

**Every outbound message is logged to Redis BEFORE being sent via OF API.** This creates an audit trail even if the API call fails.

Log entry includes: timestamp, fan ID, message text, content category, price, hook type, buyer type, Claude latency, fan's total spend at time of message.

---

## 8. Deployment & Configuration

### 8.1 Environment Variables

Add to Railway service:

```env
# Biancawoods chatbot
CHATBOT_BIANCA_ENABLED=false          # Master kill switch
ANTHROPIC_API_KEY=<from MEMORY.md>    # Claude Sonnet 4 key
# OF_API_KEY already exists in service
```

### 8.2 Feature Flag

```js
// In chatbot-engine.js
const BIANCA_ACCOUNT_ID = 'acct_54e3119e77da4429b6537f7dd2883a05';

async function shouldRun() {
  if (process.env.CHATBOT_BIANCA_ENABLED !== 'true') return false;
  const redisEnabled = await redis.get('chatbot:bianca:enabled');
  return redisEnabled === true;
}
```

Both the env var AND the Redis flag must be true. This gives two layers of control:
- `CHATBOT_BIANCA_ENABLED` env var: requires Railway redeploy to change
- `chatbot:bianca:enabled` Redis: toggle via API endpoint instantly

### 8.3 Startup Sequence

```js
// In index.js, after existing startup code:
const biancaChatbot = require('./chatbot-engine');

// Register endpoints
app.get('/chatbot/bianca/status', biancaChatbot.statusHandler);
app.post('/chatbot/bianca/start', biancaChatbot.startHandler);
app.post('/chatbot/bianca/stop', biancaChatbot.stopHandler);
app.get('/chatbot/bianca/fans', biancaChatbot.fansHandler);
app.get('/chatbot/bianca/logs', biancaChatbot.logsHandler);
app.post('/chatbot/bianca/exclude/:fanId', biancaChatbot.excludeHandler);
app.delete('/chatbot/bianca/exclude/:fanId', biancaChatbot.unexcludeHandler);

// Auto-start if enabled
if (process.env.CHATBOT_BIANCA_ENABLED === 'true') {
  biancaChatbot.startChatbot().catch(console.error);
}
```

### 8.4 Cron Schedule Summary

| Loop | Schedule | Cron Expression |
|------|----------|-----------------|
| Message Polling | Every 30s | `setInterval(pollMessages, 30000)` |
| Bump Loop | Every 60m | `cron.schedule('0 * * * *', ...)` |
| Welcome Check | Every 2m | `setInterval(checkNewSubs, 120000)` |
| Retarget Loop | Daily 9 PM AST (01:00 UTC) | `cron.schedule('0 1 * * *', ...)` |
| Fan Profile Cleanup | Daily 8 AM AST (12:00 UTC) | `cron.schedule('0 12 * * *', ...)` |
| Timewaster Check | Every 6 hours | `cron.schedule('0 */6 * * *', ...)` |

### 8.5 Claude System Prompt Construction

The system prompt sent to Claude is built dynamically per-fan-message:

```
[chatbot-brain-v3.md — full content, Sections 1-17]

=== FAN CONTEXT ===
CURRENT TIME: [time in EST]
BUYER TYPE: emotional_chaser
TOTAL SPENT: $57.00 (3 purchases)
LAST PURCHASE: $24 (sexting1_vid1)
ESTIMATED CEILING: $30

=== CONTENT AVAILABLE FOR THIS FAN ===
[dynamically generated based on what fan has/hasn't seen]

=== CONVERSATION HISTORY ===
[last 30 messages]

=== RESPONSE FORMAT ===
Respond with ONLY valid JSON...
```

---

## 9. Flow Diagrams

### 9.1 End-to-End Message Flow

```
Fan sends message on OF
        │
        ▼
OF API stores message
        │
        ▼ (30s poll)
Bot polls GET /chats (unread)
        │
        ▼
┌───────────────────┐
│  EXCLUDED?         │──YES──► Mark read, skip
│  (4 whales +       │
│   custom excludes) │
└───────┬───────────┘
        │ NO
        ▼
┌───────────────────┐
│  DEBOUNCE (3s)     │  Wait for more messages
│  from same fan     │  from this fan
└───────┬───────────┘
        │
        ▼
┌───────────────────┐
│  FETCH CONTEXT     │
│  - Chat history    │
│  - Fan profile     │
│  - Spend data      │
│  - Sexting state   │
│  - Bundle history  │
└───────┬───────────┘
        │
        ▼
┌───────────────────┐
│  CALL CLAUDE       │
│  - System prompt   │
│  - Fan context     │
│  - Content menu    │
│  - Conversation    │
│  - New message     │
└───────┬───────────┘
        │
        ▼
┌───────────────────┐
│  PARSE RESPONSE    │
│  Extract JSON      │
│  { messages: [...] │
│    flag?: {...} }   │
└───────┬───────────┘
        │
        ├── FLAG? ──YES──► Human handoff, template reply
        │
        ▼
┌───────────────────┐
│  SAFETY FILTER     │
│  - Restricted words│
│  - Rate limits     │
│  - Max 1 PPV/turn  │
└───────┬───────────┘
        │
        ├── BLOCKED? ──► Retry Claude (max 2x) or skip
        │
        ▼
┌───────────────────┐
│  EXECUTE           │
│  For each message: │
│  ├─ text → POST    │
│  │   /chats/{uid}/ │
│  │   messages       │
│  └─ ppv →           │
│    1. Fetch vault   │
│    2. POST message  │
│       w/ media+price│
└───────┬───────────┘
        │
        ▼
┌───────────────────┐
│  LOG & UPDATE      │
│  - Conversation log│
│  - Fan profile     │
│  - Pricing data    │
│  - Sexting state   │
│  - Active convos   │
└───────────────────┘
```

### 9.2 Pricing Decision Flow

```
Fan is in conversation, Claude decides to send PPV
        │
        ▼
┌────────────────────────┐
│  CHECK FAN PRICE DATA   │
│  fan.priceHistory       │
│  fan.estimatedCeiling   │
│  fan.purchaseCount      │
└───────┬────────────────┘
        │
        ├── 0 purchases → $15 (first buy, low barrier)
        │
        ├── 1-2 purchases → last price bought at
        │   │  If they bought → next offer +30%
        │   │  If they didn't → same price or lower
        │
        ├── 3+ purchases → push toward ceiling
        │   │  Offer ceiling + 20%
        │   │  If rejected → back to ceiling
        │   │  If 2 rejections at same tier → lock, retest in 2 weeks
        │
        └── Whale pattern (buys everything) →
            Escalate: $15→$24→$38→$54→$75→$100
        
        │
        ▼
  HARD RULES:
  - Never jump > 50% between prices
  - Never go below $10
  - PPV cap: $100 (over $100 → request tips)
  - Log: price, hook, time, result
```

### 9.3 Timewaster Detection Flow

```
Bot checks fan metrics every 6 hours
        │
        ▼
┌──────────────────────────────┐
│  TIMEWASTER SCORE CALC        │
│                                │
│  +1: $0 spent after 14+ days  │
│  +1: Said "can't afford" 2x+  │
│  +1: Asked free content 2x+   │
│  +1: 10+ bot msgs, 0 purchases│
│  +1: Opened 3+ PPVs, bought 0 │
│  +1: Only sends "hi"/"hey"    │
│  +1: Card issues 7+ days      │
└───────┬──────────────────────┘
        │
        ├── Score < 2 → Normal fan, continue
        │
        ├── Score >= 2 → Mark as timewaster
        │   │
        │   ▼
        │   Add to OF "Timewasters" list (1231455148)
        │   Set fan.isTimewaster = true
        │   Reduce: reply every 2-3 msgs, 1 sentence max
        │   No personal PPVs, mass only
        │
        └── Exception: fan < 48 hours old → don't classify yet
```

---

## Appendix A: Key IDs Reference

### OF Lists

| List | ID | Purpose |
|------|----|---------|
| Timewasters | 1231455148 | Exclude from bumps + reduce bot effort |
| Broke/Student | 1232110158 | Exclude from bumps |
| Lowballers | 1258116798 | Exclude from bumps |
| New Subs (Clear every 8AM) | 1239250956 | Welcome loop source |
| $101-$500 Spenders | 1254929000 | Retarget loop source (66 fans) |

### Excluded Fan IDs

| ID | Username | Note |
|----|----------|------|
| 483664969 | @u483664969 | Antonio, $1000+ whale |
| 482383508 | @u482383508 | Brandon, $1000+ whale |
| *(resolve at startup)* | @nij444 | Ferdy, DO NOT MESSAGE |
| *(resolve at startup)* | @tylerd34 | VIP Tyler, $1000+ whale |

### Vault Categories (Key IDs)

| Category | ID | Usage |
|----------|----|-------|
| Bump Message (Jack) | 27535987 | Hourly bump photos |
| GFE Selfies | 26201789 | Free hooks |
| Sexting 1 Pic 1 | 27535606 | Free preview |
| Sexting 1 Vid 1 | 27535609 | $15 PPV |
| Sexting 1 Vid 2 | 27535617 | $24 PPV |
| Sexting 1 Vid 3 | 27535620 | $38 PPV |
| Sexting 1 Vid 4 | 27535623 | $54 PPV |
| Sexting 1 Vid 5 | 27535625 | $75 PPV |
| Bundle 1 (Zebra Bra) | 25942141 | Entry PPV |
| ... | ... | (see content-map.json for full list) |
| **NEVER SELL** | 25942142, 25942144, 27174580, 26278056 | HARD BLOCK |

### Account

| Field | Value |
|-------|-------|
| Account ID | `acct_54e3119e77da4429b6537f7dd2883a05` |
| Username | `biancaawoods` |
| Max Explicitness | topless |

---

## Appendix B: Redis Key Namespace

All biancawoods chatbot keys use the prefix `chatbot:bianca:`:

```
chatbot:bianca:enabled              → boolean
chatbot:bianca:state                → JSON (global state + stats)
chatbot:bianca:fan:{fanId}          → JSON (fan profile)
chatbot:bianca:conv:{fanId}         → JSON array (conversation history, last 50)
chatbot:bianca:log                  → List (conversation log entries, cap 5000)
chatbot:bianca:bump_state           → JSON (bump loop state)
chatbot:bianca:retarget_state       → JSON (retarget loop state)
chatbot:bianca:excluded_fans        → Hash { fanId: reason }
chatbot:bianca:welcomed_fans        → Set of fan IDs
chatbot:bianca:sent_bundles:{fanId} → Set of bundle category IDs
chatbot:bianca:active_convos        → Set of fan IDs (2hr TTL per entry)
chatbot:bianca:vault_cache:{catId}  → JSON array of vault item IDs (1hr TTL)
chatbot:bianca:rate:msg:{hourKey}   → Integer (messages sent this hour)
chatbot:bianca:rate:ppv:{fanId}:{h} → Integer (PPVs sent to fan this hour)
chatbot:bianca:last_poll_ts         → Integer (timestamp)
```

---

*End of spec. Ready for implementation.*
