#!/usr/bin/env python3
"""Extract a single fan's state from bianca-fan-state.json"""
import json, sys

fan_id = sys.argv[1]
with open("research/bianca-fan-state.json") as f:
    data = json.load(f)

state = data.get(fan_id, data.get(str(fan_id), {}))
if state:
    print(json.dumps({fan_id: state}, indent=2))
else:
    print(f"No state for fan {fan_id}")
