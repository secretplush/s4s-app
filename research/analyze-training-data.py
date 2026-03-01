#!/usr/bin/env python3
"""
Training Data Analyzer — Discovers what converts across all accounts.
Reads harvested JSONL, outputs actionable insights.

Answers:
- What message patterns precede purchases?
- What's the optimal message count before PPV?
- What price points convert best?
- What signals predict buyers?
- What time of day converts best?
- What's the average conversion funnel?
"""

import json, os, sys, re
from collections import defaultdict
from datetime import datetime

DIR = os.path.dirname(os.path.abspath(__file__))
CONVO_LOG = os.path.join(DIR, "training-conversations.jsonl")
OUTCOME_LOG = os.path.join(DIR, "training-outcomes.jsonl")
OUTPUT_FILE = os.path.join(DIR, "training-insights.json")


def load_jsonl(path):
    lines = []
    try:
        with open(path) as f:
            for line in f:
                line = line.strip()
                if line:
                    lines.append(json.loads(line))
    except FileNotFoundError:
        print(f"  Not found: {path}")
    return lines


def analyze():
    print("📊 Training Data Analyzer")
    print()
    
    convos = load_jsonl(CONVO_LOG)
    outcomes = load_jsonl(OUTCOME_LOG)
    
    print(f"Loaded: {len(convos):,} messages, {len(outcomes):,} outcomes")
    
    if not convos:
        print("No data to analyze yet. Run harvest-training-data.py first.")
        return
    
    # ===== 1. GROUP CONVERSATIONS BY FAN =====
    fan_convos = defaultdict(list)  # (model, fan_id) -> [msgs]
    for msg in convos:
        key = (msg.get("model", ""), msg.get("fan_id", 0))
        fan_convos[key].append(msg)
    
    print(f"Unique fan conversations: {len(fan_convos):,}")
    
    # ===== 2. PPV CONVERSION ANALYSIS =====
    ppv_sent = [o for o in outcomes if o.get("event") in ("ppv_unlocked", "ppv_ignored")]
    ppv_unlocked = [o for o in ppv_sent if o.get("event") == "ppv_unlocked"]
    ppv_ignored = [o for o in ppv_sent if o.get("event") == "ppv_ignored"]
    
    overall_conv = len(ppv_unlocked) / len(ppv_sent) * 100 if ppv_sent else 0
    print(f"\nPPV Conversion: {len(ppv_unlocked)}/{len(ppv_sent)} = {overall_conv:.1f}%")
    
    # By price point
    price_buckets = defaultdict(lambda: {"sent": 0, "unlocked": 0, "revenue": 0})
    for o in ppv_sent:
        price = o.get("price_offered", 0)
        bucket = f"${int(price)}" if price else "$0"
        price_buckets[bucket]["sent"] += 1
        if o.get("event") == "ppv_unlocked":
            price_buckets[bucket]["unlocked"] += 1
            price_buckets[bucket]["revenue"] += o.get("amount", 0)
    
    print(f"\nConversion by price point:")
    for price, data in sorted(price_buckets.items(), key=lambda x: x[1]["sent"], reverse=True)[:15]:
        conv = data["unlocked"] / data["sent"] * 100 if data["sent"] > 0 else 0
        print(f"  {price:>6}: {data['unlocked']}/{data['sent']} = {conv:.1f}%  (${data['revenue']:.0f} rev)")
    
    # ===== 3. SIGNALS THAT PREDICT PURCHASES =====
    # For each fan conversation, check if signals appeared before purchases
    signal_to_purchase = defaultdict(lambda: {"appeared": 0, "led_to_purchase": 0})
    
    buyers = set()
    for o in outcomes:
        if o.get("event") in ("ppv_unlocked", "tip") and o.get("amount", 0) > 0:
            buyers.add((o.get("model", ""), o.get("fan_id", 0)))
    
    for key, msgs in fan_convos.items():
        is_buyer = key in buyers
        signals_seen = set()
        for msg in msgs:
            for s in msg.get("signals", []):
                signals_seen.add(s)
        
        for s in signals_seen:
            signal_to_purchase[s]["appeared"] += 1
            if is_buyer:
                signal_to_purchase[s]["led_to_purchase"] += 1
    
    print(f"\nSignals → Purchase correlation:")
    for signal, data in sorted(signal_to_purchase.items(), key=lambda x: x[1]["led_to_purchase"], reverse=True):
        rate = data["led_to_purchase"] / data["appeared"] * 100 if data["appeared"] > 0 else 0
        print(f"  {signal:>12}: {data['led_to_purchase']}/{data['appeared']} fans = {rate:.1f}% purchase rate")
    
    # ===== 4. MESSAGE COUNT TO FIRST PURCHASE =====
    msgs_to_first_purchase = []
    for key, msgs in fan_convos.items():
        if key not in buyers:
            continue
        # Count messages before first PPV that was unlocked
        model_msgs = 0
        fan_msgs = 0
        for msg in msgs:
            if msg.get("from") == "fan":
                fan_msgs += 1
            else:
                model_msgs += 1
            if msg.get("from") == "model" and msg.get("is_ppv") and msg.get("ppv_unlocked"):
                msgs_to_first_purchase.append({"fan_msgs": fan_msgs, "model_msgs": model_msgs, "total": fan_msgs + model_msgs})
                break
    
    if msgs_to_first_purchase:
        avg_total = sum(m["total"] for m in msgs_to_first_purchase) / len(msgs_to_first_purchase)
        avg_fan = sum(m["fan_msgs"] for m in msgs_to_first_purchase) / len(msgs_to_first_purchase)
        # Distribution
        buckets = defaultdict(int)
        for m in msgs_to_first_purchase:
            bucket = min(m["fan_msgs"], 20)
            buckets[bucket] += 1
        
        print(f"\nMessages to first purchase (n={len(msgs_to_first_purchase)}):")
        print(f"  Avg fan messages before buy: {avg_fan:.1f}")
        print(f"  Avg total messages before buy: {avg_total:.1f}")
        print(f"  Distribution (fan msg count → purchases):")
        for i in range(0, 21):
            if buckets[i] > 0:
                bar = "█" * min(buckets[i], 50)
                print(f"    {i:>3} msgs: {buckets[i]:>4} {bar}")
    
    # ===== 5. TIME OF DAY ANALYSIS =====
    hour_purchases = defaultdict(lambda: {"purchases": 0, "revenue": 0})
    for o in outcomes:
        if o.get("event") in ("ppv_unlocked", "tip") and o.get("amount", 0) > 0:
            ts = o.get("ts")
            if isinstance(ts, int) and ts > 0:
                hour = datetime.utcfromtimestamp(ts).hour
                hour_purchases[hour]["purchases"] += 1
                hour_purchases[hour]["revenue"] += o.get("amount", 0)
            elif isinstance(ts, str):
                try:
                    hour = datetime.fromisoformat(ts.replace("+00:00", "+00:00")).hour
                    hour_purchases[hour]["purchases"] += 1
                    hour_purchases[hour]["revenue"] += o.get("amount", 0)
                except:
                    pass
    
    if hour_purchases:
        print(f"\nPurchases by hour (UTC):")
        for h in range(24):
            data = hour_purchases[h]
            if data["purchases"] > 0:
                bar = "█" * min(data["purchases"], 40)
                print(f"  {h:02d}:00 — {data['purchases']:>4} purchases, ${data['revenue']:>8.0f}  {bar}")
    
    # ===== 6. FAN SPEND DISTRIBUTION =====
    fan_total_spend = defaultdict(float)
    for o in outcomes:
        if o.get("amount", 0) > 0:
            fan_total_spend[(o.get("model", ""), o.get("fan_id", 0))] += o.get("amount", 0)
    
    spend_tiers = {"$0": 0, "$1-10": 0, "$11-25": 0, "$26-50": 0, "$51-100": 0, "$101-250": 0, "$251-500": 0, "$500+": 0}
    for spend in fan_total_spend.values():
        if spend <= 0: spend_tiers["$0"] += 1
        elif spend <= 10: spend_tiers["$1-10"] += 1
        elif spend <= 25: spend_tiers["$11-25"] += 1
        elif spend <= 50: spend_tiers["$26-50"] += 1
        elif spend <= 100: spend_tiers["$51-100"] += 1
        elif spend <= 250: spend_tiers["$101-250"] += 1
        elif spend <= 500: spend_tiers["$251-500"] += 1
        else: spend_tiers["$500+"] += 1
    
    print(f"\nFan spend distribution:")
    for tier, count in spend_tiers.items():
        bar = "█" * min(count, 40)
        print(f"  {tier:>10}: {count:>5} fans  {bar}")
    
    # ===== 7. TOP CONVERTING MODELS =====
    model_stats = defaultdict(lambda: {"ppv_sent": 0, "ppv_unlocked": 0, "revenue": 0, "tips": 0})
    for o in outcomes:
        model = o.get("model", "unknown")
        if o.get("event") == "ppv_unlocked":
            model_stats[model]["ppv_unlocked"] += 1
            model_stats[model]["revenue"] += o.get("amount", 0)
        elif o.get("event") == "ppv_ignored":
            model_stats[model]["ppv_sent"] += 1
        elif o.get("event") == "tip":
            model_stats[model]["tips"] += o.get("amount", 0)
    
    # Add unlocked to sent count
    for m in model_stats.values():
        m["ppv_sent"] += m["ppv_unlocked"]
    
    print(f"\nTop models by PPV conversion:")
    sorted_models = sorted(model_stats.items(), 
                          key=lambda x: x[1]["ppv_unlocked"] / max(x[1]["ppv_sent"], 1), 
                          reverse=True)
    for model, data in sorted_models[:20]:
        conv = data["ppv_unlocked"] / data["ppv_sent"] * 100 if data["ppv_sent"] > 0 else 0
        print(f"  {model:>20}: {conv:>5.1f}% ({data['ppv_unlocked']}/{data['ppv_sent']}) ${data['revenue']:.0f} rev + ${data['tips']:.0f} tips")
    
    # ===== 8. MESSAGE PATTERNS BEFORE PURCHASE =====
    # What did the MODEL say in the message RIGHT BEFORE a purchase?
    pre_purchase_msgs = []
    for key, msgs in fan_convos.items():
        for i, msg in enumerate(msgs):
            if msg.get("from") == "model" and msg.get("is_ppv") and msg.get("ppv_unlocked"):
                # Get the model's text message right before the PPV
                for j in range(i-1, max(i-5, -1), -1):
                    if j >= 0 and msgs[j].get("from") == "model" and not msgs[j].get("is_ppv"):
                        pre_purchase_msgs.append(msgs[j].get("text", "")[:200])
                        break
    
    # Find common phrases in pre-purchase messages
    if pre_purchase_msgs:
        phrase_counts = defaultdict(int)
        trigger_phrases = [
            "just for you", "just for u", "never done this", "never shared",
            "nobody", "no one", "special", "exclusive", "only you", "only u",
            "trust you", "trust u", "nervous", "shy", "first time",
            "naughty", "bad girl", "good girl", "miss you", "miss u",
            "thinking about", "cant stop", "can't stop",
            "🥺", "🙈", "😏", "🔥", "💕", "😈",
            "unlock", "open", "tip", "surprise",
        ]
        for msg in pre_purchase_msgs:
            msg_lower = msg.lower()
            for phrase in trigger_phrases:
                if phrase.lower() in msg_lower:
                    phrase_counts[phrase] += 1
        
        print(f"\nTrigger phrases before purchases (n={len(pre_purchase_msgs)}):")
        for phrase, count in sorted(phrase_counts.items(), key=lambda x: x[1], reverse=True)[:20]:
            pct = count / len(pre_purchase_msgs) * 100
            bar = "█" * min(count, 30)
            print(f"  \"{phrase}\": {count} ({pct:.1f}%)  {bar}")
    
    # ===== SAVE INSIGHTS =====
    insights = {
        "generated_at": datetime.utcnow().isoformat(),
        "total_messages": len(convos),
        "total_outcomes": len(outcomes),
        "unique_conversations": len(fan_convos),
        "ppv_conversion_rate": overall_conv,
        "price_point_performance": {k: v for k, v in sorted(price_buckets.items(), key=lambda x: x[1]["sent"], reverse=True)},
        "signal_purchase_correlation": {k: v for k, v in signal_to_purchase.items()},
        "avg_messages_to_purchase": sum(m["fan_msgs"] for m in msgs_to_first_purchase) / len(msgs_to_first_purchase) if msgs_to_first_purchase else 0,
        "fan_spend_distribution": spend_tiers,
        "hour_performance": {str(h): v for h, v in hour_purchases.items()},
        "model_performance": {k: v for k, v in sorted_models[:20]},
    }
    
    with open(OUTPUT_FILE, "w") as f:
        json.dump(insights, f, indent=2)
    
    print(f"\n✅ Insights saved to {OUTPUT_FILE}")


if __name__ == "__main__":
    analyze()
