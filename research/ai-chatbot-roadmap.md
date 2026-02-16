# AI Chatbot Roadmap — Plush Models

**Date:** February 16, 2026  
**Status:** Phase 1 prototype deployed (milliexhart test)

---

## Architecture: Three-Layer System

### Layer 1: AI Bot (Volume Handler)
- Handles ALL new fans automatically
- Bundle sales, basic flirting, qualifying
- Runs 24/7, never misses a message
- Targets the 99% of fans who are low/no spend

### Layer 2: Whale Handoff (Detection + Flagging)
- Bot detects whale signals in real-time:
  - Tip > $20
  - 2+ purchases in one session
  - Emotional language ("I love", "you're special", "can we meet")
  - Custom content requests
  - Repeated re-engagement after going silent
- Flags to human chatter via Discord: "🐋 WHALE ALERT — [model] fan [name] just spent $50 in 10 min"
- Smooth handoff — bot stops responding, chatter picks up seamlessly

### Layer 3: AI Review (Quality Control)
- Monitors chatter-whale conversations passively
- Scores against proven playbook (winterclaire GFE tactics, Nina scripts)
- Flags mistakes to Discord:
  - "⚠️ Chatter said 'no worries' to a $200 spender"
  - "⚠️ Fan asked for content 2 hours ago, no response"
  - "⚠️ Fan said 'I love you' — switch to GFE mode, don't push PPV"
  - "💡 Fan expressed budget concern — counter-offer at 50% price"
- Daily summary report per model

---

## What We Need From Kiefer's Team

### 1. Vault Content Descriptions (1 day task)
For each model's vault, team provides:
- **Bundle name** → **Content level** (implied/topless/fully nude/XXX)
- **Bundle name** → **Short description** ("4 bikini selfies + strip tease video")
- **Sexting set order** → Which items go first, second, third (they're already in order)
- **Price per item** for sexting drip sets

**Format:** Simple spreadsheet or even just notes in each vault folder name.  
Example: `💰 Bundle 3 - Topless - 4 selfies + strip video + 8 topless pics - $14.99`

### 2. Model Branding / Tone (per model)
For each model the bot will chat as:
- **Name, age, location** (what fans are told)
- **Personality** (bubbly/shy/bold/bratty/sweet)
- **Texting style** (lots of emojis? Typos? Long messages? Short?)
- **Content boundaries** (does she "do" fully nude? B/G? Customs?)
- **Signature phrases** or things she says often
- **Backstory** (college student? Fitness model? Girl next door?)

### 3. Discord Access
- Bot needs webhook URL for the sales escalation / chatter notification channel
- Separate channel for whale alerts vs audit findings
- Per-model channels or one unified?

---

## Implementation Phases

### Phase 1: Bundle Sales Bot ✅ (Current — milliexhart test)
- [x] Webhook receives fan messages
- [x] Claude generates responses with playbook tactics
- [x] Vault awareness — knows what content exists
- [x] Fan context — checks spending history
- [x] Natural response delays
- [ ] **Testing with sadieeblake → milliexhart** (in progress)
- [ ] Fix CWM categorization (it's welcome message, not explicit)
- [ ] Validate PPV sending actually works end-to-end

### Phase 2: Smart Qualification + Handoff
- [ ] Whale detection algorithm (spending velocity, emotional signals, tip patterns)
- [ ] Discord webhook integration for whale alerts
- [ ] Handoff protocol — bot stops, chatter picks up, fan doesn't notice
- [ ] Fan tagging — bot auto-adds fans to OF lists (Whale, Buyer, Silent, etc.)
- [ ] Track conversion funnel: message → engagement → first PPV → repeat buyer → whale

### Phase 3: Multi-Model Rollout
- [ ] Template system — one bot, per-model personality configs
- [ ] Content descriptions loaded from team spreadsheet
- [ ] Deploy to 5 pilot models (mix of high/low LTV)
- [ ] A/B test: bot vs human chatters on matched fan segments
- [ ] Measure: revenue per fan, response time, conversion rate

### Phase 4: Chatter Review System
- [ ] Passive monitoring of human chatter conversations
- [ ] AI scoring against playbook (winterclaire GFE tactics as benchmark)
- [ ] Discord alerts for mistakes and opportunities
- [ ] Daily/weekly performance reports per chatter
- [ ] Leaderboard: which chatters convert best, which need training

### Phase 5: Full Auto + Sexting Drip
- [ ] Sexting set automation — drip content piece by piece with escalating prices
- [ ] Real-time arousal detection (message frequency, explicit language, emoji patterns)
- [ ] Dynamic pricing — adjust PPV price based on fan's demonstrated willingness
- [ ] Custom request handling (or smart flagging to human)
- [ ] Voice message integration (if OF API supports)

---

## Key Insights From Research (Feb 16 Analysis)

### What Makes Fans Spend (winterclaire — $57.37 LTV)
1. **GFE first, sales second** — 70% relationship talk, 30% selling
2. **"For your eyes only"** — content framed as exclusive, deleted from device
3. **Guilt-investment loops** — fans feel bad when they CAN'T buy
4. **Arousal-state selling** — PPV only during peak engagement
5. **Progressive pricing** — $15 → $30 → $50 → $150 within single sessions

### What Kills Spending (Low LTV Models — $1-2 LTV)
- Analysis in progress (caraaawesley, keelydavidson)
- Hypothesis: ghosting fans, no engagement, no PPV strategy

### Price Points That Work (Across All Models)
- $9.99-$14.99: Starter PPV (highest conversion rate)
- $22-$35: Mid tier (returning buyers)
- $50-$99: High tier (engaged fans in-session)
- $100-$200: Whale tier (emotional investment required first)

### Bot vs Human Performance Expectations
- **Bot advantage:** 24/7, instant response, never says "no worries", always follows playbook
- **Bot weakness:** Can't build deep emotional connections (yet), can't handle customs, might feel robotic
- **Expected outcome:** Bot handles volume better, humans handle whales better
- **Revenue impact:** Even a 10% improvement in the 99% low-spend segment = significant because it's pure automation

---

## Technical Requirements

### Already Built
- Webhook handler for OF messages (in s4s-rotation-service)
- Claude Sonnet integration for response generation
- Vault catalog with category mapping
- Fan spending context lookup
- Redis conversation history
- Enable/disable/test-user endpoints

### Needs Building
- Discord webhook sender (for whale alerts)
- Multi-model configuration system
- Content description ingestion (from team spreadsheet)
- Whale detection scoring algorithm
- Chatter review/scoring pipeline
- Sexting drip state machine
- Dashboard for monitoring bot performance
- A/B testing framework

---

## Phase 6: Adaptive Learning System

### Revenue Tracking Per Conversation
- After every PPV send, track: fan_id, tactic_used, price, category, did_they_buy, time_to_purchase
- After every tip, track: what happened in the 5 messages before the tip
- Store in Redis: `chatbot:outcomes:{fan_id}` — full conversion history

### Tactic Scoring
- Score each tactic by conversion rate across ALL fans:
  - "unsend threat" → X% conversion
  - "vulnerability play" → Y% conversion  
  - "challenge loop" → Z% conversion
- Score per FAN TYPE (silent buyer vs chatty vs emotional):
  - Silent buyers: which bundle size/price converts best?
  - Chatty fans: how many messages before first sale?
  - Emotional fans: which vulnerability play works best?

### Adaptive Personality
- Bot starts with default personality per model
- After 3-5 interactions with a fan, classify their type
- Shift tactics toward what works for their type
- Track: did the shift improve conversion?

### A/B Testing
- For each new fan, randomly assign approach A or B
- After N fans, compare revenue per approach
- Winner becomes new default, loser gets replaced with new variant
- Continuous optimization loop

### Price Optimization
- Track acceptance rate per price point
- If $14.99 converts at 40% but $19.99 converts at 35%, which makes more revenue?
- $14.99 × 40% = $6.00 expected vs $19.99 × 35% = $7.00 expected → $19.99 wins
- Auto-adjust pricing based on expected revenue, not just conversion rate

### Dashboard
- Real-time: revenue per model, per tactic, per fan type
- Trends: which tactics are improving/declining over time
- Alerts: "tactic X hasn't converted in 20 attempts — consider retiring"

*This roadmap is a living document. Update as we learn from the test and research.*
