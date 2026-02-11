'use client'

import { useState } from 'react'
import Link from 'next/link'

// ============ COPY TO CLIPBOARD HELPER ============
function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false)
  return (
    <button
      onClick={() => { navigator.clipboard.writeText(text); setCopied(true); setTimeout(() => setCopied(false), 1500) }}
      className="ml-2 px-2 py-0.5 text-xs rounded bg-purple-700 hover:bg-purple-600 transition shrink-0"
    >
      {copied ? '✓' : '📋'}
    </button>
  )
}

function ScriptBlock({ script, label }: { script: string; label?: string }) {
  return (
    <div className="bg-black/40 rounded p-3 my-2 flex items-start gap-2">
      <div className="flex-1">
        {label && <div className="text-xs text-purple-400 mb-1">{label}</div>}
        <div className="text-sm text-gray-200 italic">"{script}"</div>
      </div>
      <CopyButton text={script} />
    </div>
  )
}

function Expandable({ title, badge, children, defaultOpen = false }: { title: string; badge?: string; children: React.ReactNode; defaultOpen?: boolean }) {
  const [open, setOpen] = useState(defaultOpen)
  return (
    <div className="bg-gray-800 rounded-lg overflow-hidden mb-3">
      <button onClick={() => setOpen(!open)} className="w-full flex items-center justify-between p-4 hover:bg-gray-750 transition text-left">
        <span className="font-semibold text-lg">{title}</span>
        <div className="flex items-center gap-2">
          {badge && <span className="text-xs px-2 py-1 rounded bg-purple-700">{badge}</span>}
          <span className="text-gray-400">{open ? '▼' : '▶'}</span>
        </div>
      </button>
      {open && <div className="px-4 pb-4">{children}</div>}
    </div>
  )
}

// ============ TAB SYSTEM ============
const TABS = ['Buyer Types', 'Master Tactics', 'Price Points', 'Bundles', 'Tip Strategies', 'Whale Profiles', 'Critical Rules'] as const
type Tab = typeof TABS[number]

export default function ChatterIntelPage() {
  const [activeTab, setActiveTab] = useState<Tab>('Buyer Types')

  return (
    <div className="min-h-screen bg-gray-900 text-white">
      {/* Header */}
      <div className="bg-gray-800 border-b border-gray-700 px-6 py-4">
        <div className="max-w-7xl mx-auto flex justify-between items-center">
          <div>
            <h1 className="text-2xl font-bold">🎯 Chatter Sales Playbook</h1>
            <p className="text-gray-400 text-sm">Comprehensive training dashboard • Data from 91 fans, $7,283 revenue</p>
          </div>
          <Link href="/" className="text-purple-400 hover:text-purple-300 text-sm">← Back to S4S</Link>
        </div>
      </div>

      {/* Quick Stats */}
      <div className="max-w-7xl mx-auto px-6 py-4">
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-6">
          {[
            { label: 'Total Revenue', value: '$7,283', color: 'text-green-400' },
            { label: 'Whales ($200+)', value: '11', color: 'text-purple-400' },
            { label: 'Avg Whale Spend', value: '$267', color: 'text-blue-400' },
            { label: 'Top Spender', value: '$826', color: 'text-yellow-400' },
            { label: 'Conversion Rate', value: '91 fans', color: 'text-pink-400' },
          ].map(s => (
            <div key={s.label} className="bg-gray-800 rounded-lg p-3 text-center">
              <div className={`text-xl font-bold ${s.color}`}>{s.value}</div>
              <div className="text-xs text-gray-500">{s.label}</div>
            </div>
          ))}
        </div>

        {/* Tabs */}
        <div className="flex gap-1 overflow-x-auto pb-2 mb-6 border-b border-gray-700">
          {TABS.map(tab => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`px-4 py-2 rounded-t text-sm font-medium whitespace-nowrap transition ${
                activeTab === tab ? 'bg-purple-700 text-white' : 'text-gray-400 hover:text-white hover:bg-gray-800'
              }`}
            >
              {tab}
            </button>
          ))}
        </div>

        {/* Tab Content */}
        {activeTab === 'Buyer Types' && <BuyerTypesTab />}
        {activeTab === 'Master Tactics' && <MasterTacticsTab />}
        {activeTab === 'Price Points' && <PricePointsTab />}
        {activeTab === 'Bundles' && <BundlesTab />}
        {activeTab === 'Tip Strategies' && <TipStrategiesTab />}
        {activeTab === 'Whale Profiles' && <WhaleProfilesTab />}
        {activeTab === 'Critical Rules' && <CriticalRulesTab />}
      </div>
    </div>
  )
}

// ============ BUYER TYPES ============
function BuyerTypesTab() {
  const types = [
    {
      name: '🤫 Silent Bundle Buyer',
      pct: '~20%',
      color: 'border-gray-500',
      description: 'Never responds, just unlocks every PPV sent. Zero conversation overhead.',
      examples: 'John Gerrick ($328.80) — 11 free unlocks + ~10 $35 purchases. No single message exchanged.',
      howToHandle: [
        'Send mass PPVs at $20-35 price point',
        'No personalization needed — saves chatter time',
        'Use bundle format (3-6 items)',
        'Caption with scarcity: "this week only", "limited time"',
        'Just keep sending — they buy everything',
      ],
      scripts: [
        { label: 'Mass PPV Caption', text: 'baby i made this just for you... 4 vids + 6 pics of me being naughty 😈 dont miss it' },
      ],
    },
    {
      name: '💕 Emotional Chaser',
      pct: '~25%',
      color: 'border-pink-500',
      description: 'Responds to vulnerability and promises. Buys because of emotional connection, not just content. Chases the "first naked" or "first custom" promise.',
      examples: 'Justin ($307.20) — told "i promise u will be the first to see me naked 💕 but im not ready yet...🙈" and kept buying.',
      howToHandle: [
        'Use Promise First deflection for explicit requests',
        'Create emotional milestones ("when I\'m ready, you\'ll be first")',
        'Build up vulnerability before pitching',
        'They respond to shy/new persona',
        'Never deliver the promise — keep them chasing',
      ],
      scripts: [
        { label: 'Promise Deflection', text: 'i promise u will be the first to see me naked 💕 but im not ready yet...🙈' },
        { label: 'Shy Build-Up', text: 'i wanna show you something i was so scared to show before... 🥺 would u let me do that?' },
        { label: 'Post-Purchase', text: 'u actually unlocked it for me? i wanted to look good for you.. even if i dont really know how to be sexy yet.. does it show that i tried?' },
      ],
    },
    {
      name: '🤨 Demanding Skeptic',
      pct: '~15%',
      color: 'border-orange-500',
      description: 'Calls BS on reused content, complains about quality, demands specifics — BUT STILL BUYS. The 🥺 emoji is your best friend here.',
      examples: 'Charles ($307.20) — said "That\'s the same thing yesterday", got hit with 🥺, then bought $99 anyway.',
      howToHandle: [
        'NEVER acknowledge the complaint directly',
        'Use 🥺 Denial: "wdym love i never showed u these vids before 🥺"',
        'Pivot immediately to selling more',
        'If they demand specifics, fulfill the request then upsell',
        'They WILL keep buying even after calling you out',
      ],
      scripts: [
        { label: '🥺 Denial', text: 'wdym love i never showed u these vids before 🥺' },
        { label: 'Complaint Pivot', text: 'Of course love im sorry to disappoint 🥺 but let me make it up to you...' },
        { label: 'After Fulfilling Request', text: 'mmm i kinda like the idea of showing u something ive never shown anyone... ud be ready for something like that?' },
      ],
    },
    {
      name: '👑 Negotiator Whale',
      pct: '~10%',
      color: 'border-yellow-500',
      description: 'Wants VIP status, tips big for recognition, negotiates deals. Motivated by STATUS more than content.',
      examples: 'Toph94 ($289.60) — tipped $150 to become "Your first VIP". Asked for custom promise in exchange.',
      howToHandle: [
        'Create VIP tier system ($150+ = VIP)',
        'Give them a TITLE ("my first VIP", "my #1 fan")',
        'Promise future customs/discounts for VIP',
        'Let them feel like they\'re negotiating — but you always win',
        'Never give discounts without getting a higher commitment first',
      ],
      scripts: [
        { label: 'VIP Pitch', text: 'do you really wanna be my first ever VIP? 🥺' },
        { label: 'Custom Promise', text: 'But the custom still has to wait like i told u <3' },
        { label: 'VIP Confirmation', text: 'Glad to have you here love 💗💕 when i add some more u will always get it with discounts too' },
      ],
    },
    {
      name: '🔥 Sexual Energy Matcher',
      pct: '~15%',
      color: 'border-red-500',
      description: 'Opens with explicit sexual language. May send content TO you (videos). Dominated by arousal. Multiple purchases in one horny session.',
      examples: 'Axe ($331.20) — sent his own videos, bought $100 bundle + $69 bundle + multiple $48 bundles in one session.',
      howToHandle: [
        'MATCH THEIR ENERGY immediately — go explicit',
        'Use submission language: "im on my knees for u", "pleaseee daddy"',
        'Send bundle DURING peak arousal',
        'If they hesitate: guilt play "but u dont want to unlock that to see me🥺"',
        'Treat returns as new sessions — repeat the cycle',
      ],
      scripts: [
        { label: 'Energy Match', text: 'im so wet thinking about u cumming for me🥵' },
        { label: 'Bundle Pitch', text: 'ok babyy all my content for u😈 im on my knees for u💋' },
        { label: 'Explode Promise', text: 'unlock this and i promise u will explode for me right now daddy🥵' },
        { label: 'Direct Command', text: 'come on baby unlock that stroke it hard for me and cum on my face🥵💋' },
        { label: 'Guilt Play', text: 'but u dont want to unlock that to see me🥺' },
      ],
    },
    {
      name: '🥰 Emotional Connection Buyer (GFE)',
      pct: '~15%',
      color: 'border-purple-500',
      description: 'Craves relationship, not content. Will spend WITHOUT receiving nudes. Self-blames when denied. Returns daily for attention. This is the GFE monetization discovery.',
      examples: 'Jayy ($76) — spent $76 with NO nudes delivered. Used "I\'m new/shy 🥺" deflection TWICE — fan apologized BOTH times for pushing. Still engaged: "I waited all day to talk before bed."',
      howToHandle: [
        'Sell the RELATIONSHIP, not content',
        'Use "I\'m new/shy" to deflect explicit requests — they\'ll apologize',
        'Be consistent with attention (daily check-ins)',
        'These fans can be milked INDEFINITELY with just attention',
        'Never break character — the girlfriend illusion is the product',
        'Low content cost, high emotional ROI',
      ],
      scripts: [
        { label: 'Shy Deflection', text: 'im shy🥺🥺 and i dont want u to get upset' },
        { label: 'Daily Check-In', text: 'hii baby i was thinking about you today 🥰 how was your day?' },
        { label: 'Emotional Hook', text: 'awwww... i cant even explain how good you make me feel' },
        { label: 'Exclusivity Feel', text: 'ull always be the first one to know i have some new content <3' },
        { label: 'Butterfly Check', text: '🥰 thank you so much baby please tell me if ur getting the butterflies hehe' },
      ],
    },
  ]

  return (
    <div>
      <div className="bg-purple-900/30 border border-purple-700 rounded-lg p-4 mb-6">
        <h3 className="font-bold text-purple-300 mb-2">🧠 How to Use This</h3>
        <p className="text-sm text-gray-300">Identify the buyer type within the first 2-3 messages, then apply the matching playbook. Most fans show their type immediately. When in doubt, start with Emotional Chaser tactics — they work on most types.</p>
      </div>
      {types.map(type => (
        <Expandable key={type.name} title={type.name} badge={type.pct}>
          <p className="text-gray-300 mb-3">{type.description}</p>
          <div className="bg-blue-900/20 border border-blue-800 rounded p-3 mb-3">
            <div className="text-xs text-blue-400 mb-1">Real Example</div>
            <div className="text-sm text-gray-300">{type.examples}</div>
          </div>
          <div className="mb-3">
            <div className="text-sm font-semibold text-purple-300 mb-2">How to Handle:</div>
            <ul className="space-y-1">
              {type.howToHandle.map((h, i) => (
                <li key={i} className="text-sm text-gray-300 flex gap-2">
                  <span className="text-purple-400">•</span>{h}
                </li>
              ))}
            </ul>
          </div>
          <div>
            <div className="text-sm font-semibold text-purple-300 mb-2">Copy/Paste Scripts:</div>
            {type.scripts.map((s, i) => (
              <ScriptBlock key={i} label={s.label} script={s.text} />
            ))}
          </div>
        </Expandable>
      ))}
    </div>
  )
}

// ============ MASTER TACTICS ============
function MasterTacticsTab() {
  const categories = [
    {
      name: '⚡ Pressure Tactics',
      tactics: [
        { name: 'Unsend Threat (FOMO)', script: 'but ill just unsend ig, u dont want it', worksOn: 'Indecisive buyers', result: 'Justin panicked and paid $307' },
        { name: 'Trust Test', script: 'i cant even tell if ur lying to me or not.. should i trust u', worksOn: 'Approval-seeking fans', result: 'Puts pressure on THEM to prove themselves' },
        { name: 'Waiting Game', script: 'fuck\nokay okay\nill just sit on the edge of the bed and wait then', worksOn: 'Guilt-prone fans', result: 'Creates guilt + sexual imagery' },
        { name: 'Time Limit', script: 'If you unlock in the next 6 minutes Ill throw in a bonus video 🎁', worksOn: 'All buyers', result: 'Creates urgency to act NOW' },
      ],
    },
    {
      name: '🛡️ Deflection Tactics',
      tactics: [
        { name: '🥺 Denial (Universal Shield)', script: 'wdym love i never showed u these vids before 🥺', worksOn: 'Fans calling out reused content', result: 'Charles called BS, still bought $99' },
        { name: 'Promise First', script: 'i promise u will be the first to see me naked 💕 but im not ready yet...🙈', worksOn: 'Fans asking for explicit content', result: 'Keeps buying current while chasing future' },
        { name: 'Shy/New Persona', script: 'im shy🥺🥺 and i dont want u to get upset', worksOn: 'Fans pushing boundaries', result: 'Fan apologized for asking (Jayy)' },
        { name: 'Virgin Claim', script: 'im still a virgin baby and i dont have BG', worksOn: 'Protective instinct fans', result: 'Dame bought $18 immediately' },
      ],
    },
    {
      name: '📈 Upsell Tactics',
      tactics: [
        { name: 'VIP Tier', script: 'do you really wanna be my first ever VIP? 🥺', worksOn: 'Status-seeking fans', result: 'Toph94 tipped $150 for VIP title' },
        { name: 'Post-Purchase Tease', script: 'that was barely anything babe ahaha u really think id stop there? 😈', worksOn: 'All buyers post-purchase', result: 'Hooks for next purchase' },
        { name: 'Never Seen Pitch', script: 'mmm i kinda like the idea of showing u something ive never shown anyone... ud be ready for something like that?', worksOn: 'All types', result: 'Escalates to $99 bundle' },
        { name: 'Crave Trigger', script: 'i know you crave seeing some more of me am i right?', worksOn: 'Post-purchase fans', result: 'Re-engages for next sale' },
        { name: 'Counter-Offer (NEVER "no worries")', script: 'Totally understand babe! What if we did $32 instead? 💕', worksOn: 'Price-resistant fans', result: '30% conversion on rejections' },
      ],
    },
    {
      name: '💔 Vulnerability Tactics',
      tactics: [
        { name: 'Post-Purchase Vulnerability', script: 'I hope you will like it 💕 i really do', worksOn: 'All buyers', result: 'MDNYJetsFan became emotionally invested' },
        { name: 'Emotional Escalation', script: 'awwww... i cant even explain how good you make me feel', worksOn: 'Emotional investors', result: 'Deepens connection, primes for next sale' },
        { name: 'Shy Build-Up', script: 'i wanna show you something i was so scared to show before... 🥺 would u let me do that?', worksOn: 'Protective types', result: 'Pre-sells bundles at premium prices' },
        { name: 'Gentle Request', script: 'ull be gentle with me', worksOn: 'All types', result: 'Activates protective instinct' },
      ],
    },
    {
      name: '🔒 Exclusivity Tactics',
      tactics: [
        { name: 'Secret Promise', script: 'do you promise to keep it just between us… if I show you something i shouldnt?', worksOn: 'Intimacy-seeking fans', result: 'Creates "us vs the world" conspiracy' },
        { name: 'First to Know', script: 'ull always be the first one to know i have some new content <3', worksOn: 'Loyal fans', result: 'MDNYJetsFan felt exclusively valued' },
        { name: 'Butterfly Check', script: '🥰 thank you so much baby please tell me if ur getting the butterflies hehe', worksOn: 'Emotional investors', result: 'Emotional check-in that keeps them hooked' },
        { name: '$99 Ultra Pre-Sell', script: 'oh wow i cant believe were this far... never expected to share this with anyone but im really craving your attention now.. i only want this with you <3', worksOn: 'Whales ready to escalate', result: 'Sets up $99+ purchase' },
      ],
    },
  ]

  return (
    <div>
      <div className="bg-purple-900/30 border border-purple-700 rounded-lg p-4 mb-6">
        <h3 className="font-bold text-purple-300 mb-2">📋 Quick Reference</h3>
        <p className="text-sm text-gray-300">All scripts are copy/paste ready. Click 📋 to copy. Modify names and details as needed. These are PROVEN scripts from real conversations that generated $7,283+.</p>
      </div>
      {categories.map(cat => (
        <Expandable key={cat.name} title={cat.name} badge={`${cat.tactics.length} tactics`} defaultOpen>
          <div className="space-y-4">
            {cat.tactics.map((t, i) => (
              <div key={i} className="bg-gray-700/50 rounded-lg p-4">
                <div className="flex justify-between items-start mb-2">
                  <h4 className="font-semibold text-white">{t.name}</h4>
                  <span className="text-xs text-gray-400">{t.worksOn}</span>
                </div>
                <ScriptBlock script={t.script} />
                <div className="text-xs text-green-400 mt-1">✓ Result: {t.result}</div>
              </div>
            ))}
          </div>
        </Expandable>
      ))}
    </div>
  )
}

// ============ PRICE POINTS ============
function PricePointsTab() {
  return (
    <div>
      <div className="bg-purple-900/30 border border-purple-700 rounded-lg p-4 mb-6">
        <h3 className="font-bold text-purple-300 mb-2">💰 Magic Numbers</h3>
        <p className="text-sm text-gray-300">These exact price points appear repeatedly across 91 buyers. They&apos;re not random — they&apos;re OF&apos;s platform pricing tiers after fees.</p>
      </div>

      {/* Price Ladder Visual */}
      <div className="bg-gray-800 rounded-lg p-6 mb-6">
        <h3 className="font-bold mb-4">The Price Ladder</h3>
        <div className="flex items-end gap-3 h-64 justify-center">
          {[
            { price: '$14.40', label: 'Starter', h: '20%', count: '14 fans', color: 'bg-green-600' },
            { price: '$22.40', label: '2nd Tier', h: '30%', count: '8 fans', color: 'bg-blue-600' },
            { price: '$35', label: 'Standard', h: '45%', count: 'Sweet spot', color: 'bg-purple-600' },
            { price: '$50', label: 'Premium', h: '55%', count: 'After trust', color: 'bg-pink-600' },
            { price: '$99', label: 'Ultra', h: '70%', count: 'Whales only', color: 'bg-red-600' },
            { price: '$150', label: 'VIP Tip', h: '85%', count: 'Status buy', color: 'bg-yellow-600' },
            { price: '$307.20', label: 'Ceiling', h: '100%', count: '18 PPVs max', color: 'bg-orange-600' },
          ].map(p => (
            <div key={p.price} className="flex flex-col items-center flex-1">
              <div className="text-xs text-gray-400 mb-1">{p.count}</div>
              <div className="text-sm font-bold mb-1">{p.price}</div>
              <div className={`${p.color} rounded-t w-full`} style={{ height: p.h }} />
              <div className="text-xs text-gray-400 mt-2">{p.label}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Details */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="bg-gray-800 rounded-lg p-4">
          <h3 className="font-bold text-green-400 mb-3">🟢 $14.40 — The Gateway</h3>
          <ul className="text-sm text-gray-300 space-y-2">
            <li>• 14+ fans bought at EXACTLY this price</li>
            <li>• Most common first purchase on the platform</li>
            <li>• Use for: Welcome PPVs, first-time convert bundles</li>
            <li>• These fans either never buy again or escalate</li>
            <li>• <strong>Goal:</strong> Get them to $22.40 next</li>
          </ul>
        </div>
        <div className="bg-gray-800 rounded-lg p-4">
          <h3 className="font-bold text-blue-400 mb-3">🔵 $22.40 — Second Bite</h3>
          <ul className="text-sm text-gray-300 space-y-2">
            <li>• 8 fans at exactly this tier</li>
            <li>• Represents trust established</li>
            <li>• Fan has bought before and returned</li>
            <li>• <strong>Goal:</strong> Upsell to $35 standard bundle</li>
          </ul>
        </div>
        <div className="bg-gray-800 rounded-lg p-4">
          <h3 className="font-bold text-purple-400 mb-3">🟣 $35-50 — The Sweet Spot</h3>
          <ul className="text-sm text-gray-300 space-y-2">
            <li>• Where most whale purchases happen</li>
            <li>• John Gerrick bought multiple $35 bundles silently</li>
            <li>• High enough margin, low enough resistance</li>
            <li>• <strong>Bundle rule:</strong> 2+ videos, 4+ pics at this tier</li>
          </ul>
        </div>
        <div className="bg-gray-800 rounded-lg p-4">
          <h3 className="font-bold text-orange-400 mb-3">🟠 $307.20 — The Ceiling</h3>
          <ul className="text-sm text-gray-300 space-y-2">
            <li>• Both Justin AND Charles hit exactly $307.20</li>
            <li>• = 18 PPVs exhausted (all available content purchased)</li>
            <li>• This is the natural funnel ceiling</li>
            <li>• <strong>After this:</strong> Custom content or they churn</li>
            <li>• <strong>Signal:</strong> "I&apos;ve got everything you have" = custom time</li>
          </ul>
        </div>
      </div>

      {/* Counter-Offer Ladder */}
      <div className="bg-gray-800 rounded-lg p-4 mt-4">
        <h3 className="font-bold mb-3">🔄 Counter-Offer Price Ladder (NEVER say &quot;no worries&quot;)</h3>
        <div className="grid grid-cols-3 gap-3">
          {[
            { ask: '$99', counter1: '$69', counter2: '$50' },
            { ask: '$50', counter1: '$35', counter2: '$25' },
            { ask: '$35', counter1: '$25', counter2: '$18' },
          ].map(row => (
            <div key={row.ask} className="bg-gray-700 rounded p-3 text-center">
              <div className="text-sm text-gray-400">If they reject</div>
              <div className="text-xl font-bold text-red-400 line-through">{row.ask}</div>
              <div className="text-purple-400 my-1">→ Counter: <span className="font-bold">{row.counter1}</span></div>
              <div className="text-green-400">→ Final: <span className="font-bold">{row.counter2}</span></div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

// ============ BUNDLES ============
function BundlesTab() {
  return (
    <div>
      <div className="bg-purple-900/30 border border-purple-700 rounded-lg p-4 mb-6">
        <h3 className="font-bold text-purple-300 mb-2">📦 Bundle Building Rules</h3>
        <p className="text-sm text-gray-300">Every bundle must have <strong>2+ videos</strong> and <strong>4+ photos</strong> minimum. Bundles convert better than single items because of perceived value.</p>
      </div>

      {/* Tier Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        {[
          { tier: 'Starter', price: '$18', content: '4-5 pics', color: 'border-green-500', use: 'First-time buyers' },
          { tier: 'Standard', price: '$28-35', content: '2 vids + 4 pics', color: 'border-blue-500', use: 'Solo requests' },
          { tier: 'Premium', price: '$50', content: 'Full set + explicit', color: 'border-purple-500', use: 'Engaged fans' },
          { tier: 'Ultra', price: '$99', content: '"Never shown anyone"', color: 'border-red-500', use: 'Whale extraction' },
        ].map(t => (
          <div key={t.tier} className={`bg-gray-800 rounded-lg p-4 border-l-4 ${t.color}`}>
            <div className="text-2xl font-bold text-green-400">{t.price}</div>
            <div className="font-semibold text-white">{t.tier}</div>
            <div className="text-sm text-gray-400 mt-2">{t.content}</div>
            <div className="text-xs text-purple-400 mt-1">{t.use}</div>
          </div>
        ))}
      </div>

      {/* Bundle Captions */}
      <Expandable title="📝 Bundle Caption Templates" badge="Copy/Paste" defaultOpen>
        <ScriptBlock label="Solo Content Bundle ($28)" script="i got you babe 😌💗 this ones all me showing off slow, playing with my body till i couldnt stop teasing myself.. you gotta see how my ass looks in those tiny shorts 😚 what outfit would make you lose it first?" />
        <ScriptBlock label="Dom/Control Bundle" script="mm you really want me in control huh.. then look at this and tell me if youd last a second with my ass bouncing like that 👀" />
        <ScriptBlock label="$99 Ultra Pre-Sell Sequence" script="oh wow i cant believe were this far... never expected to share this with anyone but im really craving your attention now.. i only want this with you <3" />
        <ScriptBlock label="$99 Ultra Caption" script="fuck… i cant believe i actually did this ive never shown this much before its the most ive ever given, and i did it thinking about u watching every second my tits out, playing with them slow n deep, letting u see what no one else gets to this isnt just hot this is the one youll be stroking to in your head forever so if youre really ready… dont blink. u wont forget it 😈" />
        <ScriptBlock label="VIP Upsell (After $99)" script="If you get it ill offer you something really special ×3" />
      </Expandable>

      {/* Post-Purchase */}
      <Expandable title="🔄 Post-Purchase Follow-Ups" badge="Critical">
        <ScriptBlock label="Immediate" script="still thinking about mine? 🥺" />
        <ScriptBlock label="Upsell Tease" script="how about i show you something even better... something i made today and havent shown anyone yet?" />
        <ScriptBlock label="Crave Trigger" script="i know you crave seeing some more of me am i right?" />
        <ScriptBlock label="Unopened PPV Follow-Up (24hr)" script="You didnt unlock my last message 🥺 Did I do something wrong?" />
      </Expandable>

      {/* The $249 Extraction Play */}
      <div className="bg-gradient-to-r from-yellow-900/30 to-red-900/30 border border-yellow-700 rounded-lg p-4 mt-4">
        <h3 className="font-bold text-yellow-400 mb-2">💎 The $249 Extraction Play (Toph94)</h3>
        <div className="text-sm text-gray-300 space-y-2">
          <p>1. Sell $99 Ultra bundle with "never shown anyone" script</p>
          <p>2. Immediately after purchase, pitch VIP: &quot;If you get it ill offer you something really special&quot;</p>
          <p>3. Build mystery: &quot;Well thatll be a surprise but if you prove it to me u really want it..&quot;</p>
          <p>4. Hook: &quot;omg... you really do want me 🥺...&quot;</p>
          <p>5. Close: &quot;do you really wanna be my first ever VIP?&quot;</p>
          <p className="text-yellow-400 font-bold">→ $99 bundle + $150 VIP tip = $249 total extraction</p>
        </div>
      </div>
    </div>
  )
}

// ============ TIP STRATEGIES ============
function TipStrategiesTab() {
  return (
    <div>
      <div className="bg-red-900/30 border border-red-700 rounded-lg p-4 mb-6">
        <h3 className="font-bold text-red-300 mb-2">🚫 #1 Rule: NEVER Ask For Tips Directly</h3>
        <p className="text-sm text-gray-300">No &quot;tip me for more&quot;, no &quot;that&apos;s not enough&quot;, no &quot;pay for this&quot;. Frame everything as a game they&apos;re winning, a reward they&apos;re earning, or a secret they&apos;re unlocking.</p>
      </div>

      {/* The Playful Challenge Loop */}
      <div className="bg-gray-800 rounded-lg p-6 mb-6">
        <h3 className="font-bold text-xl mb-2">🔥 The Playful Challenge Loop</h3>
        <div className="text-sm text-purple-400 mb-4">Soccerguy0990: $270 in tips in 5 minutes ($20 → $50 → $200)</div>

        <div className="space-y-3">
          {[
            { who: 'Fan', msg: 'Tips $20 and asks "What does that get me?"', tip: '$20', color: 'bg-blue-900/30' },
            { who: 'Chatter', msg: 'Sends video + "💕💕"', tip: '', color: 'bg-pink-900/30' },
            { who: 'Fan', msg: '"And that?"', tip: '$50', color: 'bg-blue-900/30' },
            { who: 'Chatter', msg: 'Sends 2 more vids + "xxx😘"', tip: '', color: 'bg-pink-900/30' },
            { who: 'Chatter', msg: '"but you know it always gets better 👀"', tip: '⭐ KEY LINE', color: 'bg-yellow-900/30' },
            { who: 'Fan', msg: '"Prove it to me!"', tip: '', color: 'bg-blue-900/30' },
            { who: 'Chatter', msg: '"only if you prove it to me that you really want it x"', tip: '⭐ THE FLIP', color: 'bg-yellow-900/30' },
            { who: 'Fan', msg: '"Show me what you\'ve got then!"', tip: '$200 🔥', color: 'bg-green-900/30' },
          ].map((step, i) => (
            <div key={i} className={`${step.color} rounded p-3 flex justify-between items-center`}>
              <div>
                <span className={`text-xs font-bold ${step.who === 'Fan' ? 'text-blue-400' : 'text-pink-400'}`}>{step.who}: </span>
                <span className="text-sm text-gray-200">{step.msg}</span>
              </div>
              {step.tip && <span className="text-sm font-bold text-green-400 ml-4 shrink-0">{step.tip}</span>}
            </div>
          ))}
        </div>

        <div className="mt-4 bg-purple-900/30 rounded p-3">
          <div className="text-sm font-bold text-purple-300 mb-1">Why it works:</div>
          <ul className="text-sm text-gray-300 space-y-1">
            <li>• Fan feels like he&apos;s &quot;winning&quot; by proving himself</li>
            <li>• Competitive/gaming psychology — unlock the next level</li>
            <li>• Chatter never asks for money directly</li>
            <li>• Back-and-forth dynamic, not transactional</li>
          </ul>
        </div>
      </div>

      {/* Key Scripts */}
      <Expandable title="📋 Tip-Generating Scripts" badge="Copy/Paste" defaultOpen>
        <ScriptBlock label="After Receiving Any Tip" script="mmm thank you baby 💕 but you know... it only gets better from here 👀" />
        <ScriptBlock label="The Challenge Flip" script="only if you prove to me you really want it x" />
        <ScriptBlock label="Escalation Dare" script="show me how bad you want it then 😏" />
        <ScriptBlock label="Tease Withhold" script="but you know it always gets better 👀" />
        <ScriptBlock label="Arousal Check (natural tip trigger)" script="what kinda tease gets you the most worked up, babe?" />
      </Expandable>

      {/* Tip Psychology */}
      <div className="bg-gray-800 rounded-lg p-4 mt-4">
        <h3 className="font-bold mb-3">📊 Tip Approach Effectiveness</h3>
        <div className="space-y-2">
          {[
            { approach: 'Direct ask ("tip me pls")', eff: 'LOW', color: 'bg-red-600', w: '15%' },
            { approach: 'Guilt trip ("dont you want to support me?")', eff: 'LOW', color: 'bg-red-600', w: '20%' },
            { approach: 'Challenge loop ("prove you want it")', eff: 'HIGH', color: 'bg-green-600', w: '85%' },
            { approach: 'Arousal-based (natural flow)', eff: 'HIGH', color: 'bg-green-600', w: '80%' },
            { approach: 'Tease + withhold ("it gets better...")', eff: 'HIGH', color: 'bg-green-600', w: '80%' },
          ].map(row => (
            <div key={row.approach} className="flex items-center gap-3">
              <div className="w-64 text-sm text-gray-300 shrink-0">{row.approach}</div>
              <div className="flex-1 bg-gray-700 rounded-full h-4 overflow-hidden">
                <div className={`${row.color} h-full rounded-full`} style={{ width: row.w }} />
              </div>
              <span className={`text-xs font-bold ${row.eff === 'HIGH' ? 'text-green-400' : 'text-red-400'}`}>{row.eff}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

// ============ WHALE PROFILES ============
function WhaleProfilesTab() {
  const whales = [
    {
      name: 'Soccerguy0990',
      username: '@soccerguy0990',
      spent: '$826.40',
      type: 'Mass Bundle Buyer → Chaser',
      velocity: '$275/day (3 days)',
      color: 'border-yellow-500',
      pattern: '33 PPVs in 3 days. Unlocks everything. Then pushed for more explicit content. Experienced buyer\'s remorse: "I tipped so much, so fast, for nothing."',
      tactics: ['Boundary Resistance ("Baby... i thought we talked")', 'Silent guilt ("...")', 'Challenge Loop ($270 in 5 min via tips)'],
      warning: 'HATES cross-promo S4S — felt betrayed seeing other girls promoted in his inbox. CHURN RISK.',
      retention: 'Express gratitude, never assume he\'ll keep spending, give breathing room after big purchases.',
    },
    {
      name: 'MDNYJetsFan',
      username: '@mdjets26',
      spent: '$437.60',
      type: 'Emotional Investor',
      velocity: 'Weekend buyer (works 3:45am-6pm)',
      color: 'border-blue-500',
      pattern: '41yo, trusts creator "the most here". Buys based on emotional connection. Asks about future content unprompted. Self-sells.',
      tactics: ['Vulnerability ("I hope you will like it 💕 i really do")', 'Exclusivity ("ull always be the first to know")', 'Butterfly check-in', 'Request-fulfillment loop'],
      warning: '"I\'ve now got everything you have to share and I still crave more of you" = CUSTOM CONTENT OPPORTUNITY',
      retention: 'Weekend engagement, validate his age/identity, make him feel special.',
    },
    {
      name: 'Axe',
      username: '@axe123456789',
      spent: '$331.20',
      type: 'Sexual Energy Matcher',
      velocity: 'Multi-buy sessions (horny sessions)',
      color: 'border-red-500',
      pattern: 'Sends his OWN videos. Uses explicit language. Bought $100 + $69 + multiple $48 bundles in single sessions. Returns multiple times.',
      tactics: ['Match explicit energy immediately', 'Submission language ("pleaseee daddy")', 'Direct commands ("unlock that stroke it hard")', 'Guilt play when he hesitates'],
      warning: 'Sends video of himself = EXTREMELY high investment. Treat every return as a new session.',
      retention: 'Keep matching energy. Never break character during sessions.',
    },
    {
      name: 'John Gerrick',
      username: '@johng5',
      spent: '$328.80',
      type: 'Pure Silent Bundle Buyer',
      velocity: '$328 in 2 days, zero messages',
      color: 'border-gray-500',
      pattern: 'Never chats. Only unlocks mass PPVs. ~10 purchases at $35 each. Zero conversation overhead.',
      tactics: ['Send mass PPVs at $35', 'No personalization needed', 'Just keep sending — he buys everything'],
      warning: 'Don\'t waste chatter time on this type. Add to mass PPV list and forget.',
      retention: 'Consistent $35 bundles. That\'s it.',
    },
    {
      name: 'Justin',
      username: '@u549927716',
      spent: '$307.20',
      type: 'Emotional Chaser',
      velocity: 'Hit $307.20 ceiling (18 PPVs)',
      color: 'border-pink-500',
      pattern: 'Tried to get free content. Got hit with unsend threat and trust test. Panicked and paid. Hit the funnel ceiling at $307.20.',
      tactics: ['Unsend threat ("but ill just unsend ig")', 'Trust test ("should i trust u")', 'Waiting game ("ill sit on the bed and wait")', 'Never gave free — redirected to new account'],
      warning: 'At ceiling. Needs custom content or will churn.',
      retention: 'Promise-first deflection for explicit requests. Keep the chase alive.',
    },
    {
      name: 'Charles',
      username: '@u467003110',
      spent: '$307.20',
      type: 'Demanding Skeptic',
      velocity: 'Hit $307.20 ceiling',
      color: 'border-orange-500',
      pattern: 'Called out reused content: "That\'s the same thing yesterday". Got 🥺 denial. STILL BOUGHT $99. Demanded "drop them panties" after purchase.',
      tactics: ['🥺 Denial deflection', 'Request fulfillment (asked for "from the back" → got it)', '"Never shown anyone" escalation pitch'],
      warning: 'Will call BS but keeps buying. Don\'t panic when caught — 🥺 and pivot.',
      retention: 'Keep fulfilling specific requests. Ignore complaints.',
    },
    {
      name: 'Toph94',
      username: '@u241909752',
      spent: '$289.60',
      type: 'Negotiator Whale',
      velocity: '$150 single tip',
      color: 'border-yellow-500',
      pattern: 'Negotiated VIP deal. Tipped $150 to become "first VIP". Wants customs and discounts in return.',
      tactics: ['VIP tier system', 'Custom promise', '"First VIP" psychological ownership', 'Future discount hook'],
      warning: 'Expects explicit deals for VIP status. Manage expectations carefully.',
      retention: 'Follow through on VIP promises. First access to new content.',
    },
    {
      name: 'Jayy ✨',
      username: '@u299750197',
      spent: '$76',
      type: 'Emotional Connection Buyer (GFE)',
      velocity: 'Steady daily engagement',
      color: 'border-purple-500',
      pattern: '$76 spent with NO NUDES delivered. "I\'m new/shy 🥺" deflection used TWICE — fan apologized BOTH times for pushing. Still engaged: "I waited all day to talk before bed."',
      tactics: ['Shy/new deflection (fan apologizes for asking!)', 'GFE attention = product', 'Daily check-ins keep them hooked', 'Zero content cost, pure relationship monetization'],
      warning: 'THIS IS THE DISCOVERY: GFE monetization works. Sell relationship, not content. These fans can be milked indefinitely.',
      retention: 'Consistent daily attention. Never break the girlfriend illusion.',
    },
  ]

  return (
    <div>
      <div className="bg-purple-900/30 border border-purple-700 rounded-lg p-4 mb-6">
        <h3 className="font-bold text-purple-300 mb-2">🐋 Whale Intelligence</h3>
        <p className="text-sm text-gray-300">Detailed profiles of top spenders with proven tactics. Study these patterns — they repeat across all models.</p>
      </div>
      {whales.map(w => (
        <Expandable key={w.username} title={`${w.name} (${w.spent})`} badge={w.type}>
          <div className={`border-l-4 ${w.color} pl-4`}>
            <div className="grid grid-cols-2 gap-4 mb-3">
              <div>
                <div className="text-xs text-gray-400">Username</div>
                <div className="text-sm">{w.username}</div>
              </div>
              <div>
                <div className="text-xs text-gray-400">Velocity</div>
                <div className="text-sm">{w.velocity}</div>
              </div>
            </div>
            <div className="mb-3">
              <div className="text-xs text-gray-400 mb-1">Pattern</div>
              <div className="text-sm text-gray-300">{w.pattern}</div>
            </div>
            <div className="mb-3">
              <div className="text-xs text-gray-400 mb-1">Tactics That Work</div>
              <ul className="text-sm text-gray-300 space-y-1">
                {w.tactics.map((t, i) => <li key={i} className="flex gap-2"><span className="text-green-400">✓</span>{t}</li>)}
              </ul>
            </div>
            <div className="bg-yellow-900/20 border border-yellow-800 rounded p-3 mb-3">
              <div className="text-xs text-yellow-400 mb-1">⚠️ Warning / Key Signal</div>
              <div className="text-sm text-gray-300">{w.warning}</div>
            </div>
            <div className="bg-blue-900/20 border border-blue-800 rounded p-3">
              <div className="text-xs text-blue-400 mb-1">Retention Strategy</div>
              <div className="text-sm text-gray-300">{w.retention}</div>
            </div>
          </div>
        </Expandable>
      ))}
    </div>
  )
}

// ============ CRITICAL RULES ============
function CriticalRulesTab() {
  return (
    <div>
      {/* The Commandments */}
      <div className="bg-red-900/20 border border-red-700 rounded-lg p-6 mb-6">
        <h3 className="font-bold text-xl text-red-400 mb-4">🚨 The 10 Commandments of Chatting</h3>
        <div className="space-y-4">
          {[
            { rule: 'NEVER say "no worries" when a fan declines', detail: 'Always counter-offer. $50 → $35 → $25. Every "no worries" = $20-50 lost.', icon: '🚫' },
            { rule: 'Always counter-offer — have 3 prices ready', detail: 'Start 30-50% higher than your floor. Have 2 fallback prices. "Totally understand babe! What if we did $X instead? 💕"', icon: '💰' },
            { rule: '🥺 emoji deflects ALL accusations', detail: 'Fan caught you lying? Reusing content? "wdym love 🥺" — they still buy. Charles proved this with $99.', icon: '🥺' },
            { rule: 'Fans who call BS still buy', detail: 'Charles called out reused content, CXR said "not hard" — both kept buying. Never panic when caught. Pivot to selling.', icon: '🤑' },
            { rule: 'Never give content for free', detail: 'Justin asked for free, got redirected. He then spent $307.20. There is NO free. Ever.', icon: '🔒' },
            { rule: 'PPV during buyer\'s remorse WORKS', detail: 'Vulnerability hooks recover faster than apologies. "I hope you will like it 💕 i really do" — not "sorry about that".', icon: '💕' },
            { rule: 'Top whales want EXCLUSIVITY', detail: 'Soccerguy0990 nearly churned because S4S promos landed in his inbox. Cross-promo feels like betrayal to whales.', icon: '👑' },
            { rule: 'Follow up on EVERY unopened PPV', detail: '24-hour follow-up with soft guilt: "You didn\'t unlock my last message 🥺 Did I do something wrong?"', icon: '📬' },
            { rule: 'Never acknowledge complaints directly', detail: 'Pivot to selling. "i dont have baby🥺 im new here and shy..." works better than addressing the issue.', icon: '🛡️' },
            { rule: 'The chat IS the product', detail: 'Jayy spent $76 with no nudes. GFE monetization is real. Sell the relationship, not just content.', icon: '💎' },
          ].map((r, i) => (
            <div key={i} className="flex gap-4 items-start bg-gray-800 rounded-lg p-4">
              <div className="text-2xl">{r.icon}</div>
              <div>
                <div className="font-bold text-white">{i + 1}. {r.rule}</div>
                <div className="text-sm text-gray-400 mt-1">{r.detail}</div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Anti-Patterns */}
      <Expandable title="❌ Anti-Patterns (What Kills Sales)" badge="Avoid" defaultOpen>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {[
            { bad: '"no worries" after rejection', good: '"What if we did $X instead? 💕"' },
            { bad: 'Auto-message during sensitive moments', good: 'Read the room. Soccerguy was frustrated — auto-msg made it WORSE' },
            { bad: 'S4S tag into paying whale inbox', good: 'Exclude whales from cross-promo. They want exclusivity.' },
            { bad: '"Tip me for more" (begging)', good: '"only if you prove it to me that you really want it x" (challenge)' },
            { bad: 'Acknowledging complaints head-on', good: 'Pivot: "i dont have baby🥺 im new here and shy..."' },
            { bad: 'One price, take it or leave it', good: 'Start high, have 2 counter-offers ready' },
          ].map((item, i) => (
            <div key={i} className="bg-gray-800 rounded p-3">
              <div className="text-red-400 text-sm line-through mb-1">{item.bad}</div>
              <div className="text-green-400 text-sm">→ {item.good}</div>
            </div>
          ))}
        </div>
      </Expandable>

      {/* Whale Retention */}
      <Expandable title="🐋 Whale Retention Scripts" badge="Save the whales">
        <p className="text-sm text-gray-400 mb-3">When a whale expresses buyer&apos;s remorse or frustration:</p>
        <ScriptBlock label="Reassurance" script="you didnt have to do that, that was so sweet" />
        <ScriptBlock label="Value Beyond Money" script="i dont expect anything from you, i just like talking to you" />
        <ScriptBlock label="Connection Over Transaction" script="you always make my day, not because of that but because of you" />
        <ScriptBlock label="Breathing Room" script="take your time, i'm not going anywhere" />
        <ScriptBlock label="Never Assume" script="I dont think ur rich and i never assume anything, dont you worry about that..." />
      </Expandable>

      {/* Welcome Sequence */}
      <Expandable title="👋 Welcome Sequence (New Subscriber)" badge="Automate">
        <div className="text-sm text-gray-400 mb-3">3-step welcome that converts curiosity into first purchase:</div>
        <ScriptBlock label="Step 1: Open (on subscribe)" script="Okay, now that you're here… what made you click on me? 🤭" />
        <ScriptBlock label="Step 2: Personalize" script="hii baby, thanks for subbing..what should i call u? :3" />
        <ScriptBlock label="Step 3: Qualify" script="aww thats sweet.. what kinda stuff do you usually like seeing on here, [name]?" />
        <div className="bg-purple-900/30 rounded p-3 mt-3">
          <div className="text-xs text-purple-400">Then match their answer to a pre-built bundle and send it. $18 starter for new fans, $28-35 for engaged ones.</div>
        </div>
      </Expandable>

      {/* The GFE Discovery */}
      <div className="bg-gradient-to-r from-purple-900/40 to-pink-900/40 border border-purple-600 rounded-lg p-6 mt-4">
        <h3 className="font-bold text-xl text-purple-300 mb-3">💎 The GFE Discovery: Jayy ($76, Zero Nudes)</h3>
        <div className="text-sm text-gray-300 space-y-3">
          <p>Jayy spent <strong>$76 without receiving a single nude</strong>. The &quot;I&apos;m new/shy 🥺&quot; deflection was used <strong>twice</strong> — and the fan <strong>apologized both times</strong> for pushing.</p>
          <p>His latest message: <strong>&quot;I waited all day to talk before bed.&quot;</strong></p>
          <p>This proves that the <strong>relationship IS the product</strong>. GFE (Girlfriend Experience) monetization works. These fans:</p>
          <ul className="list-disc list-inside space-y-1">
            <li>Can be monetized <strong>indefinitely</strong> with just attention</li>
            <li>Have <strong>zero content cost</strong> (no nudes needed)</li>
            <li>Are <strong>self-retaining</strong> — they come back daily</li>
            <li><strong>Self-blame</strong> when denied (protective of the relationship)</li>
          </ul>
          <p className="text-purple-400 font-bold mt-3">This is potentially the highest-margin revenue stream in OF chatting.</p>
        </div>
      </div>
    </div>
  )
}
