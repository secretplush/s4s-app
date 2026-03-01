#!/usr/bin/env python3
"""
Bianca Dispatcher v4 — Internal Memory First architecture.

API call budget: <120/hr total.
- Poll page 1 only every 30s = ~120 calls/hr max
- Per-fan fetches only when processing (1-3 msgs)
- PPV ledger stored locally, reconciled every 6hr

Output protocol:
  DISPATCH_SKIP: <reason>
  DISPATCH_SPAWN: <fanId> <message_snippet>
"""
import json, sys, os, time, subprocess, re

DIR = os.path.dirname(os.path.abspath(__file__))
SYSTEM_STATE = os.path.join(DIR, "bianca-system-state.json")
OPUS_CALLS = os.path.join(DIR, "bianca-opus-calls.json")
FAN_MEMORY = os.path.join(DIR, "bianca-fan-memory.json")
RECENTLY_DISPATCHED = os.path.join(DIR, "bianca-dispatched.json")

OF_API = "https://app.onlyfansapi.com/api/acct_54e3119e77da4429b6537f7dd2883a05"
OF_KEY = "Bearer ofapi_bT4J1Er2YBow46EihDfjlSFf5HRmiM15M4DCOoHn7889d8b4"
BIANCA_ID = 525755724
EXCLUDE_FANS = {483664969, 482383508, 525755724}
MAX_CALLS_PER_MIN = 2
MAX_AGE_SEC = 1800  # 30 min fresh window

PROMO_USERNAMES = {"exclusivepromotion", "premiumpromotions", "erotiqa", "starpromotion", "starpromo"}
PROMO_KEYWORDS = ["permanent post", "mass dm", "promo", "shoutout", "s4s", "promotion", "📌",
                  "fans 🧑", "top 0,", "top 0.", "similar results", "want similar", "$600 in a day"]
DISPATCH_COOLDOWN_MS = 120000  # 2 min
ACTIVE_CONVO_WINDOW_MS = 1800000  # 30 min — track fans dispatched within this window
ACTIVE_FAN_CHECK_FILE = os.path.join(DIR, "bianca-active-fans.json")


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


def main():
    from datetime import datetime, timezone

    # STEP 0: System check
    state = load_json(SYSTEM_STATE, {})
    if not state.get("SYSTEM_ENABLED", False):
        print("DISPATCH_SKIP: system_disabled")
        return

    cooldown = state.get("COOLDOWN_UNTIL")
    if cooldown and now_ms() < cooldown:
        print("DISPATCH_SKIP: cooldown_active")
        return

    if state.get("canary_mode") and state.get("canary_opus_count", 0) >= state.get("canary_max_opus", 2):
        print(f"DISPATCH_SKIP: canary_complete")
        return

    # STEP 1: Rate governor (rolling 60s window)
    opus = load_json(OPUS_CALLS, {"calls": [], "last_429": None})
    current = now_ms()

    calls = [c for c in opus.get("calls", []) if current - c < 60000]
    opus["calls"] = calls
    save_json(OPUS_CALLS, opus)

    if len(calls) >= MAX_CALLS_PER_MIN:
        next_slot = 60 - (current - min(calls)) // 1000
        print(f"DISPATCH_SKIP: governor {len(calls)}/{MAX_CALLS_PER_MIN} (next slot in {next_slot}s)")
        return

    last_429 = opus.get("last_429")
    if last_429 and (current - last_429) < 60000:
        print("DISPATCH_SKIP: 429_cooldown")
        return

    # STEP 2: Poll ONLY page 1 of /chats (10 chats) — ONE API call
    data = curl_json(f"{OF_API}/chats?limit=10&order=recent&offset=0",
                     headers={"Authorization": OF_KEY}, timeout=8)
    if not data:
        print("DISPATCH_SKIP: of_api_error")
        return

    chats = data.get("data", data) if isinstance(data, dict) else data
    if not chats:
        print("DISPATCH_SKIP: no_chats")
        return

    # Quiet mode: if last 5 polls found nobody, skip every other poll (effective 60s)
    consecutive_skips = state.get("consecutive_no_fan_polls", 0)
    poll_count = state.get("total_polls", 0)
    if consecutive_skips >= 5 and poll_count % 2 == 1:
        state["total_polls"] = poll_count + 1
        save_json(SYSTEM_STATE, state)
        print(f"DISPATCH_SKIP: quiet_mode (skip {consecutive_skips} empty polls)")
        return
    state["total_polls"] = poll_count + 1

    # Track API calls for reporting
    state["api_calls_log"] = state.get("api_calls_log", [])
    state["api_calls_log"].append(current)
    # Keep only last hour
    state["api_calls_log"] = [t for t in state["api_calls_log"] if current - t < 3600000]
    api_calls_hr = len(state["api_calls_log"])

    # STEP 2b: Check active fans not on page 1 (option 3 — zero extra polling calls)
    # Fans dispatched in last 30 min get a direct /chats/{fanId}/messages?limit=1 check
    active_fans = load_json(RECENTLY_DISPATCHED, {})
    page1_fan_ids = set()
    for c in chats:
        fan = c.get("fan", {})
        if fan.get("id"):
            page1_fan_ids.add(fan["id"])

    for fan_id_str, dispatch_ts in list(active_fans.items()):
        fan_id = int(fan_id_str)
        if fan_id in page1_fan_ids or fan_id in EXCLUDE_FANS:
            continue
        if current - dispatch_ts > ACTIVE_CONVO_WINDOW_MS:
            continue
        # This fan was recently active but fell off page 1 — check directly
        fan_check = curl_json(f"{OF_API}/chats/{fan_id}/messages?limit=1",
                              headers={"Authorization": OF_KEY}, timeout=8)
        if fan_check:
            msgs = fan_check.get("data", fan_check) if isinstance(fan_check, dict) else fan_check
            if msgs and isinstance(msgs, list) and len(msgs) > 0:
                msg = msgs[0]
                from_id = msg.get("fromUser", {}).get("id")
                if from_id and from_id != BIANCA_ID:
                    # Synthesize a chat entry for the main loop
                    chats.append({
                        "fan": {"id": fan_id, "username": "", "name": fan_id_str},
                        "lastMessage": msg,
                        "_active_fan_check": True
                    })

    # STEP 3: Load fan memory — per-fan last_seen_message_id
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
        msg_lower = msg_text.lower()
        if any(kw in msg_lower for kw in PROMO_KEYWORDS):
            continue

        # Check freshness
        created = last.get("createdAt", "")
        try:
            t = datetime.fromisoformat(created)
            age_sec = (now_utc - t).total_seconds()
        except:
            age_sec = 99999

        if age_sec > MAX_AGE_SEC:
            continue

        # Check against fan memory — skip if we already saw this message
        msg_id = str(last.get("id", ""))
        fan_key = str(fan_id)
        fan_mem = memory.get("fans", {}).get(fan_key, {})
        last_seen = fan_mem.get("last_seen_message_id", "")

        if msg_id and msg_id == last_seen:
            continue  # Already processed this message

        # New message from fan — eligible
        eligible.append({
            "fanId": fan_id,
            "message": msg_text[:80],
            "age_sec": age_sec,
            "name": fan.get("name", "?"),
            "msg_id": msg_id,
        })

    if not eligible:
        state["consecutive_no_fan_polls"] = state.get("consecutive_no_fan_polls", 0) + 1
        save_json(SYSTEM_STATE, state)
        print(f"DISPATCH_SKIP: no_new_inbound (api_calls/hr: {api_calls_hr}, empty: {state['consecutive_no_fan_polls']})")
        return

    # Filter recently dispatched
    dispatched = load_json(RECENTLY_DISPATCHED, {})
    eligible = [f for f in eligible if current - dispatched.get(str(f["fanId"]), 0) > DISPATCH_COOLDOWN_MS]

    if not eligible:
        state["consecutive_no_fan_polls"] = state.get("consecutive_no_fan_polls", 0) + 1
        save_json(SYSTEM_STATE, state)
        print(f"DISPATCH_SKIP: all_recently_dispatched (api_calls/hr: {api_calls_hr}, empty: {state['consecutive_no_fan_polls']})")
        return

    # Priority sort
    def priority_score(f):
        age = f["age_sec"]
        msg = f.get("message", "").lower()
        if "__new_subscriber__" in msg or "tip" in msg:
            return (0, age)
        return (1, -age)

    eligible.sort(key=priority_score)
    selected = eligible[0]

    fan_id = selected["fanId"]
    fan_msg = selected["message"]
    fan_key = str(fan_id)

    # STEP 4: Update fan memory — but NOT last_seen_message_id yet.
    # That gets updated by the Opus worker AFTER successful reply.
    # We only track the name here for reference.
    if "fans" not in memory:
        memory["fans"] = {}
    if fan_key not in memory["fans"]:
        memory["fans"][fan_key] = {}
    memory["fans"][fan_key]["name"] = selected.get("name", "?")
    # DO NOT set last_seen_message_id here — Opus worker does it after send
    save_json(FAN_MEMORY, memory)

    # Reset quiet mode counter — we found someone
    state["consecutive_no_fan_polls"] = 0

    # STEP 5: Record call timestamp
    opus["calls"].append(current)
    save_json(OPUS_CALLS, opus)

    if state.get("canary_mode"):
        state["canary_opus_count"] = state.get("canary_opus_count", 0) + 1

    state["last_dispatch_ts"] = current
    save_json(SYSTEM_STATE, state)

    dispatched[str(fan_id)] = current
    save_json(RECENTLY_DISPATCHED, dispatched)

    print(f"DISPATCH_SPAWN: {fan_id} {fan_msg} (api_calls/hr: {api_calls_hr})")


if __name__ == "__main__":
    main()
