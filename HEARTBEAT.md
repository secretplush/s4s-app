# HEARTBEAT.md - Nina Tracking

## 🔴 ACTIVE: Bidirectional S4S Monitoring (Every 4.5 min)
**Tracking ACTIVE as of 2026-02-07**

### CHECK 1: Inbound Tags
- Go to /my/notifications/tags
- Capture any NEW tags (username, display_name, timestamp)
- Skip if already in tracking JSON
- Update ninacarlson-tracking.json

### CHECK 2: Inbound Mentions  
- Go to /my/notifications/mentioned
- Capture any NEW mentions (including story mentions)
- Update tracking JSON

### CHECK 3: Outbound - Nina's Profile Posts
- Go to /ninacarlson
- Check recent posts for @mentions of other models
- Log who Nina is tagging (bidirectional tracking)
- Update nina_outbound_tags in tracking JSON

### CHECK 4: Outbound - Mass Messages
- Go to /my/statistics/engagement/messages (30-day view)
- Check for S4S shoutout messages (sent to lists, tagging other models)
- Log model tagged, time sent, list targeted
- Update nina_outbound_mass in tracking JSON

### Current Stats (2026-02-08 11:08pm)
- **Fan growth:** 696 → 2,692 (+1,996 fans)
- **Inbound tags captured:** 178
- **Inbound mentions:** 35+
- **Unique models in rotation:** 90+
- **24hr rotation tracking:** research/24hr-rotation-tracking.md

### Rules
- DO NOT STOP until Kiefer says so
- If rate limited, note it and retry next heartbeat
- Focus on NEW data only - skip already-tracked items

## Tracking Files
- Main: `research/ninacarlson-tracking.json`
- Dashboard: https://nina-dashboard.vercel.app

## Notes
- Browser profile "openclaw" logged in AS @ninacarlson
- Ghost tags deleted within ~5 min
- Pinned 24hr posts from collegeclubb/collegebesties networks
- myfriendss uses ghost promos only (not pinned)
