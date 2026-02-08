'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { 
  loadNetworkModels, 
  saveNetworkModel, 
  deleteNetworkModel,
  initializeDefaultModels,
  type NetworkModel 
} from '@/lib/network-db'

export default function NetworkPage() {
  const [models, setModels] = useState<NetworkModel[]>([])
  const [loading, setLoading] = useState(true)
  const [credits, setCredits] = useState<{ balance: number | string; used: number } | null>(null)
  const [showAddForm, setShowAddForm] = useState(false)
  const [newModel, setNewModel] = useState({ 
    username: '', 
    displayName: '', 
    email: '', 
    password: '' 
  })
  const [saving, setSaving] = useState(false)
  const [connectStatus, setConnectStatus] = useState<string | null>(null)
  const [connectError, setConnectError] = useState<string | null>(null)

  // Load models and credits on mount
  useEffect(() => {
    const loadData = async () => {
      await initializeDefaultModels()
      const loaded = await loadNetworkModels()
      setModels(loaded.sort((a, b) => a.username.localeCompare(b.username)))
      setLoading(false)
    }
    loadData()

    // Fetch credits
    fetch('/api/credits')
      .then(res => res.json())
      .then(data => {
        if (data.balance) setCredits(data)
      })
      .catch(console.error)
  }, [])

  const toggleRotation = async (username: string) => {
    const model = models.find(m => m.username === username)
    if (!model) return

    const updated = { ...model, inRotation: !model.inRotation }
    await saveNetworkModel(updated)
    setModels(prev => prev.map(m => m.username === username ? updated : m))
  }

  const handleAddModel = async () => {
    if (!newModel.username || !newModel.displayName || !newModel.email || !newModel.password) {
      setConnectError('All fields are required')
      return
    }
    
    setSaving(true)
    setConnectStatus('Connecting to OnlyFans API...')
    setConnectError(null)

    try {
      // Call our API to connect the account
      const response = await fetch('/api/connect-account', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: newModel.email,
          password: newModel.password,
        }),
      })

      const data = await response.json()

      if (!response.ok || data.status === 'error') {
        setConnectError(data.error || 'Failed to connect account')
        setSaving(false)
        setConnectStatus(null)
        return
      }

      // Check if 2FA is required
      if (data.needs2fa) {
        setConnectStatus('2FA required - check the OnlyFans API dashboard to complete verification')
        setSaving(false)
        return
      }

      // Success! Save the model
      const accountId = data.accountId
      if (!accountId) {
        setConnectError('Connected but no account ID returned - check API dashboard')
        setSaving(false)
        setConnectStatus(null)
        return
      }

      setConnectStatus('Connected! Saving model...')

      const model: NetworkModel = {
        username: newModel.username.toLowerCase().replace('@', ''),
        displayName: newModel.displayName,
        accountId: accountId,
        inRotation: true, // Auto-enable rotation for newly connected accounts
        addedAt: new Date().toISOString()
      }
      
      await saveNetworkModel(model)
      setModels(prev => [...prev, model].sort((a, b) => a.username.localeCompare(b.username)))
      setNewModel({ username: '', displayName: '', email: '', password: '' })
      setShowAddForm(false)
      setConnectStatus(null)
      
    } catch (error: any) {
      setConnectError(error.message || 'Connection failed')
    } finally {
      setSaving(false)
    }
  }

  const handleDeleteModel = async (username: string) => {
    if (!confirm(`Remove @${username} from network?`)) return
    
    await deleteNetworkModel(username)
    setModels(prev => prev.filter(m => m.username !== username))
  }

  const handleManualConnect = async (username: string) => {
    const email = prompt(`Enter OnlyFans email for @${username}:`)
    if (!email) return
    
    const password = prompt(`Enter OnlyFans password for @${username}:`)
    if (!password) return

    const model = models.find(m => m.username === username)
    if (!model) return

    // Show connecting status
    setModels(prev => prev.map(m => 
      m.username === username 
        ? { ...m, accountId: 'connecting...' } 
        : m
    ))

    try {
      const response = await fetch('/api/connect-account', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      })

      const data = await response.json()

      if (!response.ok || data.status === 'error') {
        alert(`Failed to connect: ${data.error}`)
        setModels(prev => prev.map(m => 
          m.username === username 
            ? { ...m, accountId: null } 
            : m
        ))
        return
      }

      if (data.needs2fa) {
        alert('2FA required - complete verification in the OnlyFans API dashboard')
        setModels(prev => prev.map(m => 
          m.username === username 
            ? { ...m, accountId: null } 
            : m
        ))
        return
      }

      const accountId = data.accountId
      if (!accountId) {
        alert('Connected but no account ID returned - check API dashboard')
        setModels(prev => prev.map(m => 
          m.username === username 
            ? { ...m, accountId: null } 
            : m
        ))
        return
      }

      // Success
      const updated = { ...model, accountId, inRotation: true }
      await saveNetworkModel(updated)
      setModels(prev => prev.map(m => m.username === username ? updated : m))
      
    } catch (error: any) {
      alert(`Connection failed: ${error.message}`)
      setModels(prev => prev.map(m => 
        m.username === username 
          ? { ...m, accountId: null } 
          : m
      ))
    }
  }

  const connectedCount = models.filter(m => m.accountId && m.accountId !== 'connecting...').length
  const inRotationCount = models.filter(m => m.inRotation && m.accountId && m.accountId !== 'connecting...').length

  if (loading) {
    return (
      <div className="min-h-screen bg-black text-white flex items-center justify-center">
        <div className="text-gray-400">Loading network...</div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-black text-white">
      {/* Header */}
      <div className="border-b border-gray-800 p-4">
        <div className="max-w-4xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Link href="/" className="text-gray-400 hover:text-white">
              ← Back
            </Link>
            <h1 className="text-xl font-bold">🔌 Network Management</h1>
          </div>
          {credits && (
            <div className="text-sm">
              <span className="text-gray-400">API Credits:</span>{' '}
              <span className="text-green-400 font-mono">
                {typeof credits.balance === 'number' 
                  ? credits.balance.toLocaleString() 
                  : credits.balance}
              </span>
            </div>
          )}
        </div>
      </div>

      <div className="max-w-4xl mx-auto p-4 space-y-6">
        {/* Stats */}
        <div className="grid grid-cols-3 gap-4">
          <div className="bg-gray-900 rounded-xl p-4 border border-gray-800">
            <div className="text-3xl font-bold text-white">{models.length}</div>
            <div className="text-gray-400 text-sm">Total Models</div>
          </div>
          <div className="bg-gray-900 rounded-xl p-4 border border-gray-800">
            <div className="text-3xl font-bold text-green-400">{connectedCount}</div>
            <div className="text-gray-400 text-sm">Connected to API</div>
          </div>
          <div className="bg-gray-900 rounded-xl p-4 border border-gray-800">
            <div className="text-3xl font-bold text-blue-400">{inRotationCount}</div>
            <div className="text-gray-400 text-sm">In Rotation</div>
          </div>
        </div>

        {/* Add Model Button */}
        <div className="flex justify-end">
          <button
            onClick={() => {
              setShowAddForm(true)
              setConnectError(null)
              setConnectStatus(null)
            }}
            className="px-4 py-2 bg-green-600 hover:bg-green-700 rounded-lg text-sm font-medium"
          >
            + Add Model
          </button>
        </div>

        {/* Add Model Form */}
        {showAddForm && (
          <div className="bg-gray-900 rounded-xl p-4 border border-green-800 space-y-4">
            <h3 className="font-semibold text-green-400">Add New Model</h3>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm text-gray-400 mb-1">OF Username</label>
                <input
                  type="text"
                  value={newModel.username}
                  onChange={e => setNewModel(prev => ({ ...prev, username: e.target.value }))}
                  placeholder="@username"
                  className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white"
                />
              </div>
              <div>
                <label className="block text-sm text-gray-400 mb-1">Display Name</label>
                <input
                  type="text"
                  value={newModel.displayName}
                  onChange={e => setNewModel(prev => ({ ...prev, displayName: e.target.value }))}
                  placeholder="Model Name"
                  className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm text-gray-400 mb-1">OF Email</label>
                <input
                  type="email"
                  value={newModel.email}
                  onChange={e => setNewModel(prev => ({ ...prev, email: e.target.value }))}
                  placeholder="model@email.com"
                  className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white"
                />
              </div>
              <div>
                <label className="block text-sm text-gray-400 mb-1">OF Password</label>
                <input
                  type="password"
                  value={newModel.password}
                  onChange={e => setNewModel(prev => ({ ...prev, password: e.target.value }))}
                  placeholder="••••••••"
                  className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white"
                />
              </div>
            </div>

            {connectStatus && (
              <div className="p-3 bg-blue-900/30 border border-blue-700 rounded-lg text-blue-300 text-sm">
                ⏳ {connectStatus}
              </div>
            )}

            {connectError && (
              <div className="p-3 bg-red-900/30 border border-red-700 rounded-lg text-red-300 text-sm">
                ❌ {connectError}
              </div>
            )}

            <div className="flex gap-2 justify-end">
              <button
                onClick={() => {
                  setShowAddForm(false)
                  setConnectError(null)
                  setConnectStatus(null)
                }}
                className="px-4 py-2 bg-gray-700 hover:bg-gray-600 rounded-lg text-sm"
              >
                Cancel
              </button>
              <button
                onClick={handleAddModel}
                disabled={!newModel.username || !newModel.displayName || !newModel.email || !newModel.password || saving}
                className="px-4 py-2 bg-green-600 hover:bg-green-700 rounded-lg text-sm font-medium disabled:opacity-50"
              >
                {saving ? 'Connecting...' : 'Connect & Add'}
              </button>
            </div>
          </div>
        )}

        {/* Models List */}
        <div className="space-y-2">
          {models.map(model => (
            <div
              key={model.username}
              className={`bg-gray-900 rounded-xl p-4 border ${
                model.accountId && model.accountId !== 'connecting...'
                  ? model.inRotation 
                    ? 'border-green-800' 
                    : 'border-yellow-800'
                  : 'border-gray-800'
              }`}
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-4">
                  {/* Status Icon */}
                  <div className={`w-3 h-3 rounded-full ${
                    model.accountId === 'connecting...'
                      ? 'bg-blue-500 animate-pulse'
                      : model.accountId 
                        ? model.inRotation 
                          ? 'bg-green-500' 
                          : 'bg-yellow-500'
                        : 'bg-gray-600'
                  }`} />
                  
                  {/* Model Info */}
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-white">{model.displayName}</span>
                      <span className="text-gray-500">@{model.username}</span>
                    </div>
                    <div className="text-xs text-gray-500 mt-1">
                      {model.accountId === 'connecting...' ? (
                        <span className="text-blue-400">Connecting...</span>
                      ) : model.accountId ? (
                        <code className="bg-gray-800 px-1 rounded">{model.accountId}</code>
                      ) : (
                        <span className="text-yellow-500">Not connected to API</span>
                      )}
                    </div>
                  </div>
                </div>

                {/* Actions */}
                <div className="flex items-center gap-2">
                  {model.accountId && model.accountId !== 'connecting...' ? (
                    <button
                      onClick={() => toggleRotation(model.username)}
                      className={`px-3 py-1.5 rounded-lg text-sm font-medium transition ${
                        model.inRotation
                          ? 'bg-green-600 hover:bg-green-700 text-white'
                          : 'bg-gray-700 hover:bg-gray-600 text-gray-300'
                      }`}
                    >
                      {model.inRotation ? '✓ In Rotation' : 'Paused'}
                    </button>
                  ) : model.accountId === 'connecting...' ? (
                    <span className="px-3 py-1.5 bg-blue-600/50 rounded-lg text-sm text-blue-200">
                      Connecting...
                    </span>
                  ) : (
                    <button
                      onClick={() => handleManualConnect(model.username)}
                      className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 rounded-lg text-sm font-medium"
                    >
                      🔗 Connect
                    </button>
                  )}
                  
                  <button
                    onClick={() => handleDeleteModel(model.username)}
                    className="px-2 py-1.5 bg-red-600/20 hover:bg-red-600/40 rounded-lg text-red-400 text-sm"
                  >
                    🗑
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* Info */}
        <div className="bg-gray-900 rounded-xl p-4 border border-gray-800 text-sm text-gray-400">
          <h3 className="font-semibold text-white mb-2">💡 How it works</h3>
          <ul className="space-y-1 list-disc list-inside">
            <li><span className="text-green-400">Green</span> = Connected & in rotation (will post/receive promos)</li>
            <li><span className="text-yellow-400">Yellow</span> = Connected but paused (no promos, saves API calls)</li>
            <li><span className="text-gray-400">Gray</span> = Not connected - click Connect to add credentials</li>
            <li>If 2FA is required, you'll need to verify in the <a href="https://app.onlyfansapi.com" target="_blank" className="text-blue-400 hover:underline">OnlyFans API Dashboard</a></li>
          </ul>
        </div>
      </div>
    </div>
  )
}
