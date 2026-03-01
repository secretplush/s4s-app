#!/usr/bin/env python3
"""
Fan Index Backfill Script
Pulls fan/subscriber data from all OnlyFans accounts via OnlyFansAPI.com
and builds a master cross-account fan index.
"""
import json
import os
import sys
import time
import requests
from datetime import datetime, timezone
from collections import defaultdict

API_BASE = "https://app.onlyfansapi.com/api"
API_KEY = "ofapi_bT4J1Er2YBow46EihDfjlSFf5HRmiM15M4DCOoHn7889d8b4"
HEADERS = {"Authorization": f"Bearer {API_KEY}"}
OUTPUT_DIR = os.path.join(os.path.dirname(__file__), "fan-index")
RATE_LIMIT_SLEEP = 0.5  # seconds between API calls
api_calls = 0

def api_get(url, params=None):
    global api_calls
    time.sleep(RATE_LIMIT_SLEEP)
    api_calls += 1
    r = requests.get(url, headers=HEADERS, params=params)
    if r.status_code == 429:
        print("  ⚠️ Rate limited, sleeping 30s...")
        time.sleep(30)
        return api_get(url, params)
    return r

def get_accounts():
    r = api_get(f"{API_BASE}/accounts")
    r.raise_for_status()
    accounts = r.json()
    return [a for a in accounts if a.get("is_authenticated")]

def get_fans_page(account_id, offset=0, limit=10):
    """Get a page of fans (active subscribers) for an account."""
    r = api_get(f"{API_BASE}/{account_id}/chats", params={
        "limit": limit, "offset": offset, "skip_users": "all", "order": "recent"
    })
    if r.status_code == 404:
        return [], False
    r.raise_for_status()
    data = r.json()
    
    if isinstance(data, dict) and "data" in data:
        items = data["data"]
        if isinstance(items, dict):
            items = items.get("list", [])
        return items, len(items) >= limit
    elif isinstance(data, list):
        return data, len(data) >= limit
    return [], False

def get_earning_stats(account_id):
    """Try to get earning statistics for the account."""
    r = api_get(f"{API_BASE}/{account_id}/payouts/transactions", params={"limit": 100})
    if r.status_code != 200:
        return None
    return r.json()

def get_active_fans(account_id, offset=0, limit=100):
    """Try the fans-specific endpoints from the docs."""
    # Try /fans endpoint variants
    for endpoint in ["fans", "subscriptions/subscribers"]:
        r = api_get(f"{API_BASE}/{account_id}/{endpoint}", params={
            "limit": limit, "offset": offset
        })
        if r.status_code == 200:
            data = r.json()
            if isinstance(data, dict) and "data" in data:
                items = data["data"]
                if isinstance(items, dict):
                    has_more = items.get("hasMore", False)
                    items = items.get("list", [])
                    return items, has_more, endpoint
                elif isinstance(items, list):
                    return items, len(items) >= limit, endpoint
            elif isinstance(data, list):
                return data, len(data) >= limit, endpoint
    return [], False, None

def extract_fan_data(chat_item, model_username):
    """Extract fan info from a chat item."""
    fan = chat_item.get("fan") or chat_item.get("withUser") or {}
    fan_id = fan.get("id")
    if not fan_id:
        return None
    
    sub_data = fan.get("subscribedOnData") or {}
    
    return {
        "fanId": str(fan_id),
        "username": f"@{fan.get('username', '')}",
        "displayName": fan.get("name", ""),
        "model": model_username,
        "totalSpent": sub_data.get("totalSumm", 0),
        "tipsSumm": sub_data.get("tipsSumm", 0),
        "messagesSumm": sub_data.get("messagesSumm", 0),
        "postsSumm": sub_data.get("postsSumm", 0),
        "subscribesSumm": sub_data.get("subscribesSumm", 0),
        "subDate": sub_data.get("subscribeAt"),
        "expireDate": sub_data.get("expiredAt"),
        "lastActive": sub_data.get("lastActivity"),
        "status": sub_data.get("status", "unknown"),
        "isSubscribed": not fan.get("subscribedOnExpiredNow", True),
        "duration": sub_data.get("duration", ""),
    }

def extract_fan_from_fan_list(fan_item, model_username):
    """Extract fan info from fans list endpoint."""
    fan_id = fan_item.get("id")
    if not fan_id:
        return None
    
    sub_data = fan_item.get("subscribedOnData") or {}
    
    return {
        "fanId": str(fan_id),
        "username": f"@{fan_item.get('username', '')}",
        "displayName": fan_item.get("name", ""),
        "model": model_username,
        "totalSpent": sub_data.get("totalSumm", 0),
        "tipsSumm": sub_data.get("tipsSumm", 0),
        "messagesSumm": sub_data.get("messagesSumm", 0),
        "postsSumm": sub_data.get("postsSumm", 0),
        "subscribesSumm": sub_data.get("subscribesSumm", 0),
        "subDate": sub_data.get("subscribeAt"),
        "expireDate": sub_data.get("expiredAt"),
        "lastActive": sub_data.get("lastActivity"),
        "status": sub_data.get("status", "unknown"),
        "isSubscribed": not fan_item.get("subscribedOnExpiredNow", True),
        "duration": sub_data.get("duration", ""),
    }

def process_account(account, test_mode=False):
    """Process a single account and return fan records."""
    acct_id = account["id"]
    username = account.get("onlyfans_username", acct_id)
    display = account.get("display_name", username)
    
    print(f"\n📋 Processing: {display} (@{username}) [{acct_id}]")
    
    fans = []
    
    # First try the fans endpoint (has spend data)
    print(f"  Trying fans endpoint...")
    offset = 0
    fan_endpoint_found = None
    while True:
        items, has_more, endpoint = get_active_fans(acct_id, offset=offset, limit=100)
        if endpoint and not fan_endpoint_found:
            fan_endpoint_found = endpoint
            print(f"  ✅ Found working endpoint: {endpoint}")
        
        if not items:
            break
            
        for item in items:
            fan_data = extract_fan_from_fan_list(item, username)
            if fan_data:
                fans.append(fan_data)
        
        print(f"  Fetched {len(fans)} fans so far (offset={offset})...")
        
        if not has_more or (test_mode and offset >= 200):
            break
        offset += len(items)
    
    # If fans endpoint didn't work, fall back to chats
    if not fans:
        print(f"  Fans endpoint unavailable, falling back to chats...")
        offset = 0
        while True:
            items, has_more = get_fans_page(acct_id, offset=offset, limit=10)
            if not items:
                break
            
            for item in items:
                fan_data = extract_fan_data(item, username)
                if fan_data:
                    fans.append(fan_data)
            
            print(f"  Fetched {len(fans)} fans from chats (offset={offset})...")
            
            if len(items) < 10 or (test_mode and offset >= 200):
                break
            offset += len(items)
    
    print(f"  ✅ Total fans for {display}: {len(fans)}")
    
    # Save raw per-account data
    outfile = os.path.join(OUTPUT_DIR, f"{username}.jsonl")
    with open(outfile, "w") as f:
        for fan in fans:
            f.write(json.dumps(fan) + "\n")
    
    return fans

def build_master_index(all_fans_by_account):
    """Merge per-account fan data into a master cross-account index."""
    master = {}  # fanId -> master record
    
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
            
            record = master[fid]
            # Update display name if we have a better one
            if fan["displayName"] and not record["displayName"]:
                record["displayName"] = fan["displayName"]
            
            # Add model data
            record["models"][fan["model"]] = {
                "totalSpent": fan["totalSpent"],
                "tipsSumm": fan["tipsSumm"],
                "messagesSumm": fan["messagesSumm"],
                "postsSumm": fan["postsSumm"],
                "subscribesSumm": fan["subscribesSumm"],
                "subDate": fan["subDate"],
                "expireDate": fan["expireDate"],
                "lastActive": fan["lastActive"],
                "status": fan["status"],
                "isSubscribed": fan["isSubscribed"],
                "duration": fan["duration"],
            }
            
            # Update aggregates
            record["agencyTotalSpent"] = sum(
                m.get("totalSpent", 0) for m in record["models"].values()
            )
            record["totalModels"] = len(record["models"])
            
            # Update firstSeen/lastSeen
            if fan["subDate"]:
                if not record["firstSeen"] or fan["subDate"] < record["firstSeen"]:
                    record["firstSeen"] = fan["subDate"]
            if fan["lastActive"]:
                if not record["lastSeen"] or fan["lastActive"] > record["lastSeen"]:
                    record["lastSeen"] = fan["lastActive"]
    
    return master

def upload_to_gdrive(local_dir):
    """Upload the fan index to Google Drive using service account."""
    try:
        from google.oauth2 import service_account
        from googleapiclient.discovery import build
        from googleapiclient.http import MediaFileUpload
        
        SA_FILE = os.path.join(os.path.dirname(__file__), "gcp-service-account.json")
        DRIVE_ID = "0AKhuGgNVDSBnUk9PVA"
        
        if not os.path.exists(SA_FILE):
            print("⚠️ No service account file found, skipping Drive upload")
            return
        
        creds = service_account.Credentials.from_service_account_file(
            SA_FILE, scopes=["https://www.googleapis.com/auth/drive"]
        )
        service = build("drive", "v3", credentials=creds)
        
        # Find or create fan-index folder
        results = service.files().list(
            q=f"name='fan-index' and mimeType='application/vnd.google-apps.folder' and trashed=false",
            driveId=DRIVE_ID, includeItemsFromAllDrives=True,
            supportsAllDrives=True, corpora="drive"
        ).execute()
        
        folders = results.get("files", [])
        if folders:
            folder_id = folders[0]["id"]
        else:
            folder_meta = {
                "name": "fan-index",
                "mimeType": "application/vnd.google-apps.folder",
                "parents": [DRIVE_ID]
            }
            folder = service.files().create(
                body=folder_meta, supportsAllDrives=True, fields="id"
            ).execute()
            folder_id = folder["id"]
        
        # Upload files
        for fname in os.listdir(local_dir):
            fpath = os.path.join(local_dir, fname)
            if not os.path.isfile(fpath):
                continue
            
            media = MediaFileUpload(fpath, mimetype="application/json")
            
            # Check if file exists
            existing = service.files().list(
                q=f"name='{fname}' and '{folder_id}' in parents and trashed=false",
                driveId=DRIVE_ID, includeItemsFromAllDrives=True,
                supportsAllDrives=True, corpora="drive"
            ).execute().get("files", [])
            
            if existing:
                service.files().update(
                    fileId=existing[0]["id"], media_body=media,
                    supportsAllDrives=True
                ).execute()
                print(f"  📤 Updated {fname} on Drive")
            else:
                service.files().create(
                    body={"name": fname, "parents": [folder_id]},
                    media_body=media, supportsAllDrives=True, fields="id"
                ).execute()
                print(f"  📤 Uploaded {fname} to Drive")
        
        print("✅ Google Drive upload complete")
    except ImportError:
        print("⚠️ google-api-python-client not installed, skipping Drive upload")
        print("  Install with: pip3 install google-api-python-client google-auth")
    except Exception as e:
        print(f"⚠️ Drive upload failed: {e}")

def main():
    test_mode = "--test" in sys.argv
    single_account = None
    for arg in sys.argv[1:]:
        if arg.startswith("--account="):
            single_account = arg.split("=", 1)[1]
    
    os.makedirs(OUTPUT_DIR, exist_ok=True)
    
    print("=" * 60)
    print("🔍 Fan Index Backfill")
    print(f"   Mode: {'TEST (1 account, max 200 fans)' if test_mode else 'FULL'}")
    print(f"   Output: {OUTPUT_DIR}")
    print("=" * 60)
    
    # Get accounts
    print("\n📡 Fetching accounts...")
    accounts = get_accounts()
    print(f"   Found {len(accounts)} authenticated accounts")
    
    if single_account:
        accounts = [a for a in accounts if a["id"] == single_account or a.get("onlyfans_username") == single_account]
        if not accounts:
            print(f"❌ Account '{single_account}' not found")
            return
    
    if test_mode:
        accounts = accounts[:1]
        print(f"   Test mode: using only {accounts[0].get('display_name', accounts[0]['id'])}")
    
    # Process each account
    all_fans = {}
    total_fans = 0
    
    for i, account in enumerate(accounts):
        print(f"\n{'='*40}")
        print(f"  Account {i+1}/{len(accounts)}")
        
        fans = process_account(account, test_mode=test_mode)
        username = account.get("onlyfans_username", account["id"])
        all_fans[username] = fans
        total_fans += len(fans)
        
        print(f"\n📊 Progress: {i+1}/{len(accounts)} accounts, {total_fans} total fans, {api_calls} API calls")
    
    # Build master index
    print("\n\n🔨 Building master index...")
    master = build_master_index(all_fans)
    
    # Sort by agency total spend
    sorted_fans = sorted(master.values(), key=lambda x: x["agencyTotalSpent"], reverse=True)
    
    # Save master index
    master_file = os.path.join(OUTPUT_DIR, "master-index.json")
    with open(master_file, "w") as f:
        json.dump(sorted_fans, f, indent=2)
    
    # Print summary
    print("\n" + "=" * 60)
    print("📊 BACKFILL COMPLETE")
    print(f"   Accounts processed: {len(accounts)}")
    print(f"   Unique fans: {len(master)}")
    print(f"   Total API calls: {api_calls}")
    
    # Cross-model fans
    cross_model = [f for f in sorted_fans if f["totalModels"] > 1]
    print(f"   Cross-model fans: {len(cross_model)}")
    
    # Top spenders
    print("\n💰 Top 10 Spenders (Agency-wide):")
    for fan in sorted_fans[:10]:
        models = ", ".join(fan["models"].keys())
        print(f"   ${fan['agencyTotalSpent']:,.2f} - {fan['displayName']} ({fan['username']}) [{fan['totalModels']} models: {models}]")
    
    if cross_model:
        print(f"\n🔄 Cross-Model Fans (subbed to 2+ models):")
        for fan in cross_model[:10]:
            models = ", ".join(fan["models"].keys())
            print(f"   {fan['displayName']} ({fan['username']}) - ${fan['agencyTotalSpent']:,.2f} [{models}]")
    
    # Upload to Google Drive
    print("\n📤 Uploading to Google Drive...")
    upload_to_gdrive(OUTPUT_DIR)
    
    print(f"\n✅ All data saved to {OUTPUT_DIR}/")

if __name__ == "__main__":
    main()
