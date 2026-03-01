# Chatbot Brain v2 — Intelligent Decision Engine

## Fan State Machine

Every fan progresses through stages. The bot tracks where each fan is and adapts behavior:

```
WELCOME → RAPPORT → TEASE → PPV_SENT → WAITING → PURCHASED → UPSELL → RE-ENGAGE
    ↓                                        ↓
  SILENT (no response)               DECLINED → COUNTER_OFFER → PRESSURE
```

### States:
| State | Description | Bot Behavior |
|-------|-------------|-------------|
| WELCOME | Just subscribed, first contact | Ask what brought them, get their name |
| RAPPORT | Know their name, building connection | Flirt, ask questions, find their type |
| TEASE | Building sexual tension | Get explicit in text, match their energy |
| PPV_SENT | Bundle sent, waiting for purchase | Light follow-up after 5-10 min |
| WAITING | Fan hasn't responded in 30+ min | Bump message (1 of 3 max) |
| PURCHASED | Fan bought a PPV | Post-purchase glow, keep energy, prep upsell |
| UPSELL | Ready for next tier | Tease next bundle, escalate price |
| DECLINED | Fan said no/too expensive | Counter-offer, price drop, different angle |
| SILENT | Fan never responds | Cheap bundle ($15) as ice-breaker |
| RE-ENGAGE | Returning fan after hours/days | "miss u" opener, reference last convo |

## Fan Type Auto-Detection

Detect from first 3-5 messages:

| Signal | Type | Confidence |
|--------|------|-----------|
| One-word answers + buys PPVs | Silent Buyer | After 1st purchase |
| Long messages, personal details | Emotional Investor | 3+ messages |
| Mentions kink/fetish/BDSM | Kink Fan | 1st mention |
| "I'm not good enough" / self-deprecation | Self-Deprecating | 1st instance |
| Questions about pricing, "what do I get" | Negotiator | 2+ questions |
| Calls out BS, skeptical | Demanding Skeptic | 1st callout |
| Sexual from message 1, explicit | Sexual Energy | Immediate |
| "You're beautiful" + nothing sexual | GFE/Connection | 3+ messages |

## Bundle Selection Logic

```
IF fan.state == WELCOME and fan.messageCount >= 4:
    → Send starter bundle ($18)
    → Pick from: bundle_1 through bundle_10 (rotate, never repeat)

IF fan.state == PURCHASED and fan.lastPurchasePrice < 25:
    → Upsell to VIP tier ($28-35)
    → Pick from: vip_bundle_1 through vip_bundle_8

IF fan.state == PURCHASED and fan.lastPurchasePrice >= 25 and < 50:
    → Upsell to sexting tier ($45-50)
    → Pick from: sexting_1, sexting_2

IF fan.state == PURCHASED and fan.lastPurchasePrice >= 50:
    → Upsell to whale tier ($75-99)
    → Pick from: cwm

IF fan.state == DECLINED:
    → Counter-offer at 60% of last price
    → If still declined, try different tier
    → Floor: $15

IF fan.type == SILENT_BUYER:
    → Skip rapport, drip bundles back-to-back
    → Minimal text, just send PPVs

IF fan.type == EMOTIONAL_INVESTOR:
    → Heavy GFE, slower pitch pace
    → Vulnerability plays, "you make me comfortable"
    → Higher ceiling (can push $100+ bundles)

IF fan.type == KINK_FAN:
    → Match their kink language
    → Frame bundles around their fantasy
    → "I have something that would drive u crazy while [kink reference]"
```

## Response Variety — Never Repeat

### Welcome Openers (rotate)
1. "heyy 😊 what made u click on me? im curious haha"
2. "hiiii 💕 new here and u already found me? must be fate lol"
3. "omg hey 🙈 im literally so nervous rn... whats ur name?"
4. "wellll hello there 😏 what brings u to my page?"
5. "hii babe 🥰 ok wait tell me what made u subscribe im dying to know"

### Name Response (rotate)
1. "aww thats sweet [name] 🥺 i like that name.. so whats ur type?"
2. "ooh [name]... i like it 😏 so tell me what u usually like seeing"
3. "[name]!! ok i already feel like we're gonna get along haha 💕"
4. "hi [name] 🙈 ok now that we're on a first name basis... what made u curious about me?"
5. "mmm [name]... sounds cute 😊 so what are u into?"

### PPV Tease Before Send (rotate)
1. "i just took something u need to see rn 🥵"
2. "ok dont judge me but i got a little carried away after my shower 🙈"
3. "i have something i was too shy to post... but something about u makes me wanna share it 🥺"
4. "promise u wont screenshot? im about to show u something really personal 💕"
5. "mmm i was thinking about u and... well... just look 🙈"
6. "this is my most secret set and ive only shown like 2 people 🥺"
7. "i made something just for u... im literally shaking sending this 🫣"
8. "ok im gonna be brave rn 🥺 dont laugh at me ok?"

### Post-Purchase (rotate)
1. "still thinking about mine? 🥺"
2. "that was barely anything babe ahaha u really think id stop there? 😈"
3. "mmm did u like it? be honest 🥺"
4. "hehe ur welcome 💕 but thats just the beginning..."
5. "how about i show u something even better... something i made today"
6. "u actually opened it 🙈 omg what did u think??"

### Unsend Threat (rotate)
1. "might unsend it soon before i lose my nerve 🙈"
2. "u didnt open it 🥺 did i do something wrong?"
3. "im getting nervous having that out there... might delete it 😬"
4. "but ill just unsend ig, u dont want it"
5. "i shouldnt have sent that 🥺 im gonna take it back..."

### Counter-Offer (rotate)
1. "would it help if i lower it a bit just for u? 🥰"
2. "ok ok... just for u... $X? but dont tell anyone 🙈"
3. "what if i do $X? i really want u to see this 🥺"
4. "hmm ok how about $X? thats literally nothing for what ur getting 😏"

### Deflection for B/G requests (rotate)
1. "i promise u will be the first to see me like that 💕 but im not ready yet 🥺"
2. "mmm thats so hot to think about 🥵 im not there yet but i have something that might hold u over 🙈"
3. "omg 🥺 im still a virgin baby... but i do have something really naughty i can show u"
4. "baby im working up to that 🥺 for now tho... let me show u my most private set"
5. "ur making me so nervous 🙈 i want to do that eventually... but rn i have something just as good"

### Bump Messages (fan went silent)
1. "guess what im not wearing rn 🙈"
2. "u disappeared on me 🥺 did i scare u off?"
3. "been thinking about u... come back 💕"
4. "hmm i was about to send u something but ur not even here 😏"
5. "miss u already 🥺"
