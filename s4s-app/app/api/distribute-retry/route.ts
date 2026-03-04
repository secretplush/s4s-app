import { NextRequest, NextResponse } from 'next/server'
import { kv } from '@vercel/kv'

export const maxDuration = 300

const OF_API_BASE = 'https://app.onlyfansapi.com/api'
const OF_API_KEY = process.env.OF_API_KEY || 'ofapi_bT4J1Er2YBow46EihDfjlSFf5HRmiM15M4DCOoHn7889d8b4'

let accountIdCache: { [username: string]: string } = {}
let cacheTimestamp = 0
const CACHE_TTL = 5 * 60 * 1000

async function getAccountIds(): Promise<{ [username: string]: string }> {
  const now = Date.now()
  if (Object.keys(accountIdCache).length > 0 && now - cacheTimestamp < CACHE_TTL) {
    return accountIdCache
  }
  const res = await fetch(`${OF_API_BASE}/accounts?limit=200`, {
    headers: { 'Authorization': `Bearer ${OF_API_KEY}` },
    cache: 'no-store',
  })
  if (!res.ok) return accountIdCache
  const data = await res.json()
  const raw: any[] = Array.isArray(data) ? data : data.data || data.accounts || []
  const newCache: { [username: string]: string } = {}
  for (const acct of raw) {
    const username = acct.onlyfans_username || acct.onlyfans_user_data?.username
    const id = acct.id || acct.prefixed_id
    if (username && id) newCache[username] = id
  }
  accountIdCache = newCache
  cacheTimestamp = now
  return newCache
}

function base64ToBuffer(dataUrl: string): { buffer: Buffer; mimeType: string } {
  const matches = dataUrl.match(/^data:(.+);base64,(.+)$/)
  if (!matches) throw new Error('Invalid base64 data URL')
  return { mimeType: matches[1], buffer: Buffer.from(matches[2], 'base64') }
}

async function uploadToVault(username: string, imageBase64: string, sourceUsername: string, accountIds: { [username: string]: string }): Promise<{ vaultId: string | null; error?: string }> {
  const accountId = accountIds[username]
  if (!accountId) return { vaultId: null, error: `No account ID for ${username}` }

  try {
    const { buffer, mimeType } = base64ToBuffer(imageBase64)
    const formData = new FormData()
    formData.append('file', new Blob([buffer], { type: mimeType }), `${sourceUsername}_promo.jpg`)

    const uploadRes = await fetch(`${OF_API_BASE}/${accountId}/media/upload`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${OF_API_KEY}` },
      body: formData
    })
    if (!uploadRes.ok) return { vaultId: null, error: `Upload failed: ${await uploadRes.text()}` }

    const uploadData = await uploadRes.json()
    const mediaId = uploadData.prefixed_id || uploadData.id || uploadData.media_id
    if (!mediaId) return { vaultId: null, error: 'No media ID returned' }

    await new Promise(r => setTimeout(r, 3000))

    const postRes = await fetch(`${OF_API_BASE}/${accountId}/posts`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${OF_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: `@${sourceUsername}`, mediaFiles: [mediaId] })
    })
    if (!postRes.ok) return { vaultId: null, error: `Post creation failed: ${await postRes.text()}` }

    const postResponse = await postRes.json()
    const postData = postResponse.data || postResponse
    const postId = postData.id || postData.post_id

    let vaultId: string | null = null
    if (postData.media?.length > 0) {
      const m = postData.media[0]
      vaultId = m.id?.toString() || m.vault_id?.toString() || m.mediaId?.toString() || m.media_id?.toString() || null
      if (!vaultId && m.files) {
        const urlMatch = JSON.stringify(m.files).match(/\/(\d{5,})/)
        if (urlMatch) vaultId = urlMatch[1]
      }
    }

    if (postId) {
      await new Promise(r => setTimeout(r, 2000))
      await fetch(`${OF_API_BASE}/${accountId}/posts/${postId}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${OF_API_KEY}` }
      })
    }

    return vaultId ? { vaultId } : { vaultId: null, error: 'Could not extract vault_id' }
  } catch (e) {
    return { vaultId: null, error: String(e) }
  }
}

export async function POST(req: NextRequest) {
  try {
    const { sourceUsername, targetUsernames, imageBase64 } = await req.json()
    if (!sourceUsername || !targetUsernames?.length || !imageBase64) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
    }

    const accountIds = await getAccountIds()
    const results = await Promise.all(
      targetUsernames.map(async (username: string) => {
        const { vaultId, error } = await uploadToVault(username, imageBase64, sourceUsername, accountIds)
        return { username, vaultId, error }
      })
    )

    const successful = results.filter(r => r.vaultId)

    // Merge into existing vault_mappings (don't overwrite)
    if (successful.length > 0) {
      const mappings = (await kv.get('vault_mappings') as Record<string, Record<string, string>>) || {}
      if (!mappings[sourceUsername]) mappings[sourceUsername] = {}
      for (const r of successful) {
        mappings[sourceUsername][r.username] = r.vaultId!
      }
      await kv.set('vault_mappings', mappings)
    }

    return NextResponse.json({
      success: true,
      sourceUsername,
      distributed: successful.length,
      failed: results.length - successful.length,
      results
    })
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
