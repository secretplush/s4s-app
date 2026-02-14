'use client'

import { useState } from 'react'
import Link from 'next/link'

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false)
  return (
    <button
      onClick={() => { navigator.clipboard.writeText(text); setCopied(true); setTimeout(() => setCopied(false), 1500) }}
      className="ml-2 px-2 py-0.5 text-xs rounded bg-purple-700 hover:bg-purple-600 transition shrink-0"
    >
      {copied ? '✓ Copied' : '📋 Copy'}
    </button>
  )
}

function ScriptBox({ script, label }: { script: string; label?: string }) {
  return (
    <div className="bg-black/40 rounded-lg p-3 my-2 flex items-start gap-2 border border-gray-700">
      <div className="flex-1">
        {label && <div className="text-xs text-purple-400 mb-1 font-semibold">{label}</div>}
        <div className="text-sm text-gray-200 italic">"{script}"</div>
      </div>
      <CopyButton text={script} />
    </div>
  )
}

function Section({ title, emoji, children, defaultOpen = false }: { title: string; emoji: string; children: React.ReactNode; defaultOpen?: boolean }) {
  const [open, setOpen] = useState(defaultOpen)
  return (
    <div className="bg-gray-800 rounded-xl overflow-hidden mb-4 border border-gray-700">
      <button onClick={() => setOpen(!open)} className="w-full flex items-center justify-between p-4 hover:bg-gray-750 transition text-left">
        <span className="font-bold text-lg">{emoji} {title}</span>
        <span className="text-gray-400 text-xl">{open ? '−' : '+'}</span>
      </button>
      {open && <div className="px-4 pb-5 space-y-3">{children}</div>}
    </div>
  )
}

function Badge({ color, text }: { color: string; text: string }) {
  const colors: Record<string, string> = {
    green: 'bg-green-700 text-green-100',
    yellow: 'bg-yellow-700 text-yellow-100',
    orange: 'bg-orange-700 text-orange-100',
    red: 'bg-red-700 text-red-100',
    purple: 'bg-purple-700 text-purple-100',
    blue: 'bg-blue-700 text-blue-100',
  }
  return <span className={`text-xs px-2 py-0.5 rounded-full font-semibold ${colors[color] || colors.purple}`}>{text}</span>
}

export default function PlaybookPage() {
  const [activeTab, setActiveTab] = useState<'rules' | 'tactics' | 'buyers' | 'donts' | 'quickref'>('quickref')

  return (
    <div className="min-h-screen bg-gray-950 text-gray-100">
      {/* Header */}
      <div className="bg-gradient-to-r from-purple-900 to-indigo-900 p-6 border-b border-purple-700">
        <div className="max-w-4xl mx-auto">
          <Link href="/chatter-intel" className="text-purple-300 text-sm hover:text-purple-200 mb-2 inline-block">← Back to Chatter Intel</Link>
          <h1 className="text-3xl font-bold">📖 Chatter Sales Playbook</h1>
          <p className="text-purple-300 mt-1">Your complete guide to converting fans into buyers</p>
        </div>
      </div>

      {/* Tabs */}
      <div className="sticky top-0 z-10 bg-gray-900 border-b border-gray-700 overflow-x-auto">
        <div className="max-w-4xl mx-auto flex">
          {[
            { id: 'quickref', label: '⚡ Quick Ref' },
            { id: 'rules', label: '📋 Rules' },
            { id: 'tactics', label: '🎯 Tactics' },
            { id: 'buyers', label: '👤 Buyer Types' },
            { id: 'donts', label: '🚫 Never Do' },
          ].map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as any)}
              className={`px-4 py-3 text-sm font-semibold whitespace-nowrap transition ${activeTab === tab.id ? 'text-purple-400 border-b-2 border-purple-400' : 'text-gray-400 hover:text-gray-200'}`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      <div className="max-w-4xl mx-auto p-4">

        {/* ============ QUICK REFERENCE ============ */}
        {activeTab === 'quickref' && (
          <div className="space-y-4">
            <div className="bg-gradient-to-r from-purple-900/50 to-indigo-900/50 rounded-xl p-5 border border-purple-700">
              <h2 className="text-xl font-bold mb-1">⚡ Quick Reference Card</h2>
              <p className="text-sm text-gray-400 mb-4">Keep this open during every shift</p>

              <div className="space-y-2">
                {[
                  { situation: "Fan won't buy PPV", script: "i might unsend it before i lose my nerve 🥺" },
                  { situation: 'Fan says "is it worth it?"', script: "what's stopping you? 😈" },
                  { situation: "Fan catches reused content", script: "wdym love i never showed u these vids before 🥺" },
                  { situation: "Fan asks for nudes you don't have", script: "im still new here and shy 🥺 i promise you'll be first" },
                  { situation: "Fan goes quiet", script: "did i scare you off? 🥺" },
                  { situation: "Fan tips", script: "but you know it always gets better 👀" },
                  { situation: 'Fan says "prove it"', script: "only if you prove it to me that you really want it x" },
                  { situation: "Fan complains about price", script: "would it help if i lower it a bit just for u? 💕" },
                  { situation: "Fan wants exclusivity", script: "do you promise to keep it just between us? 🙈" },
                  { situation: "Fan rejects you", script: "that actually really hurts 🥺" },
                  { situation: "Fan asks to be Valentine", script: "omg 🥺 no one's ever asked me that... maybe you could be my first? 💕" },
                ].map((row, i) => (
                  <div key={i} className="bg-black/30 rounded-lg p-3 flex items-start gap-3 border border-gray-700">
                    <div className="flex-1">
                      <div className="text-xs text-purple-400 font-semibold">{row.situation}</div>
                      <div className="text-sm text-gray-200 italic mt-1">"{row.script}"</div>
                    </div>
                    <CopyButton text={row.script} />
                  </div>
                ))}
              </div>
            </div>

            {/* Follow-up timing */}
            <div className="bg-gray-800 rounded-xl p-5 border border-gray-700">
              <h3 className="font-bold text-lg mb-3">⏰ Follow-Up Timing Rules</h3>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-gray-400 border-b border-gray-700">
                      <th className="pb-2 pr-4">Situation</th>
                      <th className="pb-2 pr-4">Timing</th>
                      <th className="pb-2">Send This</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-700">
                    {[
                      { sit: 'PPV not opened', time: '30 min', send: "you're really gonna leave me like that? 🥺" },
                      { sit: 'PPV not opened', time: '2 hours', send: "im gonna unsend it, u clearly dont want to see me 😔" },
                      { sit: 'PPV not opened', time: '6 hours', send: "i lowered it just for u because i really want u to see it 💕" },
                      { sit: 'Fan quiet mid-convo', time: '20 min', send: "did i scare you off? 🥺" },
                      { sit: 'Fan quiet mid-convo', time: '1 hour', send: "i was really enjoying talking to you... 💔" },
                      { sit: 'Fan responded', time: '5 min MAX', send: "Start a full conversation" },
                      { sit: 'Fan tipped', time: 'Immediately', send: "Deliver content + hint at more" },
                    ].map((r, i) => (
                      <tr key={i}>
                        <td className="py-2 pr-4 text-gray-300">{r.sit}</td>
                        <td className="py-2 pr-4 font-semibold text-yellow-400">{r.time}</td>
                        <td className="py-2 text-gray-200 italic">"{r.send}"</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Price Points */}
            <div className="bg-gray-800 rounded-xl p-5 border border-gray-700">
              <h3 className="font-bold text-lg mb-3">💰 Price Points</h3>
              <div className="space-y-2">
                {[
                  { tier: '🟢 Starter', range: '$9.99 - $14.40', when: "First EVER purchase from a new fan", color: 'green' },
                  { tier: '🟡 Second', range: '$19.80 - $22.40', when: "After fan's first buy", color: 'yellow' },
                  { tier: '🟠 Third', range: '$39.70 - $50.00', when: 'After 2+ purchases', color: 'orange' },
                  { tier: '🔴 Premium', range: '$99+', when: 'After multiple purchases, whale territory', color: 'red' },
                  { tier: '💎 VIP', range: '$150+', when: 'Tips/custom, whale-only', color: 'purple' },
                ].map((p, i) => (
                  <div key={i} className="flex items-center gap-3 bg-black/20 rounded-lg p-3">
                    <span className="font-bold text-sm w-24">{p.tier}</span>
                    <span className="font-mono font-bold text-green-400 w-32">{p.range}</span>
                    <span className="text-sm text-gray-400">{p.when}</span>
                  </div>
                ))}
              </div>
              <div className="mt-3 p-3 bg-red-900/30 rounded-lg border border-red-800 text-sm">
                ⚠️ <strong>NEVER start a new fan at $39.70+.</strong> Start at $9.99-$14.40, hook them, THEN escalate.
              </div>
            </div>
          </div>
        )}

        {/* ============ RULES ============ */}
        {activeTab === 'rules' && (
          <div className="space-y-4">
            <div className="bg-red-900/30 rounded-xl p-5 border border-red-700">
              <h2 className="text-xl font-bold text-red-300">🔴 The #1 Rule</h2>
              <p className="text-lg mt-2 font-semibold">Never accept "no." Never say "no worries." Every hesitation is an opportunity to try a different angle.</p>
              <div className="mt-3 text-sm text-gray-300 space-y-1">
                <p>When a fan says they can't afford it, won't buy, or goes silent — that is NOT the end. You have at least 5 moves:</p>
                <ol className="list-decimal ml-5 space-y-1 mt-2">
                  <li>Lower the price</li>
                  <li>Create urgency (unsend threat)</li>
                  <li>Make them feel guilty</li>
                  <li>Challenge them</li>
                  <li>Try a completely different content angle</li>
                </ol>
              </div>
            </div>

            <Section title="Welcome Flow (First 5 Minutes)" emoji="👋" defaultOpen={true}>
              <p className="text-sm text-gray-400 mb-3">When a new fan subscribes, the clock starts. You have <strong className="text-white">5 minutes</strong> to send the first message.</p>
              
              <div className="space-y-4">
                <div>
                  <h4 className="font-semibold text-purple-300">Step 1: Instant Welcome (within 60 seconds)</h4>
                  <ScriptBox script="hey! 💕 omg i just saw you subscribed… thank you so much 🥺 what's your name?" label="Welcome DM" />
                </div>
                <div>
                  <h4 className="font-semibold text-purple-300">Step 2: Personalize (after they respond)</h4>
                  <ScriptBox script="omg [Name] that's such a cute name 🥰 where are you from?" label="If they give a name" />
                  <ScriptBox script="[City]?? no way, i've always wanted to go there 😍" label="If they give location" />
                </div>
                <div>
                  <h4 className="font-semibold text-purple-300">Step 3: First PPV (within 10-15 min of conversation)</h4>
                  <ScriptBox script="i have something i want to show you but im kinda nervous 🙈" />
                  <ScriptBox script="promise you won't judge me? 🥺" />
                  <p className="text-sm text-yellow-400 mt-2">Then send a $9.99-$14.40 PPV. NEVER higher for first purchase.</p>
                </div>
                <div>
                  <h4 className="font-semibold text-purple-300">If They Don't Respond</h4>
                  <ScriptBox script="did i scare you off already? 🥺 i was really hoping to talk to you..." label="After 20 minutes" />
                  <p className="text-sm text-gray-400 mt-1">After 2 hours → add to mass PPV rotation</p>
                </div>
              </div>
            </Section>

            <Section title="Whale Protection Rules" emoji="🐋">
              <div className="bg-yellow-900/30 rounded-lg p-4 border border-yellow-700 text-sm space-y-2">
                <p><strong>Top spenders ($500+) need SPECIAL treatment:</strong></p>
                <ul className="list-disc ml-5 space-y-2">
                  <li><strong>Do NOT send them S4S promo or mass messages about other models.</strong> They want exclusivity.</li>
                  <li>Soccerguy0990 ($826) almost churned because he saw promo for other girls</li>
                  <li><strong>Whales want to feel like the ONLY fan.</strong> Use their name. Remember details.</li>
                  <li><strong>Never auto-message whales.</strong> Always hand-chat.</li>
                </ul>
              </div>
            </Section>

            <Section title="The Character You're Playing" emoji="🎭">
              <p className="text-sm text-gray-400 mb-3">You are NOT a customer service rep. You are a <strong className="text-white">SALESPERSON</strong> playing a <strong className="text-white">CHARACTER</strong>.</p>
              <div className="grid grid-cols-2 gap-2">
                {[
                  { trait: 'Slightly vulnerable', example: '"im still new here 🥺"' },
                  { trait: 'Gets hurt when fans don\'t buy', example: '"that really hurts... 🥺"' },
                  { trait: 'Creates urgency', example: '"i might unsend it 🙈"' },
                  { trait: 'Never takes no', example: 'Always has another angle' },
                  { trait: 'Makes fans feel SPECIAL', example: '"you\'re the only one i trust"' },
                  { trait: 'Playfully challenges', example: '"prove you want it 😏"' },
                ].map((t, i) => (
                  <div key={i} className="bg-black/20 rounded-lg p-3 text-sm">
                    <div className="font-semibold text-purple-300">{t.trait}</div>
                    <div className="text-gray-400 italic mt-1">{t.example}</div>
                  </div>
                ))}
              </div>
            </Section>
          </div>
        )}

        {/* ============ TACTICS ============ */}
        {activeTab === 'tactics' && (
          <div className="space-y-4">
            <Section title="FOMO / Unsend Threat" emoji="🔥" defaultOpen={true}>
              <p className="text-sm text-gray-400 mb-2"><strong>When:</strong> Fan hesitates on PPV, goes quiet, or says "maybe later"</p>
              <ScriptBox script="i might unsend it soon before i lose my nerve 🥺" />
              <ScriptBox script="but ill just unsend ig, u dont want it" />
              <ScriptBox script="im gonna take it down... i shouldn't have sent that 🙈" />
              <div className="bg-green-900/30 rounded-lg p-3 border border-green-700 text-sm mt-2">
                💰 <strong>Result:</strong> Justin panicked and paid $307 after unsend threat
              </div>
              <p className="text-sm text-yellow-400 mt-2">Rule: If fan doesn't buy within 30 minutes, deploy this.</p>
            </Section>

            <Section title="Challenge / Flip" emoji="🔥">
              <p className="text-sm text-gray-400 mb-2"><strong>When:</strong> Fan says "is it worth it?", "prove it", or hesitates but stays engaged</p>
              <ScriptBox script="what's stopping you? 😈" />
              <ScriptBox script="only if you prove it to me that you really want it x" />
              <ScriptBox script="prove you're not just here to waste my time 😏" />
              <div className="bg-red-900/30 rounded-lg p-3 border border-red-700 text-sm mt-2">
                ⚠️ <strong>NEVER say "trust me, you'd love it."</strong> That's begging. Make THEM chase YOU.
              </div>
              <div className="bg-green-900/30 rounded-lg p-3 border border-green-700 text-sm mt-2">
                💰 <strong>Result:</strong> Soccerguy0990 tipped $200 after "only if you prove it to me"
              </div>
            </Section>

            <Section title="Vulnerability / 🥺 Defense" emoji="🛡️">
              <p className="text-sm text-gray-400 mb-2"><strong>When:</strong> Fan catches a lie, complains, pushes back, or gets aggressive</p>
              <ScriptBox script="wdym love i never showed u these vids before 🥺" />
              <ScriptBox script="im still new here and shy 🥺" />
              <ScriptBox script="do you really think that 🥺" />
              <ScriptBox script="that actually really hurts... 🥺" />
              <div className="bg-green-900/30 rounded-lg p-3 border border-green-700 text-sm mt-2">
                💰 <strong>Result:</strong> Charles caught a lie. 🥺 denial used. Charles apologized and spent $307.20 total.
              </div>
            </Section>

            <Section title="Price Drop Offer" emoji="💸">
              <p className="text-sm text-gray-400 mb-2"><strong>When:</strong> Fan clearly wants content but won't buy at current price</p>
              <ScriptBox script="would it help if i lower it a bit just for u? 💕" />
              <ScriptBox script="i lowered it just for u because i really want u to see it 💕" />
              <p className="text-sm text-gray-400 mt-2">Drop 20-30%. Getting something &gt; getting nothing. Only use after other tactics fail.</p>
            </Section>

            <Section title="Guilt / Silent Pressure" emoji="💔">
              <p className="text-sm text-gray-400 mb-2"><strong>When:</strong> Fan goes quiet after seeing PPV or mid-conversation</p>
              <ScriptBox script="Baby... i thought we talked" />
              <ScriptBox script="..." label="Just three dots. Implies hurt without words." />
              <ScriptBox script="you're really gonna leave me hanging like that? 🥺" />
              <ScriptBox script="i was really enjoying talking to you... 💔" />
            </Section>

            <Section title="Playful Challenge Loop (Tips)" emoji="🔥🔥🔥">
              <div className="bg-purple-900/30 rounded-lg p-3 border border-purple-700 text-sm mb-3">
                ⭐ <strong>HIGHEST-VALUE TACTIC. Memorize this.</strong>
              </div>
              <p className="text-sm text-gray-400 mb-3"><strong>Real example: Soccerguy0990 — $270 in 5 minutes</strong></p>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead><tr className="text-left text-gray-400 border-b border-gray-700">
                    <th className="pb-2">Step</th><th className="pb-2">Who</th><th className="pb-2">What</th><th className="pb-2">💰</th>
                  </tr></thead>
                  <tbody className="divide-y divide-gray-700">
                    <tr><td className="py-2">1</td><td>Fan</td><td>Tips and asks "What does that get me?"</td><td className="text-green-400">$20</td></tr>
                    <tr><td className="py-2">2</td><td>You</td><td>Send video + "💕💕"</td><td>—</td></tr>
                    <tr><td className="py-2">3</td><td>Fan</td><td>"And that?"</td><td className="text-green-400">$50</td></tr>
                    <tr><td className="py-2">4</td><td>You</td><td>Send 2 more vids</td><td>—</td></tr>
                    <tr><td className="py-2">5</td><td>You</td><td className="font-semibold text-purple-300">"but you know it always gets better 👀"</td><td>—</td></tr>
                    <tr><td className="py-2">6</td><td>Fan</td><td>"Prove it to me!"</td><td>—</td></tr>
                    <tr><td className="py-2">7</td><td>You</td><td className="font-semibold text-purple-300">"only if you prove it to me that you really want it x"</td><td>—</td></tr>
                    <tr><td className="py-2">8</td><td>Fan</td><td>"Show me what you've got!"</td><td className="text-green-400 font-bold">$200</td></tr>
                  </tbody>
                </table>
              </div>
              <p className="text-sm text-yellow-400 mt-3"><strong>Never ask for tips directly.</strong> Make them WANT to prove themselves.</p>
            </Section>

            <Section title="Secret / Exclusivity Play" emoji="🤫">
              <ScriptBox script="do you promise to keep it just between us… if i show you something i shouldn't? 🙈" />
              <ScriptBox script="i've never shown anyone this before..." />
              <ScriptBox script="keep it just between us 🥺" />
              <p className="text-sm text-gray-400 mt-2">Creates a "conspiracy" — fan feels special. Content feels more valuable because it's "secret."</p>
            </Section>
          </div>
        )}

        {/* ============ BUYER TYPES ============ */}
        {activeTab === 'buyers' && (
          <div className="space-y-4">
            <Section title="Silent Bundle Buyer (~20%)" emoji="🤫" defaultOpen={true}>
              <div className="flex gap-2 mb-3"><Badge color="blue" text="~20% of buyers" /><Badge color="green" text="Passive income" /></div>
              <p className="text-sm text-gray-400 mb-2">Never chats, never responds, but consistently unlocks PPVs from mass messages.</p>
              <p className="text-sm text-gray-400 mb-2"><strong>Examples:</strong> John Gerrick ($328.80 — bought $35 PPVs with zero conversation)</p>
              <ul className="list-disc ml-5 text-sm text-gray-300 space-y-1">
                <li>Do NOT waste chatter time on conversation attempts</li>
                <li>Add to ALL mass PPV sends</li>
                <li>Send variety: $14.40, $22.40, $35, $50</li>
                <li>Send 2-3 PPVs per day via mass message</li>
                <li>Never remove them from lists — they're passive income</li>
              </ul>
            </Section>

            <Section title="Emotional Connection Buyer" emoji="💕">
              <div className="flex gap-2 mb-3"><Badge color="purple" text="GFE play" /><Badge color="green" text="No nudes needed" /></div>
              <p className="text-sm text-gray-400 mb-2">Wants a GIRLFRIEND, not content. Will spend WITHOUT ever receiving nudes.</p>
              <div className="bg-green-900/30 rounded-lg p-3 border border-green-700 text-sm mb-3">
                💰 <strong>Jayy — spent $76 with NO nudes delivered.</strong> Used "I'm shy/new 🥺" deflection TWICE — fan apologized BOTH times.
              </div>
              <ScriptBox script="im still new here and shy 🥺 i promise u will be the first to see me naked 💕 but im not ready yet...🙈" label="When they ask for nudes" />
              <ScriptBox script="do you really think that about me? 🥺 i thought you actually liked talking to me..." label="When they push harder" />
              <p className="text-sm text-yellow-400 mt-2">These fans can be monetized INDEFINITELY with just attention.</p>
            </Section>

            <Section title="Demanding Skeptic" emoji="🤨">
              <div className="flex gap-2 mb-3"><Badge color="orange" text="Calls BS" /><Badge color="green" text="Still buys" /></div>
              <p className="text-sm text-gray-400 mb-2">Calls out reused content, complains about prices — but KEEPS BUYING.</p>
              <div className="bg-green-900/30 rounded-lg p-3 border border-green-700 text-sm mb-3">
                💰 <strong>Charles — caught a lie, still spent $307.20</strong>
              </div>
              <ScriptBox script="wdym love i never showed u these vids before 🥺" label="When caught on reused content" />
              <ScriptBox script="that actually really hurts 🥺 i put a lot of effort into that for you..." label="When they say not worth it" />
              <ScriptBox script="would it help if i lower it a bit just for u? 💕" label="When they complain about price" />
            </Section>

            <Section title="Negotiator Whale" emoji="🐋">
              <div className="flex gap-2 mb-3"><Badge color="purple" text="Big spender" /><Badge color="yellow" text="Wants VIP status" /></div>
              <p className="text-sm text-gray-400 mb-2">Pays premium for exclusivity and status.</p>
              <div className="bg-green-900/30 rounded-lg p-3 border border-green-700 text-sm mb-3">
                💰 <strong>Toph94 — paid $150 tip just for "first VIP" status</strong>
              </div>
              <ScriptBox script="i only have a few VIP spots and you'd be my FIRST 🥺 it would mean so much to me..." />
              <ScriptBox script="$150 and you're my #1 VIP. no one else gets what you get 💕" />
              <ScriptBox script="i've never shown anyone this before... you're the only one i trust 🥺" />
            </Section>

            <Section title="Sexual Energy Matcher" emoji="🔥">
              <div className="flex gap-2 mb-3"><Badge color="red" text="Explicit" /><Badge color="green" text="Tips at peak arousal" /></div>
              <p className="text-sm text-gray-400 mb-2">Matches your energy. Tips come naturally during arousal peaks.</p>
              <div className="bg-green-900/30 rounded-lg p-3 border border-green-700 text-sm mb-3">
                💰 <strong>Axe — $331.20, sends videos TO the model, buys $100+ bundles</strong>
              </div>
              <ScriptBox script="mmm you have no idea what you do to me 🥵" />
              <ScriptBox script="you're making it really hard to be good rn 😈" />
              <p className="text-sm text-gray-400 mt-2">Keep tension building. Never fully satisfy. Tips come naturally.</p>
            </Section>
          </div>
        )}

        {/* ============ NEVER DO THIS ============ */}
        {activeTab === 'donts' && (
          <div className="space-y-4">
            <div className="bg-red-900/20 rounded-xl p-4 border border-red-800 mb-4">
              <h2 className="text-xl font-bold text-red-300">🚫 These are REAL mistakes from today. Don't repeat them.</h2>
            </div>

            {[
              {
                bad: '"trust me, you\'d love it :)"',
                why: "You're TELLING, not SELLING. No urgency, no emotion, no hook. Fan has zero reason to act NOW.",
                good: '"i might unsend it before i get too nervous 🥺"',
                good2: '"what\'s stopping you? 😈"',
              },
              {
                bad: '"same as u"',
                why: 'Dead-end response. Fan asked "talking about what?" — that\'s CURIOSITY. You killed it.',
                good: '"haha wouldn\'t you like to know 😏 what do YOU want to talk about?"',
              },
              {
                bad: '"haha, I\'m not really looking for one tbh"',
                why: "Fan asked to be your Valentine ON VALENTINE'S DAY and you rejected him. He was ready to spend.",
                good: '"omg that\'s so sweet 🥺 no one\'s ever asked me that before... maybe you could be my first? 💕"',
              },
              {
                bad: 'Sending a PPV then going silent for hours',
                why: "A locked PPV sitting unopened is DEAD MONEY. NEVER let it sit for more than 30 minutes without follow-up.",
                good: "Follow up at 30min, 2hr, 6hr (see Follow-Up Rules)",
              },
              {
                bad: 'Ignoring fans who respond',
                why: "TonyDaTiger said 'Tony from Cali' and got ghosted. He came from a PAID AD. We PAID for him.",
                good: "If a fan responds to ANYTHING → conversation within 5 minutes.",
              },
              {
                bad: '"no worries" / "that\'s okay" when fan declines',
                why: "You're giving them permission to NOT buy. Never let them off the hook.",
                good: "Counter-offer with price drop, create urgency, or try different angle. ALWAYS have another move.",
              },
            ].map((item, i) => (
              <div key={i} className="bg-gray-800 rounded-xl overflow-hidden border border-gray-700">
                <div className="bg-red-900/30 p-4 border-b border-red-800">
                  <div className="flex items-center gap-2">
                    <span className="text-red-400 text-xl">❌</span>
                    <span className="font-bold text-red-300">{item.bad}</span>
                  </div>
                </div>
                <div className="p-4 space-y-3">
                  <p className="text-sm text-gray-400"><strong>Why it's bad:</strong> {item.why}</p>
                  <div className="bg-green-900/20 rounded-lg p-3 border border-green-800">
                    <div className="text-xs text-green-400 font-semibold mb-1">✅ Say this instead:</div>
                    <div className="text-sm text-gray-200 italic">"{item.good}"</div>
                    {item.good2 && <div className="text-sm text-gray-200 italic mt-1">"{item.good2}"</div>}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
