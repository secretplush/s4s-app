# S4S Automation App - Technical Specification

**Version:** 1.0 Draft
**Date:** 2026-02-08
**Scale:** 15 models to start

---

## Overview

Browser-based web application to manage cross-promotional S4S (shoutout-for-shoutout) automation across OnlyFans models using the OnlyFans API.

---

## Core Features

### 1. Model Management

**Per Model Data:**
```
- OF Username (@handle)
- Display Name
- OnlyFans API Account ID
- API Connection Status
- Promo Images (multiple, with vault IDs per target model)
- Pre-made Captions (with @tag placeholder)
```

**Model Onboarding Flow:**
1. Input OF username
2. Connect via OnlyFans API (account_id)
3. Upload promo image(s)
4. Create caption templates: "🔥 go check out {tag} 💕"

---

### 2. Vault Asset Management (KEY FEATURE)

**The Upload-Once Strategy:**
When adding a new promo image for Model A:
1. Upload image to Model B's account via API
2. Create post with "@modelA" in caption
3. Immediately delete post
4. Image stays in Model B's vault
5. Store vault_id in database

**Database Schema:**
```
promo_assets:
  - id
  - source_model_id (who the promo is FOR)
  - target_model_id (whose vault it's stored IN)
  - vault_media_id (OF vault ID)
  - image_hash (to detect duplicates)
  - uploaded_at
  - performance_score (calculated from analytics)
  - is_active (currently in rotation)
```

**Benefits:**
- No re-uploading = saves API credits
- Can A/B test promo images
- Track which image performs best per model
- Instant swap between promo variants

---

### 3. Rotation Systems

#### A. Ghost Tags Rotation (EXACTLY LIKE COMPETITOR)
**Behavior:** Post appears → deleted after 5 minutes
**Purpose:** Continuous visibility without cluttering feed

**Timing Math (15 models):**
```
- Each model has 14 targets to tag
- Each target gets tagged once per hour (no spam)
- Interval between posts FROM each model: 60 / 14 = 4.29 minutes
- Interval between posts TO each model: also 4.29 minutes
- Deletion delay: 5 minutes after posting
- Operation: 24/7 continuous
```

**Example Schedule for Model A:**
```
:00:00 - A tags B → delete at :05:00
:04:17 - A tags C → delete at :09:17
:08:34 - A tags D → delete at :13:34
:12:51 - A tags E → delete at :17:51
... (continues through all 14 targets)
:59:43 - A tags O → delete at :04:43 (next hour)
:00:00 - Cycle repeats (A tags B again)
```

**Network-Wide View:**
```
At any moment: ~15 ghost tags exist across the network
Each model receives a tag every ~4.3 minutes from a different model
Tags overlap briefly (post exists 5 min, new one every 4.3 min)
Total posts/hour: 15 models × 14 tags = 210 posts/hour
Total deletes/hour: 210 deletes/hour
```

**Flow:**
1. On startup: calculate full rotation matrix (who tags whom, when)
2. Stagger model start times to distribute load
3. Every 4.29 min per model: create post with promo image + @tag caption
4. Queue deletion for 5 min later
5. Log everything
6. Handle failures gracefully (retry once, then skip)

#### B. 24-Hour Pinned Posts Rotation (EXACTLY LIKE COMPETITOR)
**Behavior:** Post stays pinned to profile for 24hr, auto-expires
**Purpose:** Sustained visibility for profile visitors (not just feed)

**Competitor Pattern (observed):**
```
- collegeclubb & collegebesties networks: USE pinned 24hr posts
- myfriendss network: does NOT use pinned (ghost only)
- Each model has 1-3 pinned promo posts at any time
- Posts are pinned AND have expireDays: 1
```

**Our Config (15 models):**
```
- Each model pins promos for 2-3 other models
- Rotate daily so every model promotes every other over ~5-7 days
- API: create post with { expireDays: 1, isPinned: true }
- Schedule: new batch at 6am daily
```

**Rotation Matrix Example:**
```
Day 1: A pins [B,C,D], B pins [E,F,G], C pins [H,I,J], ...
Day 2: A pins [E,F,G], B pins [H,I,J], C pins [K,L,M], ...
... (cycle ensures full coverage)
```

**Flow:**
1. Daily at 6am: calculate today's pinned assignments
2. For each assignment: create post with promo image + @tag
3. API params: `{ text: "caption @target", mediaFiles: [vault_id], expireDays: 1 }`
4. Mark assignment complete
5. Posts auto-expire (no deletion needed)

#### C. Friends List Rotation
**Behavior:** Reorder friends list daily for visibility
**Purpose:** Featured models appear at top of "Friends" section

**Config:**
```
- reorder_time: daily (e.g., 6am)
- featured_count: top 5-10 positions
- rotation_strategy: round-robin or performance-based
```

**API Endpoint:** Need to verify if OF API supports friends list reordering

#### D. Mass Message Shoutouts (VA Schedule)
**Behavior:** Generate human-readable schedule for VAs
**Purpose:** Story posts require manual execution (API can't do clickable tags)

**Output Format:**
```
Daily VA Schedule - Feb 8, 2026
================================
Model: @jessicasmith
  10:00 AM - Post story tagging @emilyjones
  2:00 PM - Post story tagging @sarahlee
  6:00 PM - Post story tagging @amywilson

Model: @emilyjones
  10:30 AM - Post story tagging @jessicasmith
  ...
```

---

### 4. Analytics Dashboard

**Per Model Metrics:**
```
- Total Fans (current)
- Fans Gained (today / 7d / 30d / all-time)
- Total Earnings (today / 7d / 30d / all-time)
- Average Daily Earnings
- Fan LTV = Lifetime Earnings / Lifetime Fans
- Subs Per Day (average)
```

**Per Promo Image Metrics:**
```
- Times Used
- Estimated Fan Gain (when this image was in rotation)
- Performance Score (relative to other images for same model)
```

**Network Metrics:**
```
- Total S4S Posts (today / all-time)
- API Credits Used
- Rate Limit Status
```

---

### 5. Rate Limit Management

**OnlyFans API Limits (from docs):**
- 5000 requests/minute
- No daily limit (removed)

**Strategy:**
- Queue all API calls
- Process queue with configurable delay (e.g., 200ms between calls)
- Track credit usage
- Alert when approaching limits
- Prioritize time-sensitive operations (ghost tag deletions)

---

## Technical Architecture

### Frontend
- **Framework:** React or Vue.js
- **Hosting:** Vercel / Netlify (static)
- **Auth:** Simple password protection (single user)

### Backend
- **Runtime:** Node.js
- **Framework:** Express or Fastify
- **Database:** SQLite (local) or PostgreSQL (hosted)
- **Scheduler:** node-cron for rotation timing
- **Queue:** Bull or simple in-memory queue

### Deployment Options
1. **Local:** Run on your Mac (node server + browser UI)
2. **Hosted:** Deploy to VPS (DigitalOcean, Railway, etc.)

---

## Database Schema

```sql
-- Models in the network
CREATE TABLE models (
  id INTEGER PRIMARY KEY,
  username TEXT UNIQUE NOT NULL,
  display_name TEXT,
  of_account_id TEXT NOT NULL,
  api_connected BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Promo images stored in vaults
CREATE TABLE promo_assets (
  id INTEGER PRIMARY KEY,
  source_model_id INTEGER REFERENCES models(id),  -- who the promo is FOR
  target_model_id INTEGER REFERENCES models(id),  -- whose vault it's IN
  vault_media_id TEXT NOT NULL,
  image_url TEXT,  -- local reference or CDN
  uploaded_at TIMESTAMP DEFAULT NOW(),
  is_active BOOLEAN DEFAULT TRUE,
  performance_score REAL DEFAULT 0
);

-- Caption templates
CREATE TABLE captions (
  id INTEGER PRIMARY KEY,
  model_id INTEGER REFERENCES models(id),
  template TEXT NOT NULL,  -- e.g., "🔥 check out {tag} 💕"
  use_count INTEGER DEFAULT 0
);

-- Promotion log (every S4S action)
CREATE TABLE promotion_log (
  id INTEGER PRIMARY KEY,
  promoter_model_id INTEGER REFERENCES models(id),
  promoted_model_id INTEGER REFERENCES models(id),
  promo_asset_id INTEGER REFERENCES promo_assets(id),
  promotion_type TEXT,  -- 'ghost_tag', 'pinned_24hr', 'story_manual'
  post_id TEXT,  -- OF post ID (for deletion tracking)
  posted_at TIMESTAMP,
  deleted_at TIMESTAMP,
  status TEXT  -- 'pending', 'posted', 'deleted', 'failed'
);

-- Daily analytics snapshot
CREATE TABLE daily_stats (
  id INTEGER PRIMARY KEY,
  model_id INTEGER REFERENCES models(id),
  date DATE,
  fans_count INTEGER,
  fans_gained INTEGER,
  earnings REAL,
  subs_count INTEGER
);

-- 24hr rotation assignments
CREATE TABLE daily_assignments (
  id INTEGER PRIMARY KEY,
  date DATE,
  promoter_model_id INTEGER REFERENCES models(id),
  promoted_model_id INTEGER REFERENCES models(id),
  assignment_type TEXT,  -- 'pinned_24hr', 'story_manual'
  completed BOOLEAN DEFAULT FALSE
);

-- Ghost tag rotation schedule (pre-calculated)
CREATE TABLE ghost_schedule (
  id INTEGER PRIMARY KEY,
  promoter_model_id INTEGER REFERENCES models(id),
  promoted_model_id INTEGER REFERENCES models(id),
  minute_offset INTEGER,  -- 0-59, when in the hour to post
  second_offset INTEGER,  -- 0-59, precise timing
  is_active BOOLEAN DEFAULT TRUE
);

-- Ghost tag execution log
CREATE TABLE ghost_log (
  id INTEGER PRIMARY KEY,
  schedule_id INTEGER REFERENCES ghost_schedule(id),
  post_id TEXT,
  posted_at TIMESTAMP,
  scheduled_delete_at TIMESTAMP,
  deleted_at TIMESTAMP,
  status TEXT  -- 'posted', 'deleted', 'delete_failed'
);
```

---

## UI Wireframes

### Dashboard
```
┌─────────────────────────────────────────────────────────┐
│  S4S Manager                          [Settings] [Logs] │
├─────────────────────────────────────────────────────────┤
│                                                         │
│  Network Status: 15 models active                       │
│  API Credits: 89,234 remaining                          │
│  Ghost Tags Today: 847                                  │
│  24hr Posts Active: 42                                  │
│                                                         │
│  ┌─────────────────────────────────────────────────┐   │
│  │ Quick Stats (Last 24h)                          │   │
│  │ Total Fans Gained: +312                         │   │
│  │ Total Earnings: $4,821                          │   │
│  │ Best Performer: @jessicasmith (+47 fans)        │   │
│  └─────────────────────────────────────────────────┘   │
│                                                         │
│  [Start Rotations] [Pause All] [Generate VA Schedule]  │
│                                                         │
└─────────────────────────────────────────────────────────┘
```

### Model Manager
```
┌─────────────────────────────────────────────────────────┐
│  Models                                    [+ Add Model]│
├─────────────────────────────────────────────────────────┤
│                                                         │
│  ┌──────┐ @jessicasmith                                │
│  │ IMG  │ Jessica Smith                                │
│  │      │ Fans: 2,341 | LTV: $8.42 | Today: +12       │
│  └──────┘ [Edit] [Promo Images] [Captions] [Stats]    │
│                                                         │
│  ┌──────┐ @emilyjones                                  │
│  │ IMG  │ Emily Jones                                  │
│  │      │ Fans: 1,892 | LTV: $6.21 | Today: +8        │
│  └──────┘ [Edit] [Promo Images] [Captions] [Stats]    │
│                                                         │
│  ... (15 models)                                       │
│                                                         │
└─────────────────────────────────────────────────────────┘
```

### Promo Image Manager
```
┌─────────────────────────────────────────────────────────┐
│  Promo Images for @jessicasmith           [+ Upload]   │
├─────────────────────────────────────────────────────────┤
│                                                         │
│  ┌──────┐ promo_v1.jpg                    ★ ACTIVE    │
│  │ IMG  │ Uploaded: Feb 1, 2026                        │
│  │      │ Performance: 94/100                          │
│  │      │ Vault Status: ✓ All 14 models               │
│  └──────┘ [Set Active] [View Vault IDs] [Delete]      │
│                                                         │
│  ┌──────┐ promo_v2.jpg                    ○ INACTIVE  │
│  │ IMG  │ Uploaded: Feb 5, 2026                        │
│  │      │ Performance: 78/100                          │
│  │      │ Vault Status: ✓ All 14 models               │
│  └──────┘ [Set Active] [View Vault IDs] [Delete]      │
│                                                         │
└─────────────────────────────────────────────────────────┘
```

---

## API Endpoints (Internal)

```
POST   /api/models              - Add new model
GET    /api/models              - List all models
PUT    /api/models/:id          - Update model
DELETE /api/models/:id          - Remove model

POST   /api/models/:id/promo    - Upload promo image (triggers vault distribution)
GET    /api/models/:id/promo    - List promo images
PUT    /api/promo/:id/activate  - Set as active promo

POST   /api/rotations/ghost/start    - Start ghost tag rotation
POST   /api/rotations/ghost/stop     - Stop ghost tag rotation
POST   /api/rotations/pinned/assign  - Generate daily 24hr assignments
GET    /api/rotations/schedule       - Get VA schedule (story posts)

GET    /api/analytics/network        - Network-wide stats
GET    /api/analytics/model/:id      - Per-model stats
GET    /api/analytics/promo/:id      - Per-promo-image stats

GET    /api/logs                     - Activity logs
GET    /api/status                   - System status, rate limits
```

---

## Implementation Phases

### Phase 1: Foundation (Week 1)
- [ ] Database schema setup
- [ ] Model CRUD
- [ ] OnlyFans API integration (auth, basic calls)
- [ ] Simple UI shell

### Phase 2: Vault Management (Week 2)
- [ ] Promo image upload
- [ ] Vault distribution (upload to all target vaults)
- [ ] Vault ID tracking
- [ ] Image activation/deactivation

### Phase 3: Ghost Tags (Week 3)
- [ ] Rotation scheduler
- [ ] Post creation with @tag
- [ ] 5-min deletion timer
- [ ] Interval calculation (60 / N-1)

### Phase 4: 24hr Pinned Posts (Week 4)
- [ ] Daily assignment algorithm
- [ ] Post creation with expireDays: 1
- [ ] Assignment tracking
- [ ] Fair rotation logic

### Phase 5: Analytics (Week 5)
- [ ] Daily stats collection
- [ ] Fan LTV calculation
- [ ] Promo performance scoring
- [ ] Dashboard visualizations

### Phase 6: Polish (Week 6)
- [ ] VA schedule generator
- [ ] Rate limit monitoring
- [ ] Error handling & alerts
- [ ] Documentation

---

## Open Questions

1. **Friends List API** - Does OF API support reordering friends list? Need to verify endpoint.

2. **Webhook Support** - Can we get real-time notifications for new fans/earnings, or need to poll?

3. **Multi-user** - Just Kiefer, or will other team members need access?

4. **Backup Strategy** - How to handle API downtime or rate limit exhaustion?

---

## Next Steps

1. Confirm this spec with Kiefer
2. Set up project repo
3. Begin Phase 1 implementation
