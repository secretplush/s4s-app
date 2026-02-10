'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'

// Top spenders data - will be updated from scraping
const TOP_SPENDERS = [
  { rank: 1, name: 'Soccerguy0990', username: 'soccerguy0990', total: 826.40, analyzed: false },
  { rank: 2, name: 'MDNYJetsFan', username: 'mdjets26', total: 357.60, analyzed: true, pattern: 'VULNERABILITY_PROTECTOR' },
  { rank: 3, name: 'Axe', username: 'axe123456789', total: 331.20, analyzed: false },
  { rank: 4, name: 'John Gerrick', username: 'johng5', total: 328.80, analyzed: false },
  { rank: 5, name: 'Charles', username: 'u467003110', total: 307.20, analyzed: false },
  { rank: 6, name: 'Justin', username: 'u549927716', total: 307.20, analyzed: false },
  { rank: 7, name: 'Toph94', username: 'u241909752', total: 289.60, analyzed: false },
  { rank: 8, name: 'Daniel', username: 'u38951769', total: 277.60, analyzed: false },
  { rank: 9, name: 'Anthony Greendown', username: 'sirgreendown', total: 231.20, analyzed: false },
]

const TACTICS = [
  { 
    name: 'FOMO/Scarcity', 
    description: 'Create urgency around content availability',
    examples: [
      "i might unsend it soon before i lose my nerve",
      "better peek at it while it's still up"
    ],
    effectiveness: 'HIGH'
  },
  { 
    name: 'Challenge', 
    description: 'Challenge fan to prove interest',
    examples: [
      "what's stopping you from opening it?",
      "why didnt you open it yet?"
    ],
    effectiveness: 'HIGH'
  },
  { 
    name: 'Conditional Tease', 
    description: 'Promise more if they unlock current',
    examples: [
      "only if you unlock that one first.. then ill show you exactly how your fucktoy moves for you"
    ],
    effectiveness: 'HIGH'
  },
  { 
    name: 'Vulnerability', 
    description: 'Play sensitive/overwhelmed to trigger protective response',
    examples: [
      "sometimes its really hard but ill learn to go through that",
      "I might be too sensitive for that haha"
    ],
    effectiveness: 'VERY HIGH for whales'
  },
  { 
    name: 'Price Drop', 
    description: 'Offer to lower price for hesitant fans',
    examples: [
      "would it help if i lower it a bit just for u?🥰"
    ],
    effectiveness: 'MEDIUM'
  },
]

const BUNDLE_PATTERNS = [
  { tier: 'Premium', price: '$32', videos: 3, videoLengths: '9-34 sec', photos: '4+' },
  { tier: 'Standard', price: '$17', videos: 2, videoLengths: '8-38 sec', photos: '4+' },
  { tier: 'Whale', price: '$69', videos: '3+', videoLengths: 'varies', photos: '6+' },
  { tier: 'Teaser', price: '$8', videos: 1, videoLengths: '<30 sec', photos: '2-3' },
]

export default function ChatterIntelPage() {
  const totalAnalyzed = TOP_SPENDERS.filter(s => s.analyzed).length
  const totalSpenders = TOP_SPENDERS.length
  const totalRevenue = TOP_SPENDERS.reduce((sum, s) => sum + s.total, 0)

  return (
    <div className="min-h-screen bg-gray-900 text-white p-6">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="flex justify-between items-center mb-8">
          <div>
            <h1 className="text-3xl font-bold">🎯 Chatter Intelligence</h1>
            <p className="text-gray-400 mt-1">AI Chatbot Training Data from ninacarlson</p>
          </div>
          <Link href="/" className="text-blue-400 hover:text-blue-300">
            ← Back to S4S
          </Link>
        </div>

        {/* Stats Row */}
        <div className="grid grid-cols-4 gap-4 mb-8">
          <div className="bg-gray-800 rounded-lg p-4">
            <div className="text-3xl font-bold text-green-400">${totalRevenue.toFixed(2)}</div>
            <div className="text-gray-400 text-sm">Total from Top 9</div>
          </div>
          <div className="bg-gray-800 rounded-lg p-4">
            <div className="text-3xl font-bold text-blue-400">{totalAnalyzed}/{totalSpenders}</div>
            <div className="text-gray-400 text-sm">Whales Analyzed</div>
          </div>
          <div className="bg-gray-800 rounded-lg p-4">
            <div className="text-3xl font-bold text-purple-400">{TACTICS.length}</div>
            <div className="text-gray-400 text-sm">Tactics Identified</div>
          </div>
          <div className="bg-gray-800 rounded-lg p-4">
            <div className="text-3xl font-bold text-yellow-400">{BUNDLE_PATTERNS.length}</div>
            <div className="text-gray-400 text-sm">Bundle Patterns</div>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-6">
          {/* Top Spenders */}
          <div className="bg-gray-800 rounded-lg p-4">
            <h2 className="text-xl font-bold mb-4">🐋 Top Spenders (Analyze Queue)</h2>
            <div className="space-y-2">
              {TOP_SPENDERS.map((spender) => (
                <div 
                  key={spender.username}
                  className={`flex justify-between items-center p-3 rounded ${
                    spender.analyzed ? 'bg-green-900/30 border border-green-700' : 'bg-gray-700'
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <span className="text-gray-500">#{spender.rank}</span>
                    <div>
                      <div className="font-medium">{spender.name}</div>
                      <div className="text-gray-400 text-sm">@{spender.username}</div>
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="font-bold text-green-400">${spender.total.toFixed(2)}</div>
                    {spender.analyzed ? (
                      <div className="text-xs text-green-400">✓ {spender.pattern}</div>
                    ) : (
                      <div className="text-xs text-gray-500">Pending</div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Tactics Library */}
          <div className="bg-gray-800 rounded-lg p-4">
            <h2 className="text-xl font-bold mb-4">💬 Tactics Library</h2>
            <div className="space-y-3">
              {TACTICS.map((tactic) => (
                <div key={tactic.name} className="bg-gray-700 rounded p-3">
                  <div className="flex justify-between items-start mb-2">
                    <div className="font-medium">{tactic.name}</div>
                    <span className={`text-xs px-2 py-1 rounded ${
                      tactic.effectiveness.includes('VERY') ? 'bg-green-600' :
                      tactic.effectiveness === 'HIGH' ? 'bg-blue-600' : 'bg-yellow-600'
                    }`}>
                      {tactic.effectiveness}
                    </span>
                  </div>
                  <div className="text-gray-400 text-sm mb-2">{tactic.description}</div>
                  <div className="text-xs text-gray-500">
                    {tactic.examples.map((ex, i) => (
                      <div key={i} className="italic">"{ex}"</div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Bundle Patterns */}
        <div className="bg-gray-800 rounded-lg p-4 mt-6">
          <h2 className="text-xl font-bold mb-4">📦 Bundle Patterns</h2>
          <div className="grid grid-cols-4 gap-4">
            {BUNDLE_PATTERNS.map((bundle) => (
              <div key={bundle.tier} className="bg-gray-700 rounded p-4 text-center">
                <div className="text-2xl font-bold text-green-400">{bundle.price}</div>
                <div className="font-medium mt-1">{bundle.tier}</div>
                <div className="text-sm text-gray-400 mt-2">
                  <div>{bundle.videos} video(s)</div>
                  <div>{bundle.videoLengths}</div>
                  <div>{bundle.photos} photos</div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Key Insight */}
        <div className="bg-gradient-to-r from-purple-900 to-blue-900 rounded-lg p-6 mt-6">
          <h2 className="text-xl font-bold mb-2">🧠 Key Insight: Whale Psychology</h2>
          <p className="text-gray-300">
            Top spenders (MDNYJetsFan, $357) respond to <strong>vulnerability tactics</strong>. 
            They become emotional protectors, not just customers. The chatter plays overwhelmed/sensitive, 
            and the whale provides support + purchases to help her.
          </p>
          <div className="mt-4 p-4 bg-black/30 rounded">
            <div className="text-sm text-gray-400 mb-2">Example exchange:</div>
            <div className="text-pink-300 italic">"I might be too sensitive for that haha"</div>
            <div className="text-blue-300 mt-1">"I have all the confidence in you. You are strong minded..."</div>
            <div className="text-green-400 mt-2 font-bold">→ $129 spent in 2 hours</div>
          </div>
        </div>

        {/* Footer */}
        <div className="text-center text-gray-500 mt-8 text-sm">
          Data source: ninacarlson • Last updated: {new Date().toLocaleString()}
        </div>
      </div>
    </div>
  )
}
