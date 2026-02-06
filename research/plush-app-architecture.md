# Plush Management App — Architecture Spec

*Version: 0.1 (Draft)*
*Created: 2026-02-05*

---

## Vision

A unified platform that handles the entire model lifecycle:
**Recruit → Onboard → Setup → Launch → Manage → Optimize → Scale**

Replaces: Scattered Google Sheets, manual Typeforms, OnlyMonster limitations, Discord coordination chaos.

---

## Core Modules

### 1. MODEL ONBOARDING PORTAL

**Purpose:** Self-service onboarding for new models

#### Features
- **Landing page** with sliding testimonials, earnings graphs, lifestyle imagery
- **Contract signing** (DocuSign/PandaDoc integration or built-in)
- **Typeform-style questionnaire** → auto-populates backend
- **Progress bar** gamification (0% → 100% onboarded)
- **Content upload portal** with checklist:
  - [ ] Selfies (X required)
  - [ ] Full body pics (X required)
  - [ ] Stripping video
  - [ ] Nude/implied nude content
- **Referral tracking** (who recruited whom, bonus triggers)

#### Integrations
- Auto-create plush.la Google account
- Auto-create iluvplush email for OF
- Auto-create OF account with Erotiqa referral
- Notify admin + billing teams

---

### 2. ACCOUNT SETUP AUTOMATION

**Purpose:** Eliminate manual account creation steps

#### Automated Flow
1. Create Google Workspace account (model@plush.la)
2. Create iluvplush email for OF login
3. Create OnlyFans account with referral code → verify referral hit
4. Send model Google Chat credentials
5. Model verifies OF (ID upload)
6. Model inputs W9
7. System changes OF password
8. Provision OnlyMonster CRM access (hide sensitive features)

#### Dashboards
- **Admin view:** All accounts, status, blockers
- **Model view:** "Your setup is X% complete"

---

### 3. MODEL DASHBOARD (PWA)

**Purpose:** Mobile-first app for models to manage their work

#### Core Features
- **Content calendar** — What's due, what's uploaded
- **Weekly checklist** — Bundles, customs, streams
- **Custom request tracker** — Pending, approved, completed
- **Availability scheduler** — When can you stream/create?
- **Earnings view** — This week, this month, all-time
- **Notifications** — "New custom request! $150"
- **Chat with team** — Direct line to their manager

#### PWA Details
- Add to home screen (no app store)
- Works offline for viewing
- Push notifications

---

### 4. SALES TEAM HUB

**Purpose:** Coordinate chatters, managers, launches

#### Features
- **Model pipeline** — From onboarding → launch-ready
- **Team assignment** — Assign chatters, managers per model
- **MMS Sheet integration** — Branding, scripts, sales tracking
- **Launch scheduling** — Set go-live dates
- **Performance metrics** — Per chatter, per model
- **Custom request queue** — Fan asks → model approves → team follows up

#### Views
- **Head Manager:** All models, all teams
- **Manager:** Their assigned models
- **Chatter:** Their assigned conversations

---

### 5. TRAFFIC & PROMO AUTOMATION

**Purpose:** Automate internal cross-promotion

#### Girls Groups Management
- Create/manage groups of 15 models
- Auto-rotate friends lists (15 orders)
- Auto-rotate pinned posts (24hr cycles)
- Auto-schedule shoutouts (12/day, 12am-11pm)
- **API integration** for tagging automation

#### External Traffic
- **Gig Social integration** — Buy/schedule shoutouts
- **Tracking link generator** — Per-campaign attribution
- **Landing page builder** — collegebesties-style pages
- **Analytics** — Cost per subscriber, ROI per source

---

### 6. MASS MESSAGING ENGINE

**Purpose:** Optimize PPV mass messages

#### Features
- **Scheduling** — Set times (10:30am, 12:30pm, etc.)
- **A/B testing** — Test captions, prices, media
- **Segmentation** — Whales vs cheap PPV vs new fans
- **AI suggestions** — Optimal timing, pricing, captions
- **Performance tracking** — Opens, purchases, revenue

#### Integration
- OnlyFansAPI.com for sending
- Webhooks for real-time stats

---

### 7. STREAMING COORDINATOR

**Purpose:** Manage Chaturbate streaming schedules

#### Features
- **Schedule manager** — 4hr × 5 days/week targets
- **CB account setup** automation
- **cbhours.com integration** — Track actual vs target
- **Notifications** — "Stream starting in 30 min"
- **DMCA monitoring** — Alert on leaks post-stream

---

### 8. ANALYTICS & REPORTING

**Purpose:** Single source of truth for performance

#### Dashboards
- **Agency overview** — Total revenue, active models, trends
- **Per-model** — Revenue breakdown, fan growth, engagement
- **Per-traffic-source** — Which promos work?
- **Per-chatter** — Who's selling best?

#### Reports
- Daily revenue summary
- Weekly model performance
- Monthly agency P&L
- Churn analysis

---

### 9. AI LAYER (Future)

**Purpose:** AI-powered optimization

#### Capabilities
- **Chat assistance** — Suggest responses to chatters
- **Mass message optimization** — Auto-generate captions
- **Fan qualification** — Route high-value fans to humans
- **Content suggestions** — What performs best?
- **Churn prediction** — Who's about to leave?

---

## Technical Architecture

### Frontend
- **React/Next.js** — Web app
- **React Native** or **PWA** — Mobile for models
- **Tailwind CSS** — Styling
- **shadcn/ui** — Component library

### Backend
- **Node.js/Express** or **Python/FastAPI**
- **PostgreSQL** — Primary database
- **Redis** — Caching, queues
- **n8n** — Workflow automation (connect to OnlyFansAPI)

### Integrations
- **OnlyFansAPI.com** — OF operations
- **Google Workspace API** — Account creation
- **DocuSign/PandaDoc** — Contracts
- **Typeform API** — Questionnaires (or build native)
- **Daisio** — Payment splits
- **Discord webhook** — Team notifications
- **Telegram bot** — Model notifications

### Infrastructure
- **Vercel** or **AWS** — Hosting
- **Cloudflare** — CDN, security
- **S3** — Media storage

---

## MVP Scope (Phase 1)

Focus on highest-impact, quickest-to-build:

### Must Have
1. **Model onboarding portal** — Landing + form + contract
2. **Content upload tracker** — Checklist with progress
3. **Basic dashboard** — Earnings, schedule, tasks
4. **Girls group automation** — API-based tagging

### Nice to Have
1. Mass message scheduling
2. Custom request tracker
3. Analytics dashboard

### Later
1. AI chat assistance
2. Full Chaturbate integration
3. Phone farm management

---

## Phone Farm Research (Separate Doc Needed)

For dating app traffic:
- Hardware: Used phones (iPhone 6s+, Pixel 3a+)
- Profiles: AI-generated or real model photos
- Automation: Appium, Android ADB
- Proxies: Mobile proxies (4G/5G)
- Scale: 10-50 phones per rack

This is a separate project — needs dedicated research.

---

## Next Steps

1. [ ] Validate architecture with Kiefer
2. [ ] Prioritize MVP features
3. [ ] Design database schema
4. [ ] Build onboarding portal prototype
5. [ ] Test OnlyFansAPI integration
6. [ ] Spec phone farm requirements

---

*This doc will evolve. Version control everything.*

