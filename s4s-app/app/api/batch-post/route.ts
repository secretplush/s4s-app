import { NextRequest, NextResponse } from 'next/server'

export const maxDuration = 300
export const dynamic = 'force-dynamic'

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
    const res = await fetch(`${OF_API_BASE}/accounts?limit=200`, {
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

const MAX_MEDIA_PER_POST = 20

// Create posts from pre-uploaded mediaIds, extract vault IDs, delete posts
// Body: { targetUsername, items: [{ sourceUsername, imageId, mediaId }] }
// Response: { results: [{ sourceUsername, imageId, vaultId, error? }] }
export async function POST(req: NextRequest) {
  try {
    const { targetUsername, items } = await req.json()

    if (!targetUsername || !items || !items.length) {
      return NextResponse.json({ error: 'Missing targetUsername or items' }, { status: 400 })
    }

    const accountIds = await getAccountIds()
    const accountId = accountIds[targetUsername]
    if (!accountId) {
      return NextResponse.json({ error: `No account ID for ${targetUsername}` }, { status: 404 })
    }

    // Wait for uploads to process
    await new Promise(r => setTimeout(r, 3000))

    const allResults: { sourceUsername: string; imageId: string; vaultId: string | null; error?: string }[] = []

    // Create posts in batches of MAX_MEDIA_PER_POST
    for (let i = 0; i < items.length; i += MAX_MEDIA_PER_POST) {
      const batch = items.slice(i, i + MAX_MEDIA_PER_POST)
      const mediaIds = batch.map((b: any) => b.mediaId)
      const caption = batch.map((b: any) => `@${b.sourceUsername}`).join(' ')

      console.log(`[batch-post] Creating post with ${batch.length} media on ${targetUsername}`)

      try {
        const postRes = await fetch(`${OF_API_BASE}/${accountId}/posts`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${OF_API_KEY}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            text: caption,
            mediaFiles: mediaIds
          })
        })

        if (!postRes.ok) {
          const err = await postRes.text()
          for (const b of batch) {
            allResults.push({ sourceUsername: b.sourceUsername, imageId: b.imageId, vaultId: null, error: `Post failed: ${err}` })
          }
          continue
        }

        const postResponse = await postRes.json()
        const postData = postResponse.data || postResponse
        const postId = postData.id || postData.post_id
        const postMedia = postData.media || []

        console.log(`[batch-post] Post created: ${postId}, ${postMedia.length} media items`)

        for (let j = 0; j < batch.length; j++) {
          const b = batch[j]
          if (j < postMedia.length) {
            const m = postMedia[j]
            const vaultId = m.id?.toString() || m.vault_id?.toString() || m.mediaId?.toString() || m.media_id?.toString() || null
            allResults.push({ sourceUsername: b.sourceUsername, imageId: b.imageId, vaultId })
          } else {
            allResults.push({ sourceUsername: b.sourceUsername, imageId: b.imageId, vaultId: null, error: 'No matching media in response' })
          }
        }

        // Delete the post
        if (postId) {
          await new Promise(r => setTimeout(r, 2000))
          await fetch(`${OF_API_BASE}/${accountId}/posts/${postId}`, {
            method: 'DELETE',
            headers: { 'Authorization': `Bearer ${OF_API_KEY}` }
          })
          console.log(`[batch-post] Deleted post ${postId}`)
        }

        // Delay between posts
        if (i + MAX_MEDIA_PER_POST < items.length) {
          await new Promise(r => setTimeout(r, 2000))
        }
      } catch (e) {
        for (const b of batch) {
          allResults.push({ sourceUsername: b.sourceUsername, imageId: b.imageId, vaultId: null, error: String(e) })
        }
      }
    }

    const successful = allResults.filter(r => r.vaultId)
    return NextResponse.json({
      results: allResults,
      summary: { total: items.length, successful: successful.length, failed: allResults.length - successful.length }
    })
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
