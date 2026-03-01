#!/usr/bin/env python3
"""
bianca-metrics-log.py — Log a metric event.

Usage:
  python3 research/bianca-metrics-log.py inbound
  python3 research/bianca-metrics-log.py reply <fan_id> [latency_sec]
  python3 research/bianca-metrics-log.py ppv <fan_id> <price>
  python3 research/bianca-metrics-log.py purchase <fan_id> <amount>
  python3 research/bianca-metrics-log.py hallucination <bad_key>
  python3 research/bianca-metrics-log.py bump_delete
  python3 research/bianca-metrics-log.py report
"""

import sys
import json
import os
from datetime import datetime, timezone

METRICS_PATH = os.path.join(os.path.dirname(os.path.abspath(__file__)), "bianca-metrics.json")

def load():
    with open(METRICS_PATH, "r") as f:
        return json.load(f)

def save(data):
    with open(METRICS_PATH, "w") as f:
        json.dump(data, f, indent=2)

def main():
    action = sys.argv[1]
    data = load()
    cp = data["current_period"]

    if action == "inbound":
        cp["inbound_events"] += 1

    elif action == "reply":
        fan_id = sys.argv[2] if len(sys.argv) > 2 else "unknown"
        latency = float(sys.argv[3]) if len(sys.argv) > 3 else None
        cp["replies_sent"] += 1
        if fan_id not in cp["fans_processed"]:
            cp["fans_processed"].append(fan_id)
        if latency is not None:
            cp["reply_latencies_sec"].append(latency)

    elif action == "ppv":
        fan_id = sys.argv[2]
        price = float(sys.argv[3])
        cp["ppv_offers_sent"] += 1
        cp["ppv_total_price"] += price

    elif action == "purchase":
        fan_id = sys.argv[2]
        amount = float(sys.argv[3])
        cp["purchases"] += 1
        cp["purchase_total_usd"] += amount

    elif action == "hallucination":
        bad_key = sys.argv[2]
        cp["validation_replacements"] += 1
        cp["hallucinated_keys"].append(bad_key)

    elif action == "bump_delete":
        cp["bump_deletes"] += 1

    elif action == "report":
        offers = cp["ppv_offers_sent"]
        purchases = cp["purchases"]
        avg_price = cp["ppv_total_price"] / offers if offers > 0 else 0
        conv_rate = (purchases / offers * 100) if offers > 0 else 0
        latencies = cp["reply_latencies_sec"]
        avg_latency = sum(latencies) / len(latencies) if latencies else 0
        top_halluc = {}
        for k in cp["hallucinated_keys"]:
            top_halluc[k] = top_halluc.get(k, 0) + 1
        top5 = sorted(top_halluc.items(), key=lambda x: -x[1])[:5]

        print(f"📊 BIANCA METRICS — Period: {cp['start']}")
        print(f"  Inbound events:     {cp['inbound_events']}")
        print(f"  Replies sent:       {cp['replies_sent']}")
        print(f"  Unique fans:        {len(cp['fans_processed'])}")
        print(f"  Purchases/unlocks:  {purchases} (${cp['purchase_total_usd']:.2f})")
        print(f"  PPV offers sent:    {offers} (avg ${avg_price:.2f})")
        print(f"  Conversion rate:    {conv_rate:.1f}%")
        print(f"  Avg reply latency:  {avg_latency:.0f}s")
        print(f"  Validation swaps:   {cp['validation_replacements']}")
        if top5:
            print(f"  Top halluc keys:    {top5}")
        print(f"  Bump deletes:       {cp['bump_deletes']}")
        save(data)
        return

    save(data)
    print(f"LOGGED: {action}")

if __name__ == "__main__":
    main()
