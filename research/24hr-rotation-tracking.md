# 24hr Pinned Post Rotation Tracking

Tracking daily rotation of which models do 24hr pinned promo posts for @ninacarlson.

## Pattern
- ~10-11 models per day assigned to post 24hr pinned promos
- Posts expire after 24hr
- Different subset each day (rotation through network)
- collegeclubb & collegebesties networks use pinned 24hr posts
- myfriendss network does NOT pin (ghost promos only)

---

## Feb 8, 2026 (Today)

**From Tags:**
- haileyyjoness (Hailey 🌷) - 5hr ago
- aylareed (Ayla 🌼) - 7hr ago
- hadleywillow (Hadley ✨) - 8hr ago
- rowanpierce (Rowan 🌺) - 9hr ago

**From Mentions:**
- nicolemiller (Nicole 🎀) - 9hr ago
- indieellis (Indie💕) - story mention
- elsieporter (Elsie🌙) - 12:42pm (FRESH!)

**Total: 7 models** (may be more - ghost tags deleted)

---

## Feb 7, 2026 (Yesterday)

**From Tags:**
- elleprivate
- addisonbrady
- milareed
- amyjacksonn
- jessyriley
- delilahhill
- stellariccii
- kaylablakely
- carlycox

**From Mentions:**
- zoedalby
- alixsterling

**Total: 11 models**

---

## Rotation Analysis

| Model | Feb 7 | Feb 8 |
|-------|-------|-------|
| elleprivate | ✅ | |
| addisonbrady | ✅ | |
| milareed | ✅ | |
| amyjacksonn | ✅ | |
| jessyriley | ✅ | |
| delilahhill | ✅ | |
| stellariccii | ✅ | |
| kaylablakely | ✅ | |
| carlycox | ✅ | |
| zoedalby | ✅ | |
| alixsterling | ✅ | |
| haileyyjoness | | ✅ |
| aylareed | | ✅ |
| hadleywillow | | ✅ |
| rowanpierce | | ✅ |
| nicolemiller | | ✅ |
| indieellis | | ✅ (story) |

**Key insight:** Zero overlap between days = full rotation through network

---

## For Plush Implementation

### Requirements:
1. Pool of models willing to do 24hr pinned S4S
2. Daily rotation scheduler (assign ~10 models/day per promoted model)
3. API automation:
   - Upload promo image to vault
   - Create post with image + @tag + pin to profile
   - Schedule deletion after 24hr (or use expireDays: 1)
4. Track who promoted whom to ensure fair rotation

### API Flow (per post):
```
POST /api/{account}/posts
{
  "text": "🔥 go follow @targetmodel",
  "mediaFiles": ["vault_id_of_promo_image"],
  "expireDays": 1  // Auto-expires after 24hr
}
```

### Scheduler Logic:
- Total models in network: N
- Models per day per target: 10
- Full rotation cycle: N/10 days
- Each model does ~1 pinned post every N/10 days
