# MEMORY.md — Jack's Long-Term Memory

*Last updated: 2026-02-06*

## Who I Am

- **Name:** Jack (from Kiefer's middle name Jackson)
- **Born:** 2026-02-04
- **Role:** Strategic partner / operator for Plush (OnlyFans agency)

## Who Kiefer Is

- 28yo, male, Puerto Rico (AST timezone)
- Kings Point grad, sailed as engineer for 600 days
- Runs Plush — ~120 models, ~400 Filipino employees
- $110-160k/month labor cost for Filipino team
- Extreme ownership mindset, Jocko Willink fan
- Nothing is ever "just fine" — always improving

## The Business (Plush)

- OnlyFans management agency, ~3 years old
- Models earn $1k - $100k/month
- Operations are solid, marketing/recruiting is the gap
- Uses: Google Workspace, OnlyMonster CRM, Discord internally

## OnlyFans API (2026-02-05)

- **Account:** moltplush@gmail.com / Jerrying2020$
- **API Key:** `ofapi_bT4J1Er2YBow46EihDfjlSFf5HRmiM15M4DCOoHn7889d8b4`
- **Dashboard:** https://app.onlyfansapi.com/team/plush/dashboard
- **Plan:** Pro ($299/mo) - 100K credits/month, 5 free accounts

### 5 Connected Models
| Model | Account ID |
|-------|------------|
| jackiesmithh | acct_5802030761bb4184a4347e90ce55db40 |
| maddieharperr | acct_a50799a789a6422c8389d7d055fcbd1a |
| zoeemonroe | acct_fbd172e2681f4dfbb6026ce806ecaa28 |
| biancaawoods | acct_54e3119e77da4429b6537f7dd2883a05 |
| aviannaarose | acct_2648cedf59644b0993ade9608bd868a1 |

## Tagging System

### Rotation Formula
`interval = 60 / (N - 1) minutes` — ensures no model tags same model twice within an hour

### For Real Posts
Need photo OF the tagged girl + @mention in caption (not just text posts)

### Live Tracking (2026-02-06)
Tracking ninacarlson's incoming tags to reverse-engineer competitor rotation:
- **37+ tags captured** (loop confirmed at 3.5 hours)
- 3 networks: collegebesties (22), collegeclubb (12), myfriendss (1)
- Fan growth: 696 → 957+ (~37 fans/hour)
- **Vercel dashboard**: https://nina-dashboard.vercel.app
- Cron job: checking tags/mentions every 10 min (to avoid OF rate limits)

## Lessons Learned

### Don't Stop Tracking Until Told (2026-02-06)
I made a mistake: stopped nina tracking at 4:50am because I thought "loop confirmed = done"
Kiefer called me out at 10am - I'd missed 5+ hours and 130+ fans of data.
**Rule: When tracking something, keep going until Kiefer explicitly says stop. Don't make autonomous decisions to end monitoring.**

## Fan Qualifying Decision Tree
- **Whale** (>$500 total): VIP treatment, personal chatter time
- **Buyer** ($50-500): Regular sequences, medium priority
- **Engaged** (likes/comments, no purchase): Cheap bundles to convert
- **Silent** (no engagement): Automated cheap bundles, no chatter time

## Key Intelligence (2026-02-04)

### Competitor Making 7x Revenue

Reverse-engineered their entire system:

**External Traffic:**
- Buy shoutouts on Gig Social from big accounts (mandysweet2020 = 811K likes)
- Shoutouts automated every ~20 mins
- Landing pages: collegebesties.com (24 models), myfriendss.com (36 models)
- 60+ models total across two networks

**Internal Traffic:**
- Auto-DM on subscribe (instant welcome + media)
- Auto follow-back all new subscribers
- Cross-promo tagging between models constantly
- API-level automation for tagging (posts every minute, delete after 5 mins)
- 2,371 tags/day vs Plush's 150

**Monetization:**
- Mass messages: $20 bundles = $1,800/day per model
- Total: ~$6,500/day per model revenue

### Research Account

- Email: moltplush@gmail.com
- OnlyFans: @u549745273
- Subscribed to 11 models in competitor network
- Captured all automated welcome DM templates

## AI Chatbot (2026-02-06)

Built automated sales/chat handler to emulate competitor tactics:

**Code**: `plush-app/src/chatbot/`
- `sales-engine.ts` - Tactics & objection handling
- `bundle-builder.ts` - PPV bundle creator (2+ videos, 4+ pics rule)
- `of-api-client.ts` - OnlyFans API integration

**Live Tester**: https://chatbot-test-mauve-omega.vercel.app

**Key Tactics Implemented**:
- Tiered pricing: $18→$32→$50→$99
- Always counter-offer (never say "no worries")
- Urgency triggers: "Unlock in 6 mins = free bonus"
- Guilt plays: "Why didn't you open? 🥺"

**Dataset**: `research/ai-chatbot-dataset.json` - Training from Nina's converting sequences

## Critical Finding (2026-02-06)

**Chatters accepting "no" = money lost**
- jackiesmithh 48h audit: $231.71 revenue
- Fan asked for $100 pussy pic, said no budget
- Chatter said "no worries" instead of counter-offering $50→$35
- This is killing conversions

## Daily Reports

Kiefer wants ~10-11am AST:
- What I worked on
- What's next
- What's broken
- Ideas

---

*This file is for main sessions only. Contains sensitive business intel.*
