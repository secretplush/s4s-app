#!/usr/bin/env python3
"""Scan all accounts for stale S4S promo posts (ghost tags that weren't deleted)"""
import json, subprocess, sys

BASE = "https://app.onlyfansapi.com/api"
AUTH = "Bearer ofapi_bT4J1Er2YBow46EihDfjlSFf5HRmiM15M4DCOoHn7889d8b4"

def api(method, url):
    r = subprocess.run(["curl", "-s", "-X", method, "-H", f"Authorization: {AUTH}", url], 
                      capture_output=True, text=True, timeout=30)
    return json.loads(r.stdout) if r.stdout.strip() else None

# Get all accounts
accounts = api("GET", f"{BASE}/accounts")
authed = [(a["id"], a.get("display_name","?")) for a in accounts if a.get("is_authenticated")]
print(f"Scanning {len(authed)} accounts for stale promos...\n", flush=True)

total_stale = 0
total_deleted = 0

for acct_id, name in sorted(authed, key=lambda x: x[1]):
    data = api("GET", f"{BASE}/{acct_id}/posts?limit=50")
    if not data:
        continue
    posts = data.get("data", {}).get("list", [])
    
    stale = []
    for p in posts:
        text = p.get("rawText", "") or ""
        pid = p.get("id")
        pinned = p.get("isPinned", False)
        has_expiry = bool(p.get("expiredAt") or p.get("expiresAt"))
        has_mention = "@" in text
        is_promo = has_mention and any(w in text.lower() for w in ["follow", "love", "check", "show", "trust", "prettiest", "giving", "bad omg", "go ", "free rn", "birthday"])
        
        # Stale = has @mention promo text, NOT pinned, NO expiry
        if is_promo and not pinned and not has_expiry:
            created = p.get("postedAt", "?")[:16]
            stale.append((pid, created, text[:60]))
    
    if stale:
        print(f"⚠️  {name}: {len(stale)} stale promo(s)", flush=True)
        for pid, created, text in stale:
            print(f"   {pid} | {created} | {text}")
            # Delete it
            result = api("DELETE", f"{BASE}/{acct_id}/posts/{pid}")
            success = result.get("data", {}).get("success") if result else False
            status = "✅" if success else "❌"
            print(f"   {status} Deleted {pid}")
            if success:
                total_deleted += 1
        total_stale += len(stale)
        print(flush=True)

print(f"\n=== DONE === {total_stale} stale promos found, {total_deleted} deleted", flush=True)
