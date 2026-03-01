#!/usr/bin/env python3
"""
Bianca Daemon v7 — Webhook-driven fan message handler.
Pure Python stdlib. No external dependencies.

Endpoints:
  POST /webhook/fan-message  — receive webhooks from Railway/tunnel
  GET  /health               — health check
  GET  /stats                — metrics
  POST /enable               — enable system
  POST /disable              — disable system
"""

import json, os, sys, re, time, random, subprocess, threading, logging
from http.server import HTTPServer, BaseHTTPRequestHandler
from datetime import datetime, timezone
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

FAN_STATE_FILE = os.path.join(DIR, "bianca-fan-state.json")
FAN_MEMORY_FILE = os.path.join(DIR, "bianca-fan-memory.json")
METRICS_FILE = os.path.join(DIR, "bianca-metrics.json")
OPUS_CALLS_FILE = os.path.join(DIR, "bianca-opus-calls.json")
SYSTEM_STATE_FILE = os.path.join(DIR, "bianca-system-state.json")
PROMPT_FILE = os.path.join(DIR, "bianca-prompt-slim.md")
LOG_FILE = os.path.join(DIR, "bianca-daemon.log")
CONVERSATION_LOG_FILE = os.path.join(DIR, "bianca-conversation-log.jsonl")
OUTCOME_LOG_FILE = os.path.join(DIR, "bianca-outcomes.jsonl")

# Exclude lists
EXCLUDE_FAN_IDS = {483664969, 482383508, 525755724}
EXCLUDE_USERNAMES = {"nij444", "tylerd34"}
PROMO_USERNAMES = {"exclusivepromotion", "premiumpromotions", "erotiqa", "starpromotion", "starpromo"}
PROMO_KEYWORDS = ["permanent post", "mass dm", "promo", "shoutout", "s4s", "promotion",
                  "fans 🧑", "top 0,", "top 0.", "similar results", "want similar"]

MAX_OPUS_PER_MIN = 2
RATE_LIMIT_PAUSE_SEC = 60

# ==================== LOGGING ====================
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    handlers=[
        logging.FileHandler(LOG_FILE),
        logging.StreamHandler()
    ]
)
log = logging.getLogger("bianca")

# ==================== GOOGLE DRIVE STORAGE ====================
_gdrive_buffer = []
_gdrive_lock = threading.Lock()
_gdrive_service = None

GDRIVE_SCOPES = ['https://www.googleapis.com/auth/drive']
GDRIVE_SA_FILE = os.path.join(DIR, 'gcp-service-account.json')
GDRIVE_SHARED_DRIVE_ID = '0AKhuGgNVDSBnUk9PVA'
GDRIVE_FLUSH_INTERVAL = 300  # 5 minutes
GDRIVE_MAX_BUFFER = 1000

def _init_gdrive():
    """Initialize Google Drive service (once on startup)."""
    global _gdrive_service
    try:
        from google.oauth2 import service_account as _sa
        from googleapiclient.discovery import build as _build
        creds = _sa.Credentials.from_service_account_file(GDRIVE_SA_FILE, scopes=GDRIVE_SCOPES)
        _gdrive_service = _build('drive', 'v3', credentials=creds)
        log.info("Google Drive service initialized")
    except Exception as e:
        log.error(f"Failed to init Google Drive: {e}")

def _gdrive_find_or_create_folder(name, parent_id):
    q = f"name='{name}' and '{parent_id}' in parents and mimeType='application/vnd.google-apps.folder' and trashed=false"
    results = _gdrive_service.files().list(q=q, spaces='drive', supportsAllDrives=True, includeItemsFromAllDrives=True).execute()
    files = results.get('files', [])
    if files:
        return files[0]['id']
    meta = {'name': name, 'mimeType': 'application/vnd.google-apps.folder', 'parents': [parent_id]}
    f = _gdrive_service.files().create(body=meta, supportsAllDrives=True, fields='id').execute()
    return f['id']

def _gdrive_append_jsonl(folder_id, filename, lines_text):
    from googleapiclient.http import MediaInMemoryUpload
    q = f"name='{filename}' and '{folder_id}' in parents and trashed=false"
    results = _gdrive_service.files().list(q=q, spaces='drive', supportsAllDrives=True, includeItemsFromAllDrives=True).execute()
    files = results.get('files', [])
    if files:
        file_id = files[0]['id']
        existing = _gdrive_service.files().get_media(fileId=file_id, supportsAllDrives=True).execute().decode('utf-8')
        new_content = existing + lines_text
        media = MediaInMemoryUpload(new_content.encode('utf-8'), mimetype='text/plain')
        _gdrive_service.files().update(fileId=file_id, media_body=media, supportsAllDrives=True).execute()
    else:
        meta = {'name': filename, 'parents': [folder_id]}
        media = MediaInMemoryUpload(lines_text.encode('utf-8'), mimetype='text/plain')
        _gdrive_service.files().create(body=meta, media_body=media, supportsAllDrives=True, fields='id').execute()

def gdrive_log(event_dict):
    """Append an event to the Google Drive buffer. Thread-safe."""
    if "ts" not in event_dict:
        event_dict["ts"] = int(time.time())
    with _gdrive_lock:
        if len(_gdrive_buffer) >= GDRIVE_MAX_BUFFER:
            # Drop oldest 100 to make room
            del _gdrive_buffer[:100]
        _gdrive_buffer.append(event_dict)

def flush_to_gdrive():
    """Flush buffered events to Google Shared Drive as JSONL files."""
    global _gdrive_buffer
    if not _gdrive_service:
        return
    with _gdrive_lock:
        if not _gdrive_buffer:
            return
        events = list(_gdrive_buffer)
        _gdrive_buffer.clear()
    try:
        # Group by date
        by_date = defaultdict(list)
        for ev in events:
            dt = datetime.fromtimestamp(ev.get("ts", time.time()), tz=timezone.utc).strftime("%Y-%m-%d")
            by_date[dt].append(ev)
        # Find/create folder structure: conversations/biancawoods/YYYY-MM-DD.jsonl
        conv_folder = _gdrive_find_or_create_folder("conversations", GDRIVE_SHARED_DRIVE_ID)
        bianca_folder = _gdrive_find_or_create_folder("biancawoods", conv_folder)
        for date_str, date_events in by_date.items():
            lines = "".join(json.dumps(e, separators=(',', ':')) + "\n" for e in date_events)
            _gdrive_append_jsonl(bianca_folder, f"{date_str}.jsonl", lines)
        log.info(f"GDRIVE: Flushed {len(events)} events across {len(by_date)} date(s)")
    except Exception as e:
        log.error(f"GDRIVE flush error: {e}")
        # Re-buffer events that failed to flush
        with _gdrive_lock:
            _gdrive_buffer = events + _gdrive_buffer
            if len(_gdrive_buffer) > GDRIVE_MAX_BUFFER:
                _gdrive_buffer = _gdrive_buffer[-GDRIVE_MAX_BUFFER:]

def gdrive_sync_thread():
    """Background thread: flushes events to Google Drive every 5 minutes."""
    log.info("Google Drive sync thread started (every 5 min)")
    while True:
        time.sleep(GDRIVE_FLUSH_INTERVAL)
        try:
            flush_to_gdrive()
        except Exception as e:
            log.error(f"GDRIVE sync thread error: {e}")

# ==================== STATS ====================
stats = {
    "started_at": datetime.now(timezone.utc).isoformat(),
    "webhooks_received": 0,
    "auto_replies": 0,
    "opus_calls": 0,
    "errors": 0,
    "skipped": 0,
    "sends": 0,
    "last_webhook": None,
    "last_error": None,
}

# ==================== OPUS COOLDOWN ====================
# After Opus acts on a fan, rule engine must NOT auto-reply — route back to Opus
_opus_last_action = {}  # fan_id → timestamp of last Opus action
OPUS_COOLDOWN_SECS = 300  # 5 minutes — any fan message within 5 min of Opus action goes back to Opus

def mark_opus_acted(fan_id):
    """Mark that Opus just handled this fan. Rule engine will defer for OPUS_COOLDOWN_SECS."""
    _opus_last_action[int(fan_id)] = time.time()

def is_opus_cooldown(fan_id):
    """Check if this fan is in Opus cooldown (Opus recently acted, rule engine should defer)."""
    last = _opus_last_action.get(int(fan_id), 0)
    return (time.time() - last) < OPUS_COOLDOWN_SECS

# ==================== PERFORMANCE TRACKING ====================
PERF_FILE = os.path.join(DIR, "bianca-performance.json")
ACTIVE_CHATTERS_FILE = os.path.join(DIR, "bianca-active-chatters.json")
BUMP_REGISTRY_FILE = os.path.join(DIR, "bianca-bump-registry.json")

def is_bump_message(text):
    """Check if a message text matches a known bump template.
    Used to detect if the last outgoing message was a bump (not a real reply)."""
    if not text:
        return False
    text = re.sub(r"<[^>]+>", "", text).strip()
    try:
        with open(BUMP_REGISTRY_FILE) as f:
            registry = json.load(f)
        bump_texts = registry.get("bump_texts", [])
        return text in bump_texts
    except:
        # Fallback hardcoded list
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
    """Check if the most recent message we sent to this fan was a bump.
    If so, the fan hasn't been properly responded to yet."""
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
        
        # Find the most recent message from Bianca
        for msg in messages:
            from_id = msg.get("fromUser", {}).get("id")
            if from_id == BIANCA_ID:
                text = re.sub(r"<[^>]+>", "", msg.get("text", "") or "").strip()
                return is_bump_message(text)
        
        return False  # No outgoing messages found
    except:
        return False

# ==================== PRIORITY QUEUE ====================
# Priority levels (lower = higher priority, processed first)
PRIORITY_NEW_SUB = 1        # Brand new subscriber — hottest lead
PRIORITY_PURCHASER = 2      # Just bought something — upsell window
PRIORITY_HIGH_SPENDER = 3   # $50+ lifetime — whale treatment
PRIORITY_BUYING_SIGNAL = 4  # "how much" / "send me" — ready to buy
PRIORITY_SEXUAL_SIGNAL = 5  # Horny + engaged — close to converting
PRIORITY_ACTIVE_CHAT = 6    # Currently chatting — keep momentum
PRIORITY_BUMP_REPLY = 7     # Replied to a mass bump — warm lead
PRIORITY_COLD = 8           # Generic message, low engagement

import heapq

_priority_queue = []  # (priority, timestamp, fan_id, payload)
_queue_lock = threading.Lock()
_queue_event = threading.Event()

def classify_priority(fan_id, message_text, is_new_sub=False, is_purchase=False):
    """Classify a fan interaction by priority."""
    if is_new_sub:
        return PRIORITY_NEW_SUB
    if is_purchase:
        return PRIORITY_PURCHASER
    
    # Check spend level
    all_state = load_json(FAN_STATE_FILE, {})
    fs = all_state.get(str(fan_id), {})
    total_spent = fs.get("totalSpent", 0)
    msg_count = fs.get("messageCount", 0)
    
    if total_spent > 0:
        return PRIORITY_HIGH_SPENDER  # Any proven buyer gets priority
    
    text = (message_text or "").lower()
    
    # Buying signals
    if any(kw in text for kw in ["how much", "price", "buy", "unlock", "send me", "show me more", "what do you have"]):
        return PRIORITY_BUYING_SIGNAL
    
    # Sexual signals
    if any(kw in text for kw in ["nude", "naked", "strip", "show me", "pussy", "tits", "boobs", "horny", "hard", "🍆", "🍑", "💦"]):
        return PRIORITY_SEXUAL_SIGNAL
    
    # Active conversation (multiple messages)
    if msg_count >= 3:
        return PRIORITY_ACTIVE_CHAT
    
    # Check if replying to a bump
    if last_outgoing_was_bump(fan_id):
        return PRIORITY_BUMP_REPLY
    
    return PRIORITY_COLD

PRIORITY_NAMES = {1: "NEW_SUB", 2: "PURCHASER", 3: "HIGH_SPENDER", 4: "BUYING_SIGNAL",
                  5: "SEXUAL_SIGNAL", 6: "ACTIVE_CHAT", 7: "BUMP_REPLY", 8: "COLD"}

def enqueue_fan(priority, fan_id, payload):
    """Add to priority queue. Higher priority fans get processed first.
    Within same priority level:
    - Priorities 1-5 (hot leads): newest first (strike while iron is hot)
    - Priority 6+ (active/warm/cold): oldest first (don't let them go stale)
    """
    if priority >= PRIORITY_ACTIVE_CHAT:
        # For active chats, bump replies, cold — oldest first
        # Use positive timestamp so older = smaller = dequeued first
        sort_key = time.time()
    else:
        # For hot leads (new sub, purchaser, whale, buying/sexual signal) — newest first
        # Use negative timestamp so newer = smaller = dequeued first
        sort_key = -time.time()
    
    with _queue_lock:
        heapq.heappush(_priority_queue, (priority, sort_key, fan_id, payload))
    _queue_event.set()

def priority_worker():
    """Background thread: processes fan messages in priority order."""
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


# ==================== FAN CONTEXT STORE ====================
# Stores everything Opus needs per fan — no API calls needed at decision time
FAN_CONTEXT_FILE = os.path.join(DIR, "bianca-fan-context.json")

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
                json.dump(contexts, f, separators=(',',':'))
            os.replace(tmp, FAN_CONTEXT_FILE)
        except Exception as e:
            log.error(f"save_fan_contexts: {e}")

def append_conversation_log(fan_id, text, from_bianca=False, content_key=None, price=None, action=None, signals=None):
    """Append ONE line to permanent conversation log. Never truncated. Training data forever."""
    entry = {
        "fan_id": int(fan_id),
        "from": "b" if from_bianca else "f",
        "ts": int(time.time()),
        "text": text[:500] if text else "",
    }
    if content_key:
        entry["key"] = content_key
    if price:
        entry["price"] = price
    if action:
        entry["action"] = action  # "ppv_sent", "free_hook", "greet", "tease", "opus", etc.
    if signals:
        entry["signals"] = signals
    try:
        with file_lock:
            with open(CONVERSATION_LOG_FILE, "a") as f:
                f.write(json.dumps(entry, separators=(',',':')) + "\n")
    except Exception as e:
        log.error(f"append_conversation_log: {e}")


def append_outcome_log(fan_id, event, amount=0, content_key=None, msgs_before_purchase=0, time_to_purchase=0):
    """Log purchase/conversion outcomes. What worked, what didn't. Training gold."""
    entry = {
        "fan_id": int(fan_id),
        "ts": int(time.time()),
        "event": event,  # "ppv_unlocked", "tip", "refund", "unsubscribe", "ignored_ppv"
    }
    if amount:
        entry["amount"] = amount
    if content_key:
        entry["key"] = content_key
    if msgs_before_purchase:
        entry["msgs_to_buy"] = msgs_before_purchase
    if time_to_purchase:
        entry["secs_to_buy"] = time_to_purchase
    
    # Snapshot the fan's context at purchase time — what path led here?
    contexts = load_fan_contexts()
    fk = str(fan_id)
    ctx = contexts.get(fk, {})
    entry["stage"] = ctx.get("stage", "unknown")
    entry["signals"] = ctx.get("signals", [])
    sent = ctx.get("sent_keys", [])
    entry["items_sent"] = len(sent)
    entry["items_bought"] = len([s for s in sent if s.get("bought")])
    
    try:
        with file_lock:
            with open(OUTCOME_LOG_FILE, "a") as f:
                f.write(json.dumps(entry, separators=(',',':')) + "\n")
    except Exception as e:
        log.error(f"append_outcome_log: {e}")


def record_fan_message(fan_id, text, from_bianca=False, content_key=None, price=None, action=None, _skip_permanent=False):
    """Record a message in the fan's context. Keeps last 20 messages. Also appends to permanent log."""
    # Permanent log — never truncated, training data forever
    # _skip_permanent=True when caller already logged (e.g. incoming with signals)
    if not _skip_permanent:
        append_conversation_log(fan_id, text, from_bianca=from_bianca, content_key=content_key, price=price, action=action)
    
    contexts = load_fan_contexts()
    fk = str(fan_id)
    if fk not in contexts:
        contexts[fk] = {"msgs": [], "sent_keys": [], "stage": "new", "signals": []}
    
    ctx = contexts[fk]
    ctx["msgs"].append({
        "from": "b" if from_bianca else "f",
        "text": text[:200],
        "ts": int(time.time())
    })
    # Keep last 20 messages (whale convos need depth, storage is cheap)
    ctx["msgs"] = ctx["msgs"][-20:]
    ctx["last_update"] = int(time.time())
    
    save_fan_contexts(contexts)

def record_content_sent(fan_id, content_key, price=None, purchased=False):
    """Record what content was sent to a fan."""
    contexts = load_fan_contexts()
    fk = str(fan_id)
    if fk not in contexts:
        contexts[fk] = {"msgs": [], "sent_keys": [], "stage": "new", "signals": []}
    
    ctx = contexts[fk]
    entry = {"key": content_key, "ts": int(time.time())}
    if price:
        entry["price"] = price
    if purchased:
        entry["bought"] = True
    
    # Check if already in sent_keys
    existing_keys = [s["key"] for s in ctx["sent_keys"]]
    if content_key not in existing_keys:
        ctx["sent_keys"].append(entry)
    elif purchased:
        # Update existing entry to mark as purchased
        for s in ctx["sent_keys"]:
            if s["key"] == content_key:
                s["bought"] = True
    
    save_fan_contexts(contexts)

def record_fan_signal(fan_id, signal):
    """Record a detected signal (sexual, buying, interest, etc)."""
    contexts = load_fan_contexts()
    fk = str(fan_id)
    if fk not in contexts:
        contexts[fk] = {"msgs": [], "sent_keys": [], "stage": "new", "signals": []}
    
    ctx = contexts[fk]
    if signal not in ctx["signals"]:
        ctx["signals"].append(signal)
    
    save_fan_contexts(contexts)

def update_fan_stage(fan_id, stage):
    """Update conversation stage: new, rapport, teasing, ppv_sent, purchased, upselling, whale, vip"""
    contexts = load_fan_contexts()
    fk = str(fan_id)
    if fk not in contexts:
        contexts[fk] = {"msgs": [], "sent_keys": [], "stage": "new", "signals": []}
    old_stage = contexts[fk].get("stage", "new")
    contexts[fk]["stage"] = stage
    save_fan_contexts(contexts)
    if old_stage != stage:
        gdrive_log({"event": "state_change", "fan_id": int(fan_id), "old_state": old_stage, "new_state": stage})

def get_fan_context_compact(fan_id):
    """Get compact context string for Opus. No API calls."""
    contexts = load_fan_contexts()
    fk = str(fan_id)
    ctx = contexts.get(fk, {"msgs": [], "sent_keys": [], "stage": "new", "signals": []})
    
    # Fan state
    all_state = load_json(FAN_STATE_FILE, {})
    fs = all_state.get(fk, {})
    
    compact = {
        "fan_id": int(fk),
        "name": fs.get("name", ""),
        "spent": fs.get("totalSpent", 0),
        "msg_count": fs.get("messageCount", 0),
        "stage": ctx.get("stage", "new"),
        "signals": ctx.get("signals", []),
        "is_vip": fs.get("is_vip", False),
        "msgs": ctx.get("msgs", [])[-10:],
        "sent": [{"key": s["key"], "bought": s.get("bought", False)} for s in ctx.get("sent_keys", [])],
        "prices": fs.get("priceHistory", [])[-5:],
        "notes": fs.get("notes", "")[:300],
    }
    
    return compact


def track_active_chatter(fan_id, fan_name=""):
    """Record fan as actively chatting. Bump script reads this to build exclude list.
    Auto-prunes entries older than 4 hours to keep file small."""
    with file_lock:
        try:
            with open(ACTIVE_CHATTERS_FILE) as f:
                active = json.load(f)
        except:
            active = {}
        
        now = time.time()
        active[str(fan_id)] = {"name": fan_name, "last_msg": now}
        
        # Prune entries older than 4 hours
        cutoff = now - 14400
        active = {k: v for k, v in active.items() if v.get("last_msg", 0) > cutoff}
        
        try:
            tmp = ACTIVE_CHATTERS_FILE + ".tmp"
            with open(tmp, "w") as f:
                json.dump(active, f, indent=2)
            os.replace(tmp, ACTIVE_CHATTERS_FILE)
        except Exception as e:
            log.error(f"track_active_chatter: {e}")

# ==================== OF EXCLUDE LIST SYNC ====================
EXCLUDE_LIST_ID = 1265115686  # "jacks exclude bump list"
_exclude_list_members = set()  # track who's currently on the OF list

def sync_exclude_list():
    """Sync active chatters to the OF exclude list every 10 minutes.
    Adds fans active in last hour, removes expired ones."""
    global _exclude_list_members
    while True:
        try:
            time.sleep(600)  # every 10 min
            with file_lock:
                try:
                    with open(ACTIVE_CHATTERS_FILE) as f:
                        active = json.load(f)
                except:
                    active = {}
            
            now = time.time()
            cutoff = now - 3600  # 1 hour
            should_be_on = set(int(fid) for fid, info in active.items() if info.get("last_msg", 0) > cutoff)
            
            to_add = should_be_on - _exclude_list_members
            to_remove = _exclude_list_members - should_be_on
            
            base = f"https://app.onlyfansapi.com/api/acct_54e3119e77da4429b6537f7dd2883a05"
            auth = f"Bearer {os.environ.get('OF_API_KEY', 'ofapi_bT4J1Er2YBow46EihDfjlSFf5HRmiM15M4DCOoHn7889d8b4')}"
            
            if to_add:
                cmd = ["curl", "-s", "--max-time", "15", "-X", "POST",
                       "-H", f"Authorization: {auth}", "-H", "Content-Type: application/json",
                       "-d", json.dumps({"ids": list(to_add)}),
                       f"{base}/user-lists/{EXCLUDE_LIST_ID}/users"]
                r = subprocess.run(cmd, capture_output=True, text=True, timeout=20)
                if '"data"' in r.stdout:
                    _exclude_list_members.update(to_add)
                    log.info(f"EXCLUDE-SYNC: Added {len(to_add)} to OF list")
            
            if to_remove:
                cmd = ["curl", "-s", "--max-time", "15", "-X", "DELETE",
                       "-H", f"Authorization: {auth}", "-H", "Content-Type: application/json",
                       "-d", json.dumps({"ids": list(to_remove)}),
                       f"{base}/user-lists/{EXCLUDE_LIST_ID}/users"]
                r = subprocess.run(cmd, capture_output=True, text=True, timeout=20)
                _exclude_list_members -= to_remove
                log.info(f"EXCLUDE-SYNC: Removed {len(to_remove)} from OF list")
            
            if not to_add and not to_remove:
                log.debug(f"EXCLUDE-SYNC: No changes ({len(_exclude_list_members)} on list)")
                
        except Exception as e:
            log.error(f"exclude_list_sync error: {e}")

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
    """Track a performance event. All metrics stored persistently."""
    perf = load_perf()
    today = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    hour = datetime.now(timezone.utc).strftime("%Y-%m-%d-%H")
    
    # Ensure today bucket exists
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
        # Track per-fan
        if fan_id:
            fk = str(fan_id)
            if fk not in perf["fans"]:
                perf["fans"][fk] = {"ppvs_sent": 0, "ppvs_unlocked": 0, "spent": 0.0, "first_seen": today}
            perf["fans"][fk]["ppvs_sent"] += 1
            if content_key:
                perf["fans"][fk]["last_sent"] = content_key
            if price:
                perf["fans"][fk]["last_price"] = price
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
        if fan_id:
            fk = str(fan_id)
            if fk not in perf["fans"]:
                perf["fans"][fk] = {"ppvs_sent": 0, "ppvs_unlocked": 0, "spent": 0.0, "first_seen": today}
            perf["fans"][fk]["spent"] += amount
    elif event == "new_sub":
        d["new_subs"] += 1; lt["new_subs_welcomed"] += 1
    elif event == "upsell_sent":
        d["upsells_sent"] += 1; lt["upsells_sent"] += 1
    elif event == "opus_call":
        d["opus_calls"] += 1; lt["opus_calls"] += 1
    
    # Prune hourly older than 48h (keep file small)
    cutoff = (datetime.now(timezone.utc) - __import__('datetime').timedelta(hours=48)).strftime("%Y-%m-%d-%H")
    perf["hourly"] = {k: v for k, v in perf["hourly"].items() if k >= cutoff}
    
    # Prune daily older than 30 days
    cutoff_day = (datetime.now(timezone.utc) - __import__('datetime').timedelta(days=30)).strftime("%Y-%m-%d")
    perf["today"] = {k: v for k, v in perf["today"].items() if k >= cutoff_day}
    
    save_perf(perf)

# Thread lock for file I/O
file_lock = threading.Lock()

# ==================== VAULT MAP ====================
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
    # Combo bundles: 2 videos + 10 photos each (always send these instead of single bundles)
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
    # High ticket packages (multi-message, tip-based)
    # These are lists of lists — each sub-list is one message (max 30 items)
    "starter_pack": "HIGH_TICKET",  # Handled specially in execute
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

# ==================== CONTENT TIER SYSTEM ====================
# Classify every content key by explicitness level
# Level 1: clothed/bikini  Level 2: implied nude (hand bra, tit bounce, no nipple)
# Level 3: topless (actual nipples)  Level 4: rubbing/cumming (most explicit)

CONTENT_TIERS = {
    # Free content
    "gfe_selfie":      {"level": 1, "tags": ["clothed", "face", "cute"], "desc": "cute selfie"},
    "booty_pic":       {"level": 1, "tags": ["clothed", "ass", "tease"], "desc": "booty pic"},
    "bump":            {"level": 1, "tags": ["clothed", "promo"], "desc": "bump/promo"},
    "rekindle_vid":    {"level": 1, "tags": ["clothed", "face", "video"], "desc": "rekindle vid"},
    "sexting1_pic":    {"level": 2, "tags": ["implied", "tease"], "desc": "implied tease pic"},
    "sexting2_pic":    {"level": 2, "tags": ["implied", "tease"], "desc": "implied tease pic"},
    "sexting3_pic":    {"level": 2, "tags": ["implied", "tease"], "desc": "implied tease pic"},
    # Sexting vid chains (implied nude strip sequences)
    **{f"sexting{c}_vid_{l}": {"level": 2, "tags": ["implied", "strip", "video"], "desc": f"strip vid chain {c}"}
       for c in range(1, 4) for l in [15, 24, 38, 54, 75]},
    "sexting3_vid_100": {"level": 2, "tags": ["implied", "strip", "video"], "desc": "strip vid chain 3"},
    # Bundles 1-10: clothed/bikini
    **{f"bundle{i}": {"level": 1, "tags": ["clothed", "photos"], "desc": "clothed photo set"} for i in range(1, 11)},
    # Bundles 11-26: implied nude (tit bounce, hand bra etc)
    **{f"bundle{i}": {"level": 2, "tags": ["implied", "photos"], "desc": "implied nude set"} for i in range(11, 27)},
    # Combos: MIXED — each combo has 2 vids (1 clothed + 1 implied) + 10 photos (mix)
    # Combos 1-5 lean clothed (first vid from bundles 1-10)
    **{f"combo{i}": {"level": 1.5, "tags": ["mixed", "combo"], "desc": "mixed combo (clothed + implied)"} for i in range(1, 6)},
    # Combos 6-13 lean implied (both vids from bundles 11+)
    **{f"combo{i}": {"level": 2, "tags": ["implied", "combo"], "desc": "implied nude combo"} for i in range(6, 14)},
    # Custom tiers (explicit, premium)
    "custom_tier1_shower":  {"level": 3, "tags": ["topless", "shower", "video"], "desc": "shower vid"},
    "custom_tier2_bedroom": {"level": 3, "tags": ["topless", "bedroom", "video"], "desc": "bedroom vid"},
    "custom_tier3_topless":  {"level": 3, "tags": ["topless", "tits", "video"], "desc": "topless vid"},
    "custom_tier4_rubbing":  {"level": 4, "tags": ["rubbing", "explicit", "video"], "desc": "rubbing vid"},
    "custom_tier5_titty":    {"level": 3, "tags": ["topless", "titty", "video"], "desc": "titty play vid"},
    "custom_tier6_tryon":    {"level": 3, "tags": ["topless", "tryon", "video"], "desc": "try-on vid"},
    "custom_tier7_cumming":  {"level": 4, "tags": ["cumming", "explicit", "video"], "desc": "cumming vid"},
}

# Combo groups by explicitness
COMBOS_CLOTHED = [f"combo{i}" for i in range(1, 6)]     # More clothed content
COMBOS_IMPLIED = [f"combo{i}" for i in range(6, 14)]     # More implied nude
COMBOS_ALL = [f"combo{i}" for i in range(1, 14)]

def choose_combo(fan_id, min_level=1):
    """Pick the right combo for a fan based on spend, preferences, and what they've already seen.
    
    min_level: minimum explicitness (1=clothed ok, 2=implied minimum, 3=topless minimum)
    Returns (content_key, price) tuple.
    """
    state = FAN_STATE.get(str(fan_id), {})
    spend = state.get("totalSpend", 0)
    notes = (state.get("notes", "") or "").lower()
    sent_keys = [s.get("key", "") for s in state.get("sent", [])]
    
    # Detect preferences from notes
    wants_nude = any(w in notes for w in ["nude", "naked", "topless", "tits", "nipple", "boobs"])
    wants_ass = any(w in notes for w in ["ass", "booty", "butt"])
    wants_explicit = any(w in notes for w in ["rubbing", "cumming", "explicit", "pussy", "masturbat"])
    
    # Determine minimum tier based on fan context
    if wants_explicit and spend >= 50:
        min_level = max(min_level, 4)
    elif wants_nude and spend >= 20:
        min_level = max(min_level, 3)
    elif spend >= 50:
        min_level = max(min_level, 2)
    
    # For topless/explicit requests, go straight to custom tiers if spend justifies
    if min_level >= 3 and spend >= 20:
        topless_keys = [k for k in VAULT_MAP if k.startswith("custom_tier") 
                       and CONTENT_TIERS.get(k, {}).get("level", 0) >= min_level
                       and k not in sent_keys]
        if topless_keys:
            key = topless_keys[0]
            base_prices = {"custom_tier1_shower": 50, "custom_tier2_bedroom": 60, 
                          "custom_tier3_topless": 70, "custom_tier4_rubbing": 80,
                          "custom_tier5_titty": 90, "custom_tier6_tryon": 70, 
                          "custom_tier7_cumming": 100}
            price = base_prices.get(key, 70)
            return key, price
    
    # For combo selection, prefer implied/nude combos for fans who want more
    if min_level >= 2:
        pool = [c for c in COMBOS_IMPLIED if c not in sent_keys]
        if not pool:
            pool = [c for c in COMBOS_IMPLIED]  # Allow repeats if all sent
    else:
        pool = [c for c in COMBOS_ALL if c not in sent_keys]
        if not pool:
            pool = COMBOS_ALL[:]
    
    key = random.choice(pool)
    
    # Price based on spend tier
    if spend >= 100:
        price = random.choice([25, 30])
    elif spend >= 20:
        price = random.choice([18, 22])
    else:
        price = 18
    
    return key, price

# ==================== AUTO-REPLY TEMPLATES ====================
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

GREETING_REPLIES = [
    "heyy babe 💕", "hiii cutie 😘", "hey love 💗", "heyyy 🥰",
    "hi babe!! 💕", "heyy handsome 😏", "omg hiii 💕✨",
    "heyyy love 😘💕", "hi baby 🥰", "heyy!! missed u 💕"
]
EMOJI_REPLIES = [
    "😘💕", "hehe 🥰", "💕💕", "u make me smile 😊💕",
    "🫶✨", "right back at u babe 😘", "aww 🥰💕"
]
THANKS_REPLIES = [
    "ofc babe 💕", "anytime love 😘", "always for u 💕",
    "ofc!! 🥰", "hehe ur welcome babe 💕"
]

# ==================== HELPERS ====================

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


# ==================== PRICE ENGINE ====================
PRICE_LADDER = [18, 25, 38, 54, 75]  # Escalation tiers by purchase count

def get_next_price(fan_id):
    """Dynamic price based on fan's purchase history. Escalates per purchase."""
    all_state = load_json(FAN_STATE_FILE, {})
    fs = all_state.get(str(fan_id), {})
    purchase_count = fs.get("purchaseCount", 0)

    # If no purchaseCount tracked yet, estimate from totalSpent
    if purchase_count == 0 and fs.get("totalSpent", 0) > 0:
        purchase_count = max(1, int(fs["totalSpent"] / 18))

    # Count recent rejections (PPVs sent without purchase) from outcome log
    try:
        rejections = 0
        last_purchase_ts = 0
        with open(OUTCOME_LOG_FILE) as f:
            for line in f:
                try:
                    o = json.loads(line)
                    if str(o.get("fan_id")) != str(fan_id):
                        continue
                    if o.get("event") in ("purchase", "purchased"):
                        last_purchase_ts = o.get("ts", 0)
                        rejections = 0
                    elif o.get("event") == "ppv_sent":
                        if o.get("ts", 0) > last_purchase_ts:
                            rejections += 1
                except:
                    continue
    except FileNotFoundError:
        rejections = 0

    # If 2+ rejections at current tier without buying, don't escalate
    tier_idx = min(purchase_count, len(PRICE_LADDER) - 1)
    if rejections >= 2 and purchase_count > 0:
        tier_idx = max(0, tier_idx - 1)

    price = PRICE_LADDER[tier_idx]
    log.info(f"PRICE-ENGINE: fan {fan_id} purchase#{purchase_count} → ${price}")
    return price


def curl_json(url, headers=None, method="GET", body=None, timeout=10):
    """HTTP via curl subprocess. Returns parsed JSON or error dict."""
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
    """Send message via OF API with human-like delay. Returns response dict."""
    import random as _rnd
    delay = _rnd.uniform(5, 18)  # 5-18 second random delay before sending
    log.info(f"DELAY: Waiting {delay:.1f}s before sending to {fan_id}")
    time.sleep(delay)
    
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
    
    # Performance tracking
    perf_track("reply", fan_id=fan_id)
    if price and price > 0:
        perf_track("ppv_sent", fan_id=fan_id, content_key=content_key, price=price)
        update_fan_stage(fan_id, "ppv_sent")
    
    # Record outgoing message + content sent
    action_type = "ppv_sent" if price else ("media" if media_ids else "text")
    record_fan_message(fan_id, text, from_bianca=True, content_key=content_key, price=price, action=action_type)
    gdrive_log({"event": "bot_msg", "fan_id": fan_id, "text": (text or "")[:500], "content_key": content_key, "price": price, "action": action_type})
    if content_key:
        record_content_sent(fan_id, content_key, price=price)
    
    return resp


def handle_rate_limit():
    """Handle 429 — pause system for 60s."""
    opus = load_json(OPUS_CALLS_FILE, {"calls": [], "last_429": None})
    opus["last_429"] = now_ms()
    save_json(OPUS_CALLS_FILE, opus)
    
    state = load_json(SYSTEM_STATE_FILE, {})
    state["COOLDOWN_UNTIL"] = now_ms() + (RATE_LIMIT_PAUSE_SEC * 1000)
    state["last_429"] = now_ms()
    save_json(SYSTEM_STATE_FILE, state)


def check_opus_rate_limit():
    """Returns True if we can make an Opus call."""
    now = now_ms()
    opus = load_json(OPUS_CALLS_FILE, {"calls": [], "last_429": None})
    
    # Check 429 cooldown
    last_429 = opus.get("last_429")
    if last_429 and (now - last_429) < 60000:
        return False
    
    # Check rate limit
    calls = [c for c in opus.get("calls", []) if now - c < 60000]
    return len(calls) < MAX_OPUS_PER_MIN


def record_opus_call():
    """Record an Opus call timestamp."""
    opus = load_json(OPUS_CALLS_FILE, {"calls": [], "last_429": None})
    now = now_ms()
    calls = [c for c in opus.get("calls", []) if now - c < 60000]
    calls.append(now)
    opus["calls"] = calls
    save_json(OPUS_CALLS_FILE, opus)


def is_system_enabled():
    """Check if the system is enabled."""
    state = load_json(SYSTEM_STATE_FILE, {})
    if not state.get("SYSTEM_ENABLED", True):
        return False
    cooldown = state.get("COOLDOWN_UNTIL")
    if cooldown and now_ms() < cooldown:
        return False
    return True


def is_promo(username, message_text):
    """Check if this is a promo account/message."""
    if username and username.lower() in PROMO_USERNAMES:
        return True
    msg_lower = (message_text or "").lower()
    return any(kw in msg_lower for kw in PROMO_KEYWORDS)


def fetch_historical_spend(fan_id):
    """Fetch a fan's total historical spend from OF API. Returns (total_spent, transaction_count)."""
    try:
        url = f"https://app.onlyfansapi.com/api/{ACCOUNT_ID}/users/{fan_id}"
        resp = curl_json(url, headers={"Authorization": OF_KEY}, timeout=15)
        if not resp or resp.get("error"):
            log.warning(f"Could not fetch user for fan {fan_id}: {resp}")
            return 0, 0
        
        data = resp.get("data", {})
        sub_data = data.get("subscribedOnData", {})
        
        total = (sub_data.get("totalSumm", 0) or 0)
        tips = (sub_data.get("tipsSumm", 0) or 0)
        messages = (sub_data.get("messagesSumm", 0) or 0)
        posts = (sub_data.get("postsSumm", 0) or 0)
        
        # Also grab fan name
        fan_name = data.get("name", "")
        
        log.info(f"Historical spend for fan {fan_id} ({fan_name}): total=${total:.2f} (tips=${tips:.2f} msgs=${messages:.2f} posts=${posts:.2f})")
        return total, max(1, int(total / 18)) if total > 0 else 0
    except Exception as e:
        log.error(f"fetch_historical_spend error for {fan_id}: {e}")
        return 0, 0


def update_fan_state(fan_id, name=None, action_desc=None, message_count_inc=1):
    """Update fan state file."""
    all_state = load_json(FAN_STATE_FILE, {})
    fan_key = str(fan_id)
    is_new_fan = fan_key not in all_state
    if is_new_fan:
        all_state[fan_key] = {
            "name": name or "",
            "buyerType": "unknown",
            "totalSpent": 0,
            "notes": "",
            "priceHistory": [],
            "lastProcessedAt": None,
            "lastAction": None,
            "messageCount": 0,
            "lastSpendRefresh": None,
        }
    
    # Refresh spend data: on first contact AND every 2 hours
    fs_temp = all_state[fan_key]
    last_refresh = fs_temp.get("lastSpendRefresh")
    should_refresh = is_new_fan or not last_refresh or \
        (time.time() - (last_refresh or 0)) > 7200  # 2 hours
    
    if should_refresh:
        hist_spent, hist_count = fetch_historical_spend(fan_id)
        if hist_spent > 0:
            old_spent = fs_temp.get("totalSpent", 0)
            fs_temp["totalSpent"] = hist_spent
            fs_temp["purchaseCount"] = hist_count
            if hist_spent >= 200:
                fs_temp["buyerType"] = "whale"
            elif hist_spent >= 50:
                fs_temp["buyerType"] = "buyer"
            elif hist_spent >= 10:
                fs_temp["buyerType"] = "proven_buyer"
            if hist_spent != old_spent:
                log.info(f"SPEND REFRESH {fan_id}: ${old_spent:.2f} → ${hist_spent:.2f}")
        fs_temp["lastSpendRefresh"] = time.time()
    fs = all_state[fan_key]
    if name:
        fs["name"] = name
    fs["lastProcessedAt"] = datetime.now(timezone.utc).isoformat()
    if action_desc:
        fs["lastAction"] = f"{fs['lastProcessedAt']} - {action_desc}"
    fs["messageCount"] = fs.get("messageCount", 0) + message_count_inc
    save_json(FAN_STATE_FILE, all_state)
    return fs


def format_ago(created_at):
    try:
        t = datetime.fromisoformat(created_at)
        delta = (datetime.now(timezone.utc) - t).total_seconds()
        if delta < 60: return f"{int(delta)}s"
        if delta < 3600: return f"{int(delta/60)}m"
        if delta < 86400: return f"{int(delta/3600)}h"
        return f"{int(delta/86400)}d"
    except:
        return "?"


# ==================== CORE LOGIC ====================

def is_high_spender(fan_id):
    """Check if fan has spent $50+ — always route to Opus."""
    all_state = load_json(FAN_STATE_FILE, {})
    fs = all_state.get(str(fan_id), {})
    return fs.get("totalSpent", 0) >= 50

# ==================== SIGNAL DETECTION ====================
# Classify fan messages by buying intent

SEXUAL_SIGNALS = re.compile(
    r"(nud|naked|strip|show me|see more|content|pics|videos|explicit|pussy|tits|boobs|ass|body|topless|lingerie|bikini|sexy|naughty|wild|freaky|horny|hard|turned on|boner|cum|wet|😈|🍆|🍑|💦|👅|🥵|🤤)",
    re.IGNORECASE
)
BUYING_SIGNALS = re.compile(
    r"(how much|price|cost|what do (you|u) (have|offer|sell|post)|what('?s| is) (on|in) (your|ur) (page|profile|menu)|buy|purchase|unlock|ppv|pay|worth|deal|bundle|package|send me|show me more)",
    re.IGNORECASE
)
COMPLAINT_SIGNALS = re.compile(
    r"(refund|scam|fake|bot|chat bot|chatbot|waste.*(time|money)|rip.?off|ripoff|report|not real|liar|lied|lying|false advertis|false promis|didn.?t (deliver|get|receive|see)|where.*(nude|topless|naked|content)|you (said|promised|told)|request.*(refund|money back)|money back|charged|complain|support|customer service)",
    re.IGNORECASE
)
NEGOTIATION_SIGNALS = re.compile(
    r"(\d+\s*(bucks|dollars|\$)|too (much|expensive|short|little)|only\s*(a |one )?(minute|min|sec|vid|video|pic|photo)|not (enough|worth)|lower|cheaper|discount|less|deal|how about|counter.?offer|i('?ll| will) (do|pay|give)\s*\d+|can (u|you) do\s*\d+|make it\s*\d+)",
    re.IGNORECASE
)
CURIOSITY_SIGNALS = re.compile(
    r"(what (do|kind|type).*(post|content|share|make|do)|tell me about|what('?s| is) (this|your).*(page|of|about)|new here|just (sub|found|joined|started))",
    re.IGNORECASE
)
# Interest signals — fan is engaged with HER specifically (not just generic chat)
INTEREST_SIGNALS = re.compile(
    r"(you('?re| are) (so |really )?(hot|beautiful|gorgeous|cute|pretty|fine|sexy|stunning|amazing)|love (your|ur) (body|boobs|tits|ass|eyes|smile|face|hair|lips|look)|damn|omg|wow|😍|🤩|🥵|love (it|this|that|them)|you('?re| are) perfect|dream girl|obsessed|cant stop|addicted|fan of (you|yours)|following|subscribed for)",
    re.IGNORECASE
)

# ==================== RESPONSE TEMPLATES ====================

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

# GFE rapport (messages 1-3)
RAPPORT_REPLIES = [
    "im good babe just laying in bed thinking about u 🥰 wbu?",
    "better now that ur here 😏💕 what are u up to?",
    "just being cute and bored 🙈 entertain me?? lol",
    "kinda lonely ngl 🥺 glad ur here tho 💕 whatcha doing?",
]

# Content tease (messages 3-5, building desire)
TEASE_REPLIES = [
    "im actually taking some pics rn 📸 getting a little adventurous today 😏",
    "omg i just tried on something new and it looks soo good 🙈 wanna see?",
    "ugh im so bored... maybe i should take some spicy pics to pass the time 👀",
    "u know what... i feel like being a little naughty today 😏💕",
    "i just took something crazy and idk if i should send it 🙈",
]

# Free hook tease (message 4-5, attach free sexting pic)
FREE_HOOK_REPLIES = [
    "ok fine since ur being so sweet... heres a little preview just for u 🙈💕",
    "i dont usually do this but... u seem different 🥺 heres a lil something",
    "ok but dont show anyone 🙈 this is just between us 💕",
    "i was saving this but u deserve a sneak peek 😏💕",
]

# PPV push (message 6+, send combo bundle)
PPV_PUSH_REPLIES = [
    "ok so... ive never done this before but u make me want to 🙈🔥 i put together 2 videos and a whole set of pics just for u",
    "babe i have something crazy... its 2 videos and like 10 pics and its 🔥🔥 ive never sent this to anyone before 🥺",
    "ok i trust u enough now 😏 i made u a whole package... 2 vids + all my best pics 💕🔥 nobody else has seen this",
    "ive been saving this for someone special 🥺 2 videos and a full set... and i think ur that person 💕🔥",
    "ok fine u wore me down 🙈 im sending u my best stuff... 2 vids + 10 pics... dont show anyone 🥺💕",
]

# Sexual signal responses (immediate pivot to content)
SEXUAL_REPLY_TEASE = [
    "omg 😏 u dont waste any time huh... i like that 🔥 i actually have something ud love",
    "mmm 😏 well since u asked... i might have a few things 🙈💕",
    "hehe someones eager 😏💕 ok ok... i have something really good actually",
    "ooo i like where ur heads at 😈💕 wanna see what i just made?",
]

# Buying signal responses (go straight to PPV)
BUYING_REPLY = [
    "omg yes!! i have so much 🙈 let me send u my favorite set... i think ull love it 😏🔥",
    "yesss i have some really good stuff 💕 heres one of my best sets just for u 🔥",
    "ooo u came to the right place babe 😏 check this out...",
]

# Curiosity responses (tease → free hook)
CURIOSITY_REPLY = [
    "omg so glad u asked 🥰 i post all kinds of stuff... wanna see a preview? 🙈",
    "hehe well... lets just say i get a little wild on here 😏 heres a taste 💕",
    "i post stuff i cant put anywhere else 🙈 heres a sneak peek babe...",
]

# Filler keepalive
FILLER_REPLIES = [
    "lol 😂 ur funny babe... sooo what are u into?",
    "haha 😏 anyway i was thinking about u...",
    "haha 🥰 u make me smile. so tell me something... what do u like?",
    "lol right?? 😂 ok but real talk... what brought u here? 😏",
]

# Re-engage / generic (messages that don't match patterns)
REENGAGE_REPLIES = [
    "thats cool babe 💕 so what are u doing rn? im kinda bored 🙈",
    "haha aww 🥰 ok but like... what do u wanna do rn 😏",
    "interesting 😏 so tell me... are u usually this shy? 💕",
]

# Patterns
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


def try_auto_reply(fan_id, message_text, fan_name=None, force_respond=False):
    """
    Sales-focused auto-reply state machine.
    
    ROUTING:
    - $50+ spenders → always Opus (personalized whale handling)
    - Sexual/buying signals → fast-track to PPV offer
    - Everyone else → escalation ladder by message count
    - force_respond=True when last outgoing was a bump (fan needs real response)
    
    ESCALATION LADDER ($0 spend fans):
    Msg 1-2: Greet + free selfie (hook)
    Msg 3-4: Flirty rapport, tease content
    Msg 5:   Free sexting pic (desire builder)
    Msg 6+:  Push $18 bundle PPV
    
    Returns True if handled, False if needs Opus.
    """
    text = (message_text or "").strip()
    if not text:
        return False
    
    # ===== ANY SPENDER → OPUS ALWAYS =====
    # If they've spent $1+, they've proven they'll pay. Python can't maximize that — Opus can.
    all_state_check = load_json(FAN_STATE_FILE, {})
    fan_spent = all_state_check.get(str(fan_id), {}).get("totalSpent", 0)
    # Also check context file stage (catches race condition: purchase webhook may lag behind message webhook)
    contexts_check = load_fan_contexts()
    fan_stage = contexts_check.get(str(fan_id), {}).get("stage", "")
    if fan_spent > 0 or fan_stage == "purchased":
        log.info(f"OPUS-ROUTE: Fan {fan_id} spent=${fan_spent} stage={fan_stage} — routing to Opus")
        return False
    
    # Load fan state — use CONTEXT file msg count as primary (state file has persistence bug)
    all_state = load_json(FAN_STATE_FILE, {})
    fan_key = str(fan_id)
    fan_data = all_state.get(fan_key, {})
    # Count messages from context file (more reliable than messageCount in state file)
    contexts_for_count = load_fan_contexts()
    fan_msgs = contexts_for_count.get(fan_key, {}).get("msgs", [])
    msg_count_from_ctx = len([m for m in fan_msgs if not m.get("from_bianca")])
    msg_count_from_state = fan_data.get("messageCount", 0)
    msg_count = max(msg_count_from_ctx, msg_count_from_state)  # use whichever is higher
    total_spent = fan_data.get("totalSpent", 0)
    if msg_count_from_ctx != msg_count_from_state:
        log.info(f"MSG-COUNT-MISMATCH: fan {fan_id} ctx={msg_count_from_ctx} state={msg_count_from_state} using={msg_count}")
    
    # If last outgoing was a bump, treat as if msg_count is lower
    # so the fan gets a real response (rapport/tease/hook) instead of being skipped
    if force_respond and msg_count > 4:
        log.info(f"BUMP-RESET: Fan {fan_id} msg_count {msg_count} → treating as 3 (post-bump)")
        msg_count = 3  # Put them in tease stage — they've been engaged before
    
    # ===== OPUS COOLDOWN → if Opus recently handled this fan, defer back to Opus =====
    if is_opus_cooldown(fan_id):
        log.info(f"OPUS-COOLDOWN: Fan {fan_id} — Opus acted recently, deferring back to Opus")
        return False
    
    # ===== COMPLAINT/REFUND → ALWAYS OPUS (never auto-reply to angry fans) =====
    if COMPLAINT_SIGNALS.search(text):
        log.info(f"COMPLAINT-ROUTE: Fan {fan_id} msg='{text[:60]}' — routing to Opus for damage control")
        record_fan_signal(fan_id, "complaint")
        return False
    
    # ===== PRICE NEGOTIATION → ALWAYS OPUS (fan is counter-offering or objecting to value) =====
    if NEGOTIATION_SIGNALS.search(text):
        log.info(f"NEGOTIATION-ROUTE: Fan {fan_id} msg='{text[:60]}' — routing to Opus for objection handling")
        record_fan_signal(fan_id, "negotiation")
        return False
    
    # ===== SIGNAL DETECTION (overrides message count) =====
    
    # BUYING SIGNAL → send PPV immediately (they're ready)
    if BUYING_SIGNALS.search(text):
        record_fan_signal(fan_id, "buying")
        reply = random.choice(BUYING_REPLY)
        bundle_key, price = choose_combo(fan_id, min_level=2)  # At least implied for buyers
        vault_ids = VAULT_MAP.get(bundle_key, [])
        if vault_ids:
            send_of_message(fan_id, reply, media_ids=vault_ids, price=price, content_key=bundle_key)
            log.info(f"SALES-ENGINE ppv_push(buying_signal) → {fan_id}: {bundle_key} ${price}")
            update_fan_state(fan_id, name=fan_name, action_desc=f"PPV push (buying signal): {bundle_key} ${price}")
            stats["auto_replies"] += 1
            return True
    
    # SEXUAL SIGNAL → tease then free hook, next msg will get PPV
    if SEXUAL_SIGNALS.search(text):
        record_fan_signal(fan_id, "sexual")
        if msg_count >= 4:
            # They're warmed up + sexual → send PPV (at least implied nude)
            reply = random.choice(SEXUAL_REPLY_TEASE)
            bundle_key, price = choose_combo(fan_id, min_level=2)  # Implied minimum for sexual fans
            vault_ids = VAULT_MAP.get(bundle_key, [])
            if vault_ids:
                send_of_message(fan_id, reply, media_ids=vault_ids, price=price, content_key=bundle_key)
                log.info(f"SALES-ENGINE ppv_push(sexual+warmed) → {fan_id}: {bundle_key} ${price}")
                update_fan_state(fan_id, name=fan_name, action_desc=f"PPV push (sexual signal): {bundle_key} ${price}")
                stats["auto_replies"] += 1
                return True
        else:
            # Early sexual → send free sexting pic to build desire
            reply = random.choice(SEXUAL_REPLY_TEASE)
            chain = random.choice(["sexting1_pic", "sexting2_pic", "sexting3_pic"])
            vault_ids = VAULT_MAP.get(chain, [])
            if vault_ids:
                send_of_message(fan_id, reply, media_ids=vault_ids)
                log.info(f"SALES-ENGINE free_hook(sexual) → {fan_id}: {chain}")
                update_fan_state(fan_id, name=fan_name, action_desc=f"Free hook (sexual signal): {chain}")
                stats["auto_replies"] += 1
                return True
    
    # INTEREST SIGNAL → she's got their attention, escalate toward content
    if INTEREST_SIGNALS.search(text):
        record_fan_signal(fan_id, "interest")
        if msg_count >= 4:
            # They're warmed up + interested → send PPV
            reply = random.choice([
                "omg stoppp ur making me blush 🙈💕 ok fine... since u appreciate me... i have something special 😏🔥",
                "awww babe 🥺💕 u really know how to make a girl feel good... wanna see what i look like when im really feeling myself? 😏",
                "hehe ur too sweet 🥰 ok u deserve this... i put together something just for fans like u 🔥",
            ])
            combo_key, price = choose_combo(fan_id, min_level=1)  # Interest = clothed ok
            vault_ids = VAULT_MAP.get(combo_key, [])
            if vault_ids:
                send_of_message(fan_id, reply, media_ids=vault_ids, price=price, content_key=combo_key)
                log.info(f"SALES-ENGINE ppv_push(interest+warmed) → {fan_id}: {combo_key} ${price}")
                update_fan_state(fan_id, name=fan_name, action_desc=f"PPV push (interest signal): {combo_key} ${price}")
                stats["auto_replies"] += 1
                return True
        else:
            # Early interest → build on it with tease
            reply = random.choice([
                "omg thank u babe 🥺💕 u havent even seen the good stuff yet tho 😏",
                "stoppp 🙈💕 ur gonna make me do something crazy... like show u what i look like without this on 😏",
                "aww 🥰 well if u think thats hot... wait til u see what i just took 🙈🔥",
                "hehe 😏💕 keep talking like that and ill have to show u something special...",
            ])
            send_of_message(fan_id, reply)
            log.info(f"SALES-ENGINE interest_tease → {fan_id}: {reply[:40]}")
            update_fan_state(fan_id, name=fan_name, action_desc=f"Interest tease (msg {msg_count})")
            stats["auto_replies"] += 1
            return True
    
    # CURIOSITY SIGNAL → free hook + tease
    if CURIOSITY_SIGNALS.search(text):
        record_fan_signal(fan_id, "curiosity")
        reply = random.choice(CURIOSITY_REPLY)
        chain = random.choice(["sexting1_pic", "sexting2_pic", "sexting3_pic"])
        vault_ids = VAULT_MAP.get(chain, [])
        if vault_ids:
            send_of_message(fan_id, reply, media_ids=vault_ids)
            log.info(f"SALES-ENGINE free_hook(curiosity) → {fan_id}: {chain}")
            update_fan_state(fan_id, name=fan_name, action_desc=f"Free hook (curiosity): {chain}")
            stats["auto_replies"] += 1
            return True
    
    # ===== GOODBYE (any message count) =====
    if GOODBYE.match(text):
        reply = random.choice(GOODBYE_REPLIES)
        send_of_message(fan_id, reply)
        log.info(f"AUTO-REPLY goodbye → {fan_id}: {reply}")
        update_fan_state(fan_id, name=fan_name, action_desc=f"Auto-reply goodbye: {reply}")
        stats["auto_replies"] += 1
        return True
    
    # ===== THANKS (any message count) =====
    if THANKS_PATTERNS.match(text):
        reply = random.choice(THANKS_REPLIES)
        send_of_message(fan_id, reply)
        log.info(f"AUTO-REPLY thanks → {fan_id}: {reply}")
        update_fan_state(fan_id, name=fan_name, action_desc=f"Auto-reply thanks: {reply}")
        stats["auto_replies"] += 1
        return True
    
    # ===== ESCALATION LADDER (by message count) =====
    
    # MSG 1-2: Greet + hook
    if msg_count <= 2:
        if GREETING_PATTERNS.match(text) or EMOJI_ONLY.match(text):
            reply = random.choice(GREETING_REPLIES)
            if msg_count == 0:
                selfie_ids = random.sample(VAULT_MAP["gfe_selfie"], min(2, len(VAULT_MAP["gfe_selfie"])))
                send_of_message(fan_id, reply, media_ids=selfie_ids)
                log.info(f"SALES-ENGINE greet+selfie → {fan_id}: {reply}")
            else:
                send_of_message(fan_id, reply)
                log.info(f"SALES-ENGINE greet → {fan_id}: {reply}")
            update_fan_state(fan_id, name=fan_name, action_desc=f"Greet (msg {msg_count}): {reply}")
            stats["auto_replies"] += 1
            return True
        
        # Non-greeting first message → rapport
        if HOW_ARE_YOU.match(text) or FILLER.match(text):
            reply = random.choice(RAPPORT_REPLIES)
            if msg_count == 0:
                selfie_ids = random.sample(VAULT_MAP["gfe_selfie"], min(2, len(VAULT_MAP["gfe_selfie"])))
                send_of_message(fan_id, reply, media_ids=selfie_ids)
            else:
                send_of_message(fan_id, reply)
            log.info(f"SALES-ENGINE rapport → {fan_id}: {reply}")
            update_fan_state(fan_id, name=fan_name, action_desc=f"Rapport (msg {msg_count}): {reply}")
            stats["auto_replies"] += 1
            return True
    
    # MSG 3+: Route to Opus — rule engine only handles greetings/filler for msg 1-2
    # Opus handles: teasing, free hooks, PPV pitches, objections, negotiations, everything real
    if msg_count >= 3:
        log.info(f"OPUS-ROUTE: Fan {fan_id} msg_count={msg_count} — past greeting stage, routing to Opus")
        return False
    
    # Catch-all for unmatched patterns in msg 1-2
    if msg_count <= 2:
        reply = random.choice(RAPPORT_REPLIES)
        send_of_message(fan_id, reply)
        send_of_message(fan_id, reply)
    
    log.info(f"SALES-ENGINE catchall(msg {msg_count}) → {fan_id}: {reply}")
    update_fan_state(fan_id, name=fan_name, action_desc=f"Catchall (msg {msg_count}): {reply}")
    stats["auto_replies"] += 1
    return True


def fetch_fan_context(fan_id):
    """Get fan context from local storage. ZERO API calls.
    Everything is accumulated from webhooks as messages flow in."""
    return get_fan_context_compact(fan_id)


def call_opus(fan_id, context):
    """Call Opus via Anthropic API directly. Returns parsed JSON decision."""
    try:
        prompt_text = ""
        try:
            with open(PROMPT_FILE) as f:
                prompt_text = f.read()
        except:
            log.error("Could not read prompt file")
            return None
        
        now_est = time.strftime("%A %b %d, %Y %I:%M %p EST")
        sent_list = context.get("sent", [])
        
        user_msg = f"""You are Bianca Woods. Read the prompt below, then the fan context, then output ONE JSON decision. NOTHING ELSE.

[PROMPT]
{prompt_text}
[/PROMPT]

[CONTEXT]
{json.dumps(context, separators=(',',':'))}
[/CONTEXT]

Date: {now_est}
Already sent to this fan: {json.dumps(sent_list)}

Output ONE JSON line."""
        
        record_opus_call()
        stats["opus_calls"] += 1
        
        # Mark Opus cooldown — rule engine must not touch this fan while Opus is deciding
        mark_opus_acted(fan_id)
        
        hook_token = "05382603da53367102df5f03f48752ad2b33cbc9e2830db1"
        
        # Per-fan dedup: don't fire another Opus request if we just sent one within 90s
        dedup_key = f"opus_dedup_{fan_id}"
        last_opus = getattr(call_opus, '_dedup', {}).get(dedup_key, 0)
        if time.time() - last_opus < 90:
            log.info(f"DEDUP: Opus for {fan_id} fired <90s ago, skipping")
            return {"action": "async_spawned"}
        if not hasattr(call_opus, '_dedup'):
            call_opus._dedup = {}
        call_opus._dedup[dedup_key] = time.time()
        
        # Self-contained agent hook: Opus makes the decision AND executes it
        # No main session involvement — fully autonomous
        agent_message = f"""You are a sales decision engine for Bianca Woods (OnlyFans). 

TASK: Read the prompt, output ONE JSON decision, then execute it.

{user_msg}

AFTER you decide, run this command to execute your decision:
python3 {DIR}/bianca-execute-decision.py {fan_id} '<your_json_decision>'

Replace <your_json_decision> with your actual JSON output (single line, single-quoted).
If the JSON contains single quotes, escape them.

IMPORTANT: You MUST run the execute command. The decision is useless without execution.
Reply with just the fan_id and action taken."""

        payload = {
            "message": agent_message,
            "name": f"bianca-fan-{fan_id}",
            "sessionKey": f"hook:bianca:{fan_id}:{int(time.time())}",
            "wakeMode": "now",
            "deliver": False,
            "model": "anthropic/claude-opus-4-6",
            "thinking": "low",
            "timeoutSeconds": 60
        }
        
        result = subprocess.run(
            ["/usr/bin/curl", "-s", "-X", "POST",
             "http://127.0.0.1:18789/hooks/agent",
             "-H", f"Authorization: Bearer {hook_token}",
             "-H", "Content-Type: application/json",
             "-d", json.dumps(payload)],
            capture_output=True, text=True, timeout=10
        )
        
        resp_text = result.stdout
        gdrive_log({"event": "opus_decision", "fan_id": fan_id, "decision": {"action": "async_agent"}})
        log.info(f"Agent hook sent for fan {fan_id}: {resp_text[:100]}")
        
        # Agent session handles everything autonomously
        return {"action": "async_spawned", "fan_id": fan_id}
        
    except subprocess.TimeoutExpired:
        log.error(f"Opus call timed out for fan {fan_id}")
        return None
    except Exception as e:
        log.error(f"Opus call error for fan {fan_id}: {e}")
        return None


def execute_decision(fan_id, decision):
    """Execute an Opus decision — send via OF API, update state."""
    action = decision.get("action", "skip")
    content_key = decision.get("content_key", "")
    price = decision.get("price")
    message_text = decision.get("message_text", "")
    reason = decision.get("reason", "")
    
    log.info(f"EXECUTE {fan_id}: action={action} key={content_key} price={price} text={message_text[:60]}")
    
    if action == "skip":
        log.info(f"SKIP {fan_id}: {reason}")
        return
    
    if action == "text":
        resp = send_of_message(fan_id, message_text)
        update_fan_state(fan_id, action_desc=f"Sent text: {message_text[:50]}")
        return
    
    if action == "vip_pitch":
        # Opus pitched VIP — store pending so tip triggers delivery
        send_of_message(fan_id, message_text)
        all_state = load_json(FAN_STATE_FILE, {})
        fan_key = str(fan_id)
        if fan_key not in all_state:
            all_state[fan_key] = {"name": "", "totalSpent": 0, "messageCount": 0}
        all_state[fan_key]["pending_vip"] = {"pitched_at": now_ms()}
        save_json(FAN_STATE_FILE, all_state)
        log.info(f"VIP pitch sent to {fan_id}")
        update_fan_state(fan_id, action_desc="VIP pitch sent")
        return
    
    if action == "high_ticket":
        # High ticket = tip-based multi-message delivery
        # Opus sends the pitch text asking for a tip. Delivery happens when tip webhook fires.
        tier = decision.get("tier", "starter_pack")
        tip_ask = decision.get("tip_ask", 50)
        send_of_message(fan_id, message_text)
        
        # Store pending high-ticket deal so purchase handler knows to deliver
        all_state = load_json(FAN_STATE_FILE, {})
        fan_key = str(fan_id)
        if fan_key not in all_state:
            all_state[fan_key] = {"name": "", "totalSpent": 0, "messageCount": 0}
        all_state[fan_key]["pending_high_ticket"] = {
            "tier": tier,
            "tip_ask": tip_ask,
            "pitched_at": now_ms()
        }
        save_json(FAN_STATE_FILE, all_state)
        
        log.info(f"HIGH-TICKET pitch to {fan_id}: {tier} for ${tip_ask} tip")
        update_fan_state(fan_id, action_desc=f"High ticket pitch: {tier} ${tip_ask}")
        return
    
    if action in ("ppv", "free_media"):
        # Resolve content key (fuzzy match)
        resolved_key = content_key
        if resolved_key not in VAULT_MAP:
            for key in VAULT_MAP:
                if content_key.startswith(key) or key.startswith(content_key):
                    resolved_key = key
                    break
            else:
                log.error(f"Invalid content_key: {content_key}")
                # Fallback: send just the text
                if message_text:
                    send_of_message(fan_id, message_text)
                    update_fan_state(fan_id, action_desc=f"Sent text (bad key {content_key}): {message_text[:50]}")
                return
        
        vault_ids = VAULT_MAP[resolved_key]
        
        # For free media with many items, pick 1-2 random
        if action == "free_media" and len(vault_ids) > 3:
            vault_ids = random.sample(vault_ids, 2)
        
        send_price = price if action == "ppv" else None
        resp = send_of_message(fan_id, message_text, media_ids=vault_ids, price=send_price)
        
        # Log to Redis for dedup
        if action == "ppv":
            curl_json(
                f"{RAILWAY}/fans/{ACCOUNT_ID}/{fan_id}/sent",
                method="POST",
                body={"content_key": resolved_key, "price": price, "ts": now_ms()},
                headers={"Content-Type": "application/json"}
            )
        
        update_fan_state(fan_id, action_desc=f"Sent {action}: {resolved_key} ${price or 0} — {message_text[:50]}")
        
        # Update fan state price history
        if action == "ppv" and price:
            all_state = load_json(FAN_STATE_FILE, {})
            fan_key = str(fan_id)
            if fan_key in all_state:
                if "priceHistory" not in all_state[fan_key]:
                    all_state[fan_key]["priceHistory"] = []
                all_state[fan_key]["priceHistory"].append(price)
                save_json(FAN_STATE_FILE, all_state)
        return
    
    log.warning(f"Unknown action: {action}")


def process_webhook(payload):
    """Main webhook processing pipeline. Runs in a thread."""
    try:
        # Extract fan info from webhook payload
        # Adapt to actual webhook format from Railway
        fan_id = payload.get("fanId") or payload.get("fan_id") or payload.get("fromUser", {}).get("id")
        message_text = payload.get("text") or payload.get("message") or payload.get("body") or ""
        fan_name = payload.get("fanName") or payload.get("fan_name") or payload.get("fromUser", {}).get("name") or ""
        username = payload.get("username") or payload.get("fromUser", {}).get("username") or ""
        
        # Strip HTML
        message_text = re.sub(r"<[^>]+>", "", message_text).strip()
        
        if not fan_id:
            log.warning(f"Webhook missing fan_id: {json.dumps(payload)[:200]}")
            stats["errors"] += 1
            return
        
        fan_id = int(fan_id)
        log.info(f"WEBHOOK fan={fan_id} name={fan_name} msg={message_text[:80]}")
        
        # 1. Exclude list
        if fan_id in EXCLUDE_FAN_IDS:
            log.info(f"SKIP excluded fan {fan_id}")
            stats["skipped"] += 1
            return
        
        if username and username.lower() in EXCLUDE_USERNAMES:
            log.info(f"SKIP excluded username {username}")
            stats["skipped"] += 1
            return
        
        # 2. Promo check
        if is_promo(username, message_text):
            log.info(f"SKIP promo: {username} / {message_text[:60]}")
            stats["skipped"] += 1
            return
        
        # 3. System enabled?
        if not is_system_enabled():
            log.info(f"SKIP system disabled")
            stats["skipped"] += 1
            return
        
        # 4. Update fan state with incoming message
        update_fan_state(fan_id, name=fan_name, action_desc=None, message_count_inc=1)
        
        # 4b. Check if last outgoing was a bump — if so, fan needs a REAL response
        #     Don't let the sales engine think we already handled this fan
        bump_was_last = last_outgoing_was_bump(fan_id)
        if bump_was_last:
            log.info(f"BUMP-DETECT: Last msg to {fan_id} was a bump — treating as fresh conversation")
        
        # 5. Rule engine DISABLED — all messages go to Opus
        # Old rule engine was sending garbage responses (emoji to buying signals, 
        # ignoring sexual energy, generic teases to explicit requests)
        # if try_auto_reply(fan_id, message_text, fan_name, force_respond=bump_was_last):
        #     return
        
        # 6. Opus flow
        if not check_opus_rate_limit():
            log.info(f"RATE LIMITED fan {fan_id} — re-queuing in 10s")
            def requeue_after_delay(fid, pl, pri):
                time.sleep(10)
                enqueue_fan(pri, fid, pl)
                log.info(f"RE-QUEUED fan {fid} after rate limit delay")
            # Determine priority for re-queue (default ACTIVE_CHAT)
            _rq_priority = payload.get("_priority", 6) if isinstance(payload, dict) else 6
            threading.Thread(target=requeue_after_delay, args=(fan_id, payload, _rq_priority), daemon=True).start()
            return
        
        # Fetch context
        context = fetch_fan_context(fan_id)
        
        # Call Opus (async via main session spawn — 12K tokens, not 23K)
        decision = call_opus(fan_id, context)
        if not decision:
            log.error(f"No decision from Opus for fan {fan_id}")
            stats["errors"] += 1
            return
        
        if decision.get("action") == "async_spawned":
            log.info(f"ASYNC SPAWN sent for fan {fan_id} — main session will handle")
            stats["sends"] += 1  # Optimistic — main session will execute
            return
        
        log.info(f"OPUS DECISION for {fan_id}: {json.dumps(decision)}")
        
        # Execute (only for sync decisions like auto-reply)
        execute_decision(fan_id, decision)
        
        # Update fan memory
        memory = load_json(FAN_MEMORY_FILE, {"fans": {}})
        if "fans" not in memory:
            memory["fans"] = {}
        fan_key = str(fan_id)
        if fan_key not in memory["fans"]:
            memory["fans"][fan_key] = {}
        memory["fans"][fan_key]["last_processed_at"] = now_ms()
        memory["fans"][fan_key]["name"] = fan_name
        save_json(FAN_MEMORY_FILE, memory)
        
        # Clear from Railway pending
        curl_json(
            f"{RAILWAY}/webhooks/pending/{ACCOUNT_ID}/clear",
            method="POST",
            body={"fanIds": [fan_id]},
            headers={"Content-Type": "application/json"}
        )
        
    except Exception as e:
        log.error(f"process_webhook error: {e}", exc_info=True)
        stats["errors"] += 1
        stats["last_error"] = f"{datetime.now(timezone.utc).isoformat()} - {str(e)[:200]}"


# ==================== DASHBOARD HTML ====================
DASHBOARD_HTML = '''<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>Bianca Operator Dashboard</title>
    <style>
        * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
        }
        
        body {
            background: #0f0f13;
            color: #e0e0e0;
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
            line-height: 1.6;
        }
        
        .container {
            max-width: 1400px;
            margin: 0 auto;
            padding: 16px;
        }
        
        /* Header Bar */
        .header {
            display: flex;
            align-items: center;
            justify-content: space-between;
            background: #1a1a24;
            border-radius: 16px;
            padding: 20px 24px;
            margin-bottom: 24px;
            box-shadow: 0 4px 20px rgba(0,0,0,0.3);
        }
        
        .header-left {
            display: flex;
            align-items: center;
            gap: 20px;
        }
        
        .toggle-btn {
            background: #2a2a34;
            border: none;
            border-radius: 12px;
            padding: 12px 24px;
            font-size: 18px;
            font-weight: 700;
            cursor: pointer;
            transition: all 0.3s ease;
            color: #fff;
            min-width: 140px;
        }
        
        .toggle-btn.enabled {
            background: linear-gradient(135deg, #4ade80, #22c55e);
            box-shadow: 0 4px 15px rgba(74, 222, 128, 0.3);
        }
        
        .toggle-btn.disabled {
            background: linear-gradient(135deg, #f87171, #ef4444);
            box-shadow: 0 4px 15px rgba(248, 113, 113, 0.3);
        }
        
        .toggle-btn:hover {
            transform: translateY(-2px);
            box-shadow: 0 6px 25px rgba(0,0,0,0.4);
        }
        
        .header-status {
            display: flex;
            align-items: center;
            gap: 16px;
            font-size: 14px;
        }
        
        .status-dot {
            width: 12px;
            height: 12px;
            border-radius: 50%;
            background: #4ade80;
            animation: pulse 2s infinite;
        }
        
        .status-dot.error {
            background: #f87171;
        }
        
        @keyframes pulse {
            0%, 100% { opacity: 1; }
            50% { opacity: 0.5; }
        }
        
        .uptime {
            color: #aaa;
        }
        
        .last-webhook {
            color: #888;
            font-size: 12px;
        }
        
        /* Stats Cards */
        .stats-grid {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
            gap: 16px;
            margin-bottom: 24px;
        }
        
        .stat-card {
            background: #1a1a24;
            border-radius: 16px;
            padding: 20px;
            text-align: center;
            border: 1px solid #2a2a34;
            transition: all 0.3s ease;
        }
        
        .stat-card:hover {
            transform: translateY(-2px);
            box-shadow: 0 8px 25px rgba(0,0,0,0.2);
        }
        
        .stat-value {
            font-size: 2.2em;
            font-weight: 800;
            margin-bottom: 4px;
        }
        
        .stat-label {
            font-size: 0.85em;
            color: #888;
            font-weight: 500;
        }
        
        .stat-card.green .stat-value { color: #4ade80; }
        .stat-card.yellow .stat-value { color: #facc15; }
        .stat-card.blue .stat-value { color: #60a5fa; }
        .stat-card.purple .stat-value { color: #c084fc; }
        .stat-card.red .stat-value { color: #f87171; }
        .stat-card.orange .stat-value { color: #fb923c; }
        
        /* Main Content Layout */
        .content-grid {
            display: grid;
            grid-template-columns: 2fr 1fr;
            gap: 24px;
            margin-bottom: 24px;
        }
        
        /* Activity Feed */
        .activity-feed {
            background: #1a1a24;
            border-radius: 16px;
            padding: 20px;
            border: 1px solid #2a2a34;
        }
        
        .section-title {
            font-size: 1.1em;
            font-weight: 600;
            color: #fff;
            margin-bottom: 16px;
            display: flex;
            align-items: center;
            gap: 8px;
        }
        
        .activity-list {
            max-height: 500px;
            overflow-y: auto;
        }
        
        .activity-item {
            display: flex;
            align-items: center;
            justify-content: space-between;
            padding: 12px 16px;
            margin-bottom: 8px;
            border-radius: 12px;
            border-left: 4px solid #666;
            transition: all 0.2s ease;
        }
        
        .activity-item:hover {
            background: #22222e;
            transform: translateX(4px);
        }
        
        .activity-item.ppv { border-left-color: #4ade80; background: rgba(74, 222, 128, 0.05); }
        .activity-item.free { border-left-color: #60a5fa; background: rgba(96, 165, 250, 0.05); }
        .activity-item.text { border-left-color: #888; background: rgba(136, 136, 136, 0.05); }
        .activity-item.purchase { border-left-color: #facc15; background: rgba(250, 204, 21, 0.05); }
        
        .activity-content {
            display: flex;
            flex-direction: column;
            flex: 1;
        }
        
        .activity-main {
            display: flex;
            align-items: center;
            gap: 12px;
            margin-bottom: 4px;
        }
        
        .fan-name {
            font-weight: 600;
            color: #fff;
        }
        
        .activity-action {
            color: #aaa;
            font-size: 0.9em;
        }
        
        .activity-meta {
            display: flex;
            align-items: center;
            gap: 8px;
        }
        
        .tier-badge {
            background: #3b2a1a;
            color: #f59e0b;
            font-size: 0.7em;
            padding: 2px 6px;
            border-radius: 4px;
            font-weight: 600;
        }
        
        .activity-time {
            color: #666;
            font-size: 0.8em;
        }
        
        /* Queue Panel */
        .queue-panel {
            background: #1a1a24;
            border-radius: 16px;
            padding: 20px;
            border: 1px solid #2a2a34;
        }
        
        .queue-item {
            display: flex;
            align-items: center;
            justify-content: space-between;
            padding: 12px 0;
            border-bottom: 1px solid #2a2a34;
        }
        
        .queue-item:last-child {
            border-bottom: none;
        }
        
        .queue-fan {
            font-weight: 600;
            color: #fff;
        }
        
        .queue-meta {
            display: flex;
            align-items: center;
            gap: 8px;
        }
        
        .priority-badge {
            font-size: 0.7em;
            padding: 4px 8px;
            border-radius: 6px;
            font-weight: 600;
        }
        
        .priority-badge.whale { background: #fbbf24; color: #451a03; }
        .priority-badge.buyer { background: #8b5cf6; color: #1e1b4b; }
        .priority-badge.new { background: #10b981; color: #064e3b; }
        .priority-badge.active { background: #f472b6; color: #831843; }
        
        .queue-time {
            color: #888;
            font-size: 0.85em;
        }
        
        .empty-state {
            text-align: center;
            color: #666;
            padding: 40px;
            font-style: italic;
        }
        
        /* Fan Table */
        .fan-table-section {
            background: #1a1a24;
            border-radius: 16px;
            padding: 20px;
            border: 1px solid #2a2a34;
            margin-bottom: 24px;
        }
        
        .fan-table {
            width: 100%;
            border-collapse: collapse;
            margin-top: 16px;
        }
        
        .fan-table th {
            text-align: left;
            color: #888;
            font-weight: 600;
            padding: 12px 16px;
            border-bottom: 2px solid #2a2a34;
            cursor: pointer;
            transition: color 0.2s ease;
        }
        
        .fan-table th:hover {
            color: #fff;
        }
        
        .fan-table td {
            padding: 12px 16px;
            border-bottom: 1px solid #1f1f2a;
        }
        
        .fan-table tr:hover {
            background: #22222e;
            cursor: pointer;
        }
        
        .buyer-badge {
            font-size: 0.75em;
            padding: 2px 8px;
            border-radius: 12px;
            font-weight: 600;
        }
        
        .buyer-badge.whale { background: #fbbf24; color: #451a03; }
        .buyer-badge.buyer { background: #8b5cf6; color: #1e1b4b; }
        .buyer-badge.new { background: #10b981; color: #064e3b; }
        
        /* Modal */
        .modal {
            position: fixed;
            top: 0;
            left: 0;
            right: 0;
            bottom: 0;
            background: rgba(0,0,0,0.9);
            z-index: 100;
            overflow-y: auto;
            padding: 20px;
            backdrop-filter: blur(10px);
        }
        
        .modal-content {
            max-width: 800px;
            margin: 0 auto;
            background: #1a1a24;
            border-radius: 20px;
            border: 1px solid #2a2a34;
            overflow: hidden;
        }
        
        .modal-header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            padding: 24px;
            border-bottom: 1px solid #2a2a34;
        }
        
        .modal-title {
            font-size: 1.4em;
            font-weight: 700;
            color: #fff;
        }
        
        .close-btn {
            background: none;
            border: none;
            color: #888;
            font-size: 1.5em;
            cursor: pointer;
            padding: 8px;
            border-radius: 8px;
            transition: all 0.2s ease;
        }
        
        .close-btn:hover {
            background: #2a2a34;
            color: #fff;
        }
        
        .modal-body {
            padding: 24px;
        }
        
        .conversation {
            max-height: 500px;
            overflow-y: auto;
            background: #0f0f13;
            border-radius: 12px;
            padding: 16px;
        }
        
        .message {
            margin-bottom: 12px;
            padding: 12px 16px;
            border-radius: 12px;
            max-width: 85%;
        }
        
        .message.bianca {
            background: #1e3a8a;
            color: #dbeafe;
            margin-left: auto;
            border-bottom-right-radius: 4px;
        }
        
        .message.fan {
            background: #374151;
            color: #d1d5db;
            border-bottom-left-radius: 4px;
        }
        
        .message-header {
            display: flex;
            align-items: center;
            gap: 8px;
            margin-bottom: 8px;
            font-size: 0.8em;
            opacity: 0.8;
        }
        
        .message-badges {
            display: flex;
            gap: 4px;
        }
        
        .message-badge {
            font-size: 0.7em;
            padding: 2px 6px;
            border-radius: 4px;
            font-weight: 600;
        }
        
        .badge-signal { background: #7c3aed; color: #c4b5fd; }
        .badge-price { background: #d97706; color: #fed7aa; }
        .badge-key { background: #065f46; color: #a7f3d0; }
        .badge-action { background: #dc2626; color: #fecaca; }
        
        /* Mobile Responsive */
        @media (max-width: 768px) {
            .content-grid {
                grid-template-columns: 1fr;
            }
            
            .stats-grid {
                grid-template-columns: repeat(2, 1fr);
            }
            
            .header {
                flex-direction: column;
                gap: 16px;
            }
            
            .header-left {
                flex-direction: column;
                width: 100%;
            }
            
            .fan-table {
                font-size: 0.8em;
            }
        }
        
        /* Loading States */
        .loading {
            animation: shimmer 1.5s infinite;
        }
        
        @keyframes shimmer {
            0% { opacity: 1; }
            50% { opacity: 0.5; }
            100% { opacity: 1; }
        }
    </style>
</head>
<body>
    <div class="container">
        <!-- Header Bar -->
        <div class="header">
            <div class="header-left">
                <button id="toggleBtn" class="toggle-btn disabled" onclick="toggleSystem()">
                    DISABLED
                </button>
                <div class="header-status">
                    <div id="healthDot" class="status-dot"></div>
                    <div class="uptime">Uptime: <span id="uptime">--</span></div>
                </div>
            </div>
            <div class="last-webhook">
                Last webhook: <span id="lastWebhook">--</span>
            </div>
        </div>

        <!-- Stats Cards -->
        <div class="stats-grid" id="statsCards">
            <div class="stat-card green loading">
                <div class="stat-value">--</div>
                <div class="stat-label">Revenue Today</div>
            </div>
            <div class="stat-card yellow loading">
                <div class="stat-value">--</div>
                <div class="stat-label">Pending Revenue</div>
            </div>
            <div class="stat-card blue loading">
                <div class="stat-value">-- / --</div>
                <div class="stat-label">PPVs Sent / Opened</div>
            </div>
            <div class="stat-card purple loading">
                <div class="stat-value">--</div>
                <div class="stat-label">Opus Calls</div>
            </div>
            <div class="stat-card red loading">
                <div class="stat-value">--</div>
                <div class="stat-label">Errors</div>
            </div>
            <div class="stat-card orange loading">
                <div class="stat-value">--</div>
                <div class="stat-label">Queue Depth</div>
            </div>
        </div>

        <!-- Main Content Grid -->
        <div class="content-grid">
            <!-- Live Activity Feed -->
            <div class="activity-feed">
                <div class="section-title">
                    ⚡ Live Activity Feed
                    <div style="margin-left: auto; font-size: 0.8em; color: #666;">
                        Updates every 10s
                    </div>
                </div>
                <div id="activityList" class="activity-list">
                    <div class="empty-state loading">Loading activity...</div>
                </div>
            </div>

            <!-- Queue Panel -->
            <div class="queue-panel">
                <div class="section-title">📬 Queue</div>
                <div id="queueList">
                    <div class="empty-state loading">Loading queue...</div>
                </div>
            </div>
        </div>

        <!-- Fan Table -->
        <div class="fan-table-section">
            <div class="section-title">👥 Fan Management</div>
            <table class="fan-table">
                <thead>
                    <tr>
                        <th onclick="sortTable(0)">Fan</th>
                        <th onclick="sortTable(1)">Total Spent</th>
                        <th onclick="sortTable(2)">PPVs Sent</th>
                        <th onclick="sortTable(3)">PPVs Opened</th>
                        <th onclick="sortTable(4)">Conversion %</th>
                        <th onclick="sortTable(5)">Last Action</th>
                    </tr>
                </thead>
                <tbody id="fanTableBody">
                    <tr>
                        <td colspan="6" class="empty-state loading">Loading fans...</td>
                    </tr>
                </tbody>
            </table>
        </div>
    </div>

    <script>
        let dashboardData = null;
        let activityRefreshInterval = null;
        let statsRefreshInterval = null;
        let healthCheckInterval = null;

        // Initialize dashboard
        async function init() {
            await loadDashboardData();
            startAutoRefresh();
            startHealthCheck();
        }

        // Load main dashboard data
        async function loadDashboardData() {
            try {
                const response = await fetch('/dashboard-data');
                dashboardData = await response.json();
                updateDashboard();
            } catch (error) {
                console.error('Error loading dashboard data:', error);
                showError('Failed to load dashboard data');
            }
        }

        // Update all dashboard components
        function updateDashboard() {
            if (!dashboardData) return;
            
            updateHeader();
            updateStatsCards();
            updateQueue();
            updateFanTable();
        }

        // Update header with system status
        function updateHeader() {
            const daemon = dashboardData.daemon_status || {};
            const toggleBtn = document.getElementById('toggleBtn');
            const uptime = document.getElementById('uptime');
            const lastWebhook = document.getElementById('lastWebhook');
            
            // Update toggle button
            toggleBtn.className = `toggle-btn ${daemon.enabled ? 'enabled' : 'disabled'}`;
            toggleBtn.textContent = daemon.enabled ? 'ENABLED' : 'DISABLED';
            
            // Update uptime
            uptime.textContent = daemon.uptime || '--';
            
            // Update last webhook
            const lastWebhookTime = dashboardData.today_stats?.last_webhook;
            if (lastWebhookTime) {
                const date = new Date(lastWebhookTime);
                lastWebhook.textContent = date.toLocaleString();
            } else {
                lastWebhook.textContent = 'Never';
            }
        }

        // Update stats cards
        function updateStatsCards() {
            const today = dashboardData.today_stats || {};
            const lifetime = dashboardData.lifetime_stats || {};
            
            // Calculate values
            const revenueToday = today.revenue || 0;
            const ppvsSent = today.ppvs_sent || 0;
            const ppvsOpened = today.ppvs_unlocked || 0;
            const conversionRate = ppvsSent > 0 ? ((ppvsOpened / ppvsSent) * 100).toFixed(1) : 0;
            const pendingRevenue = Math.max(0, (ppvsSent - ppvsOpened) * (revenueToday / Math.max(ppvsOpened, 1)));
            const opusCalls = today.opus_calls || 0;
            const errors = today.errors || 0;
            const queueDepth = dashboardData.queue?.length || 0;

            // Update cards
            const cards = document.querySelectorAll('.stat-card');
            
            cards[0].querySelector('.stat-value').textContent = `$${revenueToday.toFixed(0)}`;
            cards[0].classList.remove('loading');
            
            cards[1].querySelector('.stat-value').textContent = `$${pendingRevenue.toFixed(0)}`;
            cards[1].classList.remove('loading');
            
            cards[2].querySelector('.stat-value').textContent = `${ppvsSent} / ${ppvsOpened}`;
            cards[2].querySelector('.stat-label').innerHTML = `PPVs Sent / Opened<br><small>${conversionRate}% conversion</small>`;
            cards[2].classList.remove('loading');
            
            cards[3].querySelector('.stat-value').textContent = opusCalls;
            cards[3].classList.remove('loading');
            
            cards[4].querySelector('.stat-value').textContent = errors;
            cards[4].className = `stat-card ${errors > 0 ? 'red' : 'gray'} ${errors > 0 ? '' : 'loading'}`;
            cards[4].classList.remove('loading');
            
            cards[5].querySelector('.stat-value').textContent = queueDepth;
            cards[5].classList.remove('loading');
        }

        // Update activity feed
        async function updateActivityFeed() {
            try {
                const response = await fetch('/dashboard-data');
                const data = await response.json();
                const activities = data.recent_activity || [];
                
                const activityList = document.getElementById('activityList');
                
                if (activities.length === 0) {
                    activityList.innerHTML = '<div class="empty-state">No recent activity</div>';
                    return;
                }
                
                activityList.innerHTML = activities.slice(0, 50).map(activity => {
                    const actionType = getActionType(activity.action);
                    const timeAgo = getTimeAgo(activity.ts);
                    const tierBadge = getTierBadge(activity.content_key);
                    
                    return `
                        <div class="activity-item ${actionType}">
                            <div class="activity-content">
                                <div class="activity-main">
                                    <span class="fan-name">${activity.name || activity.fan_id}</span>
                                    <span class="activity-action">${activity.action}</span>
                                </div>
                                <div class="activity-meta">
                                    ${tierBadge}
                                    <span class="activity-time">${timeAgo}</span>
                                </div>
                            </div>
                        </div>
                    `;
                }).join('');
                
                // Auto-scroll to newest
                activityList.scrollTop = 0;
                
            } catch (error) {
                console.error('Error updating activity feed:', error);
            }
        }

        // Update queue
        function updateQueue() {
            const queue = dashboardData.queue || [];
            const queueList = document.getElementById('queueList');
            
            if (queue.length === 0) {
                queueList.innerHTML = '<div class="empty-state">No fans waiting ✓</div>';
                return;
            }
            
            queueList.innerHTML = queue.map(item => {
                const waitTime = formatWaitTime(item.age_s);
                const priorityClass = getPriorityClass(item.priority);
                
                return `
                    <div class="queue-item">
                        <div class="queue-fan">${item.name || item.fan_id}</div>
                        <div class="queue-meta">
                            <span class="priority-badge ${priorityClass}">${item.priority}</span>
                            <span class="queue-time">${waitTime}</span>
                        </div>
                    </div>
                `;
            }).join('');
        }

        // Update fan table
        function updateFanTable() {
            const fans = dashboardData.fans || [];
            const tableBody = document.getElementById('fanTableBody');
            
            if (fans.length === 0) {
                tableBody.innerHTML = '<tr><td colspan="6" class="empty-state">No fan data available</td></tr>';
                return;
            }
            
            tableBody.innerHTML = fans.map(fan => `
                <tr onclick="showFanModal('${fan.fan_id}')">
                    <td>
                        <div style="display: flex; align-items: center; gap: 8px;">
                            <strong>${fan.name || fan.fan_id}</strong>
                            <span class="buyer-badge ${getBuyerClass(fan.buyer_type)}">${fan.buyer_type || 'NEW'}</span>
                        </div>
                    </td>
                    <td>$${(fan.spent || 0).toFixed(2)}</td>
                    <td>${fan.ppvs_sent || 0}</td>
                    <td>${fan.ppvs_unlocked || 0}</td>
                    <td>${fan.conv || 0}%</td>
                    <td>${fan.last_action || '--'}</td>
                </tr>
            `).join('');
        }

        // Show fan modal
        async function showFanModal(fanId) {
            try {
                const response = await fetch(`/dashboard/fan/${fanId}`);
                const fan = await response.json();
                
                const modal = document.createElement('div');
                modal.className = 'modal';
                modal.onclick = (e) => { if (e.target === modal) modal.remove(); };
                
                modal.innerHTML = `
                    <div class="modal-content">
                        <div class="modal-header">
                            <div class="modal-title">${fan.name || fan.fan_id}</div>
                            <button class="close-btn" onclick="this.closest('.modal').remove()">✕</button>
                        </div>
                        <div class="modal-body">
                            <div class="stats-grid" style="margin-bottom: 20px;">
                                <div class="stat-card blue">
                                    <div class="stat-value">$${(fan.total_spent || 0).toFixed(2)}</div>
                                    <div class="stat-label">Total Spent</div>
                                </div>
                                <div class="stat-card purple">
                                    <div class="stat-value">${fan.message_count || 0}</div>
                                    <div class="stat-label">Messages</div>
                                </div>
                                <div class="stat-card orange">
                                    <div class="stat-value">${fan.buyer_type || 'NEW'}</div>
                                    <div class="stat-label">Buyer Type</div>
                                </div>
                            </div>
                            
                            ${fan.notes ? `
                                <div style="background: #22222e; padding: 12px; border-radius: 8px; margin-bottom: 16px;">
                                    <strong>Notes:</strong> ${fan.notes}
                                </div>
                            ` : ''}
                            
                            <div class="section-title">💬 Conversation History</div>
                            <div class="conversation" id="conversation-${fanId}">
                                ${renderConversation(fan.recent_msgs || [])}
                            </div>
                        </div>
                    </div>
                `;
                
                document.body.appendChild(modal);
                
            } catch (error) {
                console.error('Error loading fan details:', error);
                alert('Failed to load fan details');
            }
        }

        // Render conversation messages
        function renderConversation(messages) {
            if (!messages.length) {
                return '<div class="empty-state">No conversation history</div>';
            }
            
            return messages.map(msg => {
                const isBianca = msg.from === 'b';
                const timestamp = msg.ts ? new Date(msg.ts * 1000).toLocaleTimeString() : '';
                
                let badges = '';
                if (msg.signals) badges += `<span class="message-badge badge-signal">${msg.signals}</span>`;
                if (msg.price) badges += `<span class="message-badge badge-price">$${msg.price}</span>`;
                if (msg.key) badges += `<span class="message-badge badge-key">${msg.key}</span>`;
                if (msg.action) badges += `<span class="message-badge badge-action">${msg.action}</span>`;
                
                return `
                    <div class="message ${isBianca ? 'bianca' : 'fan'}">
                        <div class="message-header">
                            <span>${isBianca ? '🤖 Bianca' : '👤 Fan'}</span>
                            <span>${timestamp}</span>
                            <div class="message-badges">${badges}</div>
                        </div>
                        <div>${msg.text || '(media)'}</div>
                    </div>
                `;
            }).join('');
        }

        // Toggle system on/off
        async function toggleSystem() {
            try {
                const response = await fetch('/toggle', { method: 'POST' });
                const result = await response.json();
                
                const toggleBtn = document.getElementById('toggleBtn');
                const isEnabled = result.status === 'enabled';
                
                toggleBtn.className = `toggle-btn ${isEnabled ? 'enabled' : 'disabled'}`;
                toggleBtn.textContent = isEnabled ? 'ENABLED' : 'DISABLED';
                
                // Refresh dashboard data
                await loadDashboardData();
                
            } catch (error) {
                console.error('Error toggling system:', error);
                showError('Failed to toggle system status');
            }
        }

        // Health check
        async function checkHealth() {
            try {
                const response = await fetch('/health');
                const health = await response.json();
                
                const healthDot = document.getElementById('healthDot');
                healthDot.className = `status-dot ${health.status === 'ok' ? '' : 'error'}`;
                
            } catch (error) {
                const healthDot = document.getElementById('healthDot');
                healthDot.className = 'status-dot error';
            }
        }

        // Start auto-refresh intervals
        function startAutoRefresh() {
            // Refresh activity feed every 10 seconds
            activityRefreshInterval = setInterval(updateActivityFeed, 10000);
            
            // Refresh full dashboard every 30 seconds
            statsRefreshInterval = setInterval(loadDashboardData, 30000);
        }

        // Start health check
        function startHealthCheck() {
            healthCheckInterval = setInterval(checkHealth, 5000);
        }

        // Utility functions
        function getActionType(action) {
            if (!action) return 'text';
            const lower = action.toLowerCase();
            if (lower.includes('ppv') || lower.includes('unlock')) return 'ppv';
            if (lower.includes('tip') || lower.includes('purchase') || lower.includes('buy')) return 'purchase';
            if (lower.includes('free') || lower.includes('hook')) return 'free';
            return 'text';
        }

        function getTierBadge(contentKey) {
            if (!contentKey) return '';
            const tier = contentKey.match(/L(\d+)/);
            if (tier) {
                return `<span class="tier-badge">L${tier[1]}</span>`;
            }
            return '';
        }

        function getTimeAgo(timestamp) {
            if (!timestamp) return '';
            const now = Date.now() / 1000;
            const diff = now - new Date(timestamp).getTime() / 1000;
            
            if (diff < 60) return `${Math.floor(diff)}s ago`;
            if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
            if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
            return `${Math.floor(diff / 86400)}d ago`;
        }

        function formatWaitTime(seconds) {
            if (seconds < 60) return `${seconds}s`;
            if (seconds < 3600) return `${Math.floor(seconds / 60)}m`;
            return `${Math.floor(seconds / 3600)}h`;
        }

        function getPriorityClass(priority) {
            const lower = priority?.toLowerCase() || '';
            if (lower.includes('whale')) return 'whale';
            if (lower.includes('buyer')) return 'buyer';
            if (lower.includes('new')) return 'new';
            if (lower.includes('active')) return 'active';
            return 'new';
        }

        function getBuyerClass(buyerType) {
            const lower = buyerType?.toLowerCase() || '';
            if (lower.includes('whale')) return 'whale';
            if (lower.includes('buyer')) return 'buyer';
            return 'new';
        }

        function sortTable(columnIndex) {
            // Basic table sorting implementation
            const table = document.querySelector('.fan-table');
            const tbody = table.querySelector('tbody');
            const rows = Array.from(tbody.querySelectorAll('tr'));
            
            rows.sort((a, b) => {
                const aText = a.cells[columnIndex]?.textContent.trim() || '';
                const bText = b.cells[columnIndex]?.textContent.trim() || '';
                
                // Try to parse as numbers first
                const aNum = parseFloat(aText.replace(/[$,]/g, ''));
                const bNum = parseFloat(bText.replace(/[$,]/g, ''));
                
                if (!isNaN(aNum) && !isNaN(bNum)) {
                    return bNum - aNum; // Descending for numbers
                }
                
                return aText.localeCompare(bText);
            });
            
            rows.forEach(row => tbody.appendChild(row));
        }

        function showError(message) {
            // Simple error display
            const errorDiv = document.createElement('div');
            errorDiv.style.cssText = `
                position: fixed;
                top: 20px;
                right: 20px;
                background: #f87171;
                color: #fff;
                padding: 12px 20px;
                border-radius: 8px;
                z-index: 1000;
                animation: slideIn 0.3s ease;
            `;
            errorDiv.textContent = message;
            
            document.body.appendChild(errorDiv);
            
            setTimeout(() => {
                errorDiv.remove();
            }, 5000);
        }

        // Initialize dashboard when page loads
        document.addEventListener('DOMContentLoaded', init);
    </script>
</body>
</html>'''

# ==================== HTTP SERVER ====================

class BiancaHandler(BaseHTTPRequestHandler):
    def log_message(self, format, *args):
        # Suppress default access logs, we use our own
        pass
    
    def send_json(self, code, data):
        body = json.dumps(data, indent=2).encode()
        self.send_response(code)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", len(body))
        self.end_headers()
        self.wfile.write(body)
    
    def do_GET(self):
        path = urlparse(self.path).path
        
        if path == "/health":
            self.send_json(200, {
                "status": "ok",
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
                    "order": "oldest-first" if p >= PRIORITY_ACTIVE_CHAT else "newest-first",
                } for p, sk, fid, _ in sorted(_priority_queue)]
            self.send_json(200, {"depth": len(queue_items), "items": queue_items})
        
        elif path == "/performance":
            perf = load_perf()
            today = datetime.now(timezone.utc).strftime("%Y-%m-%d")
            td = perf.get("today", {}).get(today, {})
            lt = perf.get("lifetime", {})
            
            # Conversion rates
            ppvs_sent_today = td.get("ppvs_sent", 0)
            ppvs_unlocked_today = td.get("ppvs_unlocked", 0)
            conv_today = (ppvs_unlocked_today / ppvs_sent_today * 100) if ppvs_sent_today > 0 else 0
            
            ppvs_sent_lt = lt.get("ppvs_sent", 0)
            ppvs_unlocked_lt = lt.get("ppvs_unlocked", 0)
            conv_lt = (ppvs_unlocked_lt / ppvs_sent_lt * 100) if ppvs_sent_lt > 0 else 0
            
            # Top fans by spend
            fans = perf.get("fans", {})
            top_fans = sorted(fans.items(), key=lambda x: x[1].get("spent", 0), reverse=True)[:10]
            
            # Avg revenue per fan
            total_fans = len([f for f in fans.values() if f.get("spent", 0) > 0])
            avg_ltv = lt.get("revenue", 0) / total_fans if total_fans > 0 else 0
            
            self.send_json(200, {
                "today": {
                    "replies": td.get("replies", 0),
                    "ppvs_sent": ppvs_sent_today,
                    "ppvs_unlocked": ppvs_unlocked_today,
                    "conversion_rate": f"{conv_today:.1f}%",
                    "revenue": f"${td.get('revenue', 0):.2f}",
                    "tips": f"${td.get('tips', 0):.2f}",
                    "new_subs": td.get("new_subs", 0),
                    "opus_calls": td.get("opus_calls", 0),
                },
                "lifetime": {
                    "replies": lt.get("replies", 0),
                    "ppvs_sent": ppvs_sent_lt,
                    "ppvs_unlocked": ppvs_unlocked_lt,
                    "conversion_rate": f"{conv_lt:.1f}%",
                    "revenue": f"${lt.get('revenue', 0):.2f}",
                    "tips": f"${lt.get('tips', 0):.2f}",
                    "new_subs_welcomed": lt.get("new_subs_welcomed", 0),
                    "opus_calls": lt.get("opus_calls", 0),
                    "unique_buyers": total_fans,
                    "avg_ltv": f"${avg_ltv:.2f}",
                },
                "top_fans": [{
                    "fan_id": fid,
                    "spent": f"${fd.get('spent', 0):.2f}",
                    "ppvs_sent": fd.get("ppvs_sent", 0),
                    "ppvs_unlocked": fd.get("ppvs_unlocked", 0),
                    "conversion": f"{(fd.get('ppvs_unlocked',0)/fd.get('ppvs_sent',1)*100):.0f}%" if fd.get("ppvs_sent", 0) > 0 else "n/a",
                } for fid, fd in top_fans],
                "hourly": perf.get("hourly", {}),
            })
        
        elif path == "/training":
            # Training data summary — what's working, what's not
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
            
            purchases = [o for o in outcomes if o.get("event") == "purchase"]
            total_rev = sum(o.get("amount", 0) for o in purchases)
            avg_msgs = sum(o.get("msgs_to_buy", 0) for o in purchases) / len(purchases) if purchases else 0
            avg_time = sum(o.get("secs_to_buy", 0) for o in purchases) / len(purchases) if purchases else 0
            
            # What signals preceded purchases?
            signal_counts = {}
            for o in purchases:
                for s in o.get("signals", []):
                    signal_counts[s] = signal_counts.get(s, 0) + 1
            
            # What stage were buyers in?
            stage_counts = {}
            for o in purchases:
                st = o.get("stage", "unknown")
                stage_counts[st] = stage_counts.get(st, 0) + 1
            
            self.send_json(200, {
                "conversation_log_lines": convos,
                "conversation_log_file": CONVERSATION_LOG_FILE,
                "outcome_log_entries": len(outcomes),
                "purchases": len(purchases),
                "total_revenue": f"${total_rev:.2f}",
                "avg_messages_to_purchase": round(avg_msgs, 1),
                "avg_seconds_to_purchase": round(avg_time),
                "signals_before_purchase": signal_counts,
                "stage_at_purchase": stage_counts,
            })
        
        elif path == "/dashboard-data":
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
            
            # Per-fan breakdown
            fans = perf.get("fans", {})
            fan_rows = []
            all_state = load_json(FAN_STATE_FILE, {})
            for fid, fd in sorted(fans.items(), key=lambda x: x[1].get("spent", 0), reverse=True)[:50]:
                fs = all_state.get(fid, {})
                fan_rows.append({
                    "fan_id": fid,
                    "name": fs.get("name", ""),
                    "spent": round(fd.get("spent", 0), 2),
                    "ppvs_sent": fd.get("ppvs_sent", 0),
                    "ppvs_unlocked": fd.get("ppvs_unlocked", 0),
                    "conv": round(fd.get("ppvs_unlocked", 0) / fd.get("ppvs_sent", 1) * 100) if fd.get("ppvs_sent", 0) > 0 else 0,
                })
            
            # Uptime
            try:
                started = datetime.fromisoformat(stats["started_at"])
                uptime_secs = (datetime.now(timezone.utc) - started).total_seconds()
                hours = int(uptime_secs // 3600)
                mins = int((uptime_secs % 3600) // 60)
                uptime_str = f"{hours}h {mins}m"
            except:
                uptime_str = "unknown"
            
            # Queue snapshot
            with _queue_lock:
                queue_depth = len(_priority_queue)
                queue_items = []
                for pri, sort_key, fid, payload in sorted(_priority_queue)[:20]:
                    age_s = int(time.time() - abs(sort_key))
                    pname = PRIORITY_NAMES.get(pri, str(pri))
                    fname = payload.get("fan_name", "") if isinstance(payload, dict) else ""
                    queue_items.append({"fan_id": fid, "name": fname, "priority": pname, "age_s": age_s})
            
            # Recent activity from fan state
            all_state_act = load_json(FAN_STATE_FILE, {})
            recent = []
            for fid, fs in all_state_act.items():
                if fs.get("lastProcessedAt"):
                    recent.append({"fan_id": fid, "name": fs.get("name",""), "action": fs.get("lastAction",""), "ts": fs.get("lastProcessedAt","")})
            recent.sort(key=lambda x: x.get("ts",""), reverse=True)
            recent = recent[:20]
            
            # Pending opus files
            import glob
            pending_opus = []
            for f in glob.glob(os.path.join(os.path.dirname(__file__), "bianca-pending-opus-*.json")):
                fid = os.path.basename(f).replace("bianca-pending-opus-","").replace(".json","")
                pending_opus.append(fid)
            
            self.send_json(200, {
                "today": {
                    "ppvs_sent": ppvs_sent_today,
                    "ppvs_unlocked": ppvs_unlocked_today,
                    "conversion": round(conv_today, 1),
                    "revenue": round(td.get("revenue", 0), 2),
                    "tips": round(td.get("tips", 0), 2),
                    "replies": td.get("replies", 0),
                    "new_subs": td.get("new_subs", 0),
                    "opus_calls": td.get("opus_calls", 0),
                },
                "lifetime": {
                    "ppvs_sent": ppvs_sent_lt,
                    "ppvs_unlocked": ppvs_unlocked_lt,
                    "conversion": round(conv_lt, 1),
                    "revenue": round(lt.get("revenue", 0), 2),
                    "tips": round(lt.get("tips", 0), 2),
                    "replies": lt.get("replies", 0),
                    "unique_buyers": len([f for f in fans.values() if f.get("spent", 0) > 0]),
                },
                "fans": fan_rows,
                "daemon": {
                    "uptime": uptime_str,
                    "enabled": is_system_enabled(),
                    "queue_depth": queue_depth,
                    "webhooks_received": stats["webhooks_received"],
                    "errors": stats["errors"],
                    "last_webhook": stats["last_webhook"],
                },
                "queue": queue_items,
                "pending_opus": pending_opus,
                "recent_activity": recent,
                "ts": datetime.now(timezone.utc).isoformat(),
            })
        
        elif path.startswith("/dashboard/fan/"):
            fan_id = path.split("/")[-1]
            contexts = load_fan_contexts()
            fan_ctx = contexts.get(fan_id, {})
            all_state = load_json(FAN_STATE_FILE, {})
            fan_st = all_state.get(fan_id, {})
            
            # Get conversation log entries for this fan
            conv_log = []
            try:
                with open(CONVERSATION_LOG_FILE) as f:
                    for line in f:
                        try:
                            e = json.loads(line.strip())
                            if str(e.get("fan_id")) == fan_id:
                                conv_log.append(e)
                        except: pass
            except: pass
            
            # Build response
            msgs = fan_ctx.get("msgs", [])
            self.send_json(200, {
                "fan_id": fan_id,
                "name": fan_st.get("name", fan_ctx.get("name", "")),
                "buyer_type": fan_st.get("buyerType", "unknown"),
                "total_spent": fan_st.get("totalSpent", 0),
                "notes": fan_st.get("notes", ""),
                "message_count": fan_st.get("messageCount", len(msgs)),
                "last_action": fan_st.get("lastAction", ""),
                "price_history": fan_st.get("priceHistory", []),
                "recent_msgs": [{"from": m.get("from", "f" if not m.get("from_bianca") else "b"),
                                 "text": m.get("text", ""), "ts": m.get("ts", 0),
                                 "action": m.get("action", ""), "signals": m.get("signals", ""),
                                 "price": m.get("price", 0), "key": m.get("key", m.get("content_key", ""))}
                                for m in msgs],
                "full_log": conv_log[-50:],  # last 50 logged entries
            })
        
        elif path == "/dashboard":
            html = DASHBOARD_HTML
            body = html.encode()
            self.send_response(200)
            self.send_header("Content-Type", "text/html; charset=utf-8")
            self.send_header("Content-Length", len(body))
            self.end_headers()
            self.wfile.write(body)
        
        else:
            self.send_json(404, {"error": "not found"})
    
    def do_POST(self):
        path = urlparse(self.path).path
        
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
            
            # Respond immediately, process async
            self.send_json(200, {"status": "accepted"})
            
            # Process in background thread
            t = threading.Thread(target=process_webhook, args=(payload,), daemon=True)
            t.start()
        
        elif path == "/webhook/of-event":
            # Unified webhook from OF API — handles all event types
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
            t = threading.Thread(target=handle_of_event, args=(payload,), daemon=True)
            t.start()
        
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
                t = threading.Thread(target=handle_new_subscriber, args=(int(fan_id), fan_name), daemon=True)
                t.start()
        
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
                t = threading.Thread(target=handle_purchase, args=(int(fan_id), fan_name, float(amount), content_key), daemon=True)
                t.start()
        
        elif path == "/reactivate":
            if not is_system_enabled():
                self.send_json(400, {"error": "system disabled"})
                return
            t = threading.Thread(target=reactivate_dormant_spenders, daemon=True)
            t.start()
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
    "babe!! 💕 u just made my whole day 🥰 sooo... i have even better stuff if u want 😏🔥",
    "omgg thank u babe 🥺💕 that means so much to me!! i actually just made something even spicier... wanna see? 😈",
]

PURCHASE_UPSELL = [
    "ok since u liked that... i have something way more intense 🙈🔥 i spent all morning on this one...",
    "babe i have this other set thats even crazier 😈 like... u havent seen anything yet 🔥",
    "omg ok so i was saving this but since u already proved u can handle it 😏🔥 this ones next level...",
    "ok ur officially my favorite 🥺💕 i made something just for u... nobody else has seen this",
]


def reactivate_dormant_spenders():
    """One-shot: find fans who spent $1+ but haven't messaged in 3+ days. Send rekindle."""
    all_state = load_json(FAN_STATE_FILE, {})
    cutoff = time.time() - (3 * 86400)  # 3 days
    rekindle_ids = VAULT_MAP.get("rekindle_vid", [])
    
    reactivated = 0
    for fan_key, fs in all_state.items():
        if fs.get("totalSpent", 0) <= 0:
            continue
        
        last_processed = fs.get("lastProcessedAt")
        if not last_processed:
            continue
        
        try:
            lp_time = datetime.fromisoformat(last_processed).timestamp()
        except:
            continue
        
        if lp_time > cutoff:
            continue  # Active recently
        
        if fs.get("rekindle_sent"):
            continue  # Already rekindled
        
        fan_id = int(fan_key)
        if fan_id in EXCLUDE_FAN_IDS:
            continue
        
        # Send rekindle
        vid_id = random.choice(rekindle_ids) if rekindle_ids else None
        msg = random.choice([
            "hey stranger 🥺 i havent heard from u in a while... been thinking about u tho 💕",
            "babe where did u go?? 🥺 i made something and thought of u...",
            "omg i just realized we havent talked in forever 🥺💕 i miss u... look what i just did 🙈",
        ])
        media = [vid_id] if vid_id else None
        send_of_message(fan_id, msg, media_ids=media)
        
        # Mark as rekindled
        all_state[fan_key]["rekindle_sent"] = datetime.now(timezone.utc).isoformat()
        reactivated += 1
        
        time.sleep(5)  # Don't spam API
        
        if reactivated >= 10:  # Cap per run
            break
    
    save_json(FAN_STATE_FILE, all_state)
    log.info(f"REACTIVATION: Sent {reactivated} rekindle messages")
    return reactivated


def deliver_high_ticket(fan_id, tier):
    """Deliver high-ticket package in multiple messages (max 30 items each)."""
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
        key = f"custom_tier{t}_" + ["shower","bedroom","topless","rubbing","titty","tryon","cumming"][t-1]
        ids = VAULT_MAP.get(key, [])
        if isinstance(ids, list):
            custom_ids.extend(ids)
    
    if tier == "starter_pack":
        # 3 combos worth of content
        items = []
        for i in random.sample(range(1, 14), 3):
            ids = VAULT_MAP.get(f"combo{i}", [])
            if isinstance(ids, list):
                items.extend(ids)
        items = list(dict.fromkeys(items))  # Dedup
    elif tier == "best_of":
        # Top 5 bundles + 1 sexting chain
        items = []
        for i in [11, 12, 13, 16, 26]:  # Biggest bundles
            ids = VAULT_MAP.get(f"bundle{i}", [])
            if isinstance(ids, list):
                items.extend(ids)
        items.extend(sexting_ids[:18])  # 1 full chain
        items = list(dict.fromkeys(items))
    elif tier == "everything":
        # Only approved sellable content — bundles + sexting + spliced customs
        # NO VIP customs (fan-specific), NO name-mentioned content
        items = list(dict.fromkeys(all_bundles + sexting_ids + custom_ids))
    else:
        items = all_bundles[:60]
    
    # Split into chunks of 30 (OF API limit)
    chunks = [items[i:i+30] for i in range(0, len(items), 30)]
    
    log.info(f"HIGH-TICKET delivering {tier} to {fan_id}: {len(items)} items in {len(chunks)} messages")
    
    messages = [
        f"ok babe here it comes 🔥🔥🔥 {len(items)} pics and videos just for u... enjoy 😏💕",
        "and more... 🔥🔥",
        "keep going babe... 😏💕",
        "theres more 🙈🔥",
        "still going... u asked for it 😏",
        "almost done babe 💕🔥",
        "last batch... save these 🥺💕",
    ]
    
    for i, chunk in enumerate(chunks):
        msg = messages[min(i, len(messages)-1)]
        send_of_message(fan_id, msg, media_ids=chunk)
        if i < len(chunks) - 1:
            time.sleep(3)  # Small delay between messages
    
    send_of_message(fan_id, f"thats {len(items)} pics and videos babe 🥺💕 hope u love them... let me know ur favorite 😏")
    
    update_fan_state(fan_id, action_desc=f"Delivered high ticket: {tier} ({len(items)} items)")
    perf_track("ppv_unlocked", fan_id=fan_id, amount=0)  # Revenue tracked via tip webhook


def handle_new_subscriber(fan_id, fan_name):
    """Welcome flow for brand new subscribers. Send greeting + selfies, then PPV offer."""
    # Message 1: Welcome + 2 selfies
    welcome = random.choice(NEW_SUB_WELCOME)
    selfie_ids = random.sample(VAULT_MAP["gfe_selfie"], 2)
    send_of_message(fan_id, welcome, media_ids=selfie_ids)
    gdrive_log({"event": "new_sub", "fan_id": fan_id, "name": fan_name})
    log.info(f"NEW-SUB welcome → {fan_id} ({fan_name}): {welcome[:40]}")
    
    # Message 2 (after 30s delay in thread): PPV offer with combo
    def send_followup():
        time.sleep(30)
        followup = random.choice(NEW_SUB_FOLLOWUP)
        combo_key = random.choice([f"combo{i}" for i in range(1, 14)])
        vault_ids = VAULT_MAP.get(combo_key, [])
        if vault_ids:
            send_of_message(fan_id, followup, media_ids=vault_ids, price=get_next_price(fan_id))
            log.info(f"NEW-SUB ppv_offer → {fan_id}: {combo_key} $18")
            update_fan_state(fan_id, name=fan_name, action_desc=f"New sub PPV offer: {combo_key} $18")
    
    t = threading.Thread(target=send_followup, daemon=True)
    t.start()
    
    update_fan_state(fan_id, name=fan_name, action_desc="New subscriber welcome")
    stats["auto_replies"] += 1


def handle_purchase(fan_id, fan_name, amount, content_key=None):
    """Follow up after a purchase. Thank + upsell to next tier."""
    all_state = load_json(FAN_STATE_FILE, {})
    fan_key = str(fan_id)
    fs = all_state.get(fan_key, {})
    total_spent = fs.get("totalSpent", 0) + amount
    
    # Update spend and purchase count (create entry if missing)
    if fan_key not in all_state:
        all_state[fan_key] = {"name": fan_name or "", "totalSpent": 0, "messageCount": 0, "purchaseCount": 0}
    all_state[fan_key]["totalSpent"] = total_spent
    all_state[fan_key]["purchaseCount"] = all_state[fan_key].get("purchaseCount", 0) + 1
    save_json(FAN_STATE_FILE, all_state)
    gdrive_log({"event": "purchase", "fan_id": fan_id, "amount": amount, "content_key": content_key})
    log.info(f"STATE-UPDATE: fan {fan_id} totalSpent=${total_spent} purchaseCount={all_state[fan_key]['purchaseCount']}")
    
    # Check for pending VIP deal (deliver 3 free combos)
    pending_vip = fs.get("pending_vip")
    if pending_vip and amount >= 50:
        log.info(f"VIP delivery triggered: {fan_id} tipped ${amount}")
        all_state = load_json(FAN_STATE_FILE, {})
        if fan_key in all_state:
            all_state[fan_key].pop("pending_vip", None)
            all_state[fan_key]["is_vip"] = True
            all_state[fan_key]["vip_since"] = datetime.now(timezone.utc).isoformat()
            save_json(FAN_STATE_FILE, all_state)
        
        def deliver_vip():
            send_of_message(fan_id, "omg babe ur officially my VIP 🥺💕✨ welcome to the inner circle!! heres ur 3 free bundles...")
            time.sleep(2)
            for i in random.sample(range(1, 14), 3):
                vault_ids = VAULT_MAP.get(f"combo{i}", [])
                if isinstance(vault_ids, list) and vault_ids:
                    send_of_message(fan_id, f"bundle {['one','two','three'][[1,2,3].index(min(i,3))]} 🔥💕", media_ids=vault_ids)
                    time.sleep(2)
            send_of_message(fan_id, "thats all 3 babe 🥰 and from now on u get priority + discounts on everything i make 💕😘")
        
        t = threading.Thread(target=deliver_vip, daemon=True)
        t.start()
        return
    
    # Check for pending high-ticket deal
    pending_ht = fs.get("pending_high_ticket")
    if pending_ht:
        tip_ask = pending_ht.get("tip_ask", 0)
        tier = pending_ht.get("tier", "starter_pack")
        # If tip is >= 80% of ask, deliver (allow some flexibility)
        if amount >= tip_ask * 0.8:
            log.info(f"HIGH-TICKET delivery triggered: {fan_id} tipped ${amount} (asked ${tip_ask}) → delivering {tier}")
            # Clear pending
            all_state = load_json(FAN_STATE_FILE, {})
            if fan_key in all_state:
                all_state[fan_key].pop("pending_high_ticket", None)
                save_json(FAN_STATE_FILE, all_state)
            # Deliver in background thread
            t = threading.Thread(target=deliver_high_ticket, args=(fan_id, tier), daemon=True)
            t.start()
            return
    
    # Log the outcome — training data
    contexts = load_fan_contexts()
    fk = str(fan_id)
    ctx = contexts.get(fk, {})
    msgs_before = len(ctx.get("msgs", []))
    # Time from first message to purchase
    first_ts = ctx["msgs"][0]["ts"] if ctx.get("msgs") else 0
    time_to_buy = int(time.time()) - first_ts if first_ts else 0
    append_outcome_log(fan_id, "purchase", amount=amount, content_key=content_key,
                       msgs_before_purchase=msgs_before, time_to_purchase=time_to_buy)
    
    # Thank them
    thanks = random.choice(PURCHASE_FOLLOWUP)
    send_of_message(fan_id, thanks)
    log.info(f"PURCHASE followup → {fan_id} ({fan_name}): spent ${amount}, total ${total_spent}")
    
    # Upsell after 45s delay
    def send_upsell():
        time.sleep(45)
        upsell_text = random.choice(PURCHASE_UPSELL)
        
        # Determine upsell tier based on total spend
        if total_spent < 50:
            # Another combo at dynamic price
            combo_key = random.choice([f"combo{i}" for i in range(1, 14)])
            vault_ids = VAULT_MAP.get(combo_key, [])
            price = get_next_price(fan_id)
        elif total_spent < 100:
            # Sexting chain start
            chain = random.choice(["sexting1_vid_15", "sexting2_vid_15", "sexting3_vid_15"])
            vault_ids = VAULT_MAP.get(chain, [])
            price = 15
            upsell_text = "ok babe since u already know what i look like 😏 i wanna try something... its a little video i made when i was feeling extra naughty 🙈🔥"
        elif total_spent < 200:
            # Custom upsell tier 1
            vault_ids = VAULT_MAP.get("custom_tier1_shower", [])
            price = 50
            upsell_text = "babe i literally just made this in the shower 🚿🔥 like... nobody has seen this yet 🙈 its just for u..."
        else:
            # Premium upsells for whales
            vault_ids = VAULT_MAP.get("custom_tier3_topless", [])
            price = 75
            upsell_text = "ok so... this is my most personal video ever 🥺🔥 ive never shared this with anyone... but i trust u 💕"
        
        if vault_ids:
            send_of_message(fan_id, upsell_text, media_ids=vault_ids, price=price)
            log.info(f"PURCHASE upsell → {fan_id}: ${price}")
            update_fan_state(fan_id, name=fan_name, action_desc=f"Purchase upsell: ${price}")
    
    t = threading.Thread(target=send_upsell, daemon=True)
    t.start()
    stats["auto_replies"] += 1


DAEMON_WEBHOOK_ID = None  # Set after registration

# Track welcomed fans to avoid double-welcome
_welcomed_fans = set()

def handle_of_event(payload):
    """Handle unified OF API webhook events."""
    try:
        event_type = payload.get("event") or payload.get("type") or ""
        data = payload.get("payload", payload.get("data", payload))
        
        log.info(f"OF-EVENT: {event_type} | {json.dumps(payload)[:200]}")
        
        enabled = is_system_enabled()
        
        # Extract fan ID from various payload formats
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
        
        # Skip Bianca's own messages and excludes
        if fan_id in EXCLUDE_FAN_IDS or fan_id == BIANCA_ID:
            return
        
        # NEW SUBSCRIBER (always track, only welcome if enabled)
        if event_type == "subscriptions.new":
            perf_track("new_sub", fan_id=fan_id)
            if enabled and fan_id not in _welcomed_fans:
                _welcomed_fans.add(fan_id)
                log.info(f"NEW-SUB webhook: {fan_id} ({fan_name})")
                handle_new_subscriber(fan_id, fan_name)
            elif not enabled:
                log.info(f"NEW-SUB tracked but system disabled: {fan_id}")
        
        # MESSAGE RECEIVED
        elif event_type == "messages.received":
            message = data.get("text") or data.get("message") or data.get("body") or ""
            message = re.sub(r"<[^>]+>", "", message).strip()
            
            # Skip if it's from Bianca (outgoing)
            if from_user.get("id") == BIANCA_ID:
                return
            
            # ALWAYS track active chatters + record message (even when disabled)
            track_active_chatter(fan_id, fan_name)
            # Detect signals for permanent log enrichment
            detected = []
            if BUYING_SIGNALS.search(message): detected.append("buying")
            if SEXUAL_SIGNALS.search(message): detected.append("sexual")
            if INTEREST_SIGNALS.search(message): detected.append("interest")
            if CURIOSITY_SIGNALS.search(message): detected.append("curiosity")
            # Permanent log gets signals inline; context file gets them via record_fan_signal later
            append_conversation_log(fan_id, message, from_bianca=False, signals=detected if detected else None)
            gdrive_log({"event": "fan_msg", "fan_id": fan_id, "name": fan_name, "text": message[:500], "signals": detected if detected else []})
            record_fan_message(fan_id, message, from_bianca=False, _skip_permanent=True)
            
            if not enabled:
                log.info(f"MSG skipped (disabled): {fan_id}")
                return
            
            payload = {
                "fan_id": fan_id,
                "username": username,
                "message": message,
                "name": fan_name,
                "source": "of_webhook"
            }
            
            # Classify and enqueue by priority
            priority = classify_priority(fan_id, message)
            pname = PRIORITY_NAMES.get(priority, str(priority))
            log.info(f"ENQUEUE fan={fan_id} priority={pname} msg={message[:40]}")
            enqueue_fan(priority, fan_id, payload)
        
        # PPV UNLOCKED (purchase)
        elif event_type == "messages.ppv.unlocked":
            amount = data.get("amount") or data.get("price") or 0
            try:
                amount = float(str(amount).replace("$", "").replace(",", ""))
            except:
                amount = 0
            if amount > 0:
                log.info(f"PURCHASE webhook: {fan_id} ({fan_name}) ${amount}")
                perf_track("ppv_unlocked", fan_id=fan_id, amount=amount)
                # Mark content as purchased in fan context
                # Try to find what was purchased from sent_keys
                contexts = load_fan_contexts()
                fk = str(fan_id)
                if fk in contexts:
                    for s in contexts[fk].get("sent_keys", []):
                        if not s.get("bought") and s.get("price"):
                            s["bought"] = True
                            break
                    save_fan_contexts(contexts)
                # Update stage
                update_fan_stage(fan_id, "purchased")
                handle_purchase(fan_id, fan_name, amount)
        
        # TRANSACTION (tips)
        elif event_type == "transactions.new":
            amount = data.get("amount") or data.get("price") or 0
            try:
                amount = float(str(amount).replace("$", "").replace(",", ""))
            except:
                amount = 0
            tx_type = str(data.get("type") or data.get("transaction_type") or "")
            if amount > 0 and "tip" in tx_type.lower():
                log.info(f"TIP webhook: {fan_id} ({fan_name}) ${amount}")
                perf_track("tip", fan_id=fan_id, amount=amount)
                handle_purchase(fan_id, fan_name, amount)
        
        else:
            log.info(f"OF-EVENT unhandled type: {event_type}")
    
    except Exception as e:
        log.error(f"handle_of_event error: {e}", exc_info=True)
        stats["errors"] += 1

def railway_poller():
    """Fallback poller: fetches pending messages from Railway every 30s.
    Catches anything the direct OF API webhook missed."""
    log.info("Railway poller fallback started (every 30s)")
    _seen_poll_ids = set()  # Track message IDs we've already processed
    time.sleep(10)  # Let other threads start first
    
    while True:
        try:
            if not is_system_enabled():
                time.sleep(30)
                continue
            
            resp = curl_json(
                f"{RAILWAY}/webhooks/pending/{ACCOUNT_ID}",
                headers={"Authorization": OF_KEY},
                timeout=15
            )
            
            if not resp or resp.get("error"):
                time.sleep(30)
                continue
            
            pending = resp.get("pending", [])
            if not pending:
                time.sleep(30)
                continue
            
            new_messages = []
            for msg in pending:
                msg_id = msg.get("id") or msg.get("messageId") or f"{msg.get('fanId','')}-{msg.get('text','')[:20]}-{msg.get('createdAt','')}"
                if msg_id not in _seen_poll_ids:
                    _seen_poll_ids.add(msg_id)
                    new_messages.append(msg)
            
            # Cap seen IDs memory
            if len(_seen_poll_ids) > 5000:
                _seen_poll_ids.clear()
            
            if new_messages:
                log.info(f"RAILWAY POLL: {len(new_messages)} new messages (of {len(pending)} pending)")
                
                for msg in new_messages:
                    fan_id = msg.get("fanId") or msg.get("fromUser", {}).get("id")
                    fan_name = msg.get("fanName") or msg.get("fromUser", {}).get("name", "")
                    text = msg.get("text") or ""
                    
                    if not fan_id:
                        continue
                    
                    # Build webhook-like payload
                    payload = {
                        "data": {
                            "fromUser": {"id": int(fan_id), "name": fan_name},
                            "text": text,
                            "createdAt": msg.get("createdAt", ""),
                        },
                        "event": "messages.received",
                        "_source": "railway_poll"
                    }
                    
                    log.info(f"RAILWAY POLL fan={fan_id} name={fan_name} msg={text[:60]}")
                    
                    # Process via normal webhook pipeline
                    t = threading.Thread(target=process_webhook, args=(payload,), daemon=True)
                    t.start()
                
                # Clear processed messages from Railway queue
                try:
                    clear_ids = [str(m.get("fanId") or m.get("fromUser", {}).get("id")) for m in new_messages]
                    curl_json(
                        f"{RAILWAY}/webhooks/pending/{ACCOUNT_ID}/clear",
                        headers={"Authorization": OF_KEY},
                        method="POST",
                        body={"fanIds": list(set(clear_ids))},
                        timeout=10
                    )
                except Exception as e:
                    log.error(f"Railway clear error: {e}")
            
        except Exception as e:
            log.error(f"Railway poller error: {e}")
        
        time.sleep(30)


def setup_webhook_tunnel():
    """Launch cloudflared tunnel and register webhook with OF API."""
    global DAEMON_WEBHOOK_ID
    
    # Kill any existing daemon tunnel
    subprocess.run(["pkill", "-f", "cloudflared tunnel --url http://localhost:8901"], 
                    capture_output=True, timeout=5)
    time.sleep(2)
    
    # Start cloudflared
    tunnel_log = os.path.join(DIR, "cloudflared-daemon.log")
    subprocess.Popen(
        ["/opt/homebrew/bin/cloudflared", "tunnel", "--url", "http://localhost:8901"],
        stdout=open(tunnel_log, "w"), stderr=subprocess.STDOUT
    )
    
    # Wait for tunnel URL
    tunnel_url = None
    for _ in range(30):
        time.sleep(1)
        try:
            with open(tunnel_log) as f:
                for line in f:
                    if "trycloudflare.com" in line:
                        import re as _re
                        m = _re.search(r'(https://[^\s]*trycloudflare\.com)', line)
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
    
    # Register/update webhook with OF API
    webhook_url = f"{tunnel_url}/webhook/of-event"
    
    # Check for existing daemon webhook
    resp = curl_json("https://app.onlyfansapi.com/api/webhooks",
                     headers={"Authorization": OF_KEY})
    
    existing_id = None
    if resp and not resp.get("error"):
        for wh in resp.get("data", []):
            # Find our webhook by checking if it's a trycloudflare URL for bianca
            if "trycloudflare.com" in wh.get("url", "") and "of-event" in wh.get("url", ""):
                existing_id = wh["id"]
                break
    
    events = ["messages.received", "subscriptions.new", "messages.ppv.unlocked", "transactions.new"]
    
    if existing_id:
        # Update existing webhook URL
        resp = curl_json(
            f"https://app.onlyfansapi.com/api/webhooks/{existing_id}",
            headers={"Authorization": OF_KEY},
            method="PUT",
            body={"endpoint_url": webhook_url, "events": events, "enabled": True,
                  "account_scope": "inclusive", "account_ids": [ACCOUNT_ID]}
        )
        log.info(f"Updated webhook {existing_id}: {resp}")
    else:
        # Create new webhook
        resp = curl_json(
            "https://app.onlyfansapi.com/api/webhooks",
            headers={"Authorization": OF_KEY},
            method="POST",
            body={"endpoint_url": webhook_url, "events": events, "enabled": True,
                  "account_scope": "inclusive", "account_ids": [ACCOUNT_ID]}
        )
        log.info(f"Created webhook: {resp}")
        if isinstance(resp, dict) and resp.get("data"):
            DAEMON_WEBHOOK_ID = resp["data"].get("id")
    
    # Save tunnel state
    save_json(os.path.join(DIR, "bianca-tunnel-state.json"), {
        "tunnel_url": tunnel_url,
        "webhook_url": webhook_url,
        "webhook_id": existing_id or DAEMON_WEBHOOK_ID,
        "started_at": datetime.now(timezone.utc).isoformat()
    })


def main():
    log.info(f"Bianca Daemon v7 starting on port {PORT}")
    
    # Ensure system state exists
    state = load_json(SYSTEM_STATE_FILE, {})
    if "SYSTEM_ENABLED" not in state:
        state["SYSTEM_ENABLED"] = True
        save_json(SYSTEM_STATE_FILE, state)
    
    # Webhooks + Railway polling fallback
    # Direct webhooks for instant response, Railway poll every 30s catches anything missed
    
    # Start priority worker (processes fan messages in priority order)
    worker_thread = threading.Thread(target=priority_worker, daemon=True)
    worker_thread.start()
    
    # Start cloudflared tunnel and register webhook
    tunnel_thread = threading.Thread(target=setup_webhook_tunnel, daemon=True)
    tunnel_thread.start()
    
    # Start Railway polling fallback (catches messages webhooks miss)
    railway_poller_thread = threading.Thread(target=railway_poller, daemon=True)
    railway_poller_thread.start()
    
    # Start exclude list sync thread (syncs active chatters to OF list every 10 min)
    exclude_thread = threading.Thread(target=sync_exclude_list, daemon=True)
    exclude_thread.start()
    log.info("Exclude list sync thread started (every 10 min)")
    
    # Start Google Drive sync thread (flushes events every 5 min)
    _init_gdrive()
    gdrive_thread = threading.Thread(target=gdrive_sync_thread, daemon=True)
    gdrive_thread.start()
    
    import socketserver
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
