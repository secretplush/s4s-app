'use client'

import { useState, useCallback, useEffect } from 'react'
import Link from 'next/link'
import { loadImages, saveImages, getAllUsernames, syncToKVv2, type PromoImage, type ImageUse } from '@/lib/indexed-db'
import { compressImage } from '@/lib/image-utils'
import { loadCachedModels } from '@/lib/models-data'

const STEPS = ['Verify Account', 'Upload Photos', 'Distribute → All', 'All → Her Vault', 'Sync Worker']

export default function AddModelPage() {
  const [step, setStep] = useState(0)
  const [username, setUsername] = useState('')
  const [verified, setVerified] = useState(false)
  const [accountInfo, setAccountInfo] = useState<any>(null)
  const [promoImages, setPromoImages] = useState<PromoImage[]>([])
  const allModels = loadCachedModels()

  // Resumability: check localStorage for wizard state
  useEffect(() => {
    const saved = localStorage.getItem('add_model_wizard')
    if (saved) {
      try {
        const state = JSON.parse(saved)
        if (state.username) setUsername(state.username)
        if (state.step) setStep(state.step)
        if (state.verified) setVerified(state.verified)
        if (state.accountInfo) setAccountInfo(state.accountInfo)
      } catch {}
    }
  }, [])

  // Persist wizard state
  useEffect(() => {
    if (username) {
      localStorage.setItem('add_model_wizard', JSON.stringify({ username, step, verified, accountInfo }))
    }
  }, [username, step, verified, accountInfo])

  // Load images from IndexedDB when username is set
  useEffect(() => {
    if (username && verified) {
      loadImages(username).then(imgs => setPromoImages(imgs))
    }
  }, [username, verified])

  const clearWizard = () => {
    localStorage.removeItem('add_model_wizard')
    setStep(0)
    setUsername('')
    setVerified(false)
    setAccountInfo(null)
    setPromoImages([])
  }

  return (
    <div className="min-h-screen bg-gray-950 text-white">
      {/* Header */}
      <div className="border-b border-gray-800 p-4">
        <div className="max-w-3xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Link href="/?tab=models" className="text-gray-400 hover:text-white">← Back</Link>
            <h1 className="text-xl font-bold">➕ Add New Model</h1>
          </div>
          {username && (
            <button onClick={clearWizard} className="text-xs text-gray-500 hover:text-red-400">
              Reset Wizard
            </button>
          )}
        </div>
      </div>

      {/* Progress */}
      <div className="max-w-3xl mx-auto px-4 pt-6">
        <div className="flex items-center gap-1 mb-8">
          {STEPS.map((label, i) => (
            <div key={i} className="flex-1 flex flex-col items-center gap-1">
              <div className={`w-full h-1.5 rounded-full ${
                i < step ? 'bg-green-500' : i === step ? 'bg-blue-500' : 'bg-gray-800'
              }`} />
              <span className={`text-xs ${
                i <= step ? 'text-gray-300' : 'text-gray-600'
              }`}>{label}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Step Content */}
      <div className="max-w-3xl mx-auto px-4 pb-12">
        {step === 0 && (
          <Step1Verify
            username={username}
            setUsername={setUsername}
            verified={verified}
            setVerified={setVerified}
            accountInfo={accountInfo}
            setAccountInfo={setAccountInfo}
            onNext={() => setStep(1)}
          />
        )}
        {step === 1 && (
          <Step2Upload
            username={username}
            promoImages={promoImages}
            setPromoImages={setPromoImages}
            onNext={() => setStep(2)}
            onBack={() => setStep(0)}
          />
        )}
        {step === 2 && (
          <Step3Distribute
            username={username}
            promoImages={promoImages}
            setPromoImages={setPromoImages}
            allModels={allModels}
            onNext={() => setStep(3)}
            onBack={() => setStep(1)}
          />
        )}
        {step === 3 && (
          <Step4ReverseDistribute
            username={username}
            allModels={allModels}
            onNext={() => setStep(4)}
            onBack={() => setStep(2)}
          />
        )}
        {step === 4 && (
          <Step5Sync
            username={username}
            onBack={() => setStep(3)}
            onDone={clearWizard}
          />
        )}
      </div>
    </div>
  )
}

/* ─── Step 1: Verify Account ─── */
function Step1Verify({ username, setUsername, verified, setVerified, accountInfo, setAccountInfo, onNext }: {
  username: string; setUsername: (v: string) => void
  verified: boolean; setVerified: (v: boolean) => void
  accountInfo: any; setAccountInfo: (v: any) => void
  onNext: () => void
}) {
  const [checking, setChecking] = useState(false)
  const [error, setError] = useState('')

  const verify = async () => {
    if (!username.trim()) return
    setChecking(true)
    setError('')
    setVerified(false)
    setAccountInfo(null)
    try {
      const res = await fetch('/api/sync-accounts')
      const data = await res.json()
      const accounts: any[] = data.accounts || data.models || []
      const found = accounts.find((a: any) =>
        (a.username || a.onlyfans_username || '') .toLowerCase() === username.trim().toLowerCase()
      )
      if (found) {
        setVerified(true)
        setAccountInfo(found)
      } else {
        setError('Account not found. Connect this account on app.onlyfansapi.com first.')
      }
    } catch (e) {
      setError(`Failed to check: ${e}`)
    }
    setChecking(false)
  }

  return (
    <div className="space-y-6">
      <div className="bg-gray-900 rounded-xl border border-gray-800 p-6">
        <h2 className="text-lg font-bold mb-4">Step 1: Verify OF Account</h2>
        <p className="text-sm text-gray-400 mb-4">Enter the OnlyFans username to verify it&apos;s connected to the API.</p>

        <div className="flex gap-3">
          <input
            type="text"
            value={username}
            onChange={e => { setUsername(e.target.value); setVerified(false); setError('') }}
            placeholder="e.g. laceythomass"
            className="flex-1 bg-gray-800 border border-gray-700 rounded-lg px-4 py-2 text-white placeholder-gray-500 focus:border-blue-500 focus:outline-none"
            onKeyDown={e => e.key === 'Enter' && verify()}
          />
          <button
            onClick={verify}
            disabled={checking || !username.trim()}
            className="px-6 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 rounded-lg font-medium"
          >
            {checking ? '⏳ Checking...' : 'Verify'}
          </button>
        </div>

        {error && (
          <div className="mt-4 p-3 bg-red-500/10 border border-red-500/30 rounded-lg text-red-400 text-sm flex items-center gap-2">
            <span className="text-lg">❌</span> {error}
          </div>
        )}

        {verified && accountInfo && (
          <div className="mt-4 p-4 bg-green-500/10 border border-green-500/30 rounded-lg flex items-center gap-4">
            <span className="text-2xl">✅</span>
            {accountInfo.avatar && (
              <img src={accountInfo.avatar} className="w-12 h-12 rounded-full object-cover" alt="" />
            )}
            <div>
              <div className="text-green-400 font-bold">{accountInfo.displayName || accountInfo.name || username}</div>
              <div className="text-sm text-gray-400">@{username} — Connected</div>
            </div>
          </div>
        )}
      </div>

      <div className="flex justify-end">
        <button
          onClick={onNext}
          disabled={!verified}
          className="px-6 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-30 rounded-lg font-medium"
        >
          Next →
        </button>
      </div>
    </div>
  )
}

/* ─── Step 2: Upload Promo Photos ─── */
function Step2Upload({ username, promoImages, setPromoImages, onNext, onBack }: {
  username: string; promoImages: PromoImage[]; setPromoImages: (imgs: PromoImage[]) => void
  onNext: () => void; onBack: () => void
}) {
  const [dragOver, setDragOver] = useState(false)
  const [uploading, setUploading] = useState(false)

  const handleDrop = useCallback(async (e: React.DragEvent) => {
    e.preventDefault()
    setDragOver(false)
    const files = Array.from(e.dataTransfer.files).filter(f =>
      ['image/jpeg', 'image/png', 'image/gif', 'image/webp'].includes(f.type)
    )
    if (!files.length) return
    setUploading(true)
    const newImages: PromoImage[] = []
    for (const file of files) {
      const base64 = await new Promise<string>(resolve => {
        const reader = new FileReader()
        reader.onloadend = () => resolve(reader.result as string)
        reader.readAsDataURL(file)
      })
      newImages.push({
        id: `img_${Date.now()}_${Math.random().toString(36).slice(2)}`,
        url: base64, filename: file.name, uploadedAt: new Date().toISOString(),
        isActive: false, uses: [], vaultIds: {}, base64
      })
    }
    const updated = [...promoImages, ...newImages]
    setPromoImages(updated)
    await saveImages(username, updated)
    setUploading(false)
  }, [promoImages, username, setPromoImages])

  const toggleUse = async (imageId: string, use: ImageUse) => {
    const updated = promoImages.map(img => {
      if (img.id !== imageId) return img
      const uses = img.uses.includes(use) ? img.uses.filter(u => u !== use) : [...img.uses, use]
      return { ...img, uses, isActive: uses.length > 0 }
    })
    setPromoImages(updated)
    await saveImages(username, updated)
  }

  const removeImage = async (imageId: string) => {
    const updated = promoImages.filter(img => img.id !== imageId)
    setPromoImages(updated)
    await saveImages(username, updated)
  }

  const canProceed = promoImages.some(img => img.uses.length > 0)

  return (
    <div className="space-y-6">
      <div className="bg-gray-900 rounded-xl border border-gray-800 p-6">
        <h2 className="text-lg font-bold mb-4">Step 2: Upload Promo Photos</h2>

        {/* Drop zone */}
        <div
          onDrop={handleDrop}
          onDragOver={e => { e.preventDefault(); setDragOver(true) }}
          onDragLeave={() => setDragOver(false)}
          className={`border-2 border-dashed rounded-xl p-8 text-center transition cursor-pointer ${
            dragOver ? 'border-blue-500 bg-blue-500/10' : 'border-gray-700 hover:border-gray-600'
          }`}
        >
          <input
            type="file"
            accept="image/*"
            multiple
            className="hidden"
            id="file-input"
            onChange={async (e) => {
              const files = Array.from(e.target.files || [])
              if (!files.length) return
              setUploading(true)
              const newImages: PromoImage[] = []
              for (const file of files) {
                const base64 = await new Promise<string>(resolve => {
                  const reader = new FileReader()
                  reader.onloadend = () => resolve(reader.result as string)
                  reader.readAsDataURL(file)
                })
                newImages.push({
                  id: `img_${Date.now()}_${Math.random().toString(36).slice(2)}`,
                  url: base64, filename: file.name, uploadedAt: new Date().toISOString(),
                  isActive: false, uses: [], vaultIds: {}, base64
                })
              }
              const updated = [...promoImages, ...newImages]
              setPromoImages(updated)
              await saveImages(username, updated)
              setUploading(false)
            }}
          />
          <label htmlFor="file-input" className="cursor-pointer">
            <p className="text-gray-400 text-lg mb-1">
              {uploading ? '⏳ Processing...' : '📸 Drop images here or click to browse'}
            </p>
            <p className="text-gray-600 text-sm">JPG, PNG, GIF, WebP</p>
          </label>
        </div>

        {/* Image list */}
        {promoImages.length > 0 && (
          <div className="mt-4 space-y-3">
            {promoImages.map(img => (
              <div key={img.id} className="flex items-center gap-4 bg-gray-800 rounded-lg p-3">
                <img src={img.url} alt="" className="w-16 h-16 rounded-lg object-cover" />
                <div className="flex-1">
                  <div className="text-sm text-gray-300">{img.filename}</div>
                  <div className="flex gap-2 mt-1">
                    {(['ghost', 'pinned', 'massDm'] as ImageUse[]).map(use => (
                      <button
                        key={use}
                        onClick={() => toggleUse(img.id, use)}
                        className={`text-xs px-2.5 py-1 rounded-full font-medium transition ${
                          img.uses.includes(use)
                            ? use === 'ghost' ? 'bg-purple-500/30 text-purple-300 border border-purple-500/50'
                              : use === 'pinned' ? 'bg-yellow-500/30 text-yellow-300 border border-yellow-500/50'
                              : 'bg-cyan-500/30 text-cyan-300 border border-cyan-500/50'
                            : 'bg-gray-700 text-gray-500 border border-gray-600'
                        }`}
                      >
                        {use === 'ghost' ? '👻 Ghost' : use === 'pinned' ? '📌 Pin' : '📨 DM'}
                      </button>
                    ))}
                  </div>
                </div>
                <button onClick={() => removeImage(img.id)} className="text-gray-500 hover:text-red-400 text-lg">✕</button>
              </div>
            ))}
          </div>
        )}

        {!canProceed && promoImages.length > 0 && (
          <p className="mt-3 text-sm text-yellow-400">⚠️ Select at least one use (Ghost/Pin/DM) on at least one image to continue.</p>
        )}
      </div>

      <div className="flex justify-between">
        <button onClick={onBack} className="px-6 py-2 bg-gray-800 hover:bg-gray-700 rounded-lg font-medium">← Back</button>
        <button onClick={onNext} disabled={!canProceed} className="px-6 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-30 rounded-lg font-medium">Next →</button>
      </div>
    </div>
  )
}

/* ─── Step 3: Distribute Her Photos → All Vaults ─── */
function Step3Distribute({ username, promoImages, setPromoImages, allModels, onNext, onBack }: {
  username: string; promoImages: PromoImage[]; setPromoImages: (imgs: PromoImage[]) => void
  allModels: any[]; onNext: () => void; onBack: () => void
}) {
  const [distributing, setDistributing] = useState(false)
  const [progress, setProgress] = useState({ imgIdx: 0, imgTotal: 0, modelIdx: 0, modelTotal: 0, label: '' })
  const [completedModels, setCompletedModels] = useState<Set<string>>(new Set())
  const [errors, setErrors] = useState<{ model: string; error: string }[]>([])

  const activeImages = promoImages.filter(img => img.uses.length > 0)
  const otherModels = allModels.filter(m => m.username !== username)

  // Check which models already have vault IDs (for resumability)
  useEffect(() => {
    const done = new Set<string>()
    for (const model of otherModels) {
      const allHaveVault = activeImages.every(img => img.vaultIds[model.username])
      if (allHaveVault) done.add(model.username)
    }
    setCompletedModels(done)
  }, [promoImages])

  const startDistribution = async () => {
    setDistributing(true)
    setErrors([])

    for (let i = 0; i < activeImages.length; i++) {
      const img = activeImages[i]
      const targets = otherModels
        .filter(m => !img.vaultIds[m.username])
        .map(m => m.username)

      if (targets.length === 0) continue

      setProgress({ imgIdx: i + 1, imgTotal: activeImages.length, modelIdx: 0, modelTotal: targets.length, label: `Image ${i + 1}/${activeImages.length}` })

      // Distribute in chunks of 3
      const CHUNK = 3
      const newVaultIds: Record<string, string> = {}
      for (let c = 0; c < targets.length; c += CHUNK) {
        const chunk = targets.slice(c, c + CHUNK)
        setProgress(p => ({ ...p, modelIdx: c, label: `Image ${i + 1}/${activeImages.length} → ${c}/${targets.length} vaults` }))

        try {
          const res = await fetch('/api/distribute', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              imageBase64: await compressImage(img.base64!),
              filename: img.filename,
              sourceUsername: username,
              targetUsernames: chunk
            })
          })
          const data = await res.json()
          if (data.results) {
            for (const r of data.results) {
              if (r.vaultId) {
                newVaultIds[r.username] = r.vaultId
                setCompletedModels(prev => {
                  const next = new Set(prev)
                  next.add(r.username)
                  return next
                })
              } else if (r.error) {
                setErrors(prev => [...prev, { model: r.username, error: r.error }])
              }
            }
          }
        } catch (e) {
          setErrors(prev => [...prev, { model: chunk.join(', '), error: String(e) }])
        }
      }

      // Save vault IDs back to IndexedDB
      if (Object.keys(newVaultIds).length > 0) {
        const updated = promoImages.map(im =>
          im.id === img.id ? { ...im, vaultIds: { ...im.vaultIds, ...newVaultIds } } : im
        )
        setPromoImages(updated)
        await saveImages(username, updated)
      }
    }

    setDistributing(false)
    setProgress(p => ({ ...p, label: 'Done!' }))
  }

  const allDone = otherModels.length > 0 && otherModels.every(m => completedModels.has(m.username))

  return (
    <div className="space-y-6">
      <div className="bg-gray-900 rounded-xl border border-gray-800 p-6">
        <h2 className="text-lg font-bold mb-2">Step 3: Distribute Her Photos → All Vaults</h2>
        <p className="text-sm text-gray-400 mb-4">
          Upload {activeImages.length} image(s) to {otherModels.length} other models&apos; vaults.
        </p>

        {/* Model list */}
        <div className="grid grid-cols-3 gap-2 mb-4 max-h-60 overflow-y-auto">
          {otherModels.map(m => (
            <div key={m.username} className={`text-xs px-2 py-1.5 rounded flex items-center gap-1.5 ${
              completedModels.has(m.username) ? 'bg-green-500/10 text-green-400' : 'bg-gray-800 text-gray-400'
            }`}>
              {completedModels.has(m.username) ? '✅' : '⬜'} @{m.username}
            </div>
          ))}
        </div>

        {/* Progress */}
        {distributing && (
          <div className="mb-4">
            <div className="flex justify-between text-sm mb-1">
              <span className="text-gray-300">{progress.label}</span>
              <span className="text-white">{completedModels.size}/{otherModels.length}</span>
            </div>
            <div className="w-full bg-gray-700 rounded-full h-2">
              <div className="bg-blue-500 h-2 rounded-full transition-all" style={{ width: `${otherModels.length > 0 ? (completedModels.size / otherModels.length) * 100 : 0}%` }} />
            </div>
          </div>
        )}

        {errors.length > 0 && (
          <div className="mb-4 max-h-32 overflow-y-auto space-y-1">
            {errors.map((e, i) => (
              <div key={i} className="text-xs text-red-400 bg-red-500/10 px-2 py-1 rounded">❌ {e.model}: {e.error}</div>
            ))}
          </div>
        )}

        {!distributing && !allDone && (
          <button onClick={startDistribution} className="w-full py-3 bg-purple-600 hover:bg-purple-700 rounded-lg font-bold text-lg">
            🚀 Start Distribution
          </button>
        )}

        {allDone && (
          <div className="p-3 bg-green-500/10 border border-green-500/30 rounded-lg text-green-400 text-center font-bold">
            ✅ All {otherModels.length} vaults have her photos!
          </div>
        )}
      </div>

      <div className="flex justify-between">
        <button onClick={onBack} disabled={distributing} className="px-6 py-2 bg-gray-800 hover:bg-gray-700 disabled:opacity-50 rounded-lg font-medium">← Back</button>
        <button onClick={onNext} disabled={distributing} className="px-6 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-30 rounded-lg font-medium">Next →</button>
      </div>
    </div>
  )
}

/* ─── Step 4: Distribute All Models' Photos → Her Vault ─── */
function Step4ReverseDistribute({ username, allModels, onNext, onBack }: {
  username: string; allModels: any[]; onNext: () => void; onBack: () => void
}) {
  const [distributing, setDistributing] = useState(false)
  const [progress, setProgress] = useState({ current: 0, total: 0, label: '' })
  const [completedModels, setCompletedModels] = useState<Set<string>>(new Set())
  const [errors, setErrors] = useState<{ model: string; error: string }[]>([])
  const [loaded, setLoaded] = useState(false)
  const [sourceImages, setSourceImages] = useState<{ username: string; images: PromoImage[] }[]>([])

  const otherModels = allModels.filter(m => m.username !== username)

  // Load all other models' images and check which already have vaultId for this model
  useEffect(() => {
    const load = async () => {
      const sources: { username: string; images: PromoImage[] }[] = []
      const done = new Set<string>()
      for (const m of otherModels) {
        const imgs = await loadImages(m.username)
        const active = imgs.filter(img => img.uses.length > 0)
        if (active.length > 0) {
          sources.push({ username: m.username, images: active })
          // Check if ALL active images already have vaultId for new model
          if (active.every(img => img.vaultIds[username])) {
            done.add(m.username)
          }
        }
      }
      setSourceImages(sources)
      setCompletedModels(done)
      setLoaded(true)
    }
    load()
  }, [])

  const startDistribution = async () => {
    setDistributing(true)
    setErrors([])
    let current = 0
    const total = sourceImages.filter(s => !completedModels.has(s.username)).length

    for (const source of sourceImages) {
      if (completedModels.has(source.username)) continue
      current++
      setProgress({ current, total, label: `Uploading from @${source.username} (${current}/${total})` })

      for (const img of source.images) {
        if (img.vaultIds[username]) continue // already done
        if (!img.base64) {
          setErrors(prev => [...prev, { model: source.username, error: 'No base64 data' }])
          continue
        }

        try {
          const compressed = await compressImage(img.base64)
          const res = await fetch('/api/distribute-to-new-model', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              targetUsername: username,
              sourceUsername: source.username,
              imageId: img.id,
              base64: compressed
            })
          })
          const data = await res.json()
          if (data.vaultId) {
            // Update the source model's image in IndexedDB
            const allImgs = await loadImages(source.username)
            const updated = allImgs.map(i =>
              i.id === img.id ? { ...i, vaultIds: { ...i.vaultIds, [username]: data.vaultId } } : i
            )
            await saveImages(source.username, updated)
          } else {
            setErrors(prev => [...prev, { model: source.username, error: data.error || 'No vault ID' }])
          }
        } catch (e) {
          setErrors(prev => [...prev, { model: source.username, error: String(e) }])
        }
      }

      setCompletedModels(prev => { const next = new Set(prev); next.add(source.username); return next })
    }

    setDistributing(false)
    setProgress(p => ({ ...p, label: 'Done!' }))
  }

  const allDone = loaded && sourceImages.length > 0 && sourceImages.every(s => completedModels.has(s.username))

  return (
    <div className="space-y-6">
      <div className="bg-gray-900 rounded-xl border border-gray-800 p-6">
        <h2 className="text-lg font-bold mb-2">Step 4: All Models&apos; Photos → Her Vault</h2>
        <p className="text-sm text-gray-400 mb-4">
          Upload {sourceImages.length} models&apos; promo photos into @{username}&apos;s vault.
        </p>

        {!loaded && <p className="text-gray-500 animate-pulse">Loading images from IndexedDB...</p>}

        {loaded && (
          <>
            <div className="grid grid-cols-3 gap-2 mb-4 max-h-60 overflow-y-auto">
              {sourceImages.map(s => (
                <div key={s.username} className={`text-xs px-2 py-1.5 rounded flex items-center gap-1.5 ${
                  completedModels.has(s.username) ? 'bg-green-500/10 text-green-400' : 'bg-gray-800 text-gray-400'
                }`}>
                  {completedModels.has(s.username) ? '✅' : '⬜'} @{s.username} ({s.images.length})
                </div>
              ))}
            </div>

            {distributing && (
              <div className="mb-4">
                <div className="flex justify-between text-sm mb-1">
                  <span className="text-gray-300">{progress.label}</span>
                  <span className="text-white">{completedModels.size}/{sourceImages.length}</span>
                </div>
                <div className="w-full bg-gray-700 rounded-full h-2">
                  <div className="bg-purple-500 h-2 rounded-full transition-all" style={{ width: `${sourceImages.length > 0 ? (completedModels.size / sourceImages.length) * 100 : 0}%` }} />
                </div>
              </div>
            )}

            {errors.length > 0 && (
              <div className="mb-4 max-h-32 overflow-y-auto space-y-1">
                {errors.map((e, i) => (
                  <div key={i} className="text-xs text-red-400 bg-red-500/10 px-2 py-1 rounded">❌ {e.model}: {e.error}</div>
                ))}
              </div>
            )}

            {!distributing && !allDone && (
              <button onClick={startDistribution} className="w-full py-3 bg-purple-600 hover:bg-purple-700 rounded-lg font-bold text-lg">
                🚀 Start Reverse Distribution
              </button>
            )}

            {allDone && (
              <div className="p-3 bg-green-500/10 border border-green-500/30 rounded-lg text-green-400 text-center font-bold">
                ✅ All {sourceImages.length} models&apos; photos are in @{username}&apos;s vault!
              </div>
            )}
          </>
        )}
      </div>

      <div className="flex justify-between">
        <button onClick={onBack} disabled={distributing} className="px-6 py-2 bg-gray-800 hover:bg-gray-700 disabled:opacity-50 rounded-lg font-medium">← Back</button>
        <button onClick={onNext} disabled={distributing} className="px-6 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-30 rounded-lg font-medium">Next →</button>
      </div>
    </div>
  )
}

/* ─── Step 5: Sync to Worker ─── */
function Step5Sync({ username, onBack, onDone }: {
  username: string; onBack: () => void; onDone: () => void
}) {
  const [syncing, setSyncing] = useState(false)
  const [result, setResult] = useState<{ success: boolean; message: string } | null>(null)

  const sync = async () => {
    setSyncing(true)
    setResult(null)
    try {
      const res = await syncToKVv2()
      setResult(res)
    } catch (e) {
      setResult({ success: false, message: String(e) })
    }
    setSyncing(false)
  }

  return (
    <div className="space-y-6">
      <div className="bg-gray-900 rounded-xl border border-gray-800 p-6 text-center">
        <h2 className="text-lg font-bold mb-4">Step 5: Sync to Worker</h2>
        <p className="text-sm text-gray-400 mb-6">Push all vault mappings to the Railway worker so @{username} is included in the rotation.</p>

        {!result && (
          <button
            onClick={sync}
            disabled={syncing}
            className="px-8 py-3 bg-green-600 hover:bg-green-700 disabled:opacity-50 rounded-lg font-bold text-lg"
          >
            {syncing ? '⏳ Syncing...' : '🚀 Sync All Mappings'}
          </button>
        )}

        {result && (
          <div className={`p-4 rounded-lg border ${result.success ? 'bg-green-500/10 border-green-500/30' : 'bg-red-500/10 border-red-500/30'}`}>
            {result.success ? (
              <div className="space-y-3">
                <p className="text-green-400 text-xl font-bold">🎉 Done! @{username} is now in the rotation!</p>
                <p className="text-sm text-gray-400">{result.message}</p>
                <Link
                  href={`/models/${username}`}
                  className="inline-block mt-2 px-6 py-2 bg-purple-600 hover:bg-purple-700 rounded-lg font-medium"
                >
                  View @{username}&apos;s Model Page →
                </Link>
              </div>
            ) : (
              <div>
                <p className="text-red-400 font-bold">❌ Sync failed</p>
                <p className="text-sm text-gray-400 mt-1">{result.message}</p>
                <button onClick={sync} className="mt-3 px-6 py-2 bg-blue-600 hover:bg-blue-700 rounded-lg font-medium">Retry</button>
              </div>
            )}
          </div>
        )}
      </div>

      <div className="flex justify-between">
        <button onClick={onBack} className="px-6 py-2 bg-gray-800 hover:bg-gray-700 rounded-lg font-medium">← Back</button>
        {result?.success && (
          <button onClick={onDone} className="px-6 py-2 bg-gray-800 hover:bg-gray-700 rounded-lg font-medium">
            Start Another →
          </button>
        )}
      </div>
    </div>
  )
}
