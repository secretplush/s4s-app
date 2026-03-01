#!/usr/bin/env python3
"""
Training Data Processor v1
Converts raw OF conversation JSONL into labeled training events.

Input: research/training-data/raw/{model}/{fan_id}.jsonl
Output: research/training-data/processed/{model}-events.jsonl

Event types:
- ppv_purchased: Fan bought a PPV. Captures messages leading to conversion.
- ppv_ignored: Fan was sent PPV but didn't buy. Captures what failed.
- tip_received: Fan tipped. Captures what triggered it.
- objection_handled: Fan objected (no money, too expensive) and chatter responded.
- fan_went_silent: Fan stopped responding after chatter messages.
- fan_returned: Fan came back after going silent.
- negotiation: Fan counter-offered on price.
- sexual_escalation: Conversation shifted to explicit territory.
- deflection: Chatter deflected a question/request.

Each event includes:
- context_before: 10 messages leading up to the event
- context_after: 5 messages after the event
- fan_profile: spend tier, message count, days since sub
- outcome: what happened (bought, ignored, left, etc.)
"""

import json
import os
import sys
import re
from datetime import datetime, timedelta
from pathlib import Path

RAW_DIR = Path(__file__).parent / "raw"
PROCESSED_DIR = Path(__file__).parent / "processed"
PROCESSED_DIR.mkdir(exist_ok=True)

# Objection keywords
OBJECTION_WORDS = [
    "don't have", "can't afford", "no money", "broke", "bills",
    "too expensive", "too much", "cheaper", "discount", "less",
    "not right now", "maybe later", "next time", "pass", "no thanks",
    "not interested", "i'm good", "nah"
]

NEGOTIATION_WORDS = [
    "how about", "what about", "i can do", "would you do", 
    "counter", "lower", "deal", "bargain", "for less"
]

SEXUAL_KEYWORDS = [
    "pussy", "dick", "cock", "fuck", "naked", "nude", "cum",
    "horny", "wet", "hard", "suck", "lick", "ride", "ass",
    "tits", "boobs", "nipple", "orgasm", "moan"
]

def clean_text(html):
    """Strip HTML tags from message text."""
    if not html:
        return ""
    text = re.sub(r'<[^>]+>', '', html)
    text = text.replace('&amp;', '&').replace('&lt;', '<').replace('&gt;', '>')
    return text.strip()

def get_sender(msg, fan_id):
    """Determine if message is from fan or model."""
    from_id = msg.get('fromUser', {}).get('id')
    return 'fan' if from_id == fan_id else 'model'

def format_msg(msg, fan_id):
    """Format a message for training context."""
    return {
        "sender": get_sender(msg, fan_id),
        "text": clean_text(msg.get('text', '')),
        "timestamp": msg.get('createdAt', '')[:19],
        "has_media": msg.get('mediaCount', 0) > 0,
        "price": msg.get('price', 0) or 0,
        "is_ppv": bool(msg.get('price')),
        "is_opened": msg.get('isOpened', False),
    }

def get_context(msgs, idx, before=10, after=5, fan_id=None):
    """Get surrounding messages for context."""
    start = max(0, idx - before)
    end = min(len(msgs), idx + after + 1)
    return [format_msg(m, fan_id) for m in msgs[start:end]]

def detect_silence(msgs, fan_id, idx, threshold_hours=12):
    """Check if fan went silent after this message."""
    if idx >= len(msgs) - 1:
        return False
    current_time = datetime.fromisoformat(msgs[idx]['createdAt'][:19])
    # Look for next fan message
    for j in range(idx + 1, min(idx + 20, len(msgs))):
        if get_sender(msgs[j], fan_id) == 'fan':
            next_time = datetime.fromisoformat(msgs[j]['createdAt'][:19])
            return (next_time - current_time).total_seconds() > threshold_hours * 3600
    return True  # No fan message found in next 20

def has_keywords(text, keywords):
    """Check if text contains any keywords (case insensitive)."""
    text_lower = text.lower()
    return any(kw in text_lower for kw in keywords)

def process_fan(model_name, fan_id, msgs, spend_data=None):
    """Process a single fan's conversation into training events."""
    events = []
    msgs.sort(key=lambda m: m.get('createdAt', ''))
    
    fan_msgs_count = len([m for m in msgs if get_sender(m, fan_id) == 'fan'])
    model_msgs_count = len(msgs) - fan_msgs_count
    
    fan_profile = {
        "fan_id": fan_id,
        "model": model_name,
        "total_messages": len(msgs),
        "fan_messages": fan_msgs_count,
        "model_messages": model_msgs_count,
        "spend": spend_data or {},
    }
    
    for i, msg in enumerate(msgs):
        text = clean_text(msg.get('text', ''))
        sender = get_sender(msg, fan_id)
        price = msg.get('price', 0) or 0
        
        # PPV PURCHASED
        if price > 0 and msg.get('isOpened'):
            events.append({
                "type": "ppv_purchased",
                "model": model_name,
                "fan_id": fan_id,
                "price": price,
                "timestamp": msg.get('createdAt', '')[:19],
                "context": get_context(msgs, i, fan_id=fan_id),
                "fan_profile": fan_profile,
            })
        
        # PPV IGNORED
        elif price > 0 and not msg.get('isOpened') and msg.get('canPurchase'):
            events.append({
                "type": "ppv_ignored",
                "model": model_name,
                "fan_id": fan_id,
                "price": price,
                "timestamp": msg.get('createdAt', '')[:19],
                "context": get_context(msgs, i, fan_id=fan_id),
                "fan_profile": fan_profile,
            })
        
        # TIP (check isTip field)
        if msg.get('isTip'):
            events.append({
                "type": "tip_received",
                "model": model_name,
                "fan_id": fan_id,
                "amount": price,
                "timestamp": msg.get('createdAt', '')[:19],
                "context": get_context(msgs, i, fan_id=fan_id),
                "fan_profile": fan_profile,
            })
        
        # OBJECTION (fan message with objection keywords)
        if sender == 'fan' and has_keywords(text, OBJECTION_WORDS):
            events.append({
                "type": "objection",
                "model": model_name,
                "fan_id": fan_id,
                "text": text,
                "timestamp": msg.get('createdAt', '')[:19],
                "context": get_context(msgs, i, fan_id=fan_id),
                "fan_profile": fan_profile,
            })
        
        # NEGOTIATION (fan trying to negotiate price)
        if sender == 'fan' and has_keywords(text, NEGOTIATION_WORDS):
            events.append({
                "type": "negotiation",
                "model": model_name,
                "fan_id": fan_id,
                "text": text,
                "timestamp": msg.get('createdAt', '')[:19],
                "context": get_context(msgs, i, fan_id=fan_id),
                "fan_profile": fan_profile,
            })
        
        # FAN WENT SILENT (after model message, fan disappears 12h+)
        if sender == 'model' and not price and detect_silence(msgs, fan_id, i):
            events.append({
                "type": "fan_went_silent",
                "model": model_name,
                "fan_id": fan_id,
                "last_model_msg": text,
                "timestamp": msg.get('createdAt', '')[:19],
                "context": get_context(msgs, i, before=10, after=3, fan_id=fan_id),
                "fan_profile": fan_profile,
            })
    
    return events

def process_model(model_name):
    """Process all fans for a given model."""
    model_dir = RAW_DIR / model_name
    if not model_dir.exists():
        print(f"No data for {model_name}")
        return
    
    all_events = []
    
    for jsonl_file in sorted(model_dir.glob("*.jsonl")):
        fan_id = int(jsonl_file.stem)
        msgs = []
        with open(jsonl_file) as f:
            for line in f:
                msgs.append(json.loads(line))
        
        if not msgs:
            continue
        
        events = process_fan(model_name, fan_id, msgs)
        all_events.extend(events)
        print(f"  {fan_id}: {len(msgs)} msgs → {len(events)} events")
    
    # Write processed events
    outfile = PROCESSED_DIR / f"{model_name}-events.jsonl"
    with open(outfile, 'w') as f:
        for event in all_events:
            f.write(json.dumps(event) + '\n')
    
    # Summary
    from collections import Counter
    types = Counter(e['type'] for e in all_events)
    print(f"\n{model_name}: {len(all_events)} total events")
    for t, count in types.most_common():
        print(f"  {t}: {count}")
    print(f"Saved to {outfile}")
    
    return all_events

if __name__ == "__main__":
    models = sys.argv[1:] if len(sys.argv) > 1 else [d.name for d in RAW_DIR.iterdir() if d.is_dir()]
    
    for model in models:
        print(f"\n=== Processing {model} ===")
        process_model(model)
