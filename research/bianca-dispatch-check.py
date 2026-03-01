#!/usr/bin/env python3
"""Bianca Safe Dispatch v2 — strict locking, 1 fan per tick, no concurrency."""
import json, time, sys, subprocess, os, fcntl

STATE_FILE = "research/bianca-system-state.json"
LOCKS_FILE = "research/bianca-locks.json"
PENDING_URL = "https://s4s-worker-production.up.railway.app/webhooks/pending/acct_54e3119e77da4429b6537f7dd2883a05"
EXCLUDE_IDS = {483664969, 482383508, 525755724}
ACCOUNT_ID = "acct_54e3119e77da4429b6537f7dd2883a05"

NOW = time.time()
NOW_MS = int(NOW * 1000)

def load_locks():
    try:
        with open(LOCKS_FILE) as f:
            return json.load(f)
    except:
        return {"dispatcher_lock": None, "global_opus_lock": None, "fan_locks": {}}

def save_locks(locks):
    with open(LOCKS_FILE, "w") as f:
        json.dump(locks, f, indent=2)

def is_lock_active(lock_entry):
    """Check if a lock is still active (not expired)."""
    if not lock_entry:
        return False
    expires = lock_entry.get("expires", 0)
    return NOW < expires

# ============================================================
# 1. Check system state
# ============================================================
try:
    with open(STATE_FILE) as f:
        state = json.load(f)
except Exception:
    print("DISPATCH_DISABLED: can't read state file")
    sys.exit(0)

if not state.get("SYSTEM_ENABLED"):
    print("DISPATCH_DISABLED")
    sys.exit(0)

cooldown = state.get("COOLDOWN_UNTIL")
if cooldown and NOW * 1000 < cooldown:
    print("DISPATCH_DISABLED: cooldown active")
    sys.exit(0)

# ============================================================
# 2. Check dispatcher_lock (no overlapping ticks) — TTL 55s
# ============================================================
locks = load_locks()

if is_lock_active(locks.get("dispatcher_lock")):
    print(f"DISPATCH_SKIP: dispatcher_lock active (expires {locks['dispatcher_lock']['expires'] - NOW:.0f}s)")
    sys.exit(0)

# Acquire dispatcher lock (55s TTL)
locks["dispatcher_lock"] = {"acquired": NOW, "expires": NOW + 55}
save_locks(locks)

# ============================================================
# 3. Check global_opus_lock (only 1 worker at a time) — TTL 120s
# ============================================================
if is_lock_active(locks.get("global_opus_lock")):
    remaining = locks["global_opus_lock"]["expires"] - NOW
    print(f"DISPATCH_SKIP: global_opus_lock active (worker running, expires {remaining:.0f}s)")
    # Release dispatcher lock since we're done
    locks["dispatcher_lock"] = None
    save_locks(locks)
    sys.exit(0)

# ============================================================
# 4. Get watermark and fetch pending
# ============================================================
last_ts = state.get("last_dispatch_ts", 0)

try:
    r = subprocess.run(
        ["curl", "-s", "--max-time", "10", PENDING_URL],
        capture_output=True, text=True, timeout=15
    )
    data = json.loads(r.stdout)
except Exception as e:
    print(f"DISPATCH_SKIP: fetch error: {e}")
    locks["dispatcher_lock"] = None
    save_locks(locks)
    sys.exit(0)

fans = data.get("pending", [])
fans = [f for f in fans if f["fanId"] not in EXCLUDE_IDS]

# Only fans newer than watermark
new_fans = [f for f in fans if f["timestamp"] > last_ts]

if not new_fans:
    print(f"DISPATCH_SKIP: {len(fans)} pending, 0 new since watermark")
    locks["dispatcher_lock"] = None
    save_locks(locks)
    sys.exit(0)

# ============================================================
# 5. Pick EXACTLY 1 fan (oldest first), check per-fan lock
# ============================================================
new_fans.sort(key=lambda x: x["timestamp"])

chosen = None
for f in new_fans:
    fan_key = f"fan_lock:{ACCOUNT_ID}:{f['fanId']}"
    fan_lock = locks.get("fan_locks", {}).get(fan_key)
    if is_lock_active(fan_lock):
        continue  # skip locked fan
    chosen = f
    break

if not chosen:
    # Update watermark to skip these locked fans next time
    print(f"DISPATCH_SKIP: {len(new_fans)} new fans but all locked")
    locks["dispatcher_lock"] = None
    save_locks(locks)
    sys.exit(0)

# ============================================================
# 6. Acquire locks: global_opus_lock (120s) + per-fan lock (120s)
# ============================================================
fan_key = f"fan_lock:{ACCOUNT_ID}:{chosen['fanId']}"
locks["global_opus_lock"] = {"acquired": NOW, "expires": NOW + 120, "fanId": chosen["fanId"]}
locks.setdefault("fan_locks", {})[fan_key] = {"acquired": NOW, "expires": NOW + 120}

# Update watermark to this fan's timestamp
state["last_dispatch_ts"] = chosen["timestamp"]
state["last_updated"] = time.strftime("%Y-%m-%dT%H:%M:%S-04:00")
with open(STATE_FILE, "w") as f:
    json.dump(state, f, indent=2)

save_locks(locks)

# ============================================================
# 7. Output — exactly 1 fan
# ============================================================
msg = (chosen.get("message") or "")[:80].replace("<p>", "").replace("</p>", "")
print(f"DISPATCH_SPAWN: 1 fan")
print(f"  fanId:{chosen['fanId']} | {msg}")
