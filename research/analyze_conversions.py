#!/usr/bin/env python3
"""Analyze OF conversation data for conversion patterns."""
import json
import os
import re
from collections import defaultdict
from pathlib import Path

BASE = Path("research/training-data/raw")

def strip_html(text):
    if not text:
        return ""
    return re.sub(r'<[^>]+>', '', text).strip()

def load_fans(path):
    fans = {}
    with open(path) as f:
        for line in f:
            line = line.strip()
            if not line:
                continue
            fan = json.loads(line)
            fans[fan['id']] = fan
    return fans

def load_conversation(path):
    msgs = []
    with open(path) as f:
        for line in f:
            line = line.strip()
            if not line:
                continue
            try:
                msg = json.loads(line)
                msgs.append(msg)
            except:
                continue
    return msgs

def analyze_account(account_dir, fans_file):
    fans = load_fans(fans_file)
    results = []
    
    for jsonl_file in sorted(account_dir.glob("*.jsonl")):
        fan_id = int(jsonl_file.stem)
        msgs = load_conversation(jsonl_file)
        if not msgs:
            continue
        
        fan_data = fans.get(fan_id, {"total": 0, "tips": 0, "messages": 0, "posts": 0, "username": "unknown"})
        
        # Determine creator ID (the one sending most messages marked isSentByMe)
        creator_id = None
        for m in msgs:
            if m.get("isSentByMe"):
                creator_id = m.get("fromUser", {}).get("id")
                break
        
        # Sort by createdAt
        msgs.sort(key=lambda m: m.get("createdAt", ""))
        
        # Analyze conversation
        conv = {
            "fan_id": fan_id,
            "username": fan_data.get("username", "unknown"),
            "total_spent": fan_data.get("total", 0),
            "tips": fan_data.get("tips", 0),
            "msg_count": len(msgs),
            "account": account_dir.name,
            "messages": [],
            "ppv_sends": [],      # PPV messages sent by creator
            "purchases": [],       # Messages indicating purchase (tips or price > 0 from fan)
            "conversion_events": [],
            "fan_messages": [],    # What the fan said
            "creator_messages": [], # What the creator said
            "first_purchase_idx": None,
            "objections": [],
        }
        
        first_purchase_found = False
        
        for i, m in enumerate(msgs):
            text = strip_html(m.get("text", ""))
            is_creator = m.get("isSentByMe", False)
            price = m.get("price", 0) or 0
            is_tip = m.get("isTip", False)
            has_media = len(m.get("media", [])) > 0
            can_purchase = m.get("canPurchase", False)
            created_at = m.get("createdAt", "")
            
            msg_summary = {
                "idx": i,
                "text": text[:300],
                "is_creator": is_creator,
                "price": price,
                "is_tip": is_tip,
                "has_media": has_media,
                "can_purchase": can_purchase,
                "created_at": created_at,
            }
            
            conv["messages"].append(msg_summary)
            
            if is_creator:
                conv["creator_messages"].append(msg_summary)
                if price > 0 and has_media:
                    conv["ppv_sends"].append(msg_summary)
            else:
                conv["fan_messages"].append(msg_summary)
                # Check for tip
                if is_tip and price > 0:
                    conv["purchases"].append(msg_summary)
                    if not first_purchase_found:
                        first_purchase_found = True
                        conv["first_purchase_idx"] = i
            
            # PPV that was purchased (sent by creator, has price, canPurchase=False means already bought)
            if is_creator and price > 0 and has_media and not can_purchase:
                conv["purchases"].append(msg_summary)
                if not first_purchase_found:
                    first_purchase_found = True
                    conv["first_purchase_idx"] = i
            
            # Detect objection patterns from fan
            if not is_creator and text:
                lower = text.lower()
                objection_keywords = ["can't afford", "too expensive", "no money", "broke", "maybe later", 
                                     "not right now", "don't have", "can't pay", "expensive", "free",
                                     "send me free", "for free", "no thanks", "not interested"]
                for kw in objection_keywords:
                    if kw in lower:
                        conv["objections"].append({"text": text[:200], "idx": i, "keyword": kw})
                        break
        
        # Build conversion events
        if conv["first_purchase_idx"] is not None:
            idx = conv["first_purchase_idx"]
            # Get context: 5 messages before
            start = max(0, idx - 5)
            conv["conversion_events"] = conv["messages"][start:idx+1]
        
        results.append(conv)
    
    return results

def tier(amount):
    if amount <= 0: return "non-spender"
    if amount <= 50: return "$1-50"
    if amount <= 100: return "$50-100"
    if amount <= 500: return "$100-500"
    return "$500+"

def generate_report(all_results):
    # Categorize by tier
    tiers = defaultdict(list)
    for conv in all_results:
        tiers[tier(conv["total_spent"])].append(conv)
    
    report = []
    report.append("# OF Conversation Conversion Analysis\n")
    report.append(f"**Total conversations analyzed:** {len(all_results)}\n")
    
    # Summary stats
    report.append("## Summary by Spend Tier\n")
    report.append("| Tier | Count | Avg Messages | Avg PPVs Sent |")
    report.append("|------|-------|-------------|---------------|")
    for t in ["non-spender", "$1-50", "$50-100", "$100-500", "$500+"]:
        convs = tiers[t]
        if not convs:
            report.append(f"| {t} | 0 | - | - |")
            continue
        avg_msgs = sum(c["msg_count"] for c in convs) / len(convs)
        avg_ppvs = sum(len(c["ppv_sends"]) for c in convs) / len(convs)
        report.append(f"| {t} | {len(convs)} | {avg_msgs:.0f} | {avg_ppvs:.1f} |")
    
    report.append("")
    
    # === CONVERSION EVENTS ===
    report.append("## Conversion Events — What Happens Right Before First Purchase\n")
    
    conversion_examples = []
    for conv in all_results:
        if conv["conversion_events"] and conv["total_spent"] > 0:
            conversion_examples.append(conv)
    
    conversion_examples.sort(key=lambda c: c["total_spent"], reverse=True)
    
    report.append(f"**Conversations with identifiable conversion moments:** {len(conversion_examples)}\n")
    
    # Show top examples by tier
    for t in ["$1-50", "$50-100", "$100-500", "$500+"]:
        convs = [c for c in conversion_examples if tier(c["total_spent"]) == t]
        if not convs:
            continue
        report.append(f"### {t} Tier ({len(convs)} fans)\n")
        
        for conv in convs[:3]:  # Top 3 examples per tier
            report.append(f"**Fan: {conv['username']}** (${conv['total_spent']:.0f} total, {conv['account']})")
            report.append(f"- Messages in conversation: {conv['msg_count']}")
            report.append(f"- PPVs sent: {len(conv['ppv_sends'])}")
            report.append(f"\nConversion sequence:")
            report.append("```")
            for msg in conv["conversion_events"]:
                role = "CREATOR" if msg["is_creator"] else "FAN"
                text = msg["text"][:200] if msg["text"] else "[no text]"
                price_str = f" [PPV ${msg['price']}]" if msg["price"] > 0 else ""
                tip_str = " [TIP]" if msg["is_tip"] else ""
                media_str = " [+media]" if msg["has_media"] else ""
                report.append(f"  {role}: {text}{price_str}{tip_str}{media_str}")
            report.append("```\n")
    
    # === TACTICS ANALYSIS ===
    report.append("## Top Converting Tactics\n")
    
    # Opening lines analysis
    report.append("### Opening Lines (Creator's First Message)\n")
    openings_by_tier = defaultdict(list)
    for conv in all_results:
        if conv["creator_messages"]:
            first = conv["creator_messages"][0]
            if first["text"]:
                openings_by_tier[tier(conv["total_spent"])].append(first["text"][:200])
    
    for t in ["$500+", "$100-500", "$50-100", "$1-50"]:
        if openings_by_tier[t]:
            report.append(f"\n**{t} spenders — opening lines that worked:**")
            for opener in openings_by_tier[t][:5]:
                report.append(f'- "{opener}"')
    
    report.append("")
    
    # PPV Pricing analysis
    report.append("### PPV Pricing Patterns\n")
    ppv_prices_by_tier = defaultdict(list)
    for conv in all_results:
        for ppv in conv["ppv_sends"]:
            if ppv["price"] > 0:
                ppv_prices_by_tier[tier(conv["total_spent"])].append(ppv["price"])
    
    for t in ["$500+", "$100-500", "$50-100", "$1-50", "non-spender"]:
        prices = ppv_prices_by_tier[t]
        if prices:
            avg_p = sum(prices) / len(prices)
            min_p = min(prices)
            max_p = max(prices)
            report.append(f"- **{t}**: avg ${avg_p:.0f}, range ${min_p:.0f}-${max_p:.0f} ({len(prices)} PPVs sent)")
    
    report.append("")
    
    # === ESCALATION SEQUENCES ===
    report.append("### Escalation Sequences (PPV Price Progression)\n")
    
    for conv in conversion_examples[:10]:
        if len(conv["ppv_sends"]) >= 2:
            prices = [p["price"] for p in conv["ppv_sends"]]
            report.append(f"- **{conv['username']}** (${conv['total_spent']:.0f}): {' → '.join(f'${p:.0f}' for p in prices)}")
    
    report.append("")
    
    # === OBJECTION HANDLING ===
    report.append("## Common Objections & Responses\n")
    
    objection_with_responses = []
    for conv in all_results:
        for obj in conv["objections"]:
            idx = obj["idx"]
            # Find next creator message after objection
            response = None
            for msg in conv["messages"][idx+1:idx+4]:
                if msg["is_creator"] and msg["text"]:
                    response = msg["text"][:200]
                    break
            objection_with_responses.append({
                "objection": obj["text"][:200],
                "keyword": obj["keyword"],
                "response": response,
                "fan_total": conv["total_spent"],
                "converted": conv["total_spent"] > 0,
                "username": conv["username"],
            })
    
    # Group by keyword
    by_keyword = defaultdict(list)
    for o in objection_with_responses:
        by_keyword[o["keyword"]].append(o)
    
    for kw, objs in sorted(by_keyword.items(), key=lambda x: -len(x[1])):
        converted = [o for o in objs if o["converted"]]
        report.append(f"### \"{kw}\" ({len(objs)} occurrences, {len(converted)} converted)\n")
        for o in objs[:3]:
            status = f"✅ ${o['fan_total']:.0f}" if o["converted"] else "❌ non-spender"
            report.append(f'- **Fan ({status}):** "{o["objection"]}"')
            if o["response"]:
                report.append(f'  - **Creator response:** "{o["response"]}"')
        report.append("")
    
    # === FAILED CONVERSIONS ===
    report.append("## Failed Conversions Analysis\n")
    
    non_spenders = tiers["non-spender"]
    engaged_non_spenders = [c for c in non_spenders if len(c["fan_messages"]) >= 3]
    
    report.append(f"**Total non-spenders:** {len(non_spenders)}")
    report.append(f"**Engaged but never bought (3+ fan messages):** {len(engaged_non_spenders)}\n")
    
    report.append("### Examples of Engaged Non-Spenders\n")
    engaged_non_spenders.sort(key=lambda c: len(c["fan_messages"]), reverse=True)
    
    for conv in engaged_non_spenders[:10]:
        report.append(f"**{conv['username']}** ({conv['account']}, {len(conv['fan_messages'])} fan messages, {len(conv['ppv_sends'])} PPVs sent)")
        
        # Show first few fan messages
        report.append("  Fan messages sample:")
        for fm in conv["fan_messages"][:5]:
            if fm["text"]:
                report.append(f'    - "{fm["text"][:150]}"')
        
        # Show if PPVs were sent but not bought
        unsold_ppvs = [p for p in conv["ppv_sends"] if p.get("can_purchase")]
        if unsold_ppvs:
            prices_str = ', '.join('${:.0f}'.format(p["price"]) for p in unsold_ppvs)
            report.append(f"  Unsold PPVs: {len(unsold_ppvs)} at prices: {prices_str}")
        
        if conv["objections"]:
            report.append(f"  Objections: {', '.join(o['keyword'] for o in conv['objections'])}")
        report.append("")
    
    # Patterns in failures
    report.append("### Common Failure Patterns\n")
    
    # Count PPVs sent to non-spenders vs spenders
    ppv_to_nonspender = sum(len(c["ppv_sends"]) for c in non_spenders)
    ppv_to_spender = sum(len(c["ppv_sends"]) for c in all_results if c["total_spent"] > 0)
    report.append(f"- PPVs sent to non-spenders: {ppv_to_nonspender}")
    report.append(f"- PPVs sent to spenders: {ppv_to_spender}")
    
    # Average messages before giving up on non-spenders
    if engaged_non_spenders:
        avg = sum(c["msg_count"] for c in engaged_non_spenders) / len(engaged_non_spenders)
        report.append(f"- Avg messages in failed conversion attempts: {avg:.0f}")
    
    report.append("")
    
    # === WHALE SIGNALS ===
    report.append("## Whale Early Warning Signals ($500+ Spenders)\n")
    
    whales = tiers["$500+"]
    report.append(f"**Whales identified:** {len(whales)}\n")
    
    if whales:
        report.append("### Whale Profiles\n")
        whales.sort(key=lambda c: c["total_spent"], reverse=True)
        
        for conv in whales[:15]:
            report.append(f"**{conv['username']}** — ${conv['total_spent']:.0f} total (${conv['tips']:.0f} tips), {conv['msg_count']} messages, {conv['account']}")
            
            # Early fan messages (first 5)
            early_fan = conv["fan_messages"][:5]
            if early_fan:
                report.append("  Early fan messages:")
                for fm in early_fan:
                    if fm["text"]:
                        report.append(f'    - "{fm["text"][:150]}"')
            
            # Tip ratio
            if conv["total_spent"] > 0:
                tip_pct = (conv["tips"] / conv["total_spent"]) * 100
                report.append(f"  Tip ratio: {tip_pct:.0f}% of total spend is tips")
            
            report.append("")
        
        # Aggregate whale signals
        report.append("### Aggregate Whale Signals\n")
        
        whale_first_msgs = []
        for conv in whales:
            if conv["fan_messages"]:
                first = conv["fan_messages"][0]
                if first["text"]:
                    whale_first_msgs.append(first["text"][:200])
        
        if whale_first_msgs:
            report.append("**First messages from whales:**")
            for m in whale_first_msgs[:10]:
                report.append(f'- "{m}"')
        
        report.append("")
        
        # Messages before first purchase for whales
        whale_conv_idx = [c["first_purchase_idx"] for c in whales if c["first_purchase_idx"] is not None]
        if whale_conv_idx:
            avg_idx = sum(whale_conv_idx) / len(whale_conv_idx)
            report.append(f"- Avg messages before first whale purchase: {avg_idx:.0f}")
        
        avg_whale_msgs = sum(c["msg_count"] for c in whales) / len(whales) if whales else 0
        avg_nonwhale_msgs = sum(c["msg_count"] for c in all_results if c["total_spent"] > 0 and tier(c["total_spent"]) != "$500+") / max(1, len([c for c in all_results if c["total_spent"] > 0 and tier(c["total_spent"]) != "$500+"]))
        report.append(f"- Avg messages from whales: {avg_whale_msgs:.0f} vs non-whale spenders: {avg_nonwhale_msgs:.0f}")
        report.append(f"- Avg tips from whales: ${sum(c['tips'] for c in whales)/len(whales):.0f}")
    
    report.append("")
    
    # === $10-500 RANGE PATTERNS ===
    report.append("## $10-500 Range Patterns (Bot Operating Zone)\n")
    
    bot_range = [c for c in all_results if 10 <= c["total_spent"] <= 500]
    report.append(f"**Fans in $10-500 range:** {len(bot_range)}\n")
    
    if bot_range:
        # Typical funnel
        report.append("### Typical Conversion Funnel\n")
        
        purchase_indices = [c["first_purchase_idx"] for c in bot_range if c["first_purchase_idx"] is not None]
        if purchase_indices:
            report.append(f"- Avg messages before first purchase: {sum(purchase_indices)/len(purchase_indices):.0f}")
            report.append(f"- Median: {sorted(purchase_indices)[len(purchase_indices)//2]}")
            report.append(f"- Range: {min(purchase_indices)} to {max(purchase_indices)}")
        
        # Most common PPV price points
        all_ppv_prices = []
        for c in bot_range:
            for p in c["ppv_sends"]:
                if p["price"] > 0:
                    all_ppv_prices.append(p["price"])
        
        if all_ppv_prices:
            report.append(f"\n**PPV prices used for $10-500 fans:**")
            # Price distribution
            price_buckets = defaultdict(int)
            for p in all_ppv_prices:
                bucket = f"${int(p//10)*10}-{int(p//10)*10+10}"
                price_buckets[bucket] += 1
            for bucket, count in sorted(price_buckets.items()):
                report.append(f"- {bucket}: {count} times")
        
        report.append("")
        
        # Successful conversion sequences
        report.append("### Best Conversion Sequences ($10-500)\n")
        for conv in sorted(bot_range, key=lambda c: c["total_spent"], reverse=True)[:5]:
            report.append(f"**{conv['username']}** (${conv['total_spent']:.0f})")
            if conv["conversion_events"]:
                report.append("```")
                for msg in conv["conversion_events"]:
                    role = "CREATOR" if msg["is_creator"] else "FAN"
                    text = msg["text"][:200] if msg["text"] else "[no text]"
                    extras = []
                    if msg["price"] > 0: extras.append(f"PPV ${msg['price']}")
                    if msg["is_tip"]: extras.append("TIP")
                    if msg["has_media"]: extras.append("+media")
                    extra_str = f" [{', '.join(extras)}]" if extras else ""
                    report.append(f"  {role}: {text}{extra_str}")
                report.append("```")
            report.append("")
    
    # === RECOMMENDED BOT ESCALATION LADDER ===
    report.append("## Recommended Bot Escalation Ladder\n")
    report.append("Based on analysis of real conversion data:\n")
    
    # Calculate avg metrics
    spenders = [c for c in all_results if c["total_spent"] > 0]
    if spenders:
        avg_ppvs_before_buy = []
        for c in spenders:
            if c["first_purchase_idx"] is not None:
                ppvs_before = len([p for p in c["ppv_sends"] if p["idx"] < c["first_purchase_idx"]])
                avg_ppvs_before_buy.append(ppvs_before)
        
        if avg_ppvs_before_buy:
            report.append(f"**Key metric:** Avg PPVs sent before first purchase: {sum(avg_ppvs_before_buy)/len(avg_ppvs_before_buy):.1f}")
    
    report.append("""
### Suggested Ladder:

1. **Welcome/Warmup** (Messages 1-3): Friendly greeting, light flirting, build rapport
2. **Engagement** (Messages 4-8): Escalate sexting, gauge interest, tease content
3. **First PPV** (Message 5-10): Low price point ($5-15), test willingness to pay
4. **Escalation** (After first purchase): Gradually increase prices, offer bundles
5. **Upsell** (Ongoing): Higher-value PPVs, custom content offers
6. **Whale Detection** → Handoff to human chatter if signals detected

### Whale Handoff Triggers:
- Fan tips without being asked
- Fan asks for custom/specific content
- Fan sends multiple messages in quick succession expressing desire
- Total spend crosses $200 rapidly
- Fan uses language suggesting emotional connection / loneliness
""")
    
    return "\n".join(report)

# Run analysis
print("Loading sadieeblake data...")
sadiee_results = analyze_account(BASE / "sadieeblake", BASE / "sadieeblake-fans.jsonl")
print(f"  {len(sadiee_results)} conversations loaded")

print("Loading saralovexx data...")
sara_results = analyze_account(BASE / "saralovexx", BASE / "saralovexx-fans.jsonl")
print(f"  {len(sara_results)} conversations loaded")

all_results = sadiee_results + sara_results
print(f"\nTotal: {len(all_results)} conversations")

report = generate_report(all_results)

output_path = "research/conversion-analysis.md"
with open(output_path, "w") as f:
    f.write(report)

print(f"\nReport written to {output_path}")
print(f"Report length: {len(report)} chars")
