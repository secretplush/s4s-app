#!/usr/bin/env python3
"""Cross-check 71 ad-spend fans across all Plush OF API accounts."""
import json, time, sys, os
import urllib.request

BASE = "https://app.onlyfansapi.com/api"
AUTH = "Bearer ofapi_bT4J1Er2YBow46EihDfjlSFf5HRmiM15M4DCOoHn7889d8b4"

FAN_IDS = [295453773,43172416,481908886,27764995,381722302,510689604,501131692,211167711,78758818,551946850,58225378,162040450,38538828,342825595,215896770,88782966,13773454,519252757,501611381,399320879,38344265,468724126,492892553,521251527,487661304,41935537,101145574,493284700,348044080,510229776,518394357,320188597,350190041,90144751,503122165,125176575,543223439,422303354,33047249,464862037,167878750,246990490,40938503,520047228,20351417,489700117,79975722,496210323,341301914,128404913,194494614,33350368,299370976,491929739,23740432,474227897,8363718,7592885,228155638,293592778,298389627,475383958,141738457,178706071,168076472,474329820,105439877,61041170,46125423,442138515,49453574]

PROGRESS_FILE = "/Users/moltplush/.openclaw/workspace/research/crosscheck_progress.json"
RESULTS_FILE = "/Users/moltplush/.openclaw/workspace/research/crosscheck_results.json"

def api_get(path):
    req = urllib.request.Request(f"{BASE}{path}", headers={"Authorization": AUTH})
    try:
        with urllib.request.urlopen(req, timeout=30) as resp:
            return json.loads(resp.read())
    except Exception as e:
        return {"error": str(e)}

def load_progress():
    if os.path.exists(PROGRESS_FILE):
        with open(PROGRESS_FILE) as f:
            return json.load(f)
    return {"completed_accounts": [], "results": {}}

def save_progress(progress):
    with open(PROGRESS_FILE, "w") as f:
        json.dump(progress, f)

def main():
    # Get accounts
    accounts_data = api_get("/accounts")
    accounts = [(a["id"], a["display_name"]) for a in accounts_data if a.get("is_authenticated")]
    print(f"Found {len(accounts)} authenticated accounts")
    
    progress = load_progress()
    results = progress.get("results", {})  # fan_id -> [{account, username, totalSumm, tips, messages, posts, streams, subs}]
    
    for i, (acct_id, display_name) in enumerate(accounts):
        if acct_id in progress["completed_accounts"]:
            print(f"[{i+1}/{len(accounts)}] SKIP {display_name} (already done)")
            continue
        
        print(f"[{i+1}/{len(accounts)}] Checking {display_name} ({acct_id})...")
        
        for j, fan_id in enumerate(FAN_IDS):
            data = api_get(f"/{acct_id}/users/{fan_id}")
            
            if "error" in data and "data" not in data:
                # Rate limit or error - wait and retry once
                if "429" in str(data.get("error", "")):
                    print(f"  Rate limited, waiting 60s...")
                    time.sleep(60)
                    data = api_get(f"/{acct_id}/users/{fan_id}")
                continue
            
            user = data.get("data", data)
            subscribed_on = user.get("subscribedOnData")
            subscribed_by = user.get("subscribedBy", False)
            
            if subscribed_by and subscribed_on:
                total = subscribed_on.get("totalSumm", 0)
                fan_key = str(fan_id)
                if fan_key not in results:
                    results[fan_key] = []
                
                entry = {
                    "account_id": acct_id,
                    "model": display_name,
                    "totalSumm": total,
                    "tipsSumm": subscribed_on.get("tipsSumm", 0),
                    "messagesSumm": subscribed_on.get("messagesSumm", 0),
                    "postsSumm": subscribed_on.get("postsSumm", 0),
                    "streamsSumm": subscribed_on.get("streamsSumm", 0),
                    "subscribesSumm": subscribed_on.get("subscribesSumm", 0),
                    "username": user.get("username", ""),
                    "name": user.get("name", ""),
                }
                results[fan_key].append(entry)
                
                if total > 0:
                    print(f"  💰 Fan {fan_id} ({user.get('name','')}) spent ${total} on {display_name}!")
                elif subscribed_by:
                    print(f"  ✓ Fan {fan_id} subscribed to {display_name} ($0 spent)")
            
            # Small delay to avoid rate limits
            if j % 20 == 19:
                time.sleep(0.5)
        
        progress["completed_accounts"].append(acct_id)
        progress["results"] = results
        save_progress(progress)
        print(f"  Done. Fans found so far: {len(results)}")
    
    # Save final results
    with open(RESULTS_FILE, "w") as f:
        json.dump(results, f, indent=2)
    
    # Generate report
    generate_report(results, accounts)

def generate_report(results, accounts):
    report = "# Ad-Spend Fan Cross-Check Report\n\n"
    report += f"**Date:** 2026-02-21\n"
    report += f"**Ad Spend:** $265\n"
    report += f"**Fans Tracked:** 71\n"
    report += f"**Accounts Checked:** {len(accounts)}\n\n"
    
    total_hidden_revenue = 0
    fans_on_other_models = 0
    fan_details = []
    
    for fan_id, entries in results.items():
        total_fan_spend = sum(e["totalSumm"] for e in entries)
        models_subbed = len(entries)
        
        if models_subbed > 0:
            fans_on_other_models += 1
        
        if total_fan_spend > 0:
            total_hidden_revenue += total_fan_spend
            spending_entries = [e for e in entries if e["totalSumm"] > 0]
            fan_details.append({
                "fan_id": fan_id,
                "name": entries[0].get("name", ""),
                "username": entries[0].get("username", ""),
                "total_spend": total_fan_spend,
                "models_subbed": models_subbed,
                "spending": spending_entries
            })
    
    fan_details.sort(key=lambda x: x["total_spend"], reverse=True)
    
    report += "## Summary\n\n"
    report += f"- **Fans found on ANY Plush model:** {fans_on_other_models}/71\n"
    report += f"- **Fans who SPENT money:** {len(fan_details)}\n"
    report += f"- **Total hidden revenue:** ${total_hidden_revenue:.2f}\n"
    report += f"- **Known spend on original model:** $23.98\n"
    report += f"- **Total ROI:** ${total_hidden_revenue + 23.98:.2f} from $265 ad spend\n"
    report += f"- **ROI %:** {((total_hidden_revenue + 23.98) / 265 * 100):.1f}%\n\n"
    
    report += "## Fans Who Spent Money (by total spend)\n\n"
    report += "| Fan ID | Name | Total Spent | Models Subbed | Spending Breakdown |\n"
    report += "|--------|------|-------------|---------------|--------------------|\n"
    
    for fd in fan_details:
        breakdown = ", ".join([f"{e['model']}: ${e['totalSumm']}" for e in fd["spending"]])
        report += f"| {fd['fan_id']} | {fd['name']} | ${fd['total_spend']:.2f} | {fd['models_subbed']} | {breakdown} |\n"
    
    report += "\n## All Fans - Subscription Map\n\n"
    report += "| Fan ID | Name | Models Subscribed To | Total Spent |\n"
    report += "|--------|------|---------------------|-------------|\n"
    
    for fan_id in FAN_IDS:
        fk = str(fan_id)
        if fk in results:
            entries = results[fk]
            models = ", ".join([e["model"] for e in entries])
            total = sum(e["totalSumm"] for e in entries)
            name = entries[0].get("name", "")
            report += f"| {fan_id} | {name} | {models} | ${total:.2f} |\n"
        else:
            report += f"| {fan_id} | - | None found | $0.00 |\n"
    
    report += "\n## Revenue by Model\n\n"
    model_revenue = {}
    for fan_id, entries in results.items():
        for e in entries:
            m = e["model"]
            if m not in model_revenue:
                model_revenue[m] = {"total": 0, "fans": 0}
            model_revenue[m]["total"] += e["totalSumm"]
            model_revenue[m]["fans"] += 1
    
    report += "| Model | Fans from Ad | Revenue from Ad Fans |\n"
    report += "|-------|-------------|---------------------|\n"
    for m, d in sorted(model_revenue.items(), key=lambda x: x[1]["total"], reverse=True):
        report += f"| {m} | {d['fans']} | ${d['total']:.2f} |\n"
    
    outpath = "/Users/moltplush/.openclaw/workspace/research/ad-spend-crosscheck.md"
    with open(outpath, "w") as f:
        f.write(report)
    print(f"\nReport saved to {outpath}")

if __name__ == "__main__":
    main()
