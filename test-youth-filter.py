#!/usr/bin/env python3
"""Test flux-kontext-pro for youth filter effect"""

import replicate
import os
import base64

# Set API token (from Replicate dashboard - secretplush account)
os.environ["REPLICATE_API_TOKEN"] = "r8_placeholder"  # Need to get from dashboard

# Read local image
image_path = "/Users/moltplush/.openclaw/workspace/test-images/test pics/LAINEYHAY_1"

# Prompt for youthful appearance
prompt = "Make this woman look younger, around 18-19 years old. Give her smoother, more youthful skin with a fresh, natural glow. Keep her facial features and identity the same, just make her appear younger and fresher."

print(f"Testing with: {image_path}")
print(f"Prompt: {prompt}")

# Open and encode image
with open(image_path, "rb") as f:
    image_data = f.read()

# Run the model
try:
    output = replicate.run(
        "black-forest-labs/flux-kontext-pro",
        input={
            "prompt": prompt,
            "input_image": open(image_path, "rb"),
            "aspect_ratio": "match_input_image",
            "output_format": "png",
            "safety_tolerance": 2
        }
    )
    print(f"\nSuccess! Output URL: {output}")
except Exception as e:
    print(f"\nError: {e}")
