import { NextRequest, NextResponse } from 'next/server'

export const maxDuration = 300 // 5 minutes
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

function base64ToBuffer(dataUrl: string): { buffer: Buffer; mimeType: string } {
  const matches = dataUrl.match(/^data:(.+);base64,(.+)$/)
  if (!matches) throw new Error('Invalid base64 data URL')
  return { mimeType: matches[1], buffer: Buffer.from(matches[2], 'base64') }
}

const MAX_MEDIA_PER_POST = 20 // conservative start, can bump to 30

// Batch distribute: upload many images to ONE account, create posts with up to 20 media each
// Request: { targetUsername, images: [{ sourceUsername, imageId, base64 }] }
// Response: { results: [{ sourceUsername, imageId, vaultId, error? }] }
export async function POST(req: NextRequest) {
  try {
    const { targetUsername, images } = await req.json()

    if (!targetUsername || !images || !images.length) {
      return NextResponse.json({ error: 'Missing targetUsername or images' }, { status: 400 })
    }

    const accountIds = await getAccountIds()
    const accountId = accountIds[targetUsername]
    if (!accountId) {
      return NextResponse.json({ error: `No account ID for ${targetUsername}` }, { status: 404 })
    }

    console.log(`[batch] Uploading ${images.length} images to ${targetUsername} (${accountId})`)

    // Step 1: Upload ALL images in parallel to OF CDN
    const uploadResults = await Promise.all(
      images.map(async (img: { sourceUsername: string; imageId: string; base64: string }, idx: number) => {
        try {
          const { buffer, mimeType } = base64ToBuffer(img.base64)
          const formData = new FormData()
          const blob = new Blob([buffer], { type: mimeType })
          formData.append('file', blob, `${img.sourceUsername}_promo.jpg`)

          const uploadRes = await fetch(`${OF_API_BASE}/${accountId}/media/upload`, {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${OF_API_KEY}` },
            body: formData
          })

          if (!uploadRes.ok) {
            const err = await uploadRes.text()
            return { ...img, mediaId: null, error: `Upload failed: ${err}` }
          }

          const uploadData = await uploadRes.json()
          const mediaId = uploadData.prefixed_id || uploadData.id || uploadData.media_id
          if (!mediaId) {
            return { ...img, mediaId: null, error: 'No media ID returned' }
          }

          console.log(`[batch] Uploaded ${idx + 1}/${images.length}: ${img.sourceUsername} → mediaId ${mediaId}`)
          return { ...img, mediaId, error: null }
        } catch (e) {
          return { ...img, mediaId: null, error: String(e) }
        }
      })
    )

    const successfulUploads = uploadResults.filter(r => r.mediaId)
    const failedUploads = uploadResults.filter(r => !r.mediaId)
    console.log(`[batch] Uploads done: ${successfulUploads.length} success, ${failedUploads.length} failed`)

    if (successfulUploads.length === 0) {
      return NextResponse.json({
        results: uploadResults.map(r => ({
          sourceUsername: r.sourceUsername,
          imageId: r.imageId,
          vaultId: null,
          error: r.error || 'Upload failed'
        }))
      })
    }

    // Step 2: Wait for OF to process uploads
    await new Promise(r => setTimeout(r, 3000))

    // Step 3: Create posts in batches of MAX_MEDIA_PER_POST
    const allResults: { sourceUsername: string; imageId: string; vaultId: string | null; error?: string }[] = []

    // Add failed uploads to results
    for (const f of failedUploads) {
      allResults.push({ sourceUsername: f.sourceUsername, imageId: f.imageId, vaultId: null, error: f.error || 'Upload failed' })
    }

    for (let i = 0; i < successfulUploads.length; i += MAX_MEDIA_PER_POST) {
      const batch = successfulUploads.slice(i, i + MAX_MEDIA_PER_POST)
      const mediaIds = batch.map(b => b.mediaId)
      const caption = batch.map(b => `@${b.sourceUsername}`).join(' ')

      console.log(`[batch] Creating post with ${batch.length} media (batch ${Math.floor(i / MAX_MEDIA_PER_POST) + 1})`)

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
          console.error(`[batch] Post creation failed:`, err)
          for (const b of batch) {
            allResults.push({ sourceUsername: b.sourceUsername, imageId: b.imageId, vaultId: null, error: `Post failed: ${err}` })
          }
          continue
        }

        const postResponse = await postRes.json()
        const postData = postResponse.data || postResponse
        const postId = postData.id || postData.post_id

        // Extract vault IDs from post media — media array should match order of mediaFiles
        const postMedia = postData.media || []
        console.log(`[batch] Post created with ${postMedia.length} media items`)

        for (let j = 0; j < batch.length; j++) {
          const b = batch[j]
          if (j < postMedia.length) {
            const m = postMedia[j]
            const vaultId = m.id?.toString() || m.vault_id?.toString() || m.mediaId?.toString() || m.media_id?.toString() || null
            allResults.push({ sourceUsername: b.sourceUsername, imageId: b.imageId, vaultId })
            if (vaultId) {
              console.log(`[batch] ${b.sourceUsername} → vaultId ${vaultId}`)
            }
          } else {
            allResults.push({ sourceUsername: b.sourceUsername, imageId: b.imageId, vaultId: null, error: 'No matching media in post response' })
          }
        }

        // Delete the post (vault copies remain)
        if (postId) {
          await new Promise(r => setTimeout(r, 2000))
          await fetch(`${OF_API_BASE}/${accountId}/posts/${postId}`, {
            method: 'DELETE',
            headers: { 'Authorization': `Bearer ${OF_API_KEY}` }
          })
          console.log(`[batch] Deleted post ${postId}`)
        }
      } catch (e) {
        console.error(`[batch] Post error:`, e)
        for (const b of batch) {
          allResults.push({ sourceUsername: b.sourceUsername, imageId: b.imageId, vaultId: null, error: String(e) })
        }
      }

      // Small delay between posts if multiple batches
      if (i + MAX_MEDIA_PER_POST < successfulUploads.length) {
        await new Promise(r => setTimeout(r, 3000))
      }
    }

    const successful = allResults.filter(r => r.vaultId)
    console.log(`[batch] Done: ${successful.length}/${allResults.length} got vault IDs`)

    return NextResponse.json({
      results: allResults,
      summary: {
        total: images.length,
        successful: successful.length,
        failed: allResults.length - successful.length
      }
    })
  } catch (e) {
    console.error('[batch] Error:', e)
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
