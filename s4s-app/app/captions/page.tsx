'use client'

import { useState } from 'react'
import Link from 'next/link'
import { GHOST_CAPTIONS, PINNED_CAPTIONS, MASS_DM_CAPTIONS } from '@/lib/ghost-captions'

export default function CaptionsPage() {
  const [testUsername, setTestUsername] = useState('sadieeblake')
  const [activeTab, setActiveTab] = useState<'ghost' | 'pinned' | 'massdm'>('ghost')
  
  const formatCaption = (template: string) => {
    return template.replace(/{username}/g, `@${testUsername}`)
  }
  
  const captions = activeTab === 'ghost' ? GHOST_CAPTIONS : activeTab === 'pinned' ? PINNED_CAPTIONS : MASS_DM_CAPTIONS

  return (
    <main className="min-h-screen bg-gradient-to-br from-purple-900 via-purple-800 to-indigo-900 p-4 md:p-8">
      <div className="max-w-4xl mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-3xl font-bold text-white">S4S Captions</h1>
            <p className="text-purple-300 mt-1">
              {GHOST_CAPTIONS.length} ghost + {PINNED_CAPTIONS.length} pinned + {MASS_DM_CAPTIONS.length} mass DM templates
            </p>
          </div>
          <Link 
            href="/"
            className="px-4 py-2 bg-purple-700 hover:bg-purple-600 rounded-lg text-white transition-colors"
          >
            ← Back
          </Link>
        </div>
        
        {/* Tabs */}
        <div className="flex gap-2 mb-6">
          <button
            onClick={() => setActiveTab('ghost')}
            className={`px-4 py-2 rounded-lg font-medium transition-colors ${
              activeTab === 'ghost' 
                ? 'bg-purple-600 text-white' 
                : 'bg-purple-800/50 text-purple-300 hover:bg-purple-700/50'
            }`}
          >
            👻 Ghost Tags ({GHOST_CAPTIONS.length})
          </button>
          <button
            onClick={() => setActiveTab('pinned')}
            className={`px-4 py-2 rounded-lg font-medium transition-colors ${
              activeTab === 'pinned' 
                ? 'bg-yellow-600 text-white' 
                : 'bg-purple-800/50 text-purple-300 hover:bg-purple-700/50'
            }`}
          >
            📌 Pinned Posts ({PINNED_CAPTIONS.length})
          </button>
          <button
            onClick={() => setActiveTab('massdm')}
            className={`px-4 py-2 rounded-lg font-medium transition-colors ${
              activeTab === 'massdm' 
                ? 'bg-cyan-600 text-white' 
                : 'bg-purple-800/50 text-purple-300 hover:bg-purple-700/50'
            }`}
          >
            📨 Mass DMs ({MASS_DM_CAPTIONS.length})
          </button>
        </div>
        
        {/* Description */}
        <div className={`rounded-xl p-4 mb-6 border ${
          activeTab === 'ghost' 
            ? 'bg-purple-800/30 border-purple-500/30' 
            : activeTab === 'pinned'
            ? 'bg-yellow-800/30 border-yellow-500/30'
            : 'bg-cyan-800/30 border-cyan-500/30'
        }`}>
          {activeTab === 'ghost' ? (
            <p className="text-purple-200">
              <strong>Ghost Tags:</strong> Quick, casual captions posted on model pages. Deleted after ~5 minutes. 
              Ephemeral and hype-focused. Used for the 57 daily outbound tags per model.
            </p>
          ) : activeTab === 'pinned' ? (
            <p className="text-yellow-200">
              <strong>Pinned Posts:</strong> More genuine, recommendation-style captions. 
              Pinned to top of profile for 24 hours. Need to feel authentic and personal.
            </p>
          ) : (
            <p className="text-cyan-200">
              <strong>Mass DMs:</strong> Sent directly to fans via mass message with a promo photo attached. 
              12 windows per day, all models. Excluded from SFS Exclude lists.
            </p>
          )}
        </div>

        {/* Test Username Input */}
        <div className="bg-purple-800/50 rounded-xl p-4 mb-6 border border-purple-600/30">
          <label className="text-purple-300 text-sm mb-2 block">Preview with username:</label>
          <input
            type="text"
            value={testUsername}
            onChange={(e) => setTestUsername(e.target.value.replace('@', ''))}
            className="w-full px-4 py-2 bg-purple-900/50 border border-purple-600/50 rounded-lg text-white placeholder-purple-400 focus:outline-none focus:border-purple-400"
            placeholder="Enter username to preview..."
          />
        </div>

        {/* Captions List */}
        <div className="space-y-3">
          {captions.map((template, index) => (
            <div 
              key={index}
              className={`rounded-xl p-4 border transition-colors ${
                activeTab === 'ghost'
                  ? 'bg-purple-800/30 border-purple-600/20 hover:border-purple-500/40'
                  : activeTab === 'pinned'
                  ? 'bg-yellow-800/30 border-yellow-600/20 hover:border-yellow-500/40'
                  : 'bg-cyan-800/30 border-cyan-600/20 hover:border-cyan-500/40'
              }`}
            >
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1">
                  <p className="text-white text-lg">{formatCaption(template)}</p>
                  <p className="text-purple-400 text-sm mt-2 font-mono">Template: {template}</p>
                </div>
                <span className="text-purple-500 text-sm font-mono">#{index + 1}</span>
              </div>
            </div>
          ))}
        </div>

        {/* Add Caption Section */}
        <div className="mt-8 bg-purple-800/30 rounded-xl p-6 border border-purple-600/20">
          <h2 className="text-xl font-bold text-white mb-2">Want to add more?</h2>
          <p className="text-purple-300 mb-4">
            Edit <code className="bg-purple-900/50 px-2 py-1 rounded text-purple-200">s4s-app/lib/ghost-captions.ts</code>
          </p>
          <p className="text-purple-400 text-sm">
            Use <code className="bg-purple-900/50 px-1 rounded">{'{username}'}</code> as placeholder for the @mention
          </p>
        </div>
      </div>
    </main>
  )
}
