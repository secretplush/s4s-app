import { NextRequest, NextResponse } from 'next/server'

export const maxDuration = 60

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
  try {
    const res = await fetch(`${OF_API_BASE}/accounts`, {
      headers: { 'Authorization': `Bearer ${OF_API_KEY}` },
      cache: 'no-store',
    })
    if (!res.ok) return accountIdCache
    const data = await res.json()
    const rawAccounts: any[] = Array.isArray(data) ? data : data.data || data.accounts || []
    const newCache: { [username: string]: string } = {}
    for (const acct of rawAccounts) {
      const username = acct.onlyfans_username || acct.onlyfans_user_data?.username
      const id = acct.id || acct.prefixed_id
      if (username && id) newCache[username] = id
    }
    accountIdCache = newCache
    cacheTimestamp = now
    return newCache
  } catch {
    return accountIdCache
  }
}

function base64ToBuffer(dataUrl: string): { buffer: Buffer; mimeType: string } {
  const matches = dataUrl.match(/^data:(.+);base64,(.+)$/)
  if (!matches) throw new Error('Invalid base64 data URL')
  return { mimeType: matches[1], buffer: Buffer.from(matches[2], 'base64') }
}

export async function POST(req: NextRequest) {
  try {
    const { targetUsername, sourceUsername, imageId, base64 } = await req.json()

    if (!targetUsername || !sourceUsername || !imageId || !base64) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
    }

    const accountIds = await getAccountIds()
    const accountId = accountIds[targetUsername]
    if (!accountId) {
      return NextResponse.json({ error: `No account ID for ${targetUsername}` }, { status: 404 })
    }

    // Upload media
    const { buffer, mimeType } = base64ToBuffer(base64)
    const formData = new FormData()
    const blob = new Blob([buffer], { type: mimeType })
    formData.append('file', blob, `${sourceUsername}_promo.jpg`)

    const uploadRes = await fetch(`${OF_API_BASE}/${accountId}/media/upload`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${OF_API_KEY}` },
      body: formData
    })

    if (!uploadRes.ok) {
      const err = await uploadRes.text()
      return NextResponse.json({ error: `Upload failed: ${err}` }, { status: 500 })
    }

    const uploadData = await uploadRes.json()
    const mediaId = uploadData.prefixed_id || uploadData.id || uploadData.media_id
    if (!mediaId) {
      return NextResponse.json({ error: `No media ID returned` }, { status: 500 })
    }

    // Wait for rate limit
    await new Promise(r => setTimeout(r, 11000))

    // Create post to generate vault entry
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
      const err = await postRes.text()
      return NextResponse.json({ error: `Post creation failed: ${err}` }, { status: 500 })
    }

    const postResponse = await postRes.json()
    const postData = postResponse.data || postResponse
    const postId = postData.id || postData.post_id

    // Extract vault_id
    let vaultId: string | null = null
    if (postData.media && postData.media.length > 0) {
      const m = postData.media[0]
      vaultId = m.id?.toString() || m.vault_id?.toString() || m.mediaId?.toString() || m.media_id?.toString() || null
      if (!vaultId && m.files) {
        const urlMatch = JSON.stringify(m.files).match(/\/(\d{5,})/)
        if (urlMatch) vaultId = urlMatch[1]
      }
    }

    // Delete post (vault copy remains)
    if (postId) {
      await new Promise(r => setTimeout(r, 2000))
      await fetch(`${OF_API_BASE}/${accountId}/posts/${postId}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${OF_API_KEY}` }
      })
    }

    if (!vaultId) {
      return NextResponse.json({ error: 'Could not extract vault_id', raw: postResponse }, { status: 500 })
    }

    return NextResponse.json({ vaultId, sourceUsername, imageId })
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
