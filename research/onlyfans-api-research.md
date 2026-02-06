# OnlyFans API Research

*Compiled: 2026-02-05*

## Executive Summary

Two main paths to automate OnlyFans operations:
1. **OnlyFansAPI.com** — Commercial managed service (recommended for speed)
2. **UltimaScraperAPI** — Open source self-hosted (recommended for control/cost)

---

## Option 1: OnlyFansAPI.com (Commercial)

**Website:** https://onlyfansapi.com
**Console:** https://app.onlyfansapi.com
**Docs:** https://docs.onlyfansapi.com

### Why They're Legit
- 5+ years on market
- Zero accounts banned
- 99.98% uptime claimed
- Millions of requests processed daily
- Dedicated proxy infrastructure

### Key Capabilities (200+ endpoints)

#### Mass Messaging
- Send mass messages to lists/users
- Schedule messages
- View stats (send count, view count)
- Unsend/delete messages

#### Posts
- Create/send posts
- Schedule posts
- Update/delete posts
- Pin/unpin posts
- Archive posts
- Post statistics

#### Fan Management
- List all/active/expired fans
- User lists (segments)
- Custom names for fans
- Tracking links
- Free trial links with revenue attribution

#### Analytics
- Earnings breakdown (tips, messages, posts, streams)
- Subscriber metrics
- Profile visitors
- Transaction history
- Chargeback tracking

#### Automation Features
- Webhooks (real-time events)
- n8n workflow integration
- Make.com integration
- Zapier integration
- AI Agent Skill (for AI assistants)

### Pricing Structure
- Credit-based system
- 1 credit per API request (uncached)
- 3 credits per MB for media upload/download
- 1 credit per 100 webhook events
- Cached public endpoints = FREE
- Scale discounts: +10,000 credits per additional account

### Integration Options
1. **Direct API** — REST API with auth token
2. **n8n Node** — Visual workflow automation
3. **AI Skill** — Let AI agents query OF data directly

---

## Option 2: UltimaScraperAPI (Open Source)

**GitHub:** https://github.com/UltimaHoarder/UltimaScraperAPI
**Docs:** https://ultimahoarder.github.io/UltimaScraperAPI/
**License:** AGPL-3.0 (must share source if distributing)

### What It Does
- Python async framework
- Multi-platform: OnlyFans (stable), Fansly, LoyalFans
- Authentication with cookies + x-bc token
- User/post/message retrieval
- Media downloads (including DRM)
- WebSocket support for real-time
- Redis caching option

### Technical Requirements
- Python 3.10+
- Redis (optional, for caching)
- FFmpeg (for DRM content)
- Widevine CDM files (for DRM)
- Proxies (recommended for scale)

### Pros
- Free (no per-request cost)
- Full control over infrastructure
- Can modify/extend as needed
- No external dependency

### Cons
- Need to maintain yourself
- Must handle rate limiting
- Must manage proxies
- Must handle session cookies
- Higher dev investment
- AGPL license restrictions if distributing

---

## Competitor's Likely Stack

Based on the tagging behavior (50 tags/50 mins, auto-delete after 5 mins):

**Most likely:** OnlyFansAPI.com or similar service
- Explains the consistency
- Explains the speed (1 post/min)
- Explains no bans

**Workflow:**
1. List of models in network (50+)
2. Automated post creation with tags
3. 5-minute timer → auto-delete
4. Rotate through all models continuously
5. Repeat 24/7

---

## Recommended Approach for Plush

### Phase 1: Validation (Week 1-2)
1. Sign up for OnlyFansAPI.com trial
2. Connect 1-2 test accounts
3. Build proof-of-concept tagging automation
4. Validate it works without bans

### Phase 2: Scale (Week 3-4)
1. Connect all Plush models
2. Build girls group rotation automation
3. Implement mass message scheduling
4. Set up analytics dashboard

### Phase 3: Full Integration (Month 2+)
1. Integrate with Plush management app
2. Build model dashboard with OF data
3. Automate onboarding account creation
4. AI-powered chat optimization

---

## API Endpoints Needed for Competitor Replication

### For Tagging Automation
```
POST /posts - Create post with tags
DELETE /posts/{id} - Delete post after timer
GET /users - Get list of models to tag
```

### For Mass Messaging
```
POST /mass-messages - Send to lists
GET /mass-messages/stats - View performance
PUT /mass-messages - Update scheduled
```

### For Analytics
```
GET /statistics/earnings - Revenue data
GET /fans/active - Active subscriber list
GET /tracking-links - Promo link performance
```

---

## Cost Estimation

### OnlyFansAPI.com (rough estimate)
- Tagging: 50 models × 24 hours × 60 posts = 72,000 requests/day
- Mass messages: 5 messages × 120 models = 600 requests/day
- Analytics: ~1,000 requests/day
- **Total: ~75,000 requests/day = 2.25M requests/month**

Need to check actual pricing tiers.

### Self-hosted (UltimaScraperAPI)
- Server: ~$50-200/month
- Proxies: ~$100-500/month (rotating residential)
- Dev time: Significant initial investment
- Ongoing maintenance

---

## Next Steps

1. [ ] Sign up for OnlyFansAPI.com
2. [ ] Get actual pricing for our scale
3. [ ] Test with 1 account
4. [ ] Build tagging POC
5. [ ] Document results

