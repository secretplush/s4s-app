#!/usr/bin/env python3
"""
Bianca Chatbot Health Report — ZERO OPUS, pure Python.
Run: python3 research/bianca-health.py
"""
import json, os, time, subprocess, re
from datetime import datetime, timezone

DIR = os.path.dirname(os.path.abspath(__file__))

def load_json(path, default=None):
    try:
        with open(os.path.join(DIR, path)) as f:
            return json.load(f)
    except:
        return default if default is not None else {}

def curl_json(url, headers=None, timeout=5):
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

now_ms = int(time.time() * 1000)
now_utc = datetime.now(timezone.utc)

# --- System State ---
state = load_json("bianca-system-state.json", {})
opus = load_json("bianca-opus-calls.json", {"calls": [], "last_429": None})
dispatched = load_json("bianca-dispatched.json", {})
fan_state = load_json("bianca-fan-state.json", {})

# --- Opus calls in last 60 min ---
calls_60m = [c for c in opus.get("calls", []) if now_ms - c < 3600000]
calls_1m = [c for c in opus.get("calls", []) if now_ms - c < 60000]

# --- Fan state stats ---
replies_60m = 0
ppv_offers_60m = 0
total_fans_processed = 0
for fid, fs in fan_state.items():
    lp = fs.get("lastProcessedAt") or fs.get("lastContact")
    if lp:
        try:
            t = datetime.fromisoformat(str(lp).replace("Z", "+00:00"))
            if (now_utc - t).total_seconds() < 3600:
                replies_60m += 1
        except:
            pass
    total_fans_processed += 1
    # Count PPV offers from priceHistory
    for ph in fs.get("priceHistory", []):
        ts = ph.get("timestamp", "")
        try:
            t = datetime.fromisoformat(str(ts).replace("Z", "+00:00"))
            if (now_utc - t).total_seconds() < 3600:
                ppv_offers_60m += 1
        except:
            pass

# --- Currently active fans (dispatched recently) ---
active_fans = sum(1 for ts in dispatched.values() if now_ms - ts < 120000)

# --- OF API poll rate estimate ---
# 3 pages per tick, 30s interval = 6 API calls/min for polling
# Plus ~2 send calls per spawn (messages + PPV) = ~4 more/min at max
poll_interval = 30
pages_per_tick = 3
polls_per_min = (60 / poll_interval) * pages_per_tick
sends_per_min = len(calls_1m) * 3  # ~3 API calls per worker (messages, PPV, dedup)
total_of_calls_min = polls_per_min + sends_per_min

# --- Print Report ---
print("=" * 50)
print("  BIANCA CHATBOT HEALTH REPORT")
print(f"  {now_utc.strftime('%Y-%m-%d %H:%M:%S UTC')}")
print("=" * 50)

print(f"\n📋 SYSTEM")
print(f"  Enabled:          {state.get('SYSTEM_ENABLED', '?')}")
print(f"  Canary mode:      {state.get('canary_mode', False)}")
print(f"  Architecture:     {state.get('architecture', '?')}")
print(f"  Dispatch method:  {state.get('dispatch_method', '?')}")

print(f"\n⚙️  CONFIG")
print(f"  Polling interval: {poll_interval}s")
print(f"  Fresh window:     30 min")
print(f"  Governor cap:     {state.get('MAX_OPUS_CALLS_PER_MIN', 2)}/min rolling")
print(f"  Hour cap:         {state.get('MAX_OPUS_CALLS_PER_HOUR', 120)}/hr")

print(f"\n🔥 OPUS USAGE (last 60 min)")
print(f"  Calls:            {len(calls_60m)}")
print(f"  Calls (last 1m):  {len(calls_1m)}")
if calls_60m:
    timestamps = [datetime.fromtimestamp(c/1000, tz=timezone.utc).strftime('%H:%M:%S') for c in sorted(calls_60m)[-10:]]
    print(f"  Last 10:          {', '.join(timestamps)}")
print(f"  Last 429:         {opus.get('last_429', 'None')}")
# Rough token estimate: ~80-100K tokens per worker from sub-agent reports
print(f"  Est. tokens/call: ~80-100K (from sub-agent logs)")
print(f"  Est. cost/call:   ~$0.60-0.80 (Opus)")
print(f"  Est. 60m cost:    ~${len(calls_60m) * 0.70:.2f}")

print(f"\n📨 ACTIVITY (last 60 min)")
print(f"  Replies sent:     ~{replies_60m}")
print(f"  PPV offers:       ~{ppv_offers_60m}")
print(f"  Active cooldowns: {active_fans}")
print(f"  Total fans in DB: {total_fans_processed}")

print(f"\n🌐 OF API USAGE (estimated)")
print(f"  Poll calls/min:   ~{polls_per_min:.0f} (3 pages × {60/poll_interval:.0f} ticks)")
print(f"  Send calls/min:   ~{sends_per_min} (worker API calls)")
print(f"  Total/min:        ~{total_of_calls_min:.0f}")
print(f"  Credits/hr:       ~{total_of_calls_min * 60:.0f}")
print(f"  Plan limit:       100K/month (~139/hr)")

print(f"\n⏱️  LATENCY")
print(f"  (No latency data yet — webhook tracking not active)")
print(f"  Dispatch→spawn:   ~1-5s (Python script + cron tick)")
print(f"  Worker duration:  ~45-90s (Opus processing)")
print(f"  Total reply time: ~60-120s from fan message")

print(f"\n📊 QUEUE")
print(f"  Priority:         NEWEST-first (live convos)")
print(f"  Tiers:            new_sub/tip > active_convo > normal > bumps")
print(f"  Cooldown window:  2 min (auto-dedup)")

print("\n" + "=" * 50)
