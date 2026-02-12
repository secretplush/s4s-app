import { NextRequest, NextResponse } from 'next/server'
import { kv } from '@vercel/kv'

export const maxDuration = 300 // 5 minutes

const OF_API_BASE = 'https://app.onlyfansapi.com/api'
const OF_API_KEY = process.env.OF_API_KEY || 'ofapi_bT4J1Er2YBow46EihDfjlSFf5HRmiM15M4DCOoHn7889d8b4'

// Dynamic account ID fetching - cached for 5 minutes
let _accountIdsCache: { [username: string]: string } | null = null
let _accountIdsCacheTime = 0
const CACHE_TTL = 5 * 60 * 1000

async function getAccountIds(): Promise<{ [username: string]: string }> {
  if (_accountIdsCache && Date.now() - _accountIdsCacheTime < CACHE_TTL) {
    return _accountIdsCache
  }
  try {
    const res = await fetch(`${OF_API_BASE}/accounts`, {
      headers: { 'Authorization': `Bearer ${OF_API_KEY}` },
      cache: 'no-store',
    })
    if (!res.ok) throw new Error(`OF API ${res.status}`)
    const data = await res.json()
    const rawAccounts: any[] = Array.isArray(data) ? data : data.data || data.accounts || []
    const map: { [username: string]: string } = {}
    for (const acct of rawAccounts) {
      const username = acct.onlyfans_username || acct.onlyfans_user_data?.username
      const id = acct.id || acct.prefixed_id
      if (username && id) map[username] = id
    }
    _accountIdsCache = map
    _accountIdsCacheTime = Date.now()
    console.log(`[sync-new-model] Loaded ${Object.keys(map).length} account IDs from OF API`)
    return map
  } catch (e) {
    console.error('[sync-new-model] Failed to fetch account IDs:', e)
    if (_accountIdsCache) return _accountIdsCache
    throw e
  }
}

function base64ToBuffer(dataUrl: string): { buffer: Buffer; mimeType: string } {
  const matches = dataUrl.match(/^data:(.+);base64,(.+)$/)
  if (!matches) throw new Error('Invalid base64 data URL')
  return { mimeType: matches[1], buffer: Buffer.from(matches[2], 'base64') }
}

async function uploadToVault(
  targetUsername: string,
  imageBase64: string,
  filename: string,
  sourceUsername: string
): Promise<{ vaultId: string | null; error?: string }> {
  const accountIds = await getAccountIds()
  const accountId = accountIds[targetUsername]
  if (!accountId) return { vaultId: null, error: `No account ID for ${targetUsername}` }

  try {
    const { buffer, mimeType } = base64ToBuffer(imageBase64)

    // Step 1: Upload media
    const formData = new FormData()
    const blob = new Blob([buffer], { type: mimeType })
    formData.append('file', blob, filename)

    const uploadRes = await fetch(`${OF_API_BASE}/${accountId}/media/upload`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${OF_API_KEY}` },
      body: formData
    })

    if (!uploadRes.ok) {
      return { vaultId: null, error: `Upload failed: ${await uploadRes.text()}` }
    }

    const uploadData = await uploadRes.json()
    const mediaId = uploadData.prefixed_id || uploadData.id || uploadData.media_id
    if (!mediaId) return { vaultId: null, error: `No media ID: ${JSON.stringify(uploadData)}` }

    // Wait for rate limit
    await new Promise(r => setTimeout(r, 11000))

    // Step 2: Create post with @tag
    const postRes = await fetch(`${OF_API_BASE}/${accountId}/posts`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${OF_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        text: `@${sourceUsername}`,
        mediaFiles: [mediaId]
      })
    })

    if (!postRes.ok) {
      return { vaultId: null, error: `Post failed: ${await postRes.text()}` }
    }

    const postResponse = await postRes.json()
    const postData = postResponse.data || postResponse
    const postId = postData.id || postData.post_id

    let vaultId: string | null = null
    if (postData.media && postData.media.length > 0) {
      vaultId = postData.media[0].id?.toString() || postData.media[0].vault_id?.toString()
    }

    // Step 3: Delete post (vault copy remains)
    if (postId) {
      await new Promise(r => setTimeout(r, 2000))
      await fetch(`${OF_API_BASE}/${accountId}/posts/${postId}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${OF_API_KEY}` }
      })
    }

    if (!vaultId) return { vaultId: null, error: 'Could not extract vault_id' }
    return { vaultId }
  } catch (e) {
    return { vaultId: null, error: `Exception: ${e}` }
  }
}

interface SyncRequest {
  targetUsername: string
  sources: { username: string; imageBase64: string; filename: string }[]
}

export async function POST(req: NextRequest) {
  try {
    const { targetUsername, sources }: SyncRequest = await req.json()

    if (!targetUsername || !sources || sources.length === 0) {
      return NextResponse.json({ error: 'Missing targetUsername or sources' }, { status: 400 })
    }

    const accountIds = await getAccountIds()
    if (!accountIds[targetUsername]) {
      return NextResponse.json({ error: `Unknown target model: ${targetUsername}` }, { status: 400 })
    }

    const results: { username: string; vaultId: string | null; error?: string }[] = []

    // Process sequentially to avoid overwhelming the single target account
    for (let i = 0; i < sources.length; i++) {
      const src = sources[i]
      console.log(`[sync-new-model] ${i + 1}/${sources.length}: Uploading ${src.username}'s image to ${targetUsername}'s vault...`)

      const { vaultId, error } = await uploadToVault(targetUsername, src.imageBase64, src.filename, src.username)
      results.push({ username: src.username, vaultId, error })
    }

    // Save vault mappings to KV
    const existingMappings = (await kv.get('vault_mappings') as Record<string, Record<string, string>>) || {}

    for (const r of results) {
      if (r.vaultId) {
        // mappings[sourceUsername][targetUsername] = vaultId
        // meaning: when sourceUsername promotes, they use this vaultId in targetUsername's account
        if (!existingMappings[r.username]) existingMappings[r.username] = {}
        existingMappings[r.username][targetUsername] = r.vaultId
      }
    }

    await kv.set('vault_mappings', existingMappings)
    await kv.set('last_sync', new Date().toISOString())

    const successful = results.filter(r => r.vaultId !== null)
    const failed = results.filter(r => r.vaultId === null)

    return NextResponse.json({
      success: true,
      targetUsername,
      total: sources.length,
      successful: successful.length,
      failed: failed.length,
      results
    })
  } catch (e) {
    console.error('Sync new model error:', e)
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}

// GET: Check which models are missing from a target's vault
export async function GET(req: NextRequest) {
  const targetUsername = req.nextUrl.searchParams.get('target')
  if (!targetUsername) {
    return NextResponse.json({ error: 'Missing target param' }, { status: 400 })
  }

  const mappings = (await kv.get('vault_mappings') as Record<string, Record<string, string>>) || {}
  const accountIds = await getAccountIds()
  const allModels = Object.keys(accountIds)
  const otherModels = allModels.filter(m => m !== targetUsername)

  const missing: string[] = []
  const existing: { username: string; vaultId: string }[] = []

  for (const model of otherModels) {
    if (mappings[model]?.[targetUsername]) {
      existing.push({ username: model, vaultId: mappings[model][targetUsername] })
    } else {
      missing.push(model)
    }
  }

  return NextResponse.json({
    targetUsername,
    totalModels: allModels.length,
    missing,
    missingCount: missing.length,
    existing,
    existingCount: existing.length
  })
}
