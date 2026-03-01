#!/usr/bin/env python3
"""
Fan Index Backfill v2 — uses /fans/latest (97 fans/page vs 10 via /chats)
"""
import json, os, sys, time, requests
from collections import defaultdict

API_BASE = "https://app.onlyfansapi.com/api"
API_KEY = "ofapi_bT4J1Er2YBow46EihDfjlSFf5HRmiM15M4DCOoHn7889d8b4"
HEADERS = {"Authorization": f"Bearer {API_KEY}"}
OUTPUT_DIR = os.path.join(os.path.dirname(__file__), "fan-index")
api_calls = 0

def api_get(url, params=None):
    global api_calls
    api_calls += 1
    try:
        r = requests.get(url, headers=HEADERS, params=params, timeout=30)
        if r.status_code == 429:
            print("  ⚠️ Rate limited, sleeping 30s...")
            time.sleep(30)
            return api_get(url, params)
        return r
    except Exception as e:
        print(f"  ❌ Request failed: {e}, retrying in 5s...")
        time.sleep(5)
        return api_get(url, params)

def get_accounts():
    r = api_get(f"{API_BASE}/accounts")
    r.raise_for_status()
    return [a for a in r.json() if a.get("is_authenticated")]

def get_all_fans(account_id):
    """Get ALL fans using /fans/latest — ~97 per page with spend data."""
    fans = []
    offset = 0
    retries = 0
    while True:
        r = api_get(f"{API_BASE}/{account_id}/fans/latest", params={"limit": 100, "offset": offset})
        if r.status_code == 429:
            retries += 1
            if retries > 3:
                print(f"  ⚠️ Too many rate limits, returning {len(fans)} fans so far")
                break
            continue
        if r.status_code != 200:
            # Retry once before giving up
            time.sleep(2)
            r = api_get(f"{API_BASE}/{account_id}/fans/latest", params={"limit": 100, "offset": offset})
            if r.status_code != 200:
                print(f"  ⚠️ fans/latest returned {r.status_code}, got {len(fans)} fans before failure")
                break
        
        retries = 0
        data = r.json().get("data", {})
        users = data.get("users", [])
        if not users:
            break
        
        fans.extend(users)
        has_more = data.get("hasMore", False)
        print(f"  Fetched {len(fans)} fans (offset={offset}, page={len(users)})...")
        
        if not has_more or len(users) < 10:
            break
        offset += len(users)
    
    return fans

def get_all_fans_via_chats(account_id):
    """Fallback: paginate through /chats (10 per page)."""
    fans = []
    offset = 0
    while True:
        r = api_get(f"{API_BASE}/{account_id}/chats", params={"limit": 10, "offset": offset, "skip_users": "all", "order": "recent"})
        if r.status_code != 200:
            break
        data = r.json()
        items = data.get("data", data)
        if isinstance(items, dict):
            items = items.get("list", [])
        if not items:
            break
        
        # Extract fan objects from chat items
        for item in items:
            fan = item.get("fan", {})
            if fan and fan.get("id"):
                fans.append(fan)
        
        print(f"  [chats] Fetched {len(fans)} fans (offset={offset})...")
        if len(items) < 10:
            break
        offset += len(items)
    
    return fans

def extract_fan(user, model_username):
    """Extract normalized fan record from API user object."""
    sod = user.get("subscribedOnData") or {}
    return {
        "fanId": str(user.get("id", "")),
        "username": f"@{user.get('username', '')}",
        "displayName": user.get("name", ""),
        "model": model_username,
        "totalSpent": sod.get("totalSumm", 0),
        "tipsSumm": sod.get("tipsSumm", 0),
        "messagesSumm": sod.get("messagesSumm", 0),
        "postsSumm": sod.get("postsSumm", 0),
        "subscribesSumm": sod.get("subscribesSumm", 0),
        "streamsSumm": sod.get("streamsSumm", 0),
        "subDate": sod.get("subscribeAt"),
        "expireDate": sod.get("expiredAt"),
        "lastActive": user.get("lastSeen"),
        "status": sod.get("status"),
        "isSubscribed": not user.get("subscribedOnExpiredNow", True),
        "duration": sod.get("duration", ""),
    }

def build_master_index(all_fans_by_account):
    """Merge per-account fan data into master cross-account index."""
    master = {}
    
    for username, fans in all_fans_by_account.items():
        for fan in fans:
            fid = fan["fanId"]
            if fid not in master:
                master[fid] = {
                    "fanId": fid,
                    "username": fan["username"],
                    "displayName": fan["displayName"],
                    "models": {},
                    "agencyTotalSpent": 0,
                    "totalModels": 0,
                    "firstSeen": None,
                    "lastSeen": None,
                }
            
            rec = master[fid]
            if fan["displayName"] and not rec["displayName"]:
                rec["displayName"] = fan["displayName"]
            
            rec["models"][fan["model"]] = {
                "totalSpent": fan["totalSpent"],
                "tipsSumm": fan["tipsSumm"],
                "messagesSumm": fan["messagesSumm"],
                "postsSumm": fan["postsSumm"],
                "subscribesSumm": fan["subscribesSumm"],
                "streamsSumm": fan.get("streamsSumm", 0),
                "subDate": fan["subDate"],
                "expireDate": fan["expireDate"],
                "lastActive": fan["lastActive"],
                "status": fan["status"],
                "isSubscribed": fan["isSubscribed"],
                "duration": fan["duration"],
            }
            
            rec["agencyTotalSpent"] = sum(m.get("totalSpent", 0) for m in rec["models"].values())
            rec["totalModels"] = len(rec["models"])
            
            if fan["subDate"]:
                if not rec["firstSeen"] or fan["subDate"] < rec["firstSeen"]:
                    rec["firstSeen"] = fan["subDate"]
            if fan["lastActive"]:
                if not rec["lastSeen"] or fan["lastActive"] > rec["lastSeen"]:
                    rec["lastSeen"] = fan["lastActive"]
    
    return master

def main():
    os.makedirs(OUTPUT_DIR, exist_ok=True)
    
    print("=" * 60)
    print("🔍 Fan Index Backfill v2 (fans/latest — ~97/page)")
    print(f"   Output: {OUTPUT_DIR}")
    print("=" * 60)
    
    accounts = get_accounts()
    print(f"\n📡 Found {len(accounts)} authenticated accounts")
    
    all_fans = {}
    total_fans = 0
    total_records = 0
    
    for i, acct in enumerate(accounts):
        acct_id = acct["id"]
        username = acct.get("onlyfans_username", acct_id)
        display = acct.get("display_name", username)
        
        print(f"\n{'='*40}")
        print(f"  Account {i+1}/{len(accounts)}: {display} (@{username})")
        
        # Resume support: skip if already scraped with decent count
        existing_file = os.path.join(OUTPUT_DIR, f"{username}.jsonl")
        if os.path.exists(existing_file):
            line_count = sum(1 for _ in open(existing_file))
            if line_count > 100:
                print(f"  ⏭️ Already have {line_count} fans, skipping (resume mode)")
                fans = []
                with open(existing_file) as f:
                    for line in f:
                        fans.append(json.loads(line))
                all_fans[username] = fans
                total_fans += len(fans)
                continue
        
        raw_fans = get_all_fans(acct_id)
        fans = []
        for u in raw_fans:
            fan_data = extract_fan(u, username)
            if fan_data["fanId"]:
                fans.append(fan_data)
        
        # Save per-account
        outfile = os.path.join(OUTPUT_DIR, f"{username}.jsonl")
        with open(outfile, "w") as f:
            for fan in fans:
                f.write(json.dumps(fan) + "\n")
        
        all_fans[username] = fans
        total_fans += len(fans)
        total_records += len(raw_fans)
        
        print(f"  ✅ {len(fans)} fans saved | Running total: {total_fans} fans, {api_calls} API calls")
    
    # Build master index
    print(f"\n\n🔨 Building master index...")
    master = build_master_index(all_fans)
    sorted_fans = sorted(master.values(), key=lambda x: x["agencyTotalSpent"], reverse=True)
    
    master_file = os.path.join(OUTPUT_DIR, "master-index.json")
    with open(master_file, "w") as f:
        json.dump(sorted_fans, f, indent=2)
    
    # Summary
    cross_model = [f for f in sorted_fans if f["totalModels"] > 1]
    
    print("\n" + "=" * 60)
    print("📊 BACKFILL COMPLETE")
    print(f"   Accounts: {len(accounts)}")
    print(f"   Unique fans: {len(master)}")
    print(f"   Total records: {total_fans}")
    print(f"   API calls: {api_calls}")
    print(f"   Cross-model fans: {len(cross_model)}")
    
    print("\n💰 Top 20 Spenders (Agency-wide):")
    for fan in sorted_fans[:20]:
        models = ", ".join(fan["models"].keys())
        print(f"   ${fan['agencyTotalSpent']:,.2f} - {fan['displayName']} ({fan['username']}) [{fan['totalModels']} models: {models}]")
    
    if cross_model:
        print(f"\n🔄 Top Cross-Model Fans:")
        for fan in sorted(cross_model, key=lambda x: x["totalModels"], reverse=True)[:20]:
            models = ", ".join(fan["models"].keys())
            print(f"   {fan['totalModels']} models, ${fan['agencyTotalSpent']:,.2f} - {fan['displayName']} ({fan['username']}) [{models}]")
    
    print(f"\n✅ Master index: {master_file} ({len(master)} fans)")

if __name__ == "__main__":
    main()
