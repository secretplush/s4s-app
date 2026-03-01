# Bot Learning System — Self-Improving Sales Engine

> How the Bianca daemon v2 learns from every conversation to sell better over time.

---

## 1. Overview

The daemon runs a closed-loop learning system:

1. **Act** — Bot sends a message, PPV, or free hook to a fan
2. **Observe** — Fan responds (purchase, reply, ghost, tip) or doesn't
3. **Aggregate** — Stats computed from all outcome files across all fans
4. **Inject** — Aggregated stats injected into Opus prompt as `[STATS]` block
5. **Decide** — Opus uses stats to make better decisions (price, hook, timing)

This loop runs continuously. Every action and outcome is logged per-fan. Stats are recomputed every 5 minutes (cached).

---

## 2. Data Flow Diagram

```
┌──────────────┐     ┌──────────────┐     ┌──────────────────────┐
│  OF Webhook   │────▶│  Daemon v2   │────▶│  Rule-Based Engine   │
│  (fan msg)    │     │  (port 8901) │     │  (handles $0 fans)   │
└──────────────┘     └──────┬───────┘     └──────────┬───────────┘
                            │                         │
                            │ Fan has $1+ spent       │ Logs action
                            │ or 9+ msgs              │
                            ▼                         ▼
                     ┌──────────────┐     ┌──────────────────────┐
                     │  Opus Call   │     │  bot-outcomes/        │
                     │  (<15K tok)  │     │  biancawoods/         │
                     └──────┬───────┘     │  {fan_id}.jsonl       │
                            │             └──────────┬───────────┘
                            │                        │
                     ┌──────▼───────┐     ┌──────────▼───────────┐
                     │  [STATS]     │◀────│  aggregate_learning  │
                     │  block in    │     │  _stats()            │
                     │  prompt      │     │  (cached 5 min)      │
                     └──────────────┘     └──────────────────────┘

                     ┌──────────────────────────────────────────┐
                     │           Fan State Machine               │
                     │  bot-state/biancawoods/{fan_id}.json      │
                     │                                           │
                     │  new → greeted → engaged → pitched        │
                     │                      ↓         ↓          │
                     │                    buyer → whale_candidate │
                     │                      ↓         ↓          │
                     │                   dormant   handed_off     │
                     └──────────────────────────────────────────┘
```

---

## 3. Action Logging

Every bot action is logged to `research/bot-outcomes/biancawoods/{fan_id}.jsonl`:

```json
{"ts":1708700000,"type":"action","action":"ppv","content_key":"combo3","price":18,"hook":"vulnerability","fan_state":"engaged","fan_total_spent":0}
```

**Fields:**
| Field | Description |
|-------|-------------|
| `ts` | Unix timestamp |
| `type` | Always `"action"` |
| `action` | What we did: `ppv`, `text`, `free_media`, `bump`, `rekindle`, `skip`, etc. |
| `content_key` | Vault content key sent (e.g., `combo3`, `sexting1_pic`) |
| `price` | PPV price if applicable |
| `hook` | Hook type used: `vulnerability`, `scarcity`, `challenge`, `conditional`, `exclusivity`, `sexual_match`, `curiosity` |
| `fan_state` | Fan's state when action was taken |
| `fan_total_spent` | Fan's total spend at time of action |
| `response_time_s` | Seconds from fan message to bot response |

---

## 4. Outcome Logging

When a fan responds to our action, we log the outcome to the same file:

```json
{"ts":1708700300,"type":"outcome","event":"purchased","amount":18}
{"ts":1708700500,"type":"outcome","event":"replied"}
{"ts":1708786400,"type":"outcome","event":"ghosted"}
{"ts":1708700100,"type":"outcome","event":"tipped","amount":50}
```

**Events:**
| Event | When Logged |
|-------|-------------|
| `purchased` | Fan unlocks a PPV |
| `replied` | Fan sends any message |
| `ghosted` | 24h+ no activity after our action (detected by dormancy checker) |
| `tipped` | Fan sends a tip |

---

## 5. Aggregated Stats

The `aggregate_learning_stats()` function reads ALL fan outcome files and computes:

### conversion_by_price
Which price points convert best. Example:
```json
{"18": {"sent": 45, "bought": 12, "rate": 26.7},
 "25": {"sent": 20, "bought": 3, "rate": 15.0}}
```

### conversion_by_content
Which content types sell best (by content_key).

### conversion_by_hook
Which hook types lead to purchases. The daemon tracks which hook was used in each PPV message, then correlates with purchase outcomes.

### conversion_by_hour
What time of day (UTC hour) converts best. Helps Opus decide whether to be aggressive (evening) or gentle (morning).

### ghost_rate_by_stage
Where fans drop off. Example: if `pitched` has 40% ghost rate but `engaged` only 10%, the system learns to add more rapport before pitching.

### avg_msgs_to_first_buy
Average number of fan messages before first purchase. Helps calibrate the escalation ladder.

### top_hooks
Hook types ranked by usage frequency (and eventually by conversion rate as data accumulates).

---

## 6. Stats Injection into Opus

When Opus is called, the `[STATS]` block is injected into the prompt:

```
[STATS]
Data: 234 actions, 89 outcomes
conversion_by_price: $18: 26.7% (45 sent), $25: 15.0% (20 sent), $15: 33.3% (6 sent)
top_hooks: vulnerability: 34x, scarcity: 18x, sexual_match: 12x
best_hours: 22:00 UTC: 35.0%, 21:00 UTC: 28.0%, 2:00 UTC: 25.0%
ghost_rate_by_stage: pitched: 40.0%, greeted: 25.0%
avg_msgs_to_first_buy: 5.3
[/STATS]
```

The playbook (v4) tells Opus: **"Stats override your instincts. Data > vibes."**

If stats are empty (cold start), the prompt says to use playbook defaults.

---

## 7. Fan State Machine

### States

| State | Meaning | Bot Behavior |
|-------|---------|--------------|
| `new` | Just subscribed, no interaction yet | Eligible for welcome flow |
| `greeted` | Bot sent welcome, awaiting reply | Don't double-message |
| `engaged` | Fan is actively chatting | Build rapport → tease → pitch |
| `pitched` | PPV sent, awaiting purchase | Hold. One bump after 4h max |
| `buyer` | Made at least one purchase | Aftercare → upsell to next tier |
| `whale_candidate` | Showing whale signals (2+ detected) | Aggressive selling, test price ceiling |
| `handed_off` | Escalated to human chatter | **DO NOT MESSAGE** — human owns this fan |
| `dormant` | 24h+ no activity | Eligible for rekindle/reactivation |

### State Transitions

```
new ──────────▶ greeted (welcome sent)
greeted ──────▶ engaged (fan replies)
engaged ──────▶ pitched (PPV sent)
pitched ──────▶ buyer (fan purchases)
pitched ──────▶ engaged (fan replies without buying — try different angle)
buyer ────────▶ whale_candidate (whale signals detected)
whale_candidate ▶ handed_off (custom request needs human, safety concern)
Any ──────────▶ dormant (24h no activity — automatic)
dormant ──────▶ engaged (fan re-engages)
```

### State File Location

Per-fan state: `research/bot-state/biancawoods/{fan_id}.json`

```json
{
  "fan_id": 12345678,
  "state": "buyer",
  "name": "John",
  "messages_sent": 8,
  "messages_received": 12,
  "total_spent": 36.0,
  "last_ppv_price": 18,
  "content_sent": ["gfe_selfie", "combo3", "combo7"],
  "last_interaction_ts": 1708700000,
  "created_ts": 1708600000,
  "signals": ["sexual", "interest"],
  "notes": ""
}
```

---

## 8. Whale Detection & Handoff

### Detection (automatic)

The `detect_whale_signals()` function scores fans. **3+ points = whale_candidate.**

| Signal | Points |
|--------|--------|
| $100+ spent in first 24h | 2 |
| Custom content request | 2 |
| Buys everything (5+ items, $50+ total) | 2 |
| $200+ total spend | 2 |
| Emotional attachment phrases | 1 |
| 10+ messages received | 1 |

### Handoff

The bot handles whales directly (per playbook §10). Only flag for human if:
- Custom request needs model to create NEW content
- Legal/safety concerns
- Fan claims to know model's real identity
- Video call request
- Fan mentions self-harm, is a minor, or sends restricted content
- $500+ custom negotiation needs approval

### API Handoff

```
POST /fan/{fan_id}/handoff
```

Transitions fan to `handed_off` state. Bot will never message them again until state is manually changed.

---

## 9. Efficient Opus Calls

### When Opus Is Called
- Fan has spent $1+ (proven buyer — needs personalized handling)
- Fan has 9+ messages and rule-based engine couldn't handle the pattern
- Never for simple greetings, emojis, filler, or new $0 fans in early ladder

### Prompt Size Target: <15K tokens

The prompt is built from 3 pieces:

1. **Playbook excerpt** (~3-6K tokens) — Only the relevant sections for this fan's state. A `new` fan gets §4 (strategy). A `buyer` gets §6,7,9 (content, pricing, aftercare). A `whale_candidate` gets §10,11 (whale handling).

2. **[STATS] block** (~200-500 tokens) — Compact aggregated learning data.

3. **Fan context** (~500-1K tokens) — JSON with fan_id, name, state, spent, signals, content_sent, last 10 messages.

### Output Format

Opus returns exactly ONE JSON line:
```json
{"action":"ppv","content_key":"combo5","price":25,"message_text":"babe...","hook":"vulnerability","reason":"buyer, upselling"}
```

---

## 10. Rule-Based vs Opus Routing

```
Fan message arrives
    │
    ├─ handed_off? ──▶ SKIP (human owns)
    │
    ├─ $1+ spent? ──▶ OPUS (always, personalized)
    │
    ├─ Buying signal? ──▶ RULE: send PPV immediately
    ├─ Sexual signal + 4+ msgs? ──▶ RULE: send PPV
    ├─ Sexual signal + <4 msgs? ──▶ RULE: free hook
    ├─ Interest/curiosity signal? ──▶ RULE: tease or free hook
    │
    ├─ Msg 1-2? ──▶ RULE: greet + selfie
    ├─ Msg 3-4? ──▶ RULE: tease
    ├─ Msg 5? ──▶ RULE: free sexting pic
    ├─ Msg 6-8? ──▶ RULE: $18 PPV push
    │
    ├─ Msg 9+? ──▶ OPUS (complex, needs AI decision)
    │
    └─ Catchall ──▶ RULE: re-engage reply
```

This keeps Opus calls to ~20% of interactions. Rule-based handles the predictable 80%.

---

## 11. Background Threads

| Thread | Interval | Purpose |
|--------|----------|---------|
| `priority_worker` | Continuous | Processes fan messages from priority queue |
| `dormancy_checker` | 15 min | Marks fans dormant after 24h inactivity |
| `bump_checker` | 10 min | Sends one bump to fans in `pitched` state after 4h |
| `setup_webhook_tunnel` | Startup | Launches cloudflared + registers OF API webhook |

---

## 12. Adding a New Model

To add a new model (e.g., `jessicasmith`):

### Files Needed

1. **Content map**: `research/jessicasmith-content-map.json`
   - Same structure as `biancawoods-content-map.json`
   - Lists all vault categories, sexting chains, bundles, custom upsells

2. **Playbook**: `research/chatbot-brain-jessicasmith.md`
   - Same structure as v4 playbook
   - Customize: voice/personality (§1), content ladder (§6), pricing (§7), restricted words (§14)

3. **Daemon config**: Copy `bianca-daemon-v2.py` and change:
   - `MODEL_SLUG = "jessicasmith"`
   - `OF_API` / `OF_KEY` / `ACCOUNT_ID` — new model's API creds
   - `BIANCA_ID` → model's OF user ID
   - `VAULT_MAP` — populate from content map
   - `PLAYBOOK_FILE` — point to new playbook
   - `EXCLUDE_FAN_IDS` — model-specific excludes
   - Port number (e.g., 8902 to avoid conflicts)

4. **Directories auto-created on startup:**
   - `research/bot-outcomes/jessicasmith/`
   - `research/bot-state/jessicasmith/`

### What's Shared

- The learning system architecture (action → outcome → aggregate → inject)
- The fan state machine (same states and transitions)
- The priority queue logic
- The HTTP server structure

### What's Per-Model

- Vault content map and VAULT_MAP
- Playbook personality and voice
- API credentials
- Port number
- Response templates (greetings, teases, etc.)
- Pricing tiers and content escalation ladder

---

## 13. API Reference

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/health` | GET | Health check, version, enabled status |
| `/stats` | GET | Runtime metrics (webhooks, sends, errors) |
| `/queue` | GET | Priority queue depth and items |
| `/performance` | GET | Revenue, conversion rates, top fans |
| `/training` | GET | Training data summary + learning stats |
| `/learning/stats` | GET | Full aggregated learning stats (cached 5 min) |
| `/fan/{fan_id}` | GET | Fan state, history, recent messages |
| `/fan/{fan_id}/handoff` | POST | Mark fan as handed_off (human takes over) |
| `/webhook/fan-message` | POST | Receive fan message webhook |
| `/webhook/of-event` | POST | Unified OF API webhook |
| `/webhook/new-subscriber` | POST | New subscriber event |
| `/webhook/purchase` | POST | Purchase event |
| `/enable` | POST | Enable the system |
| `/disable` | POST | Disable the system |
| `/reactivate` | POST | Trigger dormant spender reactivation |

---

## 14. Reading the Stats

### Quick Health Check

```bash
curl http://127.0.0.1:8901/learning/stats | python3 -m json.tool
```

### What to Look For

- **conversion_by_price**: If $18 converts at 25% but $25 only at 10%, the system is correctly pricing entry PPVs low
- **ghost_rate_by_stage**: If `pitched` has high ghost rate, add more rapport before pitching
- **top_hooks**: If `vulnerability` dominates, the 🥺 strategy is working
- **conversion_by_hour**: Schedule mass bumps during peak conversion hours
- **avg_msgs_to_first_buy**: If it's 3, the ladder is too fast. If it's 12, too slow.

### Cold Start

When the system first starts, there's no data. The `[STATS]` block will say:
```
[STATS]
No data yet — use playbook defaults.
[/STATS]
```

After ~50 interactions, stats become meaningful. After ~200, they're reliable.
