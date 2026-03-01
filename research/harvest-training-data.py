#!/usr/bin/env python3
"""
Training Data Harvester — Pull conversation + transaction data from ALL OF API accounts.
Outputs to JSONL files matching Bianca daemon format for unified analysis.

Usage:
  python3 harvest-training-data.py                    # All 65 accounts, top 50 spenders each
  python3 harvest-training-data.py --account acct_xxx # Single account
  python3 harvest-training-data.py --top 10           # Top 10 accounts by revenue
  python3 harvest-training-data.py --limit 20         # Top 20 fans per account
"""

import json, os, sys, time, re, argparse
from urllib.request import Request, urlopen
from urllib.error import HTTPError
from datetime import datetime

DIR = os.path.dirname(os.path.abspath(__file__))
API_BASE = "https://app.onlyfansapi.com/api"
API_KEY = "Bearer ofapi_bT4J1Er2YBow46EihDfjlSFf5HRmiM15M4DCOoHn7889d8b4"

# Output files
CONVO_LOG = os.path.join(DIR, "training-conversations.jsonl")
OUTCOME_LOG = os.path.join(DIR, "training-outcomes.jsonl")
SUMMARY_FILE = os.path.join(DIR, "training-summary.json")

# Rate limiting
REQUEST_DELAY = 0.3  # seconds between API calls (avoid 429s)
last_request = 0

def api_get(path, params=None):
    """GET from OF API with rate limiting."""
    global last_request
    elapsed = time.time() - last_request
    if elapsed < REQUEST_DELAY:
        time.sleep(REQUEST_DELAY - elapsed)
    
    url = f"{API_BASE}/{path}"
    if params:
        qs = "&".join(f"{k}={v}" for k, v in params.items())
        url += f"?{qs}"
    
    req = Request(url, headers={
        "Authorization": API_KEY,
        "Accept": "application/json",
        "User-Agent": "PlushHarvester/1.0",
    })
    try:
        with urlopen(req, timeout=30) as resp:
            last_request = time.time()
            return json.loads(resp.read())
    except HTTPError as e:
        if e.code == 429:
            print(f"  429 rate limited — waiting 60s")
            time.sleep(60)
            return api_get(path, params)
        elif e.code == 404:
            return None
        else:
            print(f"  HTTP {e.code}: {path}")
            return None
    except Exception as e:
        print(f"  Error: {e}")
        return None


def get_accounts():
    """Get all connected accounts."""
    data = api_get("accounts")
    if isinstance(data, list):
        return data
    return data.get("data", []) if isinstance(data, dict) else []


def get_chats(account_id, limit=50):
    """Get chat list for an account, ordered by recent activity."""
    data = api_get(f"{account_id}/chats", {"limit": limit})
    if not data:
        return []
    if isinstance(data, list):
        return data
    return data.get("data", []) if isinstance(data, dict) else []


def get_messages(account_id, fan_id, limit=100):
    """Get messages for a specific chat. Returns newest first."""
    all_msgs = []
    offset = 0
    while len(all_msgs) < limit:
        batch_limit = min(50, limit - len(all_msgs))
        data = api_get(f"{account_id}/chats/{fan_id}/messages", 
                       {"limit": batch_limit, "offset": offset})
        if not data:
            break
        
        msgs = data
        if isinstance(data, dict):
            msgs = data.get("data", data.get("list", []))
        if not isinstance(msgs, list) or not msgs:
            break
        
        all_msgs.extend(msgs)
        offset += len(msgs)
        
        # Check if there's more
        if isinstance(data, dict) and not data.get("hasMore", True):
            break
        if len(msgs) < batch_limit:
            break
    
    return all_msgs


def get_transactions(account_id, limit=500):
    """Get transactions for an account (paginated)."""
    all_txs = []
    marker = None
    while len(all_txs) < limit:
        params = {"limit": 50}
        if marker:
            params["marker"] = marker
        
        data = api_get(f"{account_id}/transactions", params)
        if not data or not isinstance(data, dict):
            break
        
        inner = data.get("data", data)
        txs = inner.get("list", [])
        if not txs:
            break
        
        all_txs.extend(txs)
        
        if not inner.get("hasMore"):
            break
        marker = inner.get("nextMarker")
        if not marker:
            break
    
    return all_txs


def clean_html(text):
    """Strip HTML tags."""
    if not text:
        return ""
    return re.sub(r"<[^>]+>", "", text).strip()


def extract_model_id(account_data):
    """Get OF user ID for the model (to distinguish model vs fan messages)."""
    ud = account_data.get("onlyfans_user_data", {})
    return ud.get("id") or int(account_data.get("onlyfans_id", 0))


def harvest_account(account, fan_limit=50, msg_limit=100):
    """Harvest conversation + transaction data from one account."""
    acct_id = account["id"]
    username = account.get("onlyfans_username") or account.get("display_name") or acct_id
    model_of_id = extract_model_id(account)
    
    print(f"\n{'='*60}")
    print(f"Harvesting: {username} (model OF ID: {model_of_id})")
    print(f"{'='*60}")
    
    # Get transactions first — build fan spend map
    print(f"  Fetching transactions...")
    txs = get_transactions(acct_id, limit=500)
    print(f"  Got {len(txs)} transactions")
    
    fan_spend = {}  # fan_id -> total spent
    fan_tx_list = {}  # fan_id -> list of tx details
    for tx in txs:
        user = tx.get("user", {})
        fan_id = user.get("id")
        if not fan_id:
            continue
        amount = tx.get("amount", 0)
        fan_spend[fan_id] = fan_spend.get(fan_id, 0) + amount
        if fan_id not in fan_tx_list:
            fan_tx_list[fan_id] = []
        fan_tx_list[fan_id].append({
            "amount": amount,
            "net": tx.get("net", 0),
            "ts": tx.get("createdAt", ""),
            "desc": clean_html(tx.get("description", "")),
        })
    
    total_revenue = sum(fan_spend.values())
    unique_buyers = len(fan_spend)
    print(f"  Revenue: ${total_revenue:.2f} from {unique_buyers} buyers")
    
    # Get chats — focus on fans who spent money
    print(f"  Fetching top {fan_limit} chats...")
    chats = get_chats(acct_id, limit=fan_limit)
    print(f"  Got {len(chats)} chats")
    
    account_stats = {
        "account_id": acct_id,
        "username": username,
        "model_of_id": model_of_id,
        "total_transactions": len(txs),
        "total_revenue": total_revenue,
        "unique_buyers": unique_buyers,
        "chats_harvested": 0,
        "messages_harvested": 0,
        "purchases_logged": 0,
    }
    
    convo_lines = []
    outcome_lines = []
    
    for chat in chats:
        fan = chat.get("fan", chat.get("withUser", {}))
        fan_id = fan.get("id")
        fan_name = fan.get("name") or fan.get("username") or str(fan_id)
        
        if not fan_id:
            continue
        
        spent = fan_spend.get(fan_id, 0)
        
        # Fetch messages for this fan
        msgs = get_messages(acct_id, fan_id, limit=msg_limit)
        if not msgs:
            continue
        
        # Reverse to chronological order (API returns newest first)
        msgs.reverse()
        
        account_stats["chats_harvested"] += 1
        account_stats["messages_harvested"] += len(msgs)
        
        # Process each message
        for msg in msgs:
            from_user = msg.get("fromUser", {})
            is_model = from_user.get("id") == model_of_id
            text = clean_html(msg.get("text", ""))
            price = msg.get("price")
            is_tip = msg.get("isTip", False)
            is_opened = msg.get("isOpened", False)
            media_count = msg.get("mediaCount", 0)
            created_at = msg.get("createdAt", "")
            
            # Convert to timestamp
            ts = 0
            try:
                dt = datetime.fromisoformat(created_at.replace("+00:00", "+00:00"))
                ts = int(dt.timestamp())
            except:
                pass
            
            # Detect signals in fan messages
            signals = []
            if not is_model and text:
                txt_lower = text.lower()
                if any(w in txt_lower for w in ["how much", "price", "cost", "buy", "unlock", "ppv", "send me"]):
                    signals.append("buying")
                if any(w in txt_lower for w in ["nude", "naked", "pussy", "tits", "sexy", "naughty", "horny", "🍆", "🍑", "💦"]):
                    signals.append("sexual")
                if any(w in txt_lower for w in ["beautiful", "gorgeous", "amazing", "hot", "🥵", "😍", "🔥"]):
                    signals.append("interest")
            
            # Build conversation log entry
            entry = {
                "model": username,
                "model_id": model_of_id,
                "fan_id": fan_id,
                "fan_name": fan_name,
                "from": "model" if is_model else "fan",
                "ts": ts,
                "text": text[:500],
                "fan_total_spent": spent,
            }
            if price and price > 0:
                entry["price"] = price
                entry["is_ppv"] = True
                if is_opened:
                    entry["ppv_unlocked"] = True
            if is_tip:
                entry["is_tip"] = True
            if media_count:
                entry["media_count"] = media_count
            if signals:
                entry["signals"] = signals
            
            convo_lines.append(json.dumps(entry, separators=(',', ':')))
            
            # Log PPV outcomes
            if is_model and price and price > 0:
                outcome = {
                    "model": username,
                    "fan_id": fan_id,
                    "ts": ts,
                    "event": "ppv_unlocked" if is_opened else "ppv_ignored",
                    "amount": price if is_opened else 0,
                    "price_offered": price,
                    "fan_total_spent": spent,
                    "media_count": media_count,
                }
                outcome_lines.append(json.dumps(outcome, separators=(',', ':')))
                if is_opened:
                    account_stats["purchases_logged"] += 1
        
        # Log tip transactions as outcomes
        for tx in fan_tx_list.get(fan_id, []):
            if "tip" in tx.get("desc", "").lower():
                outcome = {
                    "model": username,
                    "fan_id": fan_id,
                    "ts": tx["ts"],
                    "event": "tip",
                    "amount": tx["amount"],
                    "fan_total_spent": spent,
                }
                outcome_lines.append(json.dumps(outcome, separators=(',', ':')))
    
    # Write to files
    if convo_lines:
        with open(CONVO_LOG, "a") as f:
            f.write("\n".join(convo_lines) + "\n")
    
    if outcome_lines:
        with open(OUTCOME_LOG, "a") as f:
            f.write("\n".join(outcome_lines) + "\n")
    
    print(f"  ✅ {account_stats['chats_harvested']} chats, {account_stats['messages_harvested']} msgs, {account_stats['purchases_logged']} purchases")
    return account_stats


def main():
    parser = argparse.ArgumentParser(description="Harvest OF training data")
    parser.add_argument("--account", help="Single account ID to harvest")
    parser.add_argument("--top", type=int, default=0, help="Only harvest top N accounts by revenue")
    parser.add_argument("--limit", type=int, default=50, help="Top N fans per account")
    parser.add_argument("--msgs", type=int, default=100, help="Messages per fan")
    parser.add_argument("--resume", action="store_true", help="Skip accounts already in summary")
    args = parser.parse_args()
    
    print("🔍 OF Training Data Harvester")
    print(f"   Output: {CONVO_LOG}")
    print(f"           {OUTCOME_LOG}")
    print()
    
    accounts = get_accounts()
    print(f"Found {len(accounts)} accounts")
    
    if args.account:
        accounts = [a for a in accounts if a["id"] == args.account]
        if not accounts:
            print(f"Account {args.account} not found")
            return
    
    # Load existing summary for resume
    existing_summary = {}
    if args.resume and os.path.exists(SUMMARY_FILE):
        with open(SUMMARY_FILE) as f:
            existing_summary = json.load(f)
    
    all_stats = existing_summary.get("accounts", {})
    total_convos = existing_summary.get("total_messages", 0)
    total_outcomes = existing_summary.get("total_outcomes", 0)
    
    for i, account in enumerate(accounts):
        acct_id = account["id"]
        username = account.get("onlyfans_username") or account.get("display_name") or acct_id
        
        if args.resume and acct_id in all_stats:
            print(f"[{i+1}/{len(accounts)}] {username} — already harvested, skipping")
            continue
        
        if not account.get("is_authenticated"):
            print(f"[{i+1}/{len(accounts)}] {username} — not authenticated, skipping")
            continue
        
        print(f"\n[{i+1}/{len(accounts)}] Processing {username}...")
        
        try:
            stats = harvest_account(account, fan_limit=args.limit, msg_limit=args.msgs)
            all_stats[acct_id] = stats
            total_convos += stats["messages_harvested"]
            total_outcomes += stats["purchases_logged"]
            
            # Save summary incrementally
            summary = {
                "harvested_at": datetime.utcnow().isoformat(),
                "total_accounts": len(all_stats),
                "total_messages": total_convos,
                "total_outcomes": total_outcomes,
                "total_revenue": sum(s.get("total_revenue", 0) for s in all_stats.values()),
                "accounts": all_stats,
            }
            with open(SUMMARY_FILE, "w") as f:
                json.dump(summary, f, indent=2)
            
        except KeyboardInterrupt:
            print("\n\nInterrupted — saving progress...")
            break
        except Exception as e:
            print(f"  ❌ Error: {e}")
            continue
    
    # Final summary
    print(f"\n{'='*60}")
    print(f"HARVEST COMPLETE")
    print(f"{'='*60}")
    print(f"Accounts: {len(all_stats)}")
    print(f"Messages: {total_convos:,}")
    print(f"Outcomes: {total_outcomes:,}")
    print(f"Revenue:  ${sum(s.get('total_revenue', 0) for s in all_stats.values()):,.2f}")
    print(f"\nFiles:")
    print(f"  {CONVO_LOG}")
    print(f"  {OUTCOME_LOG}")
    print(f"  {SUMMARY_FILE}")


if __name__ == "__main__":
    main()
