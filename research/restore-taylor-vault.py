#!/usr/bin/env python3
"""
Restore taylorskully's vault mappings by:
1. For each girl, create temp post on a donor account using existing vault_id → get CDN URL
2. Download the image
3. Upload to Taylor's vault (upload media → create post → extract vault_id → delete post)
4. Save vault mappings to Redis
"""

import requests
import json
import time
import sys

OF_API_BASE = "https://app.onlyfansapi.com/api"
OF_API_KEY = "ofapi_bT4J1Er2YBow46EihDfjlSFf5HRmiM15M4DCOoHn7889d8b4"
REDIS_URL = "https://major-spider-50836.upstash.io"
REDIS_TOKEN = "AcaUAAIncDI3NjBkZmQ2YzI1MWY0MmQ2YjU0MzJkMDM5ODNiNjI2Y3AyNTA4MzY"
TAYLOR_ACCT = "acct_2f5014266cb04e8a9693b5d067d5c9bb"
DONOR_ACCT = "acct_54e3119e77da4429b6537f7dd2883a05"  # biancaawoods
DONOR_USERNAME = "biancaawoods"

headers = {"Authorization": f"Bearer {OF_API_KEY}"}

REDIS_HEADERS = {"Authorization": f"Bearer {REDIS_TOKEN}", "Content-Type": "application/json"}

def redis_cmd(*args):
    r = requests.post(REDIS_URL, headers=REDIS_HEADERS, json=list(args))
    return r.json().get("result")

def get_vault_mappings():
    return json.loads(redis_cmd("GET", "vault_mappings"))

def save_vault_mappings(data):
    return redis_cmd("SET", "vault_mappings", json.dumps(data))

def save_vault_mappings_v2(data):
    return redis_cmd("SET", "vault_mappings_v2", json.dumps(data))

def get_vault_mappings_v2():
    result = redis_cmd("GET", "vault_mappings_v2")
    return json.loads(result) if result else {}

def get_image_from_vault(donor_acct, vault_id):
    """Create temp post on donor account, get CDN URL, download image, delete post."""
    # Create temp post
    r = requests.post(f"{OF_API_BASE}/{donor_acct}/posts", headers={**headers, "Content-Type": "application/json"},
                      json={"text": "temp", "mediaFiles": [vault_id]})
    if r.status_code != 200:
        print(f"  ❌ Failed to create temp post: {r.text}")
        return None, None
    
    data = r.json().get("data", r.json())
    post_id = data.get("id")
    
    if not data.get("media") or len(data["media"]) == 0:
        print(f"  ❌ No media in temp post")
        if post_id:
            requests.delete(f"{OF_API_BASE}/{donor_acct}/posts/{post_id}", headers=headers)
        return None, None
    
    media = data["media"][0]
    image_url = media.get("files", {}).get("full", {}).get("url")
    
    if not image_url:
        print(f"  ❌ No image URL in media")
        if post_id:
            requests.delete(f"{OF_API_BASE}/{donor_acct}/posts/{post_id}", headers=headers)
        return None, None
    
    # Download image
    img_r = requests.get(image_url)
    if img_r.status_code != 200:
        print(f"  ❌ Failed to download image: {img_r.status_code}")
        requests.delete(f"{OF_API_BASE}/{donor_acct}/posts/{post_id}", headers=headers)
        return None, None
    
    image_data = img_r.content
    
    # Delete temp post
    requests.delete(f"{OF_API_BASE}/{donor_acct}/posts/{post_id}", headers=headers)
    
    return image_data, "image/jpeg"

def upload_to_taylor(image_data, source_username):
    """Upload image to Taylor's vault and return vault_id."""
    # Step 1: Upload media
    files = {"file": (f"{source_username}_promo.jpg", image_data, "image/jpeg")}
    r = requests.post(f"{OF_API_BASE}/{TAYLOR_ACCT}/media/upload", headers=headers, files=files)
    if r.status_code != 200:
        print(f"  ❌ Upload failed: {r.text}")
        return None
    
    upload_data = r.json()
    media_id = upload_data.get("prefixed_id") or upload_data.get("id") or upload_data.get("media_id")
    if not media_id:
        print(f"  ❌ No media ID: {upload_data}")
        return None
    
    # Wait for processing
    time.sleep(3)
    
    # Step 2: Create post
    r = requests.post(f"{OF_API_BASE}/{TAYLOR_ACCT}/posts", headers={**headers, "Content-Type": "application/json"},
                      json={"text": f"@{source_username}", "mediaFiles": [media_id]})
    if r.status_code != 200:
        print(f"  ❌ Post creation failed: {r.text}")
        return None
    
    post_data = r.json().get("data", r.json())
    post_id = post_data.get("id")
    
    vault_id = None
    if post_data.get("media") and len(post_data["media"]) > 0:
        m = post_data["media"][0]
        vault_id = str(m.get("id") or m.get("vault_id") or "")
    
    # Step 3: Delete post
    if post_id:
        time.sleep(2)
        requests.delete(f"{OF_API_BASE}/{TAYLOR_ACCT}/posts/{post_id}", headers=headers)
    
    return vault_id if vault_id else None

def main():
    print("🔧 Restoring taylorskully vault mappings...")
    
    # Get current vault mappings
    v1 = get_vault_mappings()
    v2 = get_vault_mappings_v2()
    
    # Get donor's targets (biancaawoods has photos for ~70 girls)
    donor_targets = v1.get(DONOR_USERNAME, {})
    print(f"📦 Donor ({DONOR_USERNAME}) has {len(donor_targets)} targets to distribute")
    
    # Track results
    taylor_v1 = {}
    taylor_v2 = {}
    success = 0
    failed = 0
    
    targets = list(donor_targets.items())
    for i, (target, donor_vault_id) in enumerate(targets):
        print(f"\n[{i+1}/{len(targets)}] {target} (donor vault_id: {donor_vault_id})")
        
        # Step 1: Get image from donor's vault
        image_data, mime = get_image_from_vault(DONOR_ACCT, donor_vault_id)
        if not image_data:
            failed += 1
            continue
        print(f"  ✅ Downloaded {len(image_data)//1024}KB")
        
        # Rate limit - wait between operations
        time.sleep(2)
        
        # Step 2: Upload to Taylor's vault
        vault_id = upload_to_taylor(image_data, target)
        if not vault_id:
            failed += 1
            continue
        
        print(f"  ✅ Taylor vault_id: {vault_id}")
        taylor_v1[target] = vault_id
        taylor_v2[target] = {"ghost": [vault_id], "pinned": [vault_id], "massDm": [vault_id]}
        success += 1
        
        # Save progress every 5 models
        if success % 5 == 0:
            v1["taylorskully"] = taylor_v1
            save_vault_mappings(v1)
            v2["taylorskully"] = taylor_v2
            save_vault_mappings_v2(v2)
            print(f"  💾 Saved progress ({success} done)")
        
        # Rate limit
        time.sleep(3)
    
    # Final save
    v1["taylorskully"] = taylor_v1
    save_vault_mappings(v1)
    v2["taylorskully"] = taylor_v2
    save_vault_mappings_v2(v2)
    
    print(f"\n{'='*50}")
    print(f"✅ Success: {success}")
    print(f"❌ Failed: {failed}")
    print(f"Total targets: {len(targets)}")

if __name__ == "__main__":
    main()
