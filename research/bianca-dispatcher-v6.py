#!/usr/bin/env python3
"""
Bianca Dispatcher v6 — Decision-Only Opus architecture.

Flow:
1. Poll page 1 of /chats → find fan needing reply
2. Fetch context (last 10 msgs + fan state + sent content)
3. Output DISPATCH_SPAWN with full inlined context (no file reads for Opus)

Output protocol:
  DISPATCH_SKIP: <reason>
  DISPATCH_SPAWN: <fanId>
  CONTEXT_JSON: <json blob with everything Opus needs>
"""
import json, sys, os, subprocess, time, re
from datetime import datetime, timezone

DIR = os.path.dirname(os.path.abspath(__file__))
SYSTEM_STATE = os.path.join(DIR, "bianca-system-state.json")
OPUS_CALLS = os.path.join(DIR, "bianca-opus-calls.json")
FAN_MEMORY = os.path.join(DIR, "bianca-fan-memory.json")
FAN_STATE = os.path.join(DIR, "bianca-fan-state.json")
RECENTLY_DISPATCHED = os.path.join(DIR, "bianca-dispatched.json")

OF_API = "https://app.onlyfansapi.com/api/acct_54e3119e77da4429b6537f7dd2883a05"
OF_KEY = "Bearer ofapi_bT4J1Er2YBow46EihDfjlSFf5HRmiM15M4DCOoHn7889d8b4"
RAILWAY = "https://s4s-worker-production.up.railway.app"
ACCOUNT_ID = "acct_54e3119e77da4429b6537f7dd2883a05"
BIANCA_ID = 525755724
EXCLUDE_FANS = {483664969, 482383508, 525755724}
MAX_CALLS_PER_MIN = 2
MAX_AGE_SEC = 1800

PROMO_USERNAMES = {"exclusivepromotion", "premiumpromotions", "erotiqa", "starpromotion", "starpromo"}
PROMO_KEYWORDS = ["permanent post", "mass dm", "promo", "shoutout", "s4s", "promotion",
                  "fans 🧑", "top 0,", "top 0.", "similar results", "want similar"]
DISPATCH_COOLDOWN_MS = 120000
ACTIVE_CONVO_WINDOW_MS = 1800000


def curl_json(url, headers=None, timeout=8):
    try:
        cmd = ["curl", "-s", "--max-time", str(timeout)]
        if headers:
            for k, v in headers.items():
                cmd += ["-H", f"{k}: {v}"]
        cmd.append(url)
        r = subprocess.run(cmd, capture_output=True, text=True, timeout=timeout + 3)
        return json.loads(r.stdout) if r.stdout.strip() else None
    except:
        return None


def load_json(path, default=None):
    try:
        with open(path) as f:
            return json.load(f)
    except:
        return default if default is not None else {}


def save_json(path, data):
    with open(path, "w") as f:
        json.dump(data, f, indent=2)


def now_ms():
    return int(time.time() * 1000)


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


def fetch_fan_context(fan_id):
    """Fetch last 10 messages + fan state + sent content. Returns compact JSON."""
    fan_key = str(fan_id)

    # Fetch messages
    data = curl_json(f"{OF_API}/chats/{fan_id}/messages?limit=12",
                     headers={"Authorization": OF_KEY})
    
    messages = []
    last_msg_id = None
    if data:
        raw = data.get("data", data) if isinstance(data, dict) else data
        if isinstance(raw, list):
            for i, m in enumerate(raw[:10]):
                from_id = m.get("fromUser", {}).get("id")
                text = re.sub(r"<[^>]+>", "", m.get("text", "") or "").strip()
                
                msg = {
                    "from": "b" if from_id == BIANCA_ID else "f",
                    "text": text[:200],
                    "ago": format_ago(m.get("createdAt", ""))
                }
                
                price = m.get("price")
                if price:
                    msg["$"] = price
                    msg["opened"] = m.get("isOpened", False)
                
                if i == 0 and from_id != BIANCA_ID:
                    last_msg_id = str(m.get("id", ""))
                
                messages.append(msg)

    # Fan state (compact)
    all_state = load_json(FAN_STATE, {})
    fs = all_state.get(fan_key, {})
    compact = {}
    if fs.get("name"): compact["name"] = fs["name"]
    if fs.get("buyerType"): compact["type"] = fs["buyerType"]
    if fs.get("totalSpent"): compact["spent"] = fs["totalSpent"]
    if fs.get("notes"): compact["notes"] = fs["notes"][:300]
    if fs.get("priceHistory"): compact["prices"] = fs["priceHistory"][-5:]

    # Sent content from Redis
    sent = []
    sent_data = curl_json(f"{RAILWAY}/fans/{ACCOUNT_ID}/{fan_id}/sent")
    if isinstance(sent_data, list):
        sent = [s.get("content_key", s) if isinstance(s, dict) else s for s in sent_data]

    return {
        "fan_id": fan_id,
        "msgs": messages,
        "state": compact,
        "sent": sent,
        "last_msg_id": last_msg_id
    }


def main():
    now = now_ms()

    # System check
    state = load_json(SYSTEM_STATE, {})
    if not state.get("SYSTEM_ENABLED", False):
        print("DISPATCH_SKIP: system_disabled")
        return

    cooldown = state.get("COOLDOWN_UNTIL")
    if cooldown and now < cooldown:
        print("DISPATCH_SKIP: cooldown_active")
        return

    # Rate governor
    opus = load_json(OPUS_CALLS, {"calls": [], "last_429": None})
    calls = [c for c in opus.get("calls", []) if now - c < 60000]
    opus["calls"] = calls
    save_json(OPUS_CALLS, opus)

    if len(calls) >= MAX_CALLS_PER_MIN:
        print(f"DISPATCH_SKIP: governor {len(calls)}/{MAX_CALLS_PER_MIN}")
        return

    last_429 = opus.get("last_429")
    if last_429 and (now - last_429) < 60000:
        print("DISPATCH_SKIP: 429_cooldown")
        return

    # Poll page 1
    data = curl_json(f"{OF_API}/chats?limit=10&order=recent&offset=0",
                     headers={"Authorization": OF_KEY})
    if not data:
        print("DISPATCH_SKIP: api_error")
        return

    chats = data.get("data", data) if isinstance(data, dict) else data
    if not chats:
        print("DISPATCH_SKIP: no_chats")
        return

    # Check active fans off page 1
    dispatched = load_json(RECENTLY_DISPATCHED, {})
    page1_ids = {c.get("fan", {}).get("id") for c in chats if c.get("fan")}

    for fan_id_str, ts in list(dispatched.items()):
        fid = int(fan_id_str)
        if fid in page1_ids or fid in EXCLUDE_FANS or now - ts > ACTIVE_CONVO_WINDOW_MS:
            continue
        check = curl_json(f"{OF_API}/chats/{fid}/messages?limit=1",
                          headers={"Authorization": OF_KEY})
        if check:
            msgs = check.get("data", check) if isinstance(check, dict) else check
            if msgs and isinstance(msgs, list) and msgs[0].get("fromUser", {}).get("id") != BIANCA_ID:
                chats.append({"fan": {"id": fid, "username": "", "name": fan_id_str}, "lastMessage": msgs[0]})

    # Find eligible
    memory = load_json(FAN_MEMORY, {"fans": {}})
    now_utc = datetime.now(timezone.utc)
    eligible = []

    for c in chats:
        last = c.get("lastMessage")
        if not last:
            continue
        from_id = last.get("fromUser", {}).get("id")
        if from_id == BIANCA_ID:
            continue
        fan = c.get("fan", {})
        fan_id = fan.get("id")
        if not fan_id or fan_id in EXCLUDE_FANS:
            continue
        username = fan.get("username", "")
        if username in PROMO_USERNAMES:
            continue
        msg_text = re.sub(r"<[^>]+>", "", last.get("text", ""))
        if any(kw in msg_text.lower() for kw in PROMO_KEYWORDS):
            continue

        try:
            age = (now_utc - datetime.fromisoformat(last.get("createdAt", ""))).total_seconds()
        except:
            age = 99999
        if age > MAX_AGE_SEC:
            continue

        msg_id = str(last.get("id", ""))
        fan_key = str(fan_id)
        last_seen = memory.get("fans", {}).get(fan_key, {}).get("last_seen_message_id", "")
        if msg_id and msg_id == last_seen:
            continue

        if now - dispatched.get(str(fan_id), 0) <= DISPATCH_COOLDOWN_MS:
            continue

        eligible.append({"fanId": fan_id, "message": msg_text[:80], "age": age,
                         "name": fan.get("name", "?"), "msg_id": msg_id})

    if not eligible:
        print("DISPATCH_SKIP: no_new_inbound")
        return

    # Sort: newest first
    eligible.sort(key=lambda f: f["age"])
    selected = eligible[0]
    fan_id = selected["fanId"]

    # Fetch full context for this fan (1 extra API call)
    context = fetch_fan_context(fan_id)

    # Update fan memory with msg_id so we don't re-dispatch
    fan_key = str(fan_id)
    if "fans" not in memory:
        memory["fans"] = {}
    if fan_key not in memory["fans"]:
        memory["fans"][fan_key] = {}
    memory["fans"][fan_key]["last_seen_message_id"] = selected["msg_id"]
    memory["fans"][fan_key]["name"] = selected["name"]
    save_json(FAN_MEMORY, memory)

    # Record call
    opus["calls"].append(now)
    save_json(OPUS_CALLS, opus)

    dispatched[str(fan_id)] = now
    save_json(RECENTLY_DISPATCHED, dispatched)

    state["last_dispatch_ts"] = now
    save_json(SYSTEM_STATE, state)

    # Output
    print(f"DISPATCH_SPAWN: {fan_id}")
    print(f"CONTEXT_JSON: {json.dumps(context)}")


if __name__ == "__main__":
    main()
