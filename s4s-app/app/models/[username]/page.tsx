'use client'

import { useState, useCallback, useEffect } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import { CONNECTED_MODELS, calculateLTV } from '@/lib/models-data'
import { 
  loadImages, 
  saveImages, 
  migrateFromLocalStorage,
  type PromoImage 
} from '@/lib/indexed-db'

export default function ModelPage() {
  const params = useParams()
  const username = params.username as string
  const model = CONNECTED_MODELS.find(m => m.username === username)

  const [promoImages, setPromoImages] = useState<PromoImage[]>([])
  const [loaded, setLoaded] = useState(false)
  const [saved, setSaved] = useState(true)
  const [saveMessage, setSaveMessage] = useState('')
  const [initialLoadDone, setInitialLoadDone] = useState(false)
  const [saving, setSaving] = useState(false)

  // Load from IndexedDB on mount (with localStorage migration)
  useEffect(() => {
    if (username) {
      const loadData = async () => {
        // First, migrate any old localStorage data
        await migrateFromLocalStorage()
        // Then load from IndexedDB
        const savedImages = await loadImages(username)
        setPromoImages(savedImages)
        setLoaded(true)
        // Mark initial load done after a tick
        setTimeout(() => setInitialLoadDone(true), 100)
      }
      loadData()
    }
  }, [username])

  // Mark as unsaved when images change (but only after initial load)
  useEffect(() => {
    if (initialLoadDone) {
      setSaved(false)
    }
  }, [promoImages, initialLoadDone])

  const handleSave = async () => {
    if (username && !saving) {
      setSaving(true)
      try {
        await saveImages(username, promoImages)
        setSaved(true)
        setSaveMessage('Saved!')
        setTimeout(() => setSaveMessage(''), 2000)
      } catch (e) {
        setSaveMessage('Error saving')
        console.error('Save error:', e)
      } finally {
        setSaving(false)
      }
    }
  }
  const [uploading, setUploading] = useState(false)
  const [dragOver, setDragOver] = useState(false)
  const [uploadProgress, setUploadProgress] = useState<string>('')

  const handleDrop = useCallback(async (e: React.DragEvent) => {
    e.preventDefault()
    setDragOver(false)

    const files = Array.from(e.dataTransfer.files).filter(f =>
      f.type === 'image/jpeg' ||
      f.type === 'image/png' ||
      f.type === 'image/gif' ||
      f.type === 'image/webp'
    )

    if (files.length === 0) return

    setUploading(true)

    for (const file of files) {
      setUploadProgress(`Uploading ${file.name}...`)

      // Convert to base64 for persistence
      const base64 = await new Promise<string>((resolve) => {
        const reader = new FileReader()
        reader.onloadend = () => resolve(reader.result as string)
        reader.readAsDataURL(file)
      })

      // For now, just add to local state with base64
      // Real implementation would upload to OF API
      const newImage: PromoImage = {
        id: `img_${Date.now()}_${Math.random().toString(36).slice(2)}`,
        url: base64, // Use base64 as URL (works in img src)
        filename: file.name,
        uploadedAt: new Date().toISOString(),
        isActive: false,
        vaultIds: {},
        base64: base64
      }

      setPromoImages(prev => [...prev, newImage])

      // TODO: Upload to OnlyFans API and distribute to all vaults
      // This would call our backend API which handles:
      // 1. Upload to first model's account
      // 2. Create post, get vault_id, delete post
      // 3. Repeat for all other models
      // 4. Store all vault_ids in database
    }

    setUploadProgress('')
    setUploading(false)
  }, [])

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setDragOver(true)
  }, [])

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setDragOver(false)
  }, [])

  const [distributing, setDistributing] = useState(false)
  const [distributeProgress, setDistributeProgress] = useState('')

  const handleDistribute = async (imageId: string) => {
    const image = promoImages.find(img => img.id === imageId)
    if (!image || !image.base64) return

    const targetUsernames = CONNECTED_MODELS
      .filter(m => m.username !== username)
      .map(m => m.username)

    setDistributing(true)
    setDistributeProgress(`Distributing to ${targetUsernames.length} vaults...`)

    try {
      const res = await fetch('/api/distribute', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          imageBase64: image.base64,
          filename: image.filename,
          sourceUsername: username,
          targetUsernames
        })
      })

      const data = await res.json()

      if (data.success) {
        // Update vaultIds in the image
        const newVaultIds: { [key: string]: string } = {}
        for (const result of data.results) {
          if (result.vaultId) {
            newVaultIds[result.username] = result.vaultId
          }
        }

        setPromoImages(prev => prev.map(img =>
          img.id === imageId
            ? { ...img, vaultIds: { ...img.vaultIds, ...newVaultIds } }
            : img
        ))

        setDistributeProgress(`✓ Distributed to ${data.distributed}/${targetUsernames.length} vaults`)
        setTimeout(() => setDistributeProgress(''), 3000)
      } else {
        setDistributeProgress(`Error: ${data.error}`)
      }
    } catch (e) {
      setDistributeProgress(`Error: ${e}`)
    } finally {
      setDistributing(false)
    }
  }

  const toggleActive = (imageId: string) => {
    setPromoImages(prev => prev.map(img =>
      img.id === imageId ? { ...img, isActive: !img.isActive } : img
    ))
  }

  const deleteImage = (imageId: string) => {
    setPromoImages(prev => prev.filter(img => img.id !== imageId))
  }

  if (!model) {
    return (
      <div className="min-h-screen bg-gray-950 flex items-center justify-center">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-white mb-4">Model not found</h1>
          <Link href="/" className="text-purple-400 hover:text-purple-300">
            ← Back to Dashboard
          </Link>
        </div>
      </div>
    )
  }

  const ltv = calculateLTV(model)
  const activeCount = promoImages.filter(i => i.isActive).length

  return (
    <div className="min-h-screen bg-gray-950 p-8">
      <div className="max-w-4xl mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <Link href="/?tab=models" className="text-gray-400 hover:text-white">
            ← Back to Models
          </Link>
          <div className="flex items-center gap-3">
            {distributeProgress && (
              <span className="text-blue-400 text-sm">{distributeProgress}</span>
            )}
            {saveMessage && (
              <span className="text-green-400 text-sm">{saveMessage}</span>
            )}
            <button
              onClick={handleSave}
              disabled={saved || saving}
              className={`px-6 py-2 rounded-lg font-medium transition ${
                saved || saving
                  ? 'bg-gray-700 text-gray-400 cursor-not-allowed'
                  : 'bg-green-600 hover:bg-green-700 text-white'
              }`}
            >
              {saving ? '⏳ Saving...' : saved ? '✓ Saved' : '💾 Save Changes'}
            </button>
          </div>
        </div>

        {/* Model Info */}
        <div className="bg-gray-900 rounded-xl p-6 border border-gray-800 mb-8">
          <div className="flex items-center gap-6">
            <img
              src={model.avatar}
              alt={model.displayName}
              className="w-24 h-24 rounded-full object-cover border-4 border-purple-500"
            />
            <div className="flex-1">
              <h1 className="text-2xl font-bold text-white">{model.displayName}</h1>
              <p className="text-gray-400">@{model.username}</p>
              <div className="flex gap-6 mt-3">
                <div>
                  <span className="text-xl font-bold text-white">{model.fans.toLocaleString()}</span>
                  <span className="text-gray-400 text-sm ml-1">fans</span>
                </div>
                <div>
                  <span className="text-xl font-bold text-green-400">${model.totalEarnings.toLocaleString()}</span>
                  <span className="text-gray-400 text-sm ml-1">earned</span>
                </div>
                <div>
                  <span className="text-xl font-bold text-purple-400">${ltv.toFixed(2)}</span>
                  <span className="text-gray-400 text-sm ml-1">LTV</span>
                </div>
              </div>
            </div>
            <div className="text-right">
              <div className="text-sm text-gray-400">Promo Images</div>
              <div className="text-3xl font-bold text-white">{promoImages.length}</div>
              <div className="text-sm text-green-400">{activeCount} active</div>
            </div>
          </div>
        </div>

        {/* Upload Zone */}
        <div
          className={`border-2 border-dashed rounded-xl p-12 text-center transition-all mb-8 ${
            dragOver
              ? 'border-purple-500 bg-purple-500/10'
              : 'border-gray-700 hover:border-gray-600'
          } ${uploading ? 'opacity-50 pointer-events-none' : ''}`}
          onDrop={handleDrop}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
        >
          {uploading ? (
            <div>
              <div className="text-4xl mb-4">⏳</div>
              <p className="text-white font-medium">{uploadProgress}</p>
              <p className="text-gray-400 text-sm mt-2">Distributing to all model vaults...</p>
            </div>
          ) : (
            <div>
              <div className="text-4xl mb-4">📸</div>
              <p className="text-white font-medium">Drag & drop promo images here</p>
              <p className="text-gray-400 text-sm mt-2">
                Up to 6 images • JPG, PNG • Will be distributed to all {CONNECTED_MODELS.length - 1} other model vaults
              </p>
              <label className="mt-4 inline-block px-4 py-2 bg-purple-600 hover:bg-purple-700 rounded-lg text-white cursor-pointer">
                Or click to browse
                <input
                  type="file"
                  accept="image/jpeg,image/png,image/gif,image/webp" 
                  multiple
                  className="hidden"
                  onChange={(e) => {
                    if (e.target.files) {
                      const dt = new DataTransfer()
                      Array.from(e.target.files).forEach(f => dt.items.add(f))
                      handleDrop({
                        preventDefault: () => {},
                        dataTransfer: dt
                      } as any)
                    }
                  }}
                />
              </label>
            </div>
          )}
        </div>

        {/* Image Grid */}
        {promoImages.length > 0 && (
          <div>
            <h2 className="text-xl font-bold text-white mb-4">Promo Images</h2>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
              {promoImages.map((img, i) => (
                <div
                  key={img.id}
                  className={`relative rounded-xl overflow-hidden border-2 transition-all ${
                    img.isActive
                      ? 'border-green-500 shadow-lg shadow-green-500/20'
                      : 'border-gray-700'
                  }`}
                >
                  <img
                    src={img.url}
                    alt={`Promo ${i + 1}`}
                    className="w-full aspect-[3/4] object-cover"
                  />

                  {/* Overlay */}
                  <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent" />

                  {/* Status Badge */}
                  <div className="absolute top-3 left-3">
                    {img.isActive ? (
                      <span className="px-2 py-1 bg-green-500 text-white text-xs font-bold rounded">
                        ● ACTIVE
                      </span>
                    ) : (
                      <span className="px-2 py-1 bg-gray-700 text-gray-300 text-xs font-bold rounded">
                        OFF
                      </span>
                    )}
                  </div>

                  {/* Vault Status */}
                  <div className="absolute top-3 right-3">
                    <span className="px-2 py-1 bg-black/50 text-gray-300 text-xs rounded">
                      {Object.keys(img.vaultIds).length}/{CONNECTED_MODELS.length - 1} vaults
                    </span>
                  </div>

                  {/* Actions */}
                  <div className="absolute bottom-0 left-0 right-0 p-3 space-y-2">
                    {/* Distribute Button */}
                    {Object.keys(img.vaultIds).length < CONNECTED_MODELS.length - 1 && (
                      <button
                        onClick={() => handleDistribute(img.id)}
                        disabled={distributing}
                        className="w-full py-2 rounded-lg text-sm font-medium bg-blue-600 hover:bg-blue-700 text-white disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        {distributing ? '⏳ Distributing...' : `📤 Distribute to ${CONNECTED_MODELS.length - 1} Vaults`}
                      </button>
                    )}
                    <div className="flex gap-2">
                      <button
                        onClick={() => toggleActive(img.id)}
                        className={`flex-1 py-2 rounded-lg text-sm font-medium transition ${
                          img.isActive
                            ? 'bg-gray-700 hover:bg-gray-600 text-white'
                            : 'bg-green-600 hover:bg-green-700 text-white'
                        }`}
                      >
                        {img.isActive ? 'Deactivate' : 'Activate'}
                      </button>
                      <button
                        onClick={() => deleteImage(img.id)}
                        className="px-3 py-2 bg-red-600/80 hover:bg-red-600 rounded-lg text-white text-sm"
                      >
                        🗑
                      </button>
                    </div>
                  </div>

                  {/* Performance (if available) */}
                  {img.performance !== undefined && (
                    <div className="absolute bottom-16 left-3 right-3">
                      <div className="bg-black/60 rounded px-2 py-1 text-xs text-gray-300">
                        Performance: <span className="text-white font-bold">{img.performance}/100</span>
                      </div>
                    </div>
                  )}
                </div>
              ))}

              {/* Add More Placeholder */}
              {promoImages.length < 6 && (
                <label className="aspect-[3/4] rounded-xl border-2 border-dashed border-gray-700 hover:border-gray-600 flex items-center justify-center cursor-pointer transition-all">
                  <div className="text-center">
                    <div className="text-3xl text-gray-600">+</div>
                    <div className="text-gray-500 text-sm mt-1">Add more</div>
                  </div>
                  <input
                    type="file"
                    accept="image/jpeg,image/png,image/gif,image/webp"
                    multiple
                    className="hidden"
                    onChange={(e) => {
                      if (e.target.files) {
                        const dt = new DataTransfer()
                        Array.from(e.target.files).forEach(f => dt.items.add(f))
                        handleDrop({
                          preventDefault: () => {},
                          dataTransfer: dt
                        } as any)
                      }
                    }}
                  />
                </label>
              )}
            </div>
          </div>
        )}

        {/* Distribution Info */}
        <div className="mt-8 bg-gray-900 rounded-xl p-6 border border-gray-800">
          <h3 className="text-lg font-semibold text-white mb-3">📦 How Distribution Works</h3>
          <div className="text-gray-400 text-sm space-y-2">
            <p>1. You upload a promo image for <strong className="text-white">{model.displayName}</strong></p>
            <p>2. We distribute it to all {CONNECTED_MODELS.length - 1} other models' vaults</p>
            <p>3. When rotation runs, other models post this image with "@{model.username}"</p>
            <p>4. Image stays in vaults forever (reusable, no re-upload needed)</p>
          </div>

          <div className="mt-4 pt-4 border-t border-gray-800">
            <h4 className="text-sm font-medium text-white mb-2">Vault Distribution Status</h4>
            <div className="flex flex-wrap gap-2">
              {CONNECTED_MODELS.filter(m => m.id !== model.id).map(m => (
                <div
                  key={m.id}
                  className="px-2 py-1 bg-gray-800 rounded text-xs text-gray-400"
                  title={m.displayName}
                >
                  @{m.username.slice(0, 10)}
                  <span className="ml-1 text-gray-600">
                    {promoImages.length > 0 && promoImages[0].vaultIds[m.id] ? '✓' : '○'}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
