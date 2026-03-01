#!/usr/bin/env python3
"""
bianca-send-message.py — Executes Opus worker decisions outside the Opus context.

Usage:
  python3 research/bianca-send-message.py <fanId> <json_decision>

JSON decision format (from Opus):
  {"action":"text","message_text":"hey babe"}
  {"action":"ppv","content_key":"bundle1_zebra_bra","price":18,"message_text":"just for u baby"}
  {"action":"free_media","content_key":"gfe_selfie_1","message_text":"heres a lil something"}
  {"action":"skip","reason":"already replied"}
  {"action":"bump","content_key":"bump_1","message_text":"heyy babe","unsend_message_id":"12345"}

Steps:
  0. If action=bump and unsend_message_id provided, DELETE old bump first
  1. If action=ppv or free_media or bump, run vault lookup for content_key
  2. Send message via OF API
  3. Log PPV to Redis if applicable
  4. Clear pending from Railway
  5. Print result summary
"""

import sys
import json
import subprocess
import urllib.request
import os

BASE = "https://app.onlyfansapi.com/api/acct_54e3119e77da4429b6537f7dd2883a05"
AUTH = "Bearer ofapi_bT4J1Er2YBow46EihDfjlSFf5HRmiM15M4DCOoHn7889d8b4"
RAILWAY = "https://s4s-worker-production.up.railway.app"
ACCT = "acct_54e3119e77da4429b6537f7dd2883a05"

def api_call(method, url, data=None):
    body = json.dumps(data).encode() if data else None
    req = urllib.request.Request(url, data=body, method=method)
    req.add_header("Authorization", AUTH)
    req.add_header("Content-Type", "application/json")
    req.add_header("User-Agent", "Mozilla/5.0")
    with urllib.request.urlopen(req, timeout=30) as resp:
        return json.loads(resp.read())

def railway_call(method, url, data=None):
    body = json.dumps(data).encode() if data else None
    req = urllib.request.Request(url, data=body, method=method)
    req.add_header("Content-Type", "application/json")
    with urllib.request.urlopen(req, timeout=15) as resp:
        return json.loads(resp.read())

def vault_lookup(content_key):
    result = subprocess.run(
        ["python3", "research/bianca-vault-lookup.py", content_key],
        capture_output=True, text=True, cwd=os.path.dirname(os.path.abspath(__file__)) + "/.."
    )
    if result.returncode != 0:
        return None
    try:
        return json.loads(result.stdout.strip())
    except:
        # Some vault lookups print just the array
        lines = result.stdout.strip().split("\n")
        for line in lines:
            try:
                return json.loads(line)
            except:
                continue
    return None

def main():
    if len(sys.argv) < 3:
        print("Usage: python3 bianca-send-message.py <fanId> '<json_decision>'")
        sys.exit(1)

    fan_id = sys.argv[1]
    decision = json.loads(sys.argv[2])

    action = decision.get("action", "skip")
    message_text = decision.get("message_text", "")
    content_key = decision.get("content_key")
    price = decision.get("price")

    if action == "skip":
        print(f"SKIP: {decision.get('reason', 'no reason')}")
        return

    # Bump lifecycle: unsend previous bump before sending new one
    unsend_id = decision.get("unsend_message_id")
    if unsend_id:
        try:
            api_call("DELETE", f"{BASE}/chats/{fan_id}/messages/{unsend_id}")
            print(f"UNSENT_BUMP: {unsend_id}")
        except Exception as e:
            print(f"UNSEND_WARN: {e}")

    # Build API payload
    payload = {"text": message_text}

    if action in ("ppv", "free_media", "bump") and content_key:
        vault_data = vault_lookup(content_key)
        if vault_data is None:
            print(f"ERROR: vault lookup failed for {content_key}")
            sys.exit(1)

        # vault_data could be {"mediaFiles": [...], "price": N} or just [...]
        if isinstance(vault_data, dict):
            media_files = vault_data.get("mediaFiles", vault_data.get("media_files", []))
        elif isinstance(vault_data, list):
            media_files = vault_data
        else:
            print(f"ERROR: unexpected vault data format: {vault_data}")
            sys.exit(1)

        payload["mediaFiles"] = media_files
        if action == "ppv" and price:
            payload["price"] = price

    # Send via OF API
    try:
        resp = api_call("POST", f"{BASE}/chats/{fan_id}/messages", payload)
        msg_id = resp.get("id", "unknown")
        print(f"SENT: action={action}, fan={fan_id}, msg_id={msg_id}")
    except urllib.error.HTTPError as e:
        code = e.code
        if code == 429:
            print(f"ERROR_429: Rate limited. STOP.")
            sys.exit(2)
        else:
            print(f"ERROR_{code}: {e.read().decode()[:200]}")
            sys.exit(1)

    # Log PPV to Redis if applicable
    if action == "ppv" and content_key:
        try:
            redis_payload = {"vaultIds": media_files if isinstance(media_files, list) else []}
            railway_call("POST", f"{RAILWAY}/fans/{ACCT}/{fan_id}/sent", redis_payload)
            print(f"REDIS_LOGGED: {content_key} ({len(media_files)} items)")
        except Exception as e:
            print(f"REDIS_WARN: {e}")

    # Clear pending
    try:
        railway_call("POST", f"{RAILWAY}/webhooks/pending/{ACCT}/clear", {"fanIds": [int(fan_id)]})
        print(f"PENDING_CLEARED: {fan_id}")
    except Exception as e:
        print(f"PENDING_WARN: {e}")

    # Summary
    print(f"DONE: {action} | content={content_key or 'none'} | price={price or 0}")

if __name__ == "__main__":
    main()
