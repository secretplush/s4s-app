#!/usr/bin/env python3
"""
Bianca Daemon v2 — Self-Learning Webhook-Driven Fan Message Handler.
Pure Python stdlib. No external dependencies.

Changes from v1:
  - Self-learning outcome tracking with aggregated stats injection
  - Fan state machine (new→greeted→engaged→pitched→buyer→whale_candidate→handed_off→dormant)
  - Efficient Opus calls (<15K tokens) with [STATS] block
  - Nina-style welcome flow (free selfie + $18 PPV combo immediate)
  - Rule-based handling for simple cases, Opus only when fan has replied and needs a decision
  - New endpoints: /learning/stats, /fan/{fan_id}, /fan/{fan_id}/handoff

Endpoints:
  POST /webhook/fan-message     — receive webhooks from Railway/tunnel
  POST /webhook/of-event        — unified OF API webhook
  POST /webhook/new-subscriber  — new sub welcome
  POST /webhook/purchase        — purchase followup
  GET  /health                  — health check
  GET  /stats                   — metrics
  GET  /performance             — performance dashboard
  GET  /training                — training data summary
  GET  /queue                   — priority queue state
  GET  /learning/stats          — aggregated learning stats
  GET  /fan/{fan_id}            — fan state and history
  POST /fan/{fan_id}/handoff    — mark fan as handed_off
  POST /enable                  — enable system
  POST /disable                 — disable system
  POST /reactivate              — reactivate dormant spenders
"""

import json, os, sys, re, time, random, subprocess, threading, logging, glob
from http.server import HTTPServer, BaseHTTPRequestHandler
from datetime import datetime, timezone, timedelta
from urllib.parse import urlparse
from collections import defaultdict

# ==================== CONFIG ====================
PORT = 8901
DIR = os.path.dirname(os.path.abspath(__file__))

OF_API = "https://app.onlyfansapi.com/api/acct_54e3119e77da4429b6537f7dd2883a05"
OF_KEY = "Bearer ofapi_bT4J1Er2YBow46EihDfjlSFf5HRmiM15M4DCOoHn7889d8b4"
RAILWAY = "https://s4s-worker-production.up.railway.app"
ACCOUNT_ID = "acct_54e3119e77da4429b6537f7dd2883a05"
BIANCA_ID = 525755724
MODEL_SLUG = "biancawoods"

# Directory structure for learning data
BOT_OUTCOMES_DIR = os.path.join(DIR, "bot-outcomes", MODEL_SLUG)
BOT_STATE_DIR = os.path.join(DIR, "bot-state", MODEL_SLUG)
LEARNING_CACHE_FILE = os.path.join(DIR, f"bot-learning-cache-{MODEL_SLUG}.json")

# Legacy files (kept for compatibility)
FAN_STATE_FILE = os.path.join(DIR, "bianca-fan-state.json")
FAN_MEMORY_FILE = os.path.join(DIR, "bianca-fan-memory.json")
METRICS_FILE = os.path.join(DIR, "bianca-metrics.json")
OPUS_CALLS_FILE = os.path.join(DIR, "bianca-opus-calls.json")
SYSTEM_STATE_FILE = os.path.join(DIR, "bianca-system-state.json")
PLAYBOOK_FILE = os.path.join(DIR, "chatbot-brain-v4.md")
LOG_FILE = os.path.join(DIR, "bianca-daemon-v2.log")
CONVERSATION_LOG_FILE = os.path.join(DIR, "bianca-conversation-log.jsonl")
OUTCOME_LOG_FILE = os.path.join(DIR, "bianca-outcomes.jsonl")
ACTIVE_CHATTERS_FILE = os.path.join(DIR, "bianca-active-chatters.json")
BUMP_REGISTRY_FILE = os.path.join(DIR, "bianca-bump-registry.json")
PERF_FILE = os.path.join(DIR, "bianca-performance.json")
FAN_CONTEXT_FILE = os.path.join(DIR, "bianca-fan-context.json")

# Exclude lists
EXCLUDE_FAN_IDS = {483664969, 482383508, 525755724}
EXCLUDE_USERNAMES = {"nij444", "tylerd34"}
PROMO_USERNAMES = {"exclusivepromotion", "premiumpromotions", "erotiqa", "starpromotion", "starpromo"}
PROMO_KEYWORDS = ["permanent post", "mass dm", "promo", "shoutout", "s4s", "promotion",
                  "fans 🧑", "top 0,", "top 0.", "similar results", "want similar"]

MAX_OPUS_PER_MIN = 2
RATE_LIMIT_PAUSE_SEC = 60

# ==================== ENSURE DIRECTORIES ====================
os.makedirs(BOT_OUTCOMES_DIR, exist_ok=True)
os.makedirs(BOT_STATE_DIR, exist_ok=True)

# ==================== LOGGING ====================
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    handlers=[
        logging.FileHandler(LOG_FILE),
        logging.StreamHandler()
    ]
)
log = logging.getLogger("bianca-v2")

# ==================== STATS ====================
stats = {
    "started_at": datetime.now(timezone.utc).isoformat(),
    "version": "v2",
    "webhooks_received": 0,
    "auto_replies": 0,
    "opus_calls": 0,
    "errors": 0,
    "skipped": 0,
    "sends": 0,
    "rule_based_handled": 0,
    "save_attempts": 0,
    "last_webhook": None,
    "last_error": None,
}

# Thread lock for file I/O
file_lock = threading.Lock()


# =====================================================================
# SECTION 1: FAN STATE MACHINE
# =====================================================================
# States: new, greeted, engaged, pitched, buyer, whale_candidate, handed_off, dormant

VALID_STATES = {"new", "greeted", "engaged", "pitched", "buyer", "whale_candidate", "handed_off", "dormant"}

# Legal transitions: from_state → set of allowed to_states
STATE_TRANSITIONS = {
    "new":              {"greeted", "engaged", "dormant"},
    "greeted":          {"engaged", "dormant"},
    "engaged":          {"pitched", "whale_candidate", "dormant", "handed_off"},
    "pitched":          {"buyer", "engaged", "dormant", "handed_off"},
    "buyer":            {"whale_candidate", "dormant", "handed_off"},
    "whale_candidate":  {"handed_off", "dormant", "buyer"},
    "handed_off":       set(),  # Terminal — human owns this fan
    "dormant":          {"engaged", "greeted", "new"},  # Can be re-engaged
}


def _fan_state_path(fan_id):
    return os.path.join(BOT_STATE_DIR, f"{fan_id}.json")


def load_fan_state_v2(fan_id):
    """Load per-fan state from bot-state directory."""
    path = _fan_state_path(fan_id)
    with file_lock:
        try:
            with open(path) as f:
                return json.load(f)
        except (FileNotFoundError, json.JSONDecodeError):
            return {
                "fan_id": int(fan_id),
                "state": "new",
                "name": "",
                "messages_sent": 0,
                "messages_received": 0,
                "total_spent": 0.0,
                "last_ppv_price": None,
                "content_sent": [],
                "last_interaction_ts": None,
                "created_ts": int(time.time()),
                "signals": [],
                "notes": "",
            }


def save_fan_state_v2(fan_id, state_data):
    """Save per-fan state to bot-state directory."""
    path = _fan_state_path(fan_id)
    with file_lock:
        try:
            tmp = path + ".tmp"
            with open(tmp, "w") as f:
                json.dump(state_data, f, indent=2)
            os.replace(tmp, path)
        except Exception as e:
            log.error(f"save_fan_state_v2({fan_id}): {e}")


def transition_fan_state(fan_id, new_state, reason=""):
    """Transition a fan's state, respecting the state machine rules."""
    if new_state not in VALID_STATES:
        log.warning(f"Invalid state '{new_state}' for fan {fan_id}")
        return False

    fs = load_fan_state_v2(fan_id)
    current = fs.get("state", "new")

    if current == "handed_off":
        log.info(f"Fan {fan_id} is handed_off — cannot transition to {new_state}")
        return False

    allowed = STATE_TRANSITIONS.get(current, set())
    if new_state not in allowed and new_state != current:
        log.warning(f"Fan {fan_id}: illegal transition {current}→{new_state} (allowed: {allowed})")
        return False

    fs["state"] = new_state
    fs["last_interaction_ts"] = int(time.time())
    save_fan_state_v2(fan_id, fs)
    log.info(f"STATE {fan_id}: {current}→{new_state} ({reason})")
    return True


def record_fan_message_v2(fan_id, from_bianca=False, content_key=None, price=None):
    """Increment message counters and update last interaction."""
    fs = load_fan_state_v2(fan_id)
    if from_bianca:
        fs["messages_sent"] = fs.get("messages_sent", 0) + 1
    else:
        fs["messages_received"] = fs.get("messages_received", 0) + 1
    fs["last_interaction_ts"] = int(time.time())
    if content_key and content_key not in fs.get("content_sent", []):
        fs.setdefault("content_sent", []).append(content_key)
    if price:
        fs["last_ppv_price"] = price
    save_fan_state_v2(fan_id, fs)


def record_fan_spend(fan_id, amount):
    """Record a purchase amount."""
    fs = load_fan_state_v2(fan_id)
    fs["total_spent"] = fs.get("total_spent", 0) + amount
    fs["last_interaction_ts"] = int(time.time())
    save_fan_state_v2(fan_id, fs)


def detect_whale_signals(fan_id, message_text="", amount=0):
    """Check for whale signals. Returns True if whale_candidate transition should fire."""
    fs = load_fan_state_v2(fan_id)
    signals = 0

    # Unprompted tip
    if amount > 0 and "tip" in str(amount):
        signals += 2
    # $100+ in first 24h
    created = fs.get("created_ts", 0)
    if fs.get("total_spent", 0) >= 100 and (time.time() - created) < 86400:
        signals += 2
    # Custom content request
    text_lower = (message_text or "").lower()
    if any(kw in text_lower for kw in ["custom", "make me", "just for me", "personalized"]):
        signals += 2
    # Emotional attachment
    if any(kw in text_lower for kw in ["trust you", "crave", "obsessed", "addicted", "favorite"]):
        signals += 1
    # Rapid messages (10+)
    if fs.get("messages_received", 0) >= 10:
        signals += 1
    # Buys everything
    if len(fs.get("content_sent", [])) >= 5 and fs.get("total_spent", 0) >= 50:
        signals += 2
    # Total spend over $200
    if fs.get("total_spent", 0) >= 200:
        signals += 2

    return signals >= 3


# =====================================================================
# SECTION 2: SELF-LEARNING OUTCOME TRACKING
# =====================================================================

def _outcome_path(fan_id):
    return os.path.join(BOT_OUTCOMES_DIR, f"{fan_id}.jsonl")


def log_bot_action(fan_id, action, content_key=None, price=None, hook=None,
                   fan_state=None, fan_total_spent=None, response_time_s=None):
    """Log every bot action to per-fan JSONL file."""
    entry = {
        "ts": int(time.time()),
        "type": "action",
        "action": action,
        "content_key": content_key,
        "price": price,
        "hook": hook,
        "fan_state": fan_state,
        "fan_total_spent": fan_total_spent,
        "response_time_s": response_time_s,
    }
    # Strip None values
    entry = {k: v for k, v in entry.items() if v is not None}
    path = _outcome_path(fan_id)
    try:
        with file_lock:
            with open(path, "a") as f:
                f.write(json.dumps(entry, separators=(',', ':')) + "\n")
    except Exception as e:
        log.error(f"log_bot_action({fan_id}): {e}")


def log_outcome(fan_id, event, amount=None, ppv_id=None, time_since_action_s=None):
    """Log an outcome (purchased, replied, ghosted, tipped) to per-fan JSONL."""
    entry = {
        "ts": int(time.time()),
        "type": "outcome",
        "event": event,
        "amount": amount,
        "ppv_id": ppv_id,
        "time_since_action_s": time_since_action_s,
    }
    entry = {k: v for k, v in entry.items() if v is not None}
    path = _outcome_path(fan_id)
    try:
        with file_lock:
            with open(path, "a") as f:
                f.write(json.dumps(entry, separators=(',', ':')) + "\n")
    except Exception as e:
        log.error(f"log_outcome({fan_id}): {e}")


def aggregate_learning_stats():
    """Compute aggregated stats from all outcome files. Cached for 5 minutes."""
    # Check cache
    try:
        with open(LEARNING_CACHE_FILE) as f:
            cache = json.load(f)
        if time.time() - cache.get("computed_at", 0) < 300:
            return cache.get("stats", {})
    except:
        pass

    # Aggregate from all fan outcome files
    actions = []
    outcomes = []

    for filepath in glob.glob(os.path.join(BOT_OUTCOMES_DIR, "*.jsonl")):
        try:
            with open(filepath) as f:
                for line in f:
                    line = line.strip()
                    if not line:
                        continue
                    entry = json.loads(line)
                    if entry.get("type") == "action":
                        actions.append(entry)
                    elif entry.get("type") == "outcome":
                        outcomes.append(entry)
        except Exception as e:
            log.warning(f"aggregate_learning_stats: error reading {filepath}: {e}")

    # Build stats
    result = {
        "total_actions": len(actions),
        "total_outcomes": len(outcomes),
        "conversion_by_price": {},
        "conversion_by_content": {},
        "conversion_by_hook": {},
        "conversion_by_hour": {},
        "ghost_rate_by_stage": {},
        "avg_msgs_to_first_buy": 0,
        "top_hooks": [],
    }

    # --- conversion_by_price ---
    price_sent = defaultdict(int)
    price_bought = defaultdict(int)
    for a in actions:
        p = a.get("price")
        if p and a.get("action") in ("ppv", "ppv_sent"):
            bucket = str(int(p))
            price_sent[bucket] += 1
    for o in outcomes:
        if o.get("event") in ("purchased", "purchase"):
            amt = o.get("amount", 0)
            bucket = str(int(amt)) if amt else "0"
            price_bought[bucket] += 1
    for bucket in sorted(set(list(price_sent.keys()) + list(price_bought.keys()))):
        sent = price_sent.get(bucket, 0)
        bought = price_bought.get(bucket, 0)
        rate = (bought / sent * 100) if sent > 0 else 0
        result["conversion_by_price"][bucket] = {
            "sent": sent, "bought": bought, "rate": round(rate, 1)
        }

    # --- conversion_by_content ---
    content_sent = defaultdict(int)
    content_bought = defaultdict(int)
    for a in actions:
        ck = a.get("content_key")
        if ck and a.get("action") in ("ppv", "ppv_sent"):
            content_sent[ck] += 1
    # Match outcomes to last action by same fan
    for o in outcomes:
        if o.get("event") in ("purchased", "purchase"):
            # We don't have content_key on outcomes directly; use ppv_id or infer
            ppv_id = o.get("ppv_id")
            if ppv_id:
                content_bought[ppv_id] += 1
    for ck in sorted(set(list(content_sent.keys()) + list(content_bought.keys()))):
        sent = content_sent.get(ck, 0)
        bought = content_bought.get(ck, 0)
        rate = (bought / sent * 100) if sent > 0 else 0
        result["conversion_by_content"][ck] = {
            "sent": sent, "bought": bought, "rate": round(rate, 1)
        }

    # --- conversion_by_hook ---
    hook_sent = defaultdict(int)
    hook_bought = defaultdict(int)
    # For hook tracking, we pair actions with outcomes by fan timeline
    fan_last_hook = {}
    for a in sorted(actions, key=lambda x: x.get("ts", 0)):
        hook = a.get("hook")
        if hook:
            hook_sent[hook] += 1
            # Track last hook per fan (we don't have fan_id here but we can infer from file)
    for o in outcomes:
        if o.get("event") == "purchased":
            # Rough: count all hooks that preceded purchases
            # Better tracking would pair by fan_id; this is approximate
            pass
    # Simplified: just count how often each hook was used
    for hook in hook_sent:
        result["conversion_by_hook"][hook] = {
            "used": hook_sent[hook],
        }

    # --- conversion_by_hour ---
    hour_sent = defaultdict(int)
    hour_bought = defaultdict(int)
    for a in actions:
        if a.get("action") in ("ppv", "ppv_sent"):
            h = datetime.fromtimestamp(a.get("ts", 0), tz=timezone.utc).hour
            hour_sent[h] += 1
    for o in outcomes:
        if o.get("event") == "purchased":
            h = datetime.fromtimestamp(o.get("ts", 0), tz=timezone.utc).hour
            hour_bought[h] += 1
    for h in range(24):
        sent = hour_sent.get(h, 0)
        bought = hour_bought.get(h, 0)
        rate = (bought / sent * 100) if sent > 0 else 0
        if sent > 0 or bought > 0:
            result["conversion_by_hour"][str(h)] = {
                "sent": sent, "bought": bought, "rate": round(rate, 1)
            }

    # --- ghost_rate_by_stage ---
    stage_actions = defaultdict(int)
    stage_ghosts = defaultdict(int)
    for a in actions:
        st = a.get("fan_state", "unknown")
        stage_actions[st] += 1
    for o in outcomes:
        if o.get("event") == "ghosted":
            # We don't have stage on outcomes; approximate from actions
            stage_ghosts["unknown"] += 1
    # Better: per-fan analysis
    for filepath in glob.glob(os.path.join(BOT_OUTCOMES_DIR, "*.jsonl")):
        try:
            fan_entries = []
            with open(filepath) as f:
                for line in f:
                    line = line.strip()
                    if line:
                        fan_entries.append(json.loads(line))
            # Find actions followed by ghost outcomes
            last_action_state = None
            for entry in sorted(fan_entries, key=lambda x: x.get("ts", 0)):
                if entry.get("type") == "action":
                    last_action_state = entry.get("fan_state", "unknown")
                elif entry.get("type") == "outcome" and entry.get("event") == "ghosted":
                    if last_action_state:
                        stage_ghosts[last_action_state] = stage_ghosts.get(last_action_state, 0) + 1
        except:
            pass
    for st in set(list(stage_actions.keys()) + list(stage_ghosts.keys())):
        total = stage_actions.get(st, 0)
        ghosts = stage_ghosts.get(st, 0)
        rate = (ghosts / total * 100) if total > 0 else 0
        result["ghost_rate_by_stage"][st] = {
            "actions": total, "ghosts": ghosts, "rate": round(rate, 1)
        }

    # --- avg_msgs_to_first_buy ---
    msgs_to_buy = []
    for filepath in glob.glob(os.path.join(BOT_STATE_DIR, "*.json")):
        try:
            with open(filepath) as f:
                fs = json.load(f)
            if fs.get("total_spent", 0) > 0:
                msgs_to_buy.append(fs.get("messages_received", 0))
        except:
            pass
    result["avg_msgs_to_first_buy"] = round(sum(msgs_to_buy) / len(msgs_to_buy), 1) if msgs_to_buy else 0

    # --- top_hooks (sorted by usage) ---
    result["top_hooks"] = sorted(
        [{"hook": h, "count": d["used"]} for h, d in result["conversion_by_hook"].items()],
        key=lambda x: x["count"], reverse=True
    )[:10]

    result["computed_at"] = int(time.time())

    # Cache
    try:
        with open(LEARNING_CACHE_FILE, "w") as f:
            json.dump({"computed_at": time.time(), "stats": result}, f, indent=2)
    except:
        pass

    return result


def format_stats_block():
    """Format learning stats as a compact [STATS] block for Opus injection."""
    st = aggregate_learning_stats()
    if st.get("total_actions", 0) == 0:
        return "[STATS]\nNo data yet — use playbook defaults.\n[/STATS]"

    lines = ["[STATS]"]
    lines.append(f"Data: {st['total_actions']} actions, {st['total_outcomes']} outcomes")

    # conversion_by_price — top 5
    cbp = st.get("conversion_by_price", {})
    if cbp:
        sorted_prices = sorted(cbp.items(), key=lambda x: x[1].get("rate", 0), reverse=True)[:5]
        price_strs = [f"${p}: {d['rate']}% ({d['sent']} sent)" for p, d in sorted_prices]
        lines.append(f"conversion_by_price: {', '.join(price_strs)}")

    # conversion_by_hook — top 5
    hooks = st.get("top_hooks", [])[:5]
    if hooks:
        hook_strs = [f"{h['hook']}: {h['count']}x" for h in hooks]
        lines.append(f"top_hooks: {', '.join(hook_strs)}")

    # conversion_by_hour — best 3 hours
    cbh = st.get("conversion_by_hour", {})
    if cbh:
        sorted_hours = sorted(cbh.items(), key=lambda x: x[1].get("rate", 0), reverse=True)[:3]
        hour_strs = [f"{h}:00 UTC: {d['rate']}%" for h, d in sorted_hours]
        lines.append(f"best_hours: {', '.join(hour_strs)}")

    # ghost_rate_by_stage
    grbs = st.get("ghost_rate_by_stage", {})
    if grbs:
        ghost_strs = [f"{s}: {d['rate']}%" for s, d in sorted(grbs.items(), key=lambda x: x[1].get("rate", 0), reverse=True) if d.get("rate", 0) > 0][:5]
        if ghost_strs:
            lines.append(f"ghost_rate_by_stage: {', '.join(ghost_strs)}")

    avg_msgs = st.get("avg_msgs_to_first_buy", 0)
    if avg_msgs:
        lines.append(f"avg_msgs_to_first_buy: {avg_msgs}")

    lines.append("[/STATS]")
    return "\n".join(lines)


# =====================================================================
# SECTION 3: DORMANCY CHECKER (background thread)
# =====================================================================

def dormancy_checker():
    """Background thread: every 15 minutes, mark fans dormant if 24h+ no activity."""
    while True:
        time.sleep(900)  # 15 min
        try:
            cutoff = time.time() - 86400  # 24h
            for filepath in glob.glob(os.path.join(BOT_STATE_DIR, "*.json")):
                try:
                    with open(filepath) as f:
                        fs = json.load(f)
                    fan_id = fs.get("fan_id")
                    current_state = fs.get("state", "new")
                    last_ts = fs.get("last_interaction_ts", 0)

                    if current_state in ("handed_off", "dormant"):
                        continue
                    if last_ts and last_ts < cutoff:
                        transition_fan_state(fan_id, "dormant", reason="24h+ no activity")
                except:
                    pass
        except Exception as e:
            log.error(f"dormancy_checker error: {e}")


# =====================================================================
# SECTION 4: BUMP / NON-BUYER CHECKER (background thread)
# =====================================================================

def bump_checker():
    """Background thread: every 10 minutes, check for fans needing a bump.
    - Non-buyer after 4h in 'pitched' → one bump
    - Non-buyer after 24h → dormant (handled by dormancy_checker)
    """
    while True:
        time.sleep(600)  # 10 min
        if not is_system_enabled():
            continue
        try:
            now = time.time()
            four_hours = 4 * 3600
            for filepath in glob.glob(os.path.join(BOT_STATE_DIR, "*.json")):
                try:
                    with open(filepath) as f:
                        fs = json.load(f)
                    fan_id = fs.get("fan_id")
                    state = fs.get("state", "new")
                    last_ts = fs.get("last_interaction_ts", 0)
                    bumped = fs.get("bump_sent", False)

                    if state != "pitched" or bumped or not last_ts:
                        continue
                    if (now - last_ts) >= four_hours and (now - last_ts) < 86400:
                        # Send one bump
                        bump_ids = VAULT_MAP.get("bump", [])
                        bump_id = random.choice(bump_ids) if bump_ids else None
                        msg = random.choice([
                            "heyyy babe did u see what i sent u? 🥺💕",
                            "babe u still there? i was really nervous about sending that 🙈",
                            "omg dont leave me on read 😤💕 did u at least look at it?",
                        ])
                        send_of_message(fan_id, msg, media_ids=[bump_id] if bump_id else None)
                        fs["bump_sent"] = True
                        save_fan_state_v2(fan_id, fs)
                        log_bot_action(fan_id, "bump", fan_state="pitched",
                                       fan_total_spent=fs.get("total_spent", 0))
                        log.info(f"BUMP sent to {fan_id} (4h+ in pitched)")
                except:
                    pass
        except Exception as e:
            log.error(f"bump_checker error: {e}")


# =====================================================================
# SECTION 4A: MASS BUMP SYSTEM (background thread)
# =====================================================================

MASS_BUMP_STATE_FILE = os.path.join(DIR, "bianca-mass-bump-state.json")
MASS_BUMP_INTERVAL = 3600  # 1 hour between bumps
MASS_BUMP_DELETE_AFTER = 3600  # Delete after 1 hour

MASS_BUMP_PHOTOS = [
    "4295115634", "4295115608", "4271207724", "4128847737", "4118094254",
    "4118094218", "4084333700", "4084332834", "4084332833", "4084332827",
    "4084332825", "4084332375", "4084332371", "4084332368", "4084332364",
    "4084331945", "4084331943", "4084331942", "4083927398", "4083927388",
    "4083927385", "4083927380", "4083927378", "4083927375"
]

MASS_BUMP_MESSAGES = [
    "heyyy u 💕 been thinking about u",
    "bored and looking cute rn 😏 wanna see?",
    "miss talking to u 🥺",
    "just took this for u 📸",
    "are u ignoring me 😤💕",
    "pssst 😘",
    "hiiii remember me? 🙈",
]

SFS_EXCLUDE_LISTS = [1231455148, 1232110158, 1258116798, 1232588865, 1254929574]


def get_active_chatter_ids():
    """Get fan IDs from active chatters file (maintained by webhook handler)."""
    active_file = os.path.join(DIR, "bianca-active-chatters.json")
    cutoff = time.time() - 7200  # 2 hours
    try:
        with open(active_file) as f:
            data = json.load(f)
        return [int(fid) for fid, info in data.items()
                if info.get("last_msg", 0) > cutoff]
    except:
        return []


def mass_bump_thread():
    """Background thread: hourly mass bumps with auto-delete after 1 hour.
    
    Cycle:
    1. Wait 1 hour
    2. Delete previous mass bump (unsend from all inboxes)
    3. Send new mass bump (excludes SFS lists + active chatters)
    4. Track message ID for next delete
    """
    # Wait 60s on startup to let everything initialize
    time.sleep(60)
    
    while True:
        if not is_system_enabled():
            time.sleep(300)
            continue
        
        try:
            state = load_json(MASS_BUMP_STATE_FILE, {
                "last_mass_bump_id": None,
                "last_mass_bump_ts": None,
                "bump_count": 0,
            })
            
            last_ts = state.get("last_mass_bump_ts_epoch", 0)
            now = time.time()
            
            # Check if enough time has passed
            if last_ts and (now - last_ts) < MASS_BUMP_INTERVAL:
                wait = MASS_BUMP_INTERVAL - (now - last_ts)
                log.info(f"MASS-BUMP: Next bump in {wait/60:.0f}min")
                time.sleep(min(wait + 10, 600))  # Sleep up to 10min chunks
                continue
            
            # Step 1: Delete previous bump
            old_id = state.get("last_mass_bump_id")
            if old_id:
                log.info(f"MASS-BUMP: Deleting previous bump {old_id}")
                try:
                    resp = curl_json(
                        f"https://app.onlyfansapi.com/api/{ACCOUNT_ID}/mass-messaging/{old_id}",
                        headers={"Authorization": f"Bearer {OF_KEY}"},
                        method="DELETE"
                    )
                    log.info(f"MASS-BUMP: Deleted {old_id}: {json.dumps(resp)[:200]}")
                except Exception as e:
                    log.error(f"MASS-BUMP: Delete failed for {old_id}: {e}")
            
            # Step 2: Build exclusion list
            active_ids = get_active_chatter_ids()
            log.info(f"MASS-BUMP: Excluding {len(active_ids)} active chatters")
            
            # Step 3: Send new bump
            msg = random.choice(MASS_BUMP_MESSAGES)
            photo = random.choice(MASS_BUMP_PHOTOS)
            
            body = {
                "text": msg,
                "mediaFiles": [photo],
                "userLists": ["fans", "following"],
                "excludeListIds": SFS_EXCLUDE_LISTS,
            }
            if active_ids:
                body["excludeUserIds"] = active_ids
            
            resp = curl_json(
                f"https://app.onlyfansapi.com/api/{ACCOUNT_ID}/mass-messaging",
                headers={"Authorization": f"Bearer {OF_KEY}"},
                method="POST",
                body=body
            )
            
            new_id = resp.get("data", {}).get("id")
            if new_id:
                state["last_mass_bump_id"] = new_id
                state["last_mass_bump_ts"] = time.strftime("%Y-%m-%dT%H:%M:%S%z")
                state["last_mass_bump_ts_epoch"] = now
                state["last_mass_bump_text"] = msg
                state["bump_count"] = state.get("bump_count", 0) + 1
                save_json(MASS_BUMP_STATE_FILE, state)
                log.info(f"MASS-BUMP: Sent '{msg}' → id={new_id}, excluded {len(active_ids)} active chatters")
                stats["sends"] += 1
            else:
                log.error(f"MASS-BUMP: Send failed: {json.dumps(resp)[:300]}")
            
            # Sleep until next cycle
            time.sleep(MASS_BUMP_INTERVAL)
            
        except Exception as e:
            log.error(f"MASS-BUMP error: {e}")
            time.sleep(300)  # Retry in 5 min on error


# =====================================================================
# SECTION 4B: OPUS SAVE CHECKER (background thread)
# =====================================================================

SAVE_COOLDOWN = 6 * 3600  # Don't save-attempt same fan within 6 hours

def save_checker():
    """Background thread: every 15 minutes, detect fans going cold after rule-based actions.

    Triggers Opus save when:
    1. Fan was pitched (PPV sent) by rule-based flow, got bumped, STILL no reply after 6h+
    2. Fan was engaged but went silent for 8h+ (got free content, never progressed)

    Does NOT trigger if:
    - Fan already had an Opus save attempt recently (cooldown)
    - Fan is dormant/handed_off (already handled)
    - Fan is a spender (already Opus-routed)
    """
    while True:
        time.sleep(900)  # 15 min
        if not is_system_enabled():
            continue
        try:
            now = time.time()
            for filepath in glob.glob(os.path.join(BOT_STATE_DIR, "*.json")):
                try:
                    with open(filepath) as f:
                        fs = json.load(f)
                    fan_id = fs.get("fan_id")
                    state = fs.get("state", "new")
                    total_spent = fs.get("total_spent", 0)
                    last_ts = fs.get("last_interaction_ts", 0)
                    bumped = fs.get("bump_sent", False)
                    last_save_ts = fs.get("last_save_attempt_ts", 0)

                    # Skip: already handled, spender, or recently saved
                    if state in ("handed_off", "dormant", "new", "greeted"):
                        continue
                    if total_spent > 0:
                        continue
                    if last_save_ts and (now - last_save_ts) < SAVE_COOLDOWN:
                        continue
                    if not last_ts:
                        continue

                    hours_silent = (now - last_ts) / 3600
                    trigger = None

                    # Pitched + bumped + still silent after 6h → Opus save
                    if state == "pitched" and bumped and hours_silent >= 6:
                        trigger = f"pitched_cold_6h (silent {hours_silent:.1f}h after PPV+bump)"

                    # Engaged but silent 8h+ → never converted to pitched
                    elif state == "engaged" and hours_silent >= 8:
                        trigger = f"engaged_cold_8h (silent {hours_silent:.1f}h, never pitched)"

                    if trigger:
                        log.info(f"OPUS-SAVE-CHECK: Fan {fan_id} → {trigger}")
                        fs["save_trigger"] = trigger
                        fs["save_trigger_ts"] = now
                        fs["last_save_attempt_ts"] = now
                        save_fan_state_v2(fan_id, fs)

                        # Route to Opus via wake
                        try:
                            # Get recent messages for context
                            msgs = get_recent_messages(fan_id, limit=10)
                            call_opus_save(fan_id, trigger, msgs)
                        except Exception as e:
                            log.error(f"save_checker opus call failed for {fan_id}: {e}")

                except Exception:
                    pass
        except Exception as e:
            log.error(f"save_checker error: {e}")


def get_recent_messages(fan_id, limit=10):
    """Pull recent messages from OF API for a fan."""
    try:
        resp = curl_json(
            f"https://app.onlyfansapi.com/api/{ACCOUNT_ID}/messages/{fan_id}?limit={limit}",
            headers={"Authorization": OF_KEY}
        )
        messages = resp.get("data", [])
        result = []
        for m in messages:
            result.append({
                "from": "model" if m.get("fromUser", {}).get("id") != int(fan_id) else "fan",
                "text": m.get("text", ""),
                "ts": m.get("createdAt", ""),
                "price": m.get("price", 0),
                "isOpened": m.get("isOpened", False),
            })
        return list(reversed(result))  # chronological
    except Exception as e:
        log.error(f"get_recent_messages({fan_id}): {e}")
        return []


def call_opus_save(fan_id, trigger, last_messages):
    """Trigger Opus save attempt for a fan going cold in rule-based flow."""
    fs = load_fan_state_v2(fan_id)

    save_prompt = f"""You are Bianca Woods. A fan is going COLD and we need a SAVE attempt.

SITUATION: {trigger}
This fan was handled by rule-based automation and is falling off. Your job: craft ONE message that re-engages them.
This is a SAVE — be creative. Change the angle. If they got PPVs, try GFE warmth. If they got teases, try vulnerability. 
Don't repeat what already failed.

[FAN CONTEXT]
fan_id: {fan_id}
name: {fs.get('name', 'babe')}
state: {fs.get('state')}
messages_received: {fs.get('messages_received', 0)}
messages_sent: {fs.get('messages_sent', 0)}
total_spent: ${fs.get('total_spent', 0)}
content_sent: {json.dumps(fs.get('content_sent', [])[-10:])}
bump_sent: {fs.get('bump_sent', False)}
save_trigger: {trigger}

[RECENT MESSAGES]
{json.dumps(last_messages[-10:], separators=(',',':'))}

RULES:
- Output ONE JSON line
- Valid actions: text, ppv, free_media, skip
- For text: {{"action":"text","message_text":"...","reason":"..."}}
- For ppv: {{"action":"ppv","content_key":"...","price":N,"message_text":"...","reason":"..."}}
- For free_media: {{"action":"free_media","content_key":"...","message_text":"...","reason":"..."}}
- For skip (truly hopeless): {{"action":"skip","reason":"..."}}
- Price sweet spot: $12-20 for saves
- Never reuse content_key already in content_sent
- Be DIFFERENT from what the automation already tried"""

    # Write pending file and wake
    task_file = os.path.join(DIR, f"bianca-pending-opus-{fan_id}.json")
    task_data = {
        "fan_id": fan_id,
        "prompt": save_prompt,
        "type": "save_attempt",
        "trigger": trigger,
        "ts": time.time()
    }
    with open(task_file, "w") as f:
        json.dump(task_data, f)

    record_opus_call()
    stats["opus_calls"] += 1
    stats["save_attempts"] += 1

    hook_token = "05382603da53367102df5f03f48752ad2b33cbc9e2830db1"
    wake_text = (
        f"BIANCA_OPUS_SAVE: Fan {fan_id} going cold — save attempt needed. "
        f"Trigger: {trigger}. "
        f"Read research/bianca-pending-opus-{fan_id}.json for the task. "
        f"Spawn ONE Opus worker (model anthropic/claude-opus-4-6, timeout 60s) with the 'prompt' field as the task. "
        f"When result comes back, parse the JSON decision and run: "
        f"python3 research/bianca-execute-decision.py {fan_id} '<json_decision>'. "
        f"Then delete the pending file. "
        f"ALSO: Send Kiefer a Telegram alert: '🚨 Opus Save on fan {fan_id}: [trigger] → [action taken]'"
    )

    try:
        subprocess.run(
            ["/usr/bin/curl", "-s", "-X", "POST",
             "http://127.0.0.1:18789/hooks/wake",
             "-H", f"Authorization: Bearer {hook_token}",
             "-H", "Content-Type: application/json",
             "-d", json.dumps({"text": wake_text, "mode": "now"})],
            capture_output=True, text=True, timeout=10
        )
        log.info(f"OPUS-SAVE wake sent for fan {fan_id}: {trigger}")
    except Exception as e:
        log.error(f"OPUS-SAVE wake failed for fan {fan_id}: {e}")


# =====================================================================
# SECTION 5: VAULT MAP (same as v1)
# =====================================================================

VAULT_MAP = {
    "gfe_selfie": ["4129214996", "4129214993", "4118094231", "4118094226", "4113019829", "4113019824", "4113019823", "4113019822", "4113019819", "4112955857", "4112955856"],
    "booty_pic": ["4161285101", "4084340188", "4084340187", "4084340182", "4084340161"],
    "bump": ["4295115634", "4295115608", "4271207724", "4128847737", "4118094254", "4118094218", "4084333700", "4084332834", "4084332833", "4084332827"],
    "rekindle_vid": ["4208184080", "4142976927", "4142976472"],
    "sexting1_pic": ["4084442782"],
    "sexting2_pic": ["4100912693"],
    "sexting3_pic": ["4156205024"],
    "sexting1_vid_15": ["4084442804"], "sexting1_vid_24": ["4084442810"],
    "sexting1_vid_38": ["4084442819"], "sexting1_vid_54": ["4084442829"],
    "sexting1_vid_75": ["4084442833"],
    "sexting2_vid_15": ["4100912696"], "sexting2_vid_24": ["4100912699"],
    "sexting2_vid_38": ["4100912703"], "sexting2_vid_54": ["4100912708"],
    "sexting2_vid_75": ["4100912711"],
    "sexting3_vid_15": ["4156205030"], "sexting3_vid_24": ["4156205035"],
    "sexting3_vid_38": ["4156205039"], "sexting3_vid_54": ["4156205044"],
    "sexting3_vid_75": ["4156205051"], "sexting3_vid_100": ["4161281036"],
    "bundle1": ["4095109757", "4084340351", "4084340350", "4084340349", "4084340348"],
    "bundle2": ["4084508911", "4084384391", "4084340188", "4084340187", "4084340183", "4084340182", "4084340178", "4084340177", "4084340174", "4084340168", "4084340161"],
    "bundle3": ["4095109759", "4084340160", "4084340156", "4084340155", "4084340152", "4084340151", "4084340143", "4084340141", "4084340138", "4084340134", "4084340132"],
    "bundle4": ["4095109760", "4084339349", "4084339348", "4084339347", "4084339346", "4084339345"],
    "bundle5": ["4095109765", "4084352226", "4084352221", "4084352219", "4084352217", "4084352214", "4084352208", "4084352203", "4084352179"],
    "bundle6": ["4090853530", "4084384389", "4084352202", "4084352199", "4084352183", "4084352180"],
    "bundle7": ["4095109773", "4084339337", "4084339336", "4084339335", "4084339334", "4084339333", "4084339331", "4084339330", "4084339325"],
    "bundle8": ["4095109767", "4084384387", "4084339324", "4084339323", "4084339320", "4084339319"],
    "bundle9": ["4163079923", "4161285098", "4161285094", "4161285093", "4161285090"],
    "bundle10": ["4178636800", "4161285101", "4161285097", "4161285092", "4161285091"],
    "bundle11": ["4182101058", "4176760767", "4176760766", "4176760765", "4176760763", "4176760761", "4176760760", "4176760759", "4176760758", "4176760757", "4176760754", "4176760753"],
    "bundle12": ["4184130158", "4176762659", "4176762658", "4176762655", "4176762654", "4176762653", "4176762652", "4176762650", "4176762649", "4176762647", "4176762645", "4176762644", "4176762643", "4176762641"],
    "bundle13": ["4187068301", "4176764449", "4176764448", "4176764447", "4176764444", "4176764443", "4176764442", "4176764441", "4176764440", "4176764439", "4176764438", "4176764436"],
    "bundle14": ["4190352077", "4161405222", "4161405220", "4161405218", "4161405217", "4161405215", "4161405213", "4161405212", "4161405211", "4161405210", "4161405209", "4161405206"],
    "bundle15": ["4190618896", "4166315392", "4161407774", "4161407771", "4161407769", "4161407767", "4161407765", "4161407763", "4161407760", "4161407759", "4161407758", "4161407757", "4161407756"],
    "bundle16": ["4193745219", "4166578144", "4166578143", "4166578142", "4166578141", "4166578140", "4166578139", "4166578138", "4166578136", "4166578135", "4166578134", "4166578131", "4166578128", "4166578127"],
    "bundle17": ["4194216128", "4166589335", "4166589331", "4166589329", "4166589327", "4166589326", "4166589325", "4166589324", "4166589323", "4166589322", "4166589319"],
    "bundle18": ["4201723400", "4177896625", "4177896623", "4177896621", "4177896620", "4177896618", "4177896615", "4177896613", "4177896612", "4177896610", "4177896609", "4177896608"],
    "bundle19": ["4166383225", "4166383222", "4166383220", "4166383218", "4166383215"],
    "bundle20": ["4242088817", "4242088813", "4242088812", "4242088811", "4242088810", "4242088808", "4242088805", "4242088802", "4242088801", "4242088796"],
    "bundle21": ["4245488102", "4245488099", "4245488097", "4245488096", "4245488095", "4245488093", "4245488092", "4245488091", "4245488090", "4245488089"],
    "bundle22": ["4245491586", "4245491585", "4245491583", "4245491582", "4245491580", "4245491579", "4245491577", "4245491575", "4245491574"],
    "bundle23": ["4292078295", "4250784656", "4250784655", "4250784654", "4250784653", "4250784649", "4250784647", "4250784646", "4250784639"],
    "bundle24": ["4250791307", "4250791305", "4250791302", "4250791301", "4250791300", "4250791298", "4250791297", "4250791294"],
    "bundle25": ["4251042040", "4251042039", "4251042037", "4251042036", "4251042035", "4251042034", "4251042032", "4251042030", "4251042029"],
    "bundle26": ["4257179556", "4257179555", "4257179554", "4257179550", "4257179547", "4257179546", "4257179536", "4257179535", "4257179533", "4257179524", "4257179522", "4257179520", "4257179516"],
    "combo1": ["4084508911", "4182101058", "4084384391", "4084340188", "4084340187", "4176760767", "4176760766", "4176760765", "4095109757", "4084340351", "4084340350", "4084340349"],
    "combo2": ["4090853530", "4184130158", "4084384389", "4084352202", "4084352199", "4176762659", "4176762658", "4176762655", "4095109759", "4084340160", "4084340156", "4084340155"],
    "combo3": ["4095109767", "4187068301", "4084384387", "4084339324", "4084339323", "4176764449", "4176764448", "4176764447", "4095109760", "4084339349", "4084339348", "4084339347"],
    "combo4": ["4084508911", "4190352077", "4084384391", "4084340188", "4084340187", "4161405222", "4161405220", "4161405218", "4095109765", "4084352226", "4084352221", "4084352219"],
    "combo5": ["4090853530", "4190618896", "4084384389", "4084352202", "4084352199", "4166315392", "4161407774", "4161407771", "4095109773", "4084339337", "4084339336", "4084339335"],
    "combo6": ["4095109767", "4193745219", "4084384387", "4084339324", "4084339323", "4166578144", "4166578143", "4166578142", "4163079923", "4161285098", "4161285094", "4161285093"],
    "combo7": ["4182101058", "4194216128", "4176760767", "4176760766", "4176760765", "4166589335", "4166589331", "4166589329", "4178636800", "4161285101", "4161285097", "4161285092"],
    "combo8": ["4184130158", "4201723400", "4176762659", "4176762658", "4176762655", "4177896625", "4177896623", "4177896621", "4166383225", "4166383222", "4166383220", "4166383218"],
    "combo9": ["4187068301", "4190352077", "4176764449", "4176764448", "4176764447", "4161405222", "4161405220", "4161405218", "4242088817", "4242088813", "4242088812", "4242088811"],
    "combo10": ["4190618896", "4193745219", "4166315392", "4161407774", "4161407771", "4166578144", "4166578143", "4166578142", "4245488102", "4245488099", "4245488097", "4245488096"],
    "combo11": ["4194216128", "4201723400", "4166589335", "4166589331", "4166589329", "4177896625", "4177896623", "4177896621", "4245491586", "4245491585", "4245491583", "4245491582"],
    "combo12": ["4182101058", "4190618896", "4176760767", "4176760766", "4176760765", "4166315392", "4161407774", "4161407771", "4292078295", "4250784656", "4250784655", "4250784654"],
    "combo13": ["4184130158", "4193745219", "4176762659", "4176762658", "4176762655", "4166578144", "4166578143", "4166578142", "4250791307", "4250791305", "4250791302", "4250791301"],
    "starter_pack": "HIGH_TICKET",
    "best_of": "HIGH_TICKET",
    "everything": "HIGH_TICKET",
    "custom_tier1_shower": ["4242780548", "4240412927", "4132819366", "4112437083", "4109660005", "4107908001", "4106671990", "4095915546", "4095915531", "4095915525", "4095915510", "4095915495", "4095915490"],
    "custom_tier2_bedroom": ["4242538532", "4240412930", "4141551599", "4132819369", "4107923734", "4101091755"],
    "custom_tier3_topless": ["4241155807", "4240495621", "4125482011", "4112437075", "4108475260", "4108475253", "4108475241", "4108475237"],
    "custom_tier4_rubbing": ["4244605437", "4240495624", "4138951601", "4130805983", "4130793373", "4130787911", "4130764880"],
    "custom_tier5_titty": ["4240495622", "4141597798", "4116444565"],
    "custom_tier6_tryon": ["4141649812", "4132819370"],
    "custom_tier7_cumming": ["4243623154", "4240495623", "4141698164", "4139431932", "4139422853", "4139401380", "4139381132", "4139287517"],
}


# =====================================================================
# SECTION 6: SIGNAL DETECTION PATTERNS
# =====================================================================

GREETING_PATTERNS = re.compile(
    r"^(hey+|hi+|hello+|hii+|good morning|gm|what'?s up|sup|heyy+|heyyy+|yo+|howdy|hola)[\s!?.💕❤️😘]*$",
    re.IGNORECASE
)
THANKS_PATTERNS = re.compile(
    r"^(thanks?( you)?|ty|thx|thank u|tysm|appreciate it)[\s!?.💕❤️]*$",
    re.IGNORECASE
)
EMOJI_ONLY = re.compile(
    r"^[\U0001F300-\U0001FAD6\U0001F600-\U0001F64F\U0001F680-\U0001F6FF\u2600-\u27BF\u2702-\u27B0\U0001F900-\U0001F9FF\U0001FA00-\U0001FA6F\U0001FA70-\U0001FAFF❤️‍🔥💕💗💖💘💝💞💓🥰😍🤤🥵👅💦🍑🍆✨🫦👀🫶🤭😜😏]+$"
)
HOW_ARE_YOU = re.compile(
    r"^(how are (you|u)|how('?s| is) (it going|everything|ur day|your day)|wyd|what('?re| are) (you|u) (doing|up to)|wbu|hbu|what about (you|u))[\s!?.💕❤️😘]*$",
    re.IGNORECASE
)
GOODBYE = re.compile(
    r"^(good ?night|gotta go|bye+|g2g|ttyl|talk later|heading out|going to (bed|sleep)|nighty? ?night|sweet dreams)[\s\w!?.💕❤️😘]*$",
    re.IGNORECASE
)
FILLER = re.compile(
    r"^(yeah|yea|ya|yep|yup|ok|okay|k|lol|lmao|haha|hahaha|ha|nice|cool|true|fr|facts|bet|word|right|same|ikr|mood|real|deadass|ong)[\s!?.💕😂🤣]*$",
    re.IGNORECASE
)
SEXUAL_SIGNALS = re.compile(
    r"(nud|naked|strip|show me|see more|content|pics|videos|explicit|pussy|tits|boobs|ass|body|topless|lingerie|bikini|sexy|naughty|wild|freaky|horny|hard|turned on|boner|cum|wet|😈|🍆|🍑|💦|👅|🥵|🤤)",
    re.IGNORECASE
)
BUYING_SIGNALS = re.compile(
    r"(how much|price|cost|what do (you|u) (have|offer|sell|post)|what('?s| is) (on|in) (your|ur) (page|profile|menu)|buy|purchase|unlock|ppv|pay|worth|deal|bundle|package|send me|show me more)",
    re.IGNORECASE
)
CURIOSITY_SIGNALS = re.compile(
    r"(what (do|kind|type).*(post|content|share|make|do)|tell me about|what('?s| is) (this|your).*(page|of|about)|new here|just (sub|found|joined|started))",
    re.IGNORECASE
)
INTEREST_SIGNALS = re.compile(
    r"(you('?re| are) (so |really )?(hot|beautiful|gorgeous|cute|pretty|fine|sexy|stunning|amazing)|love (your|ur) (body|boobs|tits|ass|eyes|smile|face|hair|lips|look)|damn|omg|wow|😍|🤩|🥵|love (it|this|that|them)|you('?re| are) perfect|dream girl|obsessed|cant stop|addicted|fan of (you|yours)|following|subscribed for)",
    re.IGNORECASE
)

# Rejection / can't-afford / disengagement signals → trigger Opus save
REJECTION_SIGNALS = re.compile(
    r"(can'?t afford|too (much|expensive|pricey)|no (money|funds|cash|budget)|broke|not (interested|worth|buying|paying)|don'?t (want|have|need)|pass|nah|nope|no thanks|not right now|maybe later|i'?m good|stop|unsubscri|leave me|waste|rip ?off|scam)",
    re.IGNORECASE
)


# =====================================================================
# SECTION 7: RESPONSE TEMPLATES
# =====================================================================

GREETING_REPLIES = [
    "heyy babe 💕", "hiii cutie 😘", "hey love 💗", "heyyy 🥰",
    "hi babe!! 💕", "heyy handsome 😏", "omg hiii 💕✨",
]
EMOJI_REPLIES = [
    "😘💕", "hehe 🥰", "💕💕", "u make me smile 😊💕",
    "🫶✨", "right back at u babe 😘",
]
THANKS_REPLIES = [
    "ofc babe 💕", "anytime love 😘", "always for u 💕",
]
GOODBYE_REPLIES = [
    "night babe 🥺💕 dream of me ok?",
    "aww already?? 🥺 ok fine sweet dreams babe 💕😘",
    "nooo dont leave 😤 jk lol night cutie 💕",
    "byeee 💕 ill be here when u get back 😏",
]
RAPPORT_REPLIES = [
    "im good babe just laying in bed thinking about u 🥰 wbu?",
    "better now that ur here 😏💕 what are u up to?",
    "just being cute and bored 🙈 entertain me?? lol",
    "kinda lonely ngl 🥺 glad ur here tho 💕 whatcha doing?",
]
TEASE_REPLIES = [
    "im actually taking some pics rn 📸 getting a little adventurous today 😏",
    "omg i just tried on something new and it looks soo good 🙈 wanna see?",
    "ugh im so bored... maybe i should take some spicy pics to pass the time 👀",
    "u know what... i feel like being a little naughty today 😏💕",
    "i just took something crazy and idk if i should send it 🙈",
]
FREE_HOOK_REPLIES = [
    "ok fine since ur being so sweet... heres a little preview just for u 🙈💕",
    "i dont usually do this but... u seem different 🥺 heres a lil something",
    "ok but dont show anyone 🙈 this is just between us 💕",
    "i was saving this but u deserve a sneak peek 😏💕",
]
PPV_PUSH_REPLIES = [
    "ok so... ive never done this before but u make me want to 🙈🔥 i put together 2 videos and a whole set of pics just for u",
    "babe i have something crazy... its 2 videos and like 10 pics and its 🔥🔥 ive never sent this to anyone before 🥺",
    "ok i trust u enough now 😏 i made u a whole package... 2 vids + all my best pics 💕🔥 nobody else has seen this",
    "ive been saving this for someone special 🥺 2 videos and a full set... and i think ur that person 💕🔥",
    "ok fine u wore me down 🙈 im sending u my best stuff... 2 vids + 10 pics... dont show anyone 🥺💕",
]
SEXUAL_REPLY_TEASE = [
    "omg 😏 u dont waste any time huh... i like that 🔥 i actually have something ud love",
    "mmm 😏 well since u asked... i might have a few things 🙈💕",
    "hehe someones eager 😏💕 ok ok... i have something really good actually",
    "ooo i like where ur heads at 😈💕 wanna see what i just made?",
]
BUYING_REPLY = [
    "omg yes!! i have so much 🙈 let me send u my favorite set... i think ull love it 😏🔥",
    "yesss i have some really good stuff 💕 heres one of my best sets just for u 🔥",
    "ooo u came to the right place babe 😏 check this out...",
]
CURIOSITY_REPLY = [
    "omg so glad u asked 🥰 i post all kinds of stuff... wanna see a preview? 🙈",
    "hehe well... lets just say i get a little wild on here 😏 heres a taste 💕",
    "i post stuff i cant put anywhere else 🙈 heres a sneak peek babe...",
]
FILLER_REPLIES = [
    "lol 😂 ur funny babe... sooo what are u into?",
    "haha 😏 anyway i was thinking about u...",
    "haha 🥰 u make me smile. so tell me something... what do u like?",
    "lol right?? 😂 ok but real talk... what brought u here? 😏",
]
REENGAGE_REPLIES = [
    "thats cool babe 💕 so what are u doing rn? im kinda bored 🙈",
    "haha aww 🥰 ok but like... what do u wanna do rn 😏",
    "interesting 😏 so tell me... are u usually this shy? 💕",
]

NEW_SUB_WELCOME = [
    "omg hiii babe!! 🥰💕 im so happy u found me!! im bianca btw 😘 i post stuff here i cant put anywhere else 🙈",
    "heyyy cutie!! 💕✨ welcome to my page!! im sooo glad ur here 🥰 i have some really fun stuff to show u 😏",
    "hiii babe!! 🥰 omgg thank u for subscribing 💕 u made my day!! i have a little welcome gift for u 🙈😘",
]
NEW_SUB_FOLLOWUP = [
    "sooo since ur new... i made something special just for u 🙈🔥 2 videos and a whole set of pics... wanna see? 😏💕",
    "ok i already trust u enough for this 😏 i put together my hottest set just for my new subscribers 🔥 its 2 vids + pics 💕",
    "babe i have this set ive been saving... its 2 videos and pics that i only share with people i really like 🥺💕 want it?",
]
PURCHASE_FOLLOWUP = [
    "omg u actually got it 🥺💕 what did u think?? did u like it? 😏",
    "babe!! 💕 u just made my whole day 🥰 sooo... what was ur favorite part?",
    "omgg thank u babe 🥺💕 that means so much to me!! sooo what did u think? 🙈",
]
PURCHASE_UPSELL = [
    "ok since u liked that... i have something way more intense 🙈🔥 i spent all morning on this one...",
    "babe i have this other set thats even crazier 😈 like... u havent seen anything yet 🔥",
    "omg ok so i was saving this but since u already proved u can handle it 😏🔥 this ones next level...",
    "ok ur officially my favorite 🥺💕 i made something just for u... nobody else has seen this",
]


# =====================================================================
# SECTION 8: PRIORITY QUEUE (same as v1)
# =====================================================================

PRIORITY_NEW_SUB = 1
PRIORITY_PURCHASER = 2
PRIORITY_HIGH_SPENDER = 3
PRIORITY_BUYING_SIGNAL = 4
PRIORITY_SEXUAL_SIGNAL = 5
PRIORITY_ACTIVE_CHAT = 6
PRIORITY_BUMP_REPLY = 7
PRIORITY_COLD = 8

PRIORITY_NAMES = {1: "NEW_SUB", 2: "PURCHASER", 3: "HIGH_SPENDER", 4: "BUYING_SIGNAL",
                  5: "SEXUAL_SIGNAL", 6: "ACTIVE_CHAT", 7: "BUMP_REPLY", 8: "COLD"}

import heapq

_priority_queue = []
_queue_lock = threading.Lock()
_queue_event = threading.Event()


def classify_priority(fan_id, message_text, is_new_sub=False, is_purchase=False):
    if is_new_sub:
        return PRIORITY_NEW_SUB
    if is_purchase:
        return PRIORITY_PURCHASER

    fs = load_fan_state_v2(fan_id)
    total_spent = fs.get("total_spent", 0)

    if total_spent >= 50:
        return PRIORITY_HIGH_SPENDER
    if total_spent > 0:
        return PRIORITY_HIGH_SPENDER

    text = (message_text or "").lower()
    if any(kw in text for kw in ["how much", "price", "buy", "unlock", "send me", "show me more", "what do you have"]):
        return PRIORITY_BUYING_SIGNAL
    if any(kw in text for kw in ["nude", "naked", "strip", "show me", "pussy", "tits", "boobs", "horny", "hard", "🍆", "🍑", "💦"]):
        return PRIORITY_SEXUAL_SIGNAL
    if fs.get("messages_received", 0) >= 3:
        return PRIORITY_ACTIVE_CHAT

    return PRIORITY_COLD


def enqueue_fan(priority, fan_id, payload):
    if priority >= PRIORITY_ACTIVE_CHAT:
        sort_key = time.time()
    else:
        sort_key = -time.time()
    with _queue_lock:
        heapq.heappush(_priority_queue, (priority, sort_key, fan_id, payload))
    _queue_event.set()


def priority_worker():
    log.info("Priority worker started")
    while True:
        _queue_event.wait()
        while True:
            with _queue_lock:
                if not _priority_queue:
                    _queue_event.clear()
                    break
                priority, sort_key, fan_id, payload = heapq.heappop(_priority_queue)
            age_ms = int((time.time() - abs(sort_key)) * 1000)
            pname = PRIORITY_NAMES.get(priority, str(priority))
            log.info(f"QUEUE: Processing fan {fan_id} priority={pname} age={age_ms}ms queue_depth={len(_priority_queue)}")
            try:
                process_webhook(payload)
            except Exception as e:
                log.error(f"Priority worker error for fan {fan_id}: {e}")
                stats["errors"] += 1


# =====================================================================
# SECTION 9: HELPERS
# =====================================================================

def now_ms():
    return int(time.time() * 1000)


def load_json(path, default=None):
    with file_lock:
        try:
            with open(path) as f:
                return json.load(f)
        except:
            return default if default is not None else {}


def save_json(path, data):
    with file_lock:
        try:
            tmp = path + ".tmp"
            with open(tmp, "w") as f:
                json.dump(data, f, indent=2)
            os.replace(tmp, path)
        except Exception as e:
            log.error(f"save_json {path}: {e}")


def curl_json(url, headers=None, method="GET", body=None, timeout=10):
    try:
        cmd = ["curl", "-s", "-w", "\n%{http_code}", "--max-time", str(timeout)]
        if method != "GET":
            cmd += ["-X", method]
        if headers:
            for k, v in headers.items():
                cmd += ["-H", f"{k}: {v}"]
        if body:
            cmd += ["-H", "Content-Type: application/json", "-d", json.dumps(body)]
        cmd.append(url)
        r = subprocess.run(cmd, capture_output=True, text=True, timeout=timeout + 5)
        if r.returncode != 0:
            return {"error": f"curl_exit_{r.returncode}", "stderr": r.stderr[:200]}
        lines = r.stdout.rsplit("\n", 1)
        response_body = lines[0] if len(lines) > 1 else r.stdout
        status_code = int(lines[-1]) if len(lines) > 1 and lines[-1].strip().isdigit() else 0
        if status_code == 429:
            return {"error": "429"}
        if not response_body.strip():
            return {"error": "empty", "status": status_code}
        return json.loads(response_body)
    except json.JSONDecodeError:
        return {"error": "json_parse", "raw": response_body[:200] if 'response_body' in dir() else ""}
    except Exception as e:
        return {"error": str(e)}


def send_of_message(fan_id, text, media_ids=None, price=None, content_key=None):
    """Send message via OF API. Returns response dict."""
    body = {"text": text}
    if media_ids:
        body["mediaFiles"] = media_ids
    if price:
        body["price"] = price

    resp = curl_json(
        f"{OF_API}/chats/{fan_id}/messages",
        headers={"Authorization": OF_KEY},
        method="POST", body=body
    )

    if isinstance(resp, dict) and resp.get("error") == "429":
        log.warning(f"429 from OF API sending to {fan_id} — pausing")
        handle_rate_limit()
        return resp

    stats["sends"] += 1

    # Update v2 fan state
    record_fan_message_v2(fan_id, from_bianca=True, content_key=content_key, price=price)

    # Log to conversation log
    action_type = "ppv_sent" if price else ("media" if media_ids else "text")
    try:
        entry = {
            "fan_id": int(fan_id), "from": "b", "ts": int(time.time()),
            "text": text[:500] if text else "",
        }
        if content_key:
            entry["key"] = content_key
        if price:
            entry["price"] = price
        entry["action"] = action_type
        with file_lock:
            with open(CONVERSATION_LOG_FILE, "a") as f:
                f.write(json.dumps(entry, separators=(',', ':')) + "\n")
    except Exception as e:
        log.error(f"conversation log write: {e}")

    return resp


def handle_rate_limit():
    opus = load_json(OPUS_CALLS_FILE, {"calls": [], "last_429": None})
    opus["last_429"] = now_ms()
    save_json(OPUS_CALLS_FILE, opus)
    state = load_json(SYSTEM_STATE_FILE, {})
    state["COOLDOWN_UNTIL"] = now_ms() + (RATE_LIMIT_PAUSE_SEC * 1000)
    state["last_429"] = now_ms()
    save_json(SYSTEM_STATE_FILE, state)


def check_opus_rate_limit():
    now = now_ms()
    opus = load_json(OPUS_CALLS_FILE, {"calls": [], "last_429": None})
    last_429 = opus.get("last_429")
    if last_429 and (now - last_429) < 60000:
        return False
    calls = [c for c in opus.get("calls", []) if now - c < 60000]
    return len(calls) < MAX_OPUS_PER_MIN


def record_opus_call():
    opus = load_json(OPUS_CALLS_FILE, {"calls": [], "last_429": None})
    now = now_ms()
    calls = [c for c in opus.get("calls", []) if now - c < 60000]
    calls.append(now)
    opus["calls"] = calls
    save_json(OPUS_CALLS_FILE, opus)


def is_system_enabled():
    state = load_json(SYSTEM_STATE_FILE, {})
    if not state.get("SYSTEM_ENABLED", True):
        return False
    cooldown = state.get("COOLDOWN_UNTIL")
    if cooldown and now_ms() < cooldown:
        return False
    return True


def is_promo(username, message_text):
    if username and username.lower() in PROMO_USERNAMES:
        return True
    msg_lower = (message_text or "").lower()
    return any(kw in msg_lower for kw in PROMO_KEYWORDS)


def track_active_chatter(fan_id, fan_name=""):
    with file_lock:
        try:
            with open(ACTIVE_CHATTERS_FILE) as f:
                active = json.load(f)
        except:
            active = {}
        now = time.time()
        active[str(fan_id)] = {"name": fan_name, "last_msg": now}
        cutoff = now - 14400
        active = {k: v for k, v in active.items() if v.get("last_msg", 0) > cutoff}
        try:
            tmp = ACTIVE_CHATTERS_FILE + ".tmp"
            with open(tmp, "w") as f:
                json.dump(active, f, indent=2)
            os.replace(tmp, ACTIVE_CHATTERS_FILE)
        except Exception as e:
            log.error(f"track_active_chatter: {e}")


def is_bump_message(text):
    if not text:
        return False
    text = re.sub(r"<[^>]+>", "", text).strip()
    try:
        with open(BUMP_REGISTRY_FILE) as f:
            registry = json.load(f)
        return text in registry.get("bump_texts", [])
    except:
        bump_texts = [
            "heyyy u 💕 been thinking about u",
            "bored and looking cute rn 😏 wanna see?",
            "miss talking to u 🥺",
            "just took this for u 📸",
            "are u ignoring me 😤💕",
            "pssst 😘",
            "hiiii remember me? 🙈",
        ]
        return text in bump_texts


def last_outgoing_was_bump(fan_id):
    try:
        resp = curl_json(
            f"{OF_API}/chats/{fan_id}/messages?limit=3",
            headers={"Authorization": OF_KEY}, timeout=8
        )
        if not resp or resp.get("error"):
            return False
        messages = resp.get("data", resp) if isinstance(resp, dict) else resp
        if not isinstance(messages, list):
            return False
        for msg in messages:
            from_id = msg.get("fromUser", {}).get("id")
            if from_id == BIANCA_ID:
                text = re.sub(r"<[^>]+>", "", msg.get("text", "") or "").strip()
                return is_bump_message(text)
        return False
    except:
        return False


# =====================================================================
# SECTION 10: PERFORMANCE TRACKING (same as v1)
# =====================================================================

def load_perf():
    with file_lock:
        try:
            with open(PERF_FILE) as f:
                return json.load(f)
        except:
            return {
                "lifetime": {"replies": 0, "ppvs_sent": 0, "ppvs_unlocked": 0, "revenue": 0.0,
                              "new_subs_welcomed": 0, "upsells_sent": 0, "tips": 0.0, "opus_calls": 0},
                "today": {},
                "fans": {},
                "hourly": {},
            }


def save_perf(perf):
    with file_lock:
        try:
            tmp = PERF_FILE + ".tmp"
            with open(tmp, "w") as f:
                json.dump(perf, f, indent=2)
            os.replace(tmp, PERF_FILE)
        except Exception as e:
            log.error(f"save_perf: {e}")


def perf_track(event, fan_id=None, amount=0.0, content_key=None, price=0):
    perf = load_perf()
    today = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    hour = datetime.now(timezone.utc).strftime("%Y-%m-%d-%H")

    if today not in perf["today"]:
        perf["today"][today] = {"replies": 0, "ppvs_sent": 0, "ppvs_unlocked": 0,
                                 "revenue": 0.0, "new_subs": 0, "upsells_sent": 0, "tips": 0.0, "opus_calls": 0}
    if hour not in perf["hourly"]:
        perf["hourly"][hour] = {"replies": 0, "ppvs_sent": 0, "ppvs_unlocked": 0, "revenue": 0.0}

    d = perf["today"][today]
    h = perf["hourly"][hour]
    lt = perf["lifetime"]

    if event == "reply":
        d["replies"] += 1; h["replies"] += 1; lt["replies"] += 1
    elif event == "ppv_sent":
        d["ppvs_sent"] += 1; h["ppvs_sent"] += 1; lt["ppvs_sent"] += 1
        if fan_id:
            fk = str(fan_id)
            if fk not in perf["fans"]:
                perf["fans"][fk] = {"ppvs_sent": 0, "ppvs_unlocked": 0, "spent": 0.0, "first_seen": today}
            perf["fans"][fk]["ppvs_sent"] += 1
    elif event == "ppv_unlocked":
        d["ppvs_unlocked"] += 1; h["ppvs_unlocked"] += 1; lt["ppvs_unlocked"] += 1
        d["revenue"] += amount; h["revenue"] += amount; lt["revenue"] += amount
        if fan_id:
            fk = str(fan_id)
            if fk not in perf["fans"]:
                perf["fans"][fk] = {"ppvs_sent": 0, "ppvs_unlocked": 0, "spent": 0.0, "first_seen": today}
            perf["fans"][fk]["ppvs_unlocked"] += 1
            perf["fans"][fk]["spent"] += amount
    elif event == "tip":
        d["tips"] += amount; lt["tips"] += amount
        d["revenue"] += amount; h["revenue"] += amount; lt["revenue"] += amount
    elif event == "new_sub":
        d["new_subs"] += 1; lt["new_subs_welcomed"] += 1
    elif event == "opus_call":
        d["opus_calls"] += 1; lt["opus_calls"] += 1

    cutoff = (datetime.now(timezone.utc) - timedelta(hours=48)).strftime("%Y-%m-%d-%H")
    perf["hourly"] = {k: v for k, v in perf["hourly"].items() if k >= cutoff}
    cutoff_day = (datetime.now(timezone.utc) - timedelta(days=30)).strftime("%Y-%m-%d")
    perf["today"] = {k: v for k, v in perf["today"].items() if k >= cutoff_day}

    save_perf(perf)


# =====================================================================
# SECTION 11: RULE-BASED AUTO-REPLY ENGINE
# =====================================================================

def pick_unseen_combo(fan_id):
    """Pick a combo the fan hasn't seen yet."""
    fs = load_fan_state_v2(fan_id)
    sent = set(fs.get("content_sent", []))
    all_combos = [f"combo{i}" for i in range(1, 14)]
    unseen = [c for c in all_combos if c not in sent]
    if not unseen:
        unseen = all_combos  # All seen, recycle
    return random.choice(unseen)


def try_rule_based_reply(fan_id, message_text, fan_name=None):
    """
    Rule-based handling for simple cases. Returns True if handled.
    Opus is only called when fan has replied and needs a real decision.

    ROUTING:
    - Buyer ($1+) → always Opus
    - handed_off → skip entirely
    - New sub ($0, few msgs) → sales ladder
    - Signal-based fast-track → PPV immediately
    """
    text = (message_text or "").strip()
    if not text:
        return False

    fs = load_fan_state_v2(fan_id)
    current_state = fs.get("state", "new")
    msg_count = fs.get("messages_received", 0)
    total_spent = fs.get("total_spent", 0)

    # ===== HANDED OFF → DO NOT MESSAGE =====
    if current_state == "handed_off":
        log.info(f"SKIP handed_off fan {fan_id}")
        stats["skipped"] += 1
        return True

    # ===== ANY SPENDER → OPUS ALWAYS =====
    if total_spent > 0:
        log.info(f"OPUS-ROUTE: Fan {fan_id} spent ${total_spent} → Opus")
        return False

    # ===== HARD CAP: $0 fan + 15+ msgs = never route to Opus =====
    if total_spent == 0 and msg_count >= 15:
        reply = random.choice([
            "💕😘", "🥰", "ur so sweet 💕", "haha ur cute 😘",
            "aww 🥺💕", "😘💗",
        ])
        send_of_message(fan_id, reply)
        log_bot_action(fan_id, "text", fan_state=current_state, fan_total_spent=0)
        log.info(f"HARD-CAP: Fan {fan_id} at {msg_count} msgs, $0 spent → auto-reply, no Opus")
        stats["auto_replies"] += 1
        stats["rule_based_handled"] += 1
        return True

    # ===== WIND-DOWN: $0 fan with many msgs chatting GFE fluff → auto-close =====
    if total_spent == 0 and msg_count >= 12:
        # Fan already said can't afford, we've been going back and forth
        if FILLER.match(text) or EMOJI_ONLY.match(text) or THANKS_PATTERNS.match(text) or GREETING_PATTERNS.match(text):
            reply = random.choice([
                "hope u have the best day babe 💕",
                "talk soon cutie 😘💕",
                "ur the sweetest, have an amazing day 🥺💕",
                "aww ur adorable 💗 ill be here whenever u want",
            ])
            send_of_message(fan_id, reply)
            log_bot_action(fan_id, "text", fan_state=current_state, fan_total_spent=0)
            log.info(f"WIND-DOWN: Fan {fan_id} auto-closed (broke fan GFE fluff, saved Opus call)")
            stats["auto_replies"] += 1
            stats["rule_based_handled"] += 1
            return True

    # ===== REJECTION / CAN'T AFFORD → OPUS SAVE =====
    if REJECTION_SIGNALS.search(text) and msg_count >= 3:
        log.info(f"OPUS-SAVE: Fan {fan_id} rejection detected in rule-based flow → routing to Opus for save attempt")
        fs["save_trigger"] = "rejection_signal"
        fs["save_trigger_text"] = text[:200]
        fs["save_trigger_ts"] = time.time()
        save_fan_state_v2(fan_id, fs)
        return False  # Falls through to Opus

    # ===== SIGNAL DETECTION (overrides message count) =====

    # BUYING SIGNAL → PPV immediately
    if BUYING_SIGNALS.search(text):
        reply = random.choice(BUYING_REPLY)
        combo = pick_unseen_combo(fan_id)
        vault_ids = VAULT_MAP.get(combo, [])
        if vault_ids:
            send_of_message(fan_id, reply, media_ids=vault_ids, price=18, content_key=combo)
            transition_fan_state(fan_id, "pitched", reason="buying signal → PPV")
            log_bot_action(fan_id, "ppv", content_key=combo, price=18, hook="buying_signal",
                           fan_state=current_state, fan_total_spent=total_spent)
            stats["auto_replies"] += 1
            stats["rule_based_handled"] += 1
            return True

    # SEXUAL SIGNAL
    if SEXUAL_SIGNALS.search(text):
        if msg_count >= 4:
            reply = random.choice(SEXUAL_REPLY_TEASE)
            combo = pick_unseen_combo(fan_id)
            vault_ids = VAULT_MAP.get(combo, [])
            if vault_ids:
                send_of_message(fan_id, reply, media_ids=vault_ids, price=18, content_key=combo)
                transition_fan_state(fan_id, "pitched", reason="sexual signal + warmed → PPV")
                log_bot_action(fan_id, "ppv", content_key=combo, price=18, hook="sexual_match",
                               fan_state=current_state, fan_total_spent=total_spent)
                stats["auto_replies"] += 1
                stats["rule_based_handled"] += 1
                return True
        else:
            reply = random.choice(SEXUAL_REPLY_TEASE)
            chain = random.choice(["sexting1_pic", "sexting2_pic", "sexting3_pic"])
            vault_ids = VAULT_MAP.get(chain, [])
            if vault_ids:
                send_of_message(fan_id, reply, media_ids=vault_ids, content_key=chain)
                transition_fan_state(fan_id, "engaged", reason="sexual signal → free hook")
                log_bot_action(fan_id, "free_media", content_key=chain, hook="sexual_match",
                               fan_state=current_state, fan_total_spent=total_spent)
                stats["auto_replies"] += 1
                stats["rule_based_handled"] += 1
                return True

    # INTEREST SIGNAL
    if INTEREST_SIGNALS.search(text):
        if msg_count >= 4:
            reply = random.choice([
                "omg stoppp ur making me blush 🙈💕 ok fine... since u appreciate me... i have something special 😏🔥",
                "awww babe 🥺💕 u really know how to make a girl feel good... wanna see what i look like when im really feeling myself? 😏",
            ])
            combo = pick_unseen_combo(fan_id)
            vault_ids = VAULT_MAP.get(combo, [])
            if vault_ids:
                send_of_message(fan_id, reply, media_ids=vault_ids, price=18, content_key=combo)
                transition_fan_state(fan_id, "pitched", reason="interest + warmed → PPV")
                log_bot_action(fan_id, "ppv", content_key=combo, price=18, hook="exclusivity",
                               fan_state=current_state, fan_total_spent=total_spent)
                stats["auto_replies"] += 1
                stats["rule_based_handled"] += 1
                return True
        else:
            reply = random.choice([
                "omg thank u babe 🥺💕 u havent even seen the good stuff yet tho 😏",
                "stoppp 🙈💕 ur gonna make me do something crazy... like show u what i look like without this on 😏",
            ])
            send_of_message(fan_id, reply)
            transition_fan_state(fan_id, "engaged", reason="interest signal → tease")
            log_bot_action(fan_id, "text", hook="vulnerability",
                           fan_state=current_state, fan_total_spent=total_spent)
            stats["auto_replies"] += 1
            stats["rule_based_handled"] += 1
            return True

    # CURIOSITY SIGNAL → free hook
    if CURIOSITY_SIGNALS.search(text):
        reply = random.choice(CURIOSITY_REPLY)
        chain = random.choice(["sexting1_pic", "sexting2_pic", "sexting3_pic"])
        vault_ids = VAULT_MAP.get(chain, [])
        if vault_ids:
            send_of_message(fan_id, reply, media_ids=vault_ids, content_key=chain)
            transition_fan_state(fan_id, "engaged", reason="curiosity → free hook")
            log_bot_action(fan_id, "free_media", content_key=chain, hook="curiosity",
                           fan_state=current_state, fan_total_spent=total_spent)
            stats["auto_replies"] += 1
            stats["rule_based_handled"] += 1
            return True

    # ===== SIMPLE PATTERN MATCHES =====

    if GOODBYE.match(text):
        reply = random.choice(GOODBYE_REPLIES)
        send_of_message(fan_id, reply)
        log_bot_action(fan_id, "text", fan_state=current_state)
        stats["auto_replies"] += 1
        stats["rule_based_handled"] += 1
        return True

    if THANKS_PATTERNS.match(text):
        reply = random.choice(THANKS_REPLIES)
        send_of_message(fan_id, reply)
        log_bot_action(fan_id, "text", fan_state=current_state)
        stats["auto_replies"] += 1
        stats["rule_based_handled"] += 1
        return True

    # ===== ESCALATION LADDER BY MESSAGE COUNT =====

    # MSG 1-2: Greet + selfie
    if msg_count <= 2:
        if GREETING_PATTERNS.match(text) or EMOJI_ONLY.match(text) or HOW_ARE_YOU.match(text) or FILLER.match(text):
            reply = random.choice(GREETING_REPLIES if GREETING_PATTERNS.match(text) or EMOJI_ONLY.match(text) else RAPPORT_REPLIES)
            if msg_count <= 1:
                selfie_ids = random.sample(VAULT_MAP["gfe_selfie"], min(2, len(VAULT_MAP["gfe_selfie"])))
                send_of_message(fan_id, reply, media_ids=selfie_ids, content_key="gfe_selfie")
                transition_fan_state(fan_id, "greeted", reason="first msg → greet + selfie")
            else:
                send_of_message(fan_id, reply)
                transition_fan_state(fan_id, "engaged", reason="second msg → rapport")
            log_bot_action(fan_id, "text", fan_state=current_state, fan_total_spent=total_spent)
            stats["auto_replies"] += 1
            stats["rule_based_handled"] += 1
            return True
        # Non-pattern first message → rapport
        reply = random.choice(RAPPORT_REPLIES)
        if msg_count <= 1:
            selfie_ids = random.sample(VAULT_MAP["gfe_selfie"], min(2, len(VAULT_MAP["gfe_selfie"])))
            send_of_message(fan_id, reply, media_ids=selfie_ids, content_key="gfe_selfie")
            transition_fan_state(fan_id, "greeted", reason="first msg → rapport + selfie")
        else:
            send_of_message(fan_id, reply)
            transition_fan_state(fan_id, "engaged", reason="second msg → rapport")
        log_bot_action(fan_id, "text", fan_state=current_state, fan_total_spent=total_spent)
        stats["auto_replies"] += 1
        stats["rule_based_handled"] += 1
        return True

    # MSG 3-4: Tease
    if msg_count <= 4:
        reply = random.choice(TEASE_REPLIES)
        send_of_message(fan_id, reply)
        transition_fan_state(fan_id, "engaged", reason=f"msg {msg_count} → tease")
        log_bot_action(fan_id, "text", fan_state=current_state, fan_total_spent=total_spent)
        stats["auto_replies"] += 1
        stats["rule_based_handled"] += 1
        return True

    # MSG 5: Free sexting pic (hook)
    if msg_count == 5:
        reply = random.choice(FREE_HOOK_REPLIES)
        chain = random.choice(["sexting1_pic", "sexting2_pic", "sexting3_pic"])
        vault_ids = VAULT_MAP.get(chain, [])
        if vault_ids:
            send_of_message(fan_id, reply, media_ids=vault_ids, content_key=chain)
            transition_fan_state(fan_id, "engaged", reason="msg 5 → free hook")
            log_bot_action(fan_id, "free_media", content_key=chain, hook="vulnerability",
                           fan_state=current_state, fan_total_spent=total_spent)
            stats["auto_replies"] += 1
            stats["rule_based_handled"] += 1
            return True

    # MSG 6-8: Push $18 PPV
    if 6 <= msg_count <= 8:
        reply = random.choice(PPV_PUSH_REPLIES)
        combo = pick_unseen_combo(fan_id)
        vault_ids = VAULT_MAP.get(combo, [])
        if vault_ids:
            send_of_message(fan_id, reply, media_ids=vault_ids, price=18, content_key=combo)
            transition_fan_state(fan_id, "pitched", reason=f"msg {msg_count} → PPV push")
            log_bot_action(fan_id, "ppv", content_key=combo, price=18, hook="vulnerability",
                           fan_state=current_state, fan_total_spent=total_spent)
            stats["auto_replies"] += 1
            stats["rule_based_handled"] += 1
            return True

    # MSG 9+: Route to Opus
    if msg_count >= 9:
        return False

    # Catchall
    reply = random.choice(REENGAGE_REPLIES)
    send_of_message(fan_id, reply)
    log_bot_action(fan_id, "text", fan_state=current_state, fan_total_spent=total_spent)
    stats["auto_replies"] += 1
    stats["rule_based_handled"] += 1
    return True


# =====================================================================
# SECTION 12: OPUS CALL (SLIM PROMPT — <15K TOKENS)
# =====================================================================

def get_relevant_playbook_section(fan_state, fan_spent, signals, is_save=False):
    """Extract only the relevant playbook sections for this fan. Keeps prompt slim."""
    try:
        with open(PLAYBOOK_FILE) as f:
            full_playbook = f.read()
    except:
        return ""

    # Always include: sections 1 (identity), 16 (output format), 14 (restricted words)
    # Conditionally include based on fan state
    sections_needed = {1, 14, 16, 17}

    if fan_state in ("new", "greeted"):
        sections_needed.add(4)  # Two-track strategy
    elif fan_state == "engaged":
        sections_needed.update({4, 5, 6, 7})  # Strategy, buyer types, content ladder, pricing
    elif fan_state == "pitched":
        sections_needed.update({7, 8})  # Pricing, objection handling
    elif fan_state == "buyer":
        sections_needed.update({6, 7, 9})  # Content ladder, pricing, aftercare
    elif fan_state == "whale_candidate":
        sections_needed.update({6, 7, 9, 10, 11})  # + whale handling, churn prevention
    elif fan_state == "dormant":
        sections_needed.add(13)  # Dormant retargeting

    if "sexual" in signals:
        sections_needed.add(5)
    if fan_spent >= 100:
        sections_needed.update({10, 11})

    # Save attempts need objection handling + pricing flexibility
    if is_save:
        sections_needed.update({7, 8, 13})

    # Extract sections by ## N. header pattern
    extracted = []
    current_section = None
    current_lines = []

    for line in full_playbook.split("\n"):
        m = re.match(r'^## (\d+)\. ', line)
        if m:
            if current_section is not None and current_section in sections_needed:
                extracted.extend(current_lines)
            current_section = int(m.group(1))
            current_lines = [line]
        else:
            current_lines.append(line)

    # Last section
    if current_section is not None and current_section in sections_needed:
        extracted.extend(current_lines)

    return "\n".join(extracted)


def build_opus_prompt(fan_id, last_messages):
    """Build a slim Opus prompt with only what's needed. Target <15K tokens."""
    fs = load_fan_state_v2(fan_id)
    fan_state = fs.get("state", "new")
    fan_spent = fs.get("total_spent", 0)
    signals = fs.get("signals", [])

    # Get relevant playbook excerpt
    is_save = bool(fs.get("save_trigger"))
    playbook_excerpt = get_relevant_playbook_section(fan_state, fan_spent, signals, is_save=is_save)

    # Get learning stats
    stats_block = format_stats_block()

    # Fan context (compact)
    fan_context = {
        "fan_id": int(fan_id),
        "name": fs.get("name", ""),
        "state": fan_state,
        "spent": fan_spent,
        "msgs_received": fs.get("messages_received", 0),
        "msgs_sent": fs.get("messages_sent", 0),
        "signals": signals,
        "content_sent": fs.get("content_sent", [])[-20:],
        "last_ppv_price": fs.get("last_ppv_price"),
    }

    # Add save context if this is a save attempt
    if fs.get("save_trigger"):
        fan_context["SAVE_ATTEMPT"] = True
        fan_context["save_trigger"] = fs.get("save_trigger")
        fan_context["save_trigger_text"] = fs.get("save_trigger_text", "")

    now_est = time.strftime("%A %b %d, %Y %I:%M %p EST")

    prompt = f"""You are Bianca Woods. Read the playbook, stats, and context. Output ONE JSON decision.

[PLAYBOOK]
{playbook_excerpt}
[/PLAYBOOK]

{stats_block}

[CONTEXT]
{json.dumps(fan_context, separators=(',',':'))}
[/CONTEXT]

[MESSAGES]
{json.dumps(last_messages[-10:], separators=(',',':'))}
[/MESSAGES]

Date: {now_est}

CRITICAL RULES:
- If fan has spent money AND says "I should stop" / "save for bills" / "can't afford more" — this is a SOFT OBJECTION, NOT an exit signal. They are a proven buyer on a streak. Push gently: "just one more babe this ones actually my fav 🥺" or pivot to cheaper content. NEVER agree with them leaving. NEVER say "bills first" or "no pressure."
- Only back off on $0 fans who say they can't afford — they might genuinely be broke.
- Active buyers who hesitate need a nudge, not permission to leave.

Output ONE JSON line. Valid actions: text, ppv, free_media, vip_pitch, high_ticket, skip, flag_human, update_state.
For ppv: include content_key, price, message_text, hook.
For text: include message_text.
Never send content_key already in content_sent."""

    return prompt


def call_opus(fan_id, last_messages):
    """Call Opus via OpenClaw hooks/wake. Returns async sentinel."""
    try:
        prompt = build_opus_prompt(fan_id, last_messages)

        record_opus_call()
        stats["opus_calls"] += 1
        perf_track("opus_call")

        hook_token = "05382603da53367102df5f03f48752ad2b33cbc9e2830db1"

        task_file = os.path.join(DIR, f"bianca-pending-opus-{fan_id}.json")
        task_data = {
            "fan_id": fan_id,
            "prompt": prompt,
            "ts": time.time()
        }
        with open(task_file, "w") as f:
            json.dump(task_data, f)

        wake_text = (
            f"BIANCA_OPUS_REQUEST: Fan {fan_id} needs Opus decision. "
            f"Read research/bianca-pending-opus-{fan_id}.json for the task. "
            f"Spawn ONE Opus worker (model anthropic/claude-opus-4-6, timeout 60s) with the 'prompt' field as the task. "
            f"When result comes back, parse the JSON decision and run: "
            f"python3 research/bianca-execute-decision.py {fan_id} '<json_decision>'. "
            f"Then delete the pending file. Reply with just the result."
        )

        result = subprocess.run(
            ["/usr/bin/curl", "-s", "-X", "POST",
             "http://127.0.0.1:18789/hooks/wake",
             "-H", f"Authorization: Bearer {hook_token}",
             "-H", "Content-Type: application/json",
             "-d", json.dumps({"text": wake_text, "mode": "now"})],
            capture_output=True, text=True, timeout=10
        )

        log.info(f"Wake sent for fan {fan_id}: {result.stdout[:100]}")
        return {"action": "async_spawned", "fan_id": fan_id}

    except subprocess.TimeoutExpired:
        log.error(f"Opus call timed out for fan {fan_id}")
        return None
    except Exception as e:
        log.error(f"Opus call error for fan {fan_id}: {e}")
        return None


# =====================================================================
# SECTION 13: EXECUTE DECISION
# =====================================================================

def execute_decision(fan_id, decision):
    """Execute an Opus decision."""
    action = decision.get("action", "skip")
    content_key = decision.get("content_key", "")
    price = decision.get("price")
    message_text = decision.get("message_text", "")
    reason = decision.get("reason", "")
    hook = decision.get("hook")

    fs = load_fan_state_v2(fan_id)
    fan_state = fs.get("state", "new")
    fan_spent = fs.get("total_spent", 0)

    log.info(f"EXECUTE {fan_id}: action={action} key={content_key} price={price} text={message_text[:60]}")

    if action == "skip":
        log.info(f"SKIP {fan_id}: {reason}")
        log_bot_action(fan_id, "skip", fan_state=fan_state, fan_total_spent=fan_spent)
        return

    if action == "text":
        send_of_message(fan_id, message_text)
        log_bot_action(fan_id, "text", fan_state=fan_state, fan_total_spent=fan_spent)
        return

    if action == "update_state":
        new_state = decision.get("new_state")
        if new_state:
            transition_fan_state(fan_id, new_state, reason=reason)
        if message_text:
            send_of_message(fan_id, message_text)
        return

    if action == "flag_human":
        transition_fan_state(fan_id, "handed_off", reason=reason)
        if message_text:
            send_of_message(fan_id, message_text)
        log_bot_action(fan_id, "flag_human", fan_state=fan_state, fan_total_spent=fan_spent)
        log.warning(f"HUMAN HANDOFF fan {fan_id}: {reason}")
        return

    if action == "vip_pitch":
        send_of_message(fan_id, message_text)
        fs["pending_vip"] = {"pitched_at": now_ms()}
        save_fan_state_v2(fan_id, fs)
        log_bot_action(fan_id, "vip_pitch", fan_state=fan_state, fan_total_spent=fan_spent)
        return

    if action == "high_ticket":
        tier = decision.get("tier", "starter_pack")
        tip_ask = decision.get("tip_ask", 50)
        send_of_message(fan_id, message_text)
        fs["pending_high_ticket"] = {"tier": tier, "tip_ask": tip_ask, "pitched_at": now_ms()}
        save_fan_state_v2(fan_id, fs)
        log_bot_action(fan_id, "high_ticket", fan_state=fan_state, fan_total_spent=fan_spent)
        return

    if action in ("ppv", "free_media"):
        resolved_key = content_key
        if resolved_key not in VAULT_MAP:
            for key in VAULT_MAP:
                if content_key.startswith(key) or key.startswith(content_key):
                    resolved_key = key
                    break
            else:
                log.error(f"Invalid content_key: {content_key}")
                if message_text:
                    send_of_message(fan_id, message_text)
                return

        vault_ids = VAULT_MAP[resolved_key]
        if vault_ids == "HIGH_TICKET":
            log.warning(f"HIGH_TICKET key used in ppv action: {resolved_key}")
            return

        if action == "free_media" and len(vault_ids) > 3:
            vault_ids = random.sample(vault_ids, 2)

        send_price = price if action == "ppv" else None
        send_of_message(fan_id, message_text, media_ids=vault_ids, price=send_price, content_key=resolved_key)

        log_bot_action(fan_id, action, content_key=resolved_key, price=send_price, hook=hook,
                       fan_state=fan_state, fan_total_spent=fan_spent)

        if action == "ppv":
            transition_fan_state(fan_id, "pitched", reason=f"Opus sent PPV {resolved_key} ${price}")
            perf_track("ppv_sent", fan_id=fan_id, content_key=resolved_key, price=price or 0)
        return

    log.warning(f"Unknown action: {action}")


# =====================================================================
# SECTION 14: FAN CONTEXT (for conversation history)
# =====================================================================

def load_fan_contexts():
    with file_lock:
        try:
            with open(FAN_CONTEXT_FILE) as f:
                return json.load(f)
        except:
            return {}


def save_fan_contexts(contexts):
    with file_lock:
        try:
            tmp = FAN_CONTEXT_FILE + ".tmp"
            with open(tmp, "w") as f:
                json.dump(contexts, f, separators=(',', ':'))
            os.replace(tmp, FAN_CONTEXT_FILE)
        except Exception as e:
            log.error(f"save_fan_contexts: {e}")


def record_fan_message_context(fan_id, text, from_bianca=False):
    """Record a message in the fan's conversation context. Keeps last 20 messages."""
    contexts = load_fan_contexts()
    fk = str(fan_id)
    if fk not in contexts:
        contexts[fk] = {"msgs": []}
    contexts[fk]["msgs"].append({
        "from": "b" if from_bianca else "f",
        "text": text[:200],
        "ts": int(time.time())
    })
    contexts[fk]["msgs"] = contexts[fk]["msgs"][-20:]
    save_fan_contexts(contexts)


def get_last_messages(fan_id, limit=10):
    """Get last N messages for Opus context."""
    contexts = load_fan_contexts()
    fk = str(fan_id)
    ctx = contexts.get(fk, {"msgs": []})
    return ctx.get("msgs", [])[-limit:]


# =====================================================================
# SECTION 15: CORE WEBHOOK PROCESSING
# =====================================================================

_welcomed_fans = set()


def process_webhook(payload):
    """Main webhook processing pipeline."""
    try:
        fan_id = payload.get("fanId") or payload.get("fan_id") or payload.get("fromUser", {}).get("id")
        message_text = payload.get("text") or payload.get("message") or payload.get("body") or ""
        fan_name = payload.get("fanName") or payload.get("fan_name") or payload.get("fromUser", {}).get("name") or ""
        username = payload.get("username") or payload.get("fromUser", {}).get("username") or ""

        message_text = re.sub(r"<[^>]+>", "", message_text).strip()

        if not fan_id:
            log.warning(f"Webhook missing fan_id: {json.dumps(payload)[:200]}")
            stats["errors"] += 1
            return

        fan_id = int(fan_id)
        log.info(f"WEBHOOK fan={fan_id} name={fan_name} msg={message_text[:80]}")

        # 1. Exclude
        if fan_id in EXCLUDE_FAN_IDS:
            stats["skipped"] += 1
            return
        if username and username.lower() in EXCLUDE_USERNAMES:
            stats["skipped"] += 1
            return

        # 2. Promo
        if is_promo(username, message_text):
            stats["skipped"] += 1
            return

        # 3. System enabled?
        if not is_system_enabled():
            stats["skipped"] += 1
            return

        # 4. Update fan state
        fs = load_fan_state_v2(fan_id)
        if fs.get("name") != fan_name and fan_name:
            fs["name"] = fan_name
            save_fan_state_v2(fan_id, fs)
        record_fan_message_v2(fan_id, from_bianca=False)
        record_fan_message_context(fan_id, message_text, from_bianca=False)

        # 5. If fan was greeted and just replied, transition to engaged
        if fs.get("state") == "greeted":
            transition_fan_state(fan_id, "engaged", reason="fan replied to greeting")

        # 6. If fan was dormant and replied, re-engage
        if fs.get("state") == "dormant":
            transition_fan_state(fan_id, "engaged", reason="dormant fan re-engaged")

        # 7. Record timestamp for ghost detection
        action_ts = time.time()

        # 8. Try rule-based reply
        if try_rule_based_reply(fan_id, message_text, fan_name):
            return

        # 9. Opus flow
        if not check_opus_rate_limit():
            log.info(f"SKIP rate limit for fan {fan_id}")
            stats["skipped"] += 1
            return

        last_msgs = get_last_messages(fan_id)
        decision = call_opus(fan_id, last_msgs)
        if not decision:
            log.error(f"No decision from Opus for fan {fan_id}")
            stats["errors"] += 1
            return

        if decision.get("action") == "async_spawned":
            log.info(f"ASYNC SPAWN sent for fan {fan_id}")
            return

        execute_decision(fan_id, decision)

    except Exception as e:
        log.error(f"process_webhook error: {e}", exc_info=True)
        stats["errors"] += 1
        stats["last_error"] = f"{datetime.now(timezone.utc).isoformat()} - {str(e)[:200]}"


# =====================================================================
# SECTION 16: EVENT HANDLERS (new sub, purchase, OF events)
# =====================================================================

def handle_new_subscriber(fan_id, fan_name):
    """Nina-style: Welcome selfie (free) + PPV combo at $18 immediately."""
    # Message 1: Welcome + 2 selfies
    welcome = random.choice(NEW_SUB_WELCOME)
    selfie_ids = random.sample(VAULT_MAP["gfe_selfie"], 2)
    send_of_message(fan_id, welcome, media_ids=selfie_ids, content_key="gfe_selfie")

    fs = load_fan_state_v2(fan_id)
    fs["name"] = fan_name
    save_fan_state_v2(fan_id, fs)
    transition_fan_state(fan_id, "greeted", reason="new sub welcome")

    log_bot_action(fan_id, "free_media", content_key="gfe_selfie", fan_state="new", fan_total_spent=0)
    log.info(f"NEW-SUB welcome → {fan_id} ({fan_name})")

    # Message 2 (after 30s delay): PPV at $18
    def send_followup():
        time.sleep(30)
        followup = random.choice(NEW_SUB_FOLLOWUP)
        combo = pick_unseen_combo(fan_id)
        vault_ids = VAULT_MAP.get(combo, [])
        if vault_ids:
            send_of_message(fan_id, followup, media_ids=vault_ids, price=18, content_key=combo)
            transition_fan_state(fan_id, "pitched", reason="new sub PPV offer")
            log_bot_action(fan_id, "ppv", content_key=combo, price=18, hook="vulnerability",
                           fan_state="greeted", fan_total_spent=0)
            log.info(f"NEW-SUB ppv_offer → {fan_id}: {combo} $18")

    t = threading.Thread(target=send_followup, daemon=True)
    t.start()
    stats["auto_replies"] += 1
    perf_track("new_sub", fan_id=fan_id)


def handle_purchase(fan_id, fan_name, amount, content_key=None):
    """Handle purchase: update state, log outcome, aftercare, upsell."""
    record_fan_spend(fan_id, amount)

    fs = load_fan_state_v2(fan_id)
    total_spent = fs.get("total_spent", 0)

    # Log outcome
    log_outcome(fan_id, "purchased", amount=amount, ppv_id=content_key)

    # Transition to buyer
    if fs.get("state") not in ("buyer", "whale_candidate", "handed_off"):
        transition_fan_state(fan_id, "buyer", reason=f"purchased ${amount}")

    # Check whale signals
    if detect_whale_signals(fan_id, amount=amount):
        transition_fan_state(fan_id, "whale_candidate", reason=f"whale signals detected, total ${total_spent}")

    # Check pending VIP
    if fs.get("pending_vip") and amount >= 50:
        fs.pop("pending_vip", None)
        fs["is_vip"] = True
        save_fan_state_v2(fan_id, fs)

        def deliver_vip():
            send_of_message(fan_id, "omg babe ur officially my VIP 🥺💕✨ welcome to the inner circle!!")
            time.sleep(2)
            for i in random.sample(range(1, 14), 3):
                vault_ids = VAULT_MAP.get(f"combo{i}", [])
                if isinstance(vault_ids, list) and vault_ids:
                    send_of_message(fan_id, "🔥💕", media_ids=vault_ids)
                    time.sleep(2)
            send_of_message(fan_id, "thats all 3 babe 🥰 u get priority + discounts on everything now 💕😘")

        threading.Thread(target=deliver_vip, daemon=True).start()
        return

    # Check pending high-ticket
    pending_ht = fs.get("pending_high_ticket")
    if pending_ht and amount >= pending_ht.get("tip_ask", 0) * 0.8:
        tier = pending_ht.get("tier", "starter_pack")
        fs.pop("pending_high_ticket", None)
        save_fan_state_v2(fan_id, fs)
        threading.Thread(target=deliver_high_ticket, args=(fan_id, tier), daemon=True).start()
        return

    # Aftercare → upsell
    thanks = random.choice(PURCHASE_FOLLOWUP)
    send_of_message(fan_id, thanks)
    log_bot_action(fan_id, "aftercare", fan_state="buyer", fan_total_spent=total_spent)
    log.info(f"PURCHASE followup → {fan_id}: ${amount}, total ${total_spent}")

    def send_upsell():
        time.sleep(45)
        upsell_text = random.choice(PURCHASE_UPSELL)
        if total_spent < 50:
            combo = pick_unseen_combo(fan_id)
            vault_ids = VAULT_MAP.get(combo, [])
            price = 25
            ck = combo
        elif total_spent < 100:
            chain = random.choice(["sexting1_vid_15", "sexting2_vid_15", "sexting3_vid_15"])
            vault_ids = VAULT_MAP.get(chain, [])
            price = 15
            ck = chain
            upsell_text = "ok babe since u already know what i look like 😏 i wanna try something... its a little video i made when i was feeling extra naughty 🙈🔥"
        elif total_spent < 200:
            vault_ids = VAULT_MAP.get("custom_tier1_shower", [])
            price = 50
            ck = "custom_tier1_shower"
            upsell_text = "babe i literally just made this in the shower 🚿🔥 like... nobody has seen this yet 🙈"
        else:
            vault_ids = VAULT_MAP.get("custom_tier3_topless", [])
            price = 75
            ck = "custom_tier3_topless"
            upsell_text = "ok so... this is my most personal video ever 🥺🔥 ive never shared this with anyone..."

        if vault_ids:
            send_of_message(fan_id, upsell_text, media_ids=vault_ids, price=price, content_key=ck)
            transition_fan_state(fan_id, "pitched", reason=f"post-purchase upsell ${price}")
            log_bot_action(fan_id, "ppv", content_key=ck, price=price, hook="conditional",
                           fan_state="buyer", fan_total_spent=total_spent)
            perf_track("ppv_sent", fan_id=fan_id, content_key=ck, price=price)

    threading.Thread(target=send_upsell, daemon=True).start()
    stats["auto_replies"] += 1


def deliver_high_ticket(fan_id, tier):
    """Deliver high-ticket package in multiple messages."""
    all_bundles = []
    for i in range(1, 27):
        ids = VAULT_MAP.get(f"bundle{i}", [])
        if isinstance(ids, list):
            all_bundles.extend(ids)

    sexting_ids = []
    for chain in range(1, 4):
        for step in ["pic", "vid_15", "vid_24", "vid_38", "vid_54", "vid_75"]:
            ids = VAULT_MAP.get(f"sexting{chain}_{step}", [])
            if isinstance(ids, list):
                sexting_ids.extend(ids)
    if "sexting3_vid_100" in VAULT_MAP:
        sexting_ids.extend(VAULT_MAP["sexting3_vid_100"])

    custom_ids = []
    for t in range(1, 8):
        key = f"custom_tier{t}_" + ["shower", "bedroom", "topless", "rubbing", "titty", "tryon", "cumming"][t - 1]
        ids = VAULT_MAP.get(key, [])
        if isinstance(ids, list):
            custom_ids.extend(ids)

    if tier == "starter_pack":
        items = []
        for i in random.sample(range(1, 14), 3):
            ids = VAULT_MAP.get(f"combo{i}", [])
            if isinstance(ids, list):
                items.extend(ids)
        items = list(dict.fromkeys(items))
    elif tier == "best_of":
        items = []
        for i in [11, 12, 13, 16, 26]:
            ids = VAULT_MAP.get(f"bundle{i}", [])
            if isinstance(ids, list):
                items.extend(ids)
        items.extend(sexting_ids[:18])
        items = list(dict.fromkeys(items))
    elif tier == "everything":
        items = list(dict.fromkeys(all_bundles + sexting_ids + custom_ids))
    else:
        items = all_bundles[:60]

    chunks = [items[i:i + 30] for i in range(0, len(items), 30)]
    log.info(f"HIGH-TICKET delivering {tier} to {fan_id}: {len(items)} items in {len(chunks)} messages")

    messages = [
        f"ok babe here it comes 🔥🔥🔥 {len(items)} pics and videos just for u... enjoy 😏💕",
        "and more... 🔥🔥", "keep going babe... 😏💕", "theres more 🙈🔥",
        "still going... u asked for it 😏", "almost done babe 💕🔥", "last batch... save these 🥺💕",
    ]

    for i, chunk in enumerate(chunks):
        msg = messages[min(i, len(messages) - 1)]
        send_of_message(fan_id, msg, media_ids=chunk)
        if i < len(chunks) - 1:
            time.sleep(3)

    send_of_message(fan_id, f"thats {len(items)} pics and videos babe 🥺💕 hope u love them... let me know ur favorite 😏")
    log_bot_action(fan_id, "high_ticket_delivered", fan_state="buyer",
                   fan_total_spent=load_fan_state_v2(fan_id).get("total_spent", 0))


def handle_of_event(payload):
    """Handle unified OF API webhook events."""
    try:
        event_type = payload.get("event") or payload.get("type") or ""
        data = payload.get("payload", payload.get("data", payload))

        log.info(f"OF-EVENT: {event_type} | {json.dumps(payload)[:200]}")

        enabled = is_system_enabled()

        from_user = data.get("fromUser", {})
        fan_id = (data.get("user_id") or data.get("userId") or
                  from_user.get("id") or data.get("subscriber", {}).get("id"))
        fan_name = (data.get("name") or data.get("username") or
                    from_user.get("name") or from_user.get("username") or "")
        username = data.get("username") or from_user.get("username") or ""

        if not fan_id:
            log.warning(f"OF-EVENT no fan_id in: {json.dumps(data)[:300]}")
            return

        fan_id = int(fan_id)
        if fan_id in EXCLUDE_FAN_IDS or fan_id == BIANCA_ID:
            return

        # NEW SUBSCRIBER
        if event_type == "subscriptions.new":
            if enabled and fan_id not in _welcomed_fans:
                _welcomed_fans.add(fan_id)
                handle_new_subscriber(fan_id, fan_name)
            elif not enabled:
                log.info(f"NEW-SUB tracked but disabled: {fan_id}")

        # MESSAGE RECEIVED
        elif event_type == "messages.received":
            message = data.get("text") or data.get("message") or data.get("body") or ""
            message = re.sub(r"<[^>]+>", "", message).strip()
            if from_user.get("id") == BIANCA_ID:
                return

            track_active_chatter(fan_id, fan_name)
            record_fan_message_context(fan_id, message, from_bianca=False)

            # Log incoming to conversation log
            try:
                entry = {"fan_id": int(fan_id), "from": "f", "ts": int(time.time()), "text": message[:500]}
                with file_lock:
                    with open(CONVERSATION_LOG_FILE, "a") as f:
                        f.write(json.dumps(entry, separators=(',', ':')) + "\n")
            except:
                pass

            if not enabled:
                return

            # Log outcome: fan replied (for learning)
            log_outcome(fan_id, "replied")

            payload_for_queue = {
                "fan_id": fan_id, "username": username,
                "message": message, "name": fan_name, "source": "of_webhook"
            }
            priority = classify_priority(fan_id, message)
            enqueue_fan(priority, fan_id, payload_for_queue)

        # PPV UNLOCKED
        elif event_type == "messages.ppv.unlocked":
            amount = data.get("amount") or data.get("price") or 0
            try:
                amount = float(str(amount).replace("$", "").replace(",", ""))
            except:
                amount = 0
            if amount > 0:
                perf_track("ppv_unlocked", fan_id=fan_id, amount=amount)
                handle_purchase(fan_id, fan_name, amount)

        # TIP
        elif event_type == "transactions.new":
            amount = data.get("amount") or data.get("price") or 0
            try:
                amount = float(str(amount).replace("$", "").replace(",", ""))
            except:
                amount = 0
            tx_type = str(data.get("type") or data.get("transaction_type") or "")
            if amount > 0 and "tip" in tx_type.lower():
                perf_track("tip", fan_id=fan_id, amount=amount)
                log_outcome(fan_id, "tipped", amount=amount)
                handle_purchase(fan_id, fan_name, amount)

    except Exception as e:
        log.error(f"handle_of_event error: {e}", exc_info=True)
        stats["errors"] += 1


def reactivate_dormant_spenders():
    """Find fans who spent $1+ but are dormant 3+ days. Send rekindle."""
    cutoff = time.time() - (3 * 86400)
    rekindle_ids = VAULT_MAP.get("rekindle_vid", [])
    reactivated = 0

    for filepath in glob.glob(os.path.join(BOT_STATE_DIR, "*.json")):
        try:
            with open(filepath) as f:
                fs = json.load(f)
            fan_id = fs.get("fan_id")
            if not fan_id or fs.get("total_spent", 0) <= 0:
                continue
            if fs.get("state") != "dormant":
                continue
            last_ts = fs.get("last_interaction_ts", 0)
            if last_ts and last_ts > cutoff:
                continue
            if fs.get("rekindle_sent"):
                continue
            if int(fan_id) in EXCLUDE_FAN_IDS:
                continue

            vid_id = random.choice(rekindle_ids) if rekindle_ids else None
            msg = random.choice([
                "hey stranger 🥺 i havent heard from u in a while... been thinking about u tho 💕",
                "babe where did u go?? 🥺 i made something and thought of u...",
                "omg i just realized we havent talked in forever 🥺💕 i miss u...",
            ])
            send_of_message(fan_id, msg, media_ids=[vid_id] if vid_id else None)
            fs["rekindle_sent"] = True
            save_fan_state_v2(fan_id, fs)
            log_bot_action(fan_id, "rekindle", fan_state="dormant",
                           fan_total_spent=fs.get("total_spent", 0))
            reactivated += 1
            time.sleep(5)
            if reactivated >= 10:
                break
        except:
            pass

    log.info(f"REACTIVATION: Sent {reactivated} rekindle messages")
    return reactivated


# =====================================================================
# SECTION 17: HTTP SERVER
# =====================================================================

class BiancaHandler(BaseHTTPRequestHandler):
    def log_message(self, format, *args):
        pass

    def send_json(self, code, data):
        body = json.dumps(data, indent=2).encode()
        self.send_response(code)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", len(body))
        self.end_headers()
        self.wfile.write(body)

    def _parse_path(self):
        return urlparse(self.path).path

    def do_GET(self):
        path = self._parse_path()

        if path == "/health":
            self.send_json(200, {
                "status": "ok", "version": "v2",
                "enabled": is_system_enabled(),
                "uptime_since": stats["started_at"],
                "ts": datetime.now(timezone.utc).isoformat()
            })

        elif path == "/stats":
            self.send_json(200, stats)

        elif path == "/queue":
            with _queue_lock:
                queue_items = [{
                    "priority": PRIORITY_NAMES.get(p, str(p)),
                    "fan_id": fid,
                    "age_ms": int((time.time() - abs(sk)) * 1000),
                } for p, sk, fid, _ in sorted(_priority_queue)]
            self.send_json(200, {"depth": len(queue_items), "items": queue_items})

        elif path == "/learning/stats":
            self.send_json(200, aggregate_learning_stats())

        elif path == "/mass-bump":
            mb_state = load_json(MASS_BUMP_STATE_FILE, {})
            active_ids = get_active_chatter_ids()
            mb_state["active_chatters_excluded"] = len(active_ids)
            self.send_json(200, mb_state)

        elif path == "/active-chatters":
            active_ids = get_active_chatter_ids()
            self.send_json(200, {"fan_ids": active_ids, "count": len(active_ids)})

        elif path.startswith("/fan/"):
            parts = path.split("/")
            if len(parts) >= 3:
                fan_id = parts[2]
                try:
                    fan_id = int(fan_id)
                except:
                    self.send_json(400, {"error": "invalid fan_id"})
                    return
                fs = load_fan_state_v2(fan_id)
                last_msgs = get_last_messages(fan_id, limit=20)
                fs["recent_messages"] = last_msgs
                self.send_json(200, fs)
            else:
                self.send_json(400, {"error": "missing fan_id"})

        elif path == "/performance":
            perf = load_perf()
            today = datetime.now(timezone.utc).strftime("%Y-%m-%d")
            td = perf.get("today", {}).get(today, {})
            lt = perf.get("lifetime", {})
            ppvs_sent_today = td.get("ppvs_sent", 0)
            ppvs_unlocked_today = td.get("ppvs_unlocked", 0)
            conv_today = (ppvs_unlocked_today / ppvs_sent_today * 100) if ppvs_sent_today > 0 else 0
            ppvs_sent_lt = lt.get("ppvs_sent", 0)
            ppvs_unlocked_lt = lt.get("ppvs_unlocked", 0)
            conv_lt = (ppvs_unlocked_lt / ppvs_sent_lt * 100) if ppvs_sent_lt > 0 else 0
            fans = perf.get("fans", {})
            top_fans = sorted(fans.items(), key=lambda x: x[1].get("spent", 0), reverse=True)[:10]
            total_fans = len([f for f in fans.values() if f.get("spent", 0) > 0])
            avg_ltv = lt.get("revenue", 0) / total_fans if total_fans > 0 else 0
            self.send_json(200, {
                "today": {
                    "replies": td.get("replies", 0), "ppvs_sent": ppvs_sent_today,
                    "ppvs_unlocked": ppvs_unlocked_today, "conversion_rate": f"{conv_today:.1f}%",
                    "revenue": f"${td.get('revenue', 0):.2f}", "tips": f"${td.get('tips', 0):.2f}",
                    "opus_calls": td.get("opus_calls", 0),
                },
                "lifetime": {
                    "replies": lt.get("replies", 0), "ppvs_sent": ppvs_sent_lt,
                    "ppvs_unlocked": ppvs_unlocked_lt, "conversion_rate": f"{conv_lt:.1f}%",
                    "revenue": f"${lt.get('revenue', 0):.2f}", "avg_ltv": f"${avg_ltv:.2f}",
                    "opus_calls": lt.get("opus_calls", 0),
                },
                "top_fans": [{
                    "fan_id": fid, "spent": f"${fd.get('spent', 0):.2f}",
                } for fid, fd in top_fans],
            })

        elif path == "/training":
            outcomes = []
            try:
                with open(OUTCOME_LOG_FILE) as f:
                    for line in f:
                        outcomes.append(json.loads(line.strip()))
            except:
                pass
            convos = 0
            try:
                with open(CONVERSATION_LOG_FILE) as f:
                    convos = sum(1 for _ in f)
            except:
                pass
            self.send_json(200, {
                "conversation_log_lines": convos,
                "outcome_log_entries": len(outcomes),
                "learning_stats": aggregate_learning_stats(),
            })

        else:
            self.send_json(404, {"error": "not found"})

    def do_POST(self):
        path = self._parse_path()

        if path == "/webhook/fan-message":
            stats["webhooks_received"] += 1
            stats["last_webhook"] = datetime.now(timezone.utc).isoformat()
            try:
                content_length = int(self.headers.get("Content-Length", 0))
                body = self.rfile.read(content_length)
                payload = json.loads(body) if body else {}
            except Exception as e:
                log.error(f"Bad webhook body: {e}")
                self.send_json(400, {"error": "bad json"})
                return
            self.send_json(200, {"status": "accepted"})
            threading.Thread(target=process_webhook, args=(payload,), daemon=True).start()

        elif path == "/webhook/of-event":
            stats["webhooks_received"] += 1
            stats["last_webhook"] = datetime.now(timezone.utc).isoformat()
            try:
                content_length = int(self.headers.get("Content-Length", 0))
                body = self.rfile.read(content_length)
                payload = json.loads(body) if body else {}
            except:
                self.send_json(400, {"error": "bad json"})
                return
            self.send_json(200, {"status": "accepted"})
            threading.Thread(target=handle_of_event, args=(payload,), daemon=True).start()

        elif path == "/webhook/new-subscriber":
            stats["webhooks_received"] += 1
            try:
                content_length = int(self.headers.get("Content-Length", 0))
                body = self.rfile.read(content_length)
                payload = json.loads(body) if body else {}
            except:
                self.send_json(400, {"error": "bad json"})
                return
            self.send_json(200, {"status": "accepted"})
            fan_id = payload.get("fanId") or payload.get("fan_id")
            fan_name = payload.get("name") or payload.get("fan_name") or ""
            if fan_id and int(fan_id) not in EXCLUDE_FAN_IDS and is_system_enabled():
                threading.Thread(target=handle_new_subscriber, args=(int(fan_id), fan_name), daemon=True).start()

        elif path == "/webhook/purchase":
            stats["webhooks_received"] += 1
            try:
                content_length = int(self.headers.get("Content-Length", 0))
                body = self.rfile.read(content_length)
                payload = json.loads(body) if body else {}
            except:
                self.send_json(400, {"error": "bad json"})
                return
            self.send_json(200, {"status": "accepted"})
            fan_id = payload.get("fanId") or payload.get("fan_id")
            fan_name = payload.get("name") or payload.get("fan_name") or ""
            amount = payload.get("amount") or payload.get("price") or 0
            content_key = payload.get("content_key")
            if fan_id and int(fan_id) not in EXCLUDE_FAN_IDS and is_system_enabled():
                threading.Thread(target=handle_purchase, args=(int(fan_id), fan_name, float(amount), content_key), daemon=True).start()

        elif path.startswith("/fan/") and path.endswith("/handoff"):
            # POST /fan/{fan_id}/handoff
            parts = path.split("/")
            if len(parts) >= 3:
                try:
                    fan_id = int(parts[2])
                except:
                    self.send_json(400, {"error": "invalid fan_id"})
                    return
                success = transition_fan_state(fan_id, "handed_off", reason="manual handoff via API")
                if success:
                    self.send_json(200, {"status": "handed_off", "fan_id": fan_id})
                else:
                    self.send_json(400, {"error": "transition failed", "fan_id": fan_id})
            else:
                self.send_json(400, {"error": "missing fan_id"})

        elif path == "/reactivate":
            if not is_system_enabled():
                self.send_json(400, {"error": "system disabled"})
                return
            threading.Thread(target=reactivate_dormant_spenders, daemon=True).start()
            self.send_json(200, {"status": "reactivation started"})

        elif path == "/enable":
            state = load_json(SYSTEM_STATE_FILE, {})
            state["SYSTEM_ENABLED"] = True
            state.pop("disabled_reason", None)
            save_json(SYSTEM_STATE_FILE, state)
            log.info("System ENABLED")
            self.send_json(200, {"status": "enabled"})

        elif path == "/disable":
            state = load_json(SYSTEM_STATE_FILE, {})
            state["SYSTEM_ENABLED"] = False
            state["disabled_reason"] = "manual"
            state["disabled_at"] = now_ms()
            save_json(SYSTEM_STATE_FILE, state)
            log.info("System DISABLED")
            self.send_json(200, {"status": "disabled"})

        else:
            self.send_json(404, {"error": "not found"})


# =====================================================================
# SECTION 18: TUNNEL SETUP
# =====================================================================

def setup_webhook_tunnel():
    """Launch cloudflared tunnel and register webhook with OF API."""
    subprocess.run(["pkill", "-f", "cloudflared tunnel --url http://localhost:8901"],
                    capture_output=True, timeout=5)
    time.sleep(2)

    tunnel_log = os.path.join(DIR, "cloudflared-daemon.log")
    subprocess.Popen(
        ["cloudflared", "tunnel", "--url", "http://localhost:8901"],
        stdout=open(tunnel_log, "w"), stderr=subprocess.STDOUT
    )

    tunnel_url = None
    for _ in range(30):
        time.sleep(1)
        try:
            with open(tunnel_log) as f:
                for line in f:
                    if "trycloudflare.com" in line:
                        m = re.search(r'(https://[^\s]*trycloudflare\.com)', line)
                        if m:
                            tunnel_url = m.group(1)
                            break
        except:
            pass
        if tunnel_url:
            break

    if not tunnel_url:
        log.error("Failed to get Cloudflare tunnel URL")
        return

    log.info(f"Tunnel URL: {tunnel_url}")

    webhook_url = f"{tunnel_url}/webhook/of-event"

    resp = curl_json("https://app.onlyfansapi.com/api/webhooks",
                     headers={"Authorization": OF_KEY})
    existing_id = None
    if resp and not resp.get("error"):
        for wh in resp.get("data", []):
            if "trycloudflare.com" in wh.get("url", "") and "of-event" in wh.get("url", ""):
                existing_id = wh["id"]
                break

    events = ["messages.received", "subscriptions.new", "messages.ppv.unlocked", "transactions.new"]

    if existing_id:
        resp = curl_json(
            f"https://app.onlyfansapi.com/api/webhooks/{existing_id}",
            headers={"Authorization": OF_KEY}, method="PUT",
            body={"endpoint_url": webhook_url, "events": events, "enabled": True,
                  "account_scope": "inclusive", "account_ids": [ACCOUNT_ID]}
        )
        log.info(f"Updated webhook {existing_id}: {resp}")
    else:
        resp = curl_json(
            "https://app.onlyfansapi.com/api/webhooks",
            headers={"Authorization": OF_KEY}, method="POST",
            body={"endpoint_url": webhook_url, "events": events, "enabled": True,
                  "account_scope": "inclusive", "account_ids": [ACCOUNT_ID]}
        )
        log.info(f"Created webhook: {resp}")

    save_json(os.path.join(DIR, "bianca-tunnel-state.json"), {
        "tunnel_url": tunnel_url, "webhook_url": webhook_url,
        "started_at": datetime.now(timezone.utc).isoformat()
    })


# =====================================================================
# SECTION 19: MAIN
# =====================================================================

def main():
    log.info(f"Bianca Daemon v2 starting on port {PORT}")

    # Ensure system state exists
    state = load_json(SYSTEM_STATE_FILE, {})
    if "SYSTEM_ENABLED" not in state:
        state["SYSTEM_ENABLED"] = True
        save_json(SYSTEM_STATE_FILE, state)

    # Start background threads
    threading.Thread(target=priority_worker, daemon=True).start()
    threading.Thread(target=dormancy_checker, daemon=True).start()
    threading.Thread(target=bump_checker, daemon=True).start()
    threading.Thread(target=mass_bump_thread, daemon=True).start()
    threading.Thread(target=save_checker, daemon=True).start()
    threading.Thread(target=setup_webhook_tunnel, daemon=True).start()

    class ReusableHTTPServer(HTTPServer):
        allow_reuse_address = True

    server = ReusableHTTPServer(("127.0.0.1", PORT), BiancaHandler)
    log.info(f"Listening on http://127.0.0.1:{PORT}")

    try:
        server.serve_forever()
    except KeyboardInterrupt:
        log.info("Shutting down")
        server.shutdown()


if __name__ == "__main__":
    main()