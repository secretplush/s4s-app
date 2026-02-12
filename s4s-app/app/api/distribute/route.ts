import { NextRequest, NextResponse } from 'next/server'
import { kv } from '@vercel/kv'

// Increase timeout for long-running distribution
export const maxDuration = 300 // 5 minutes

const OF_API_BASE = 'https://app.onlyfansapi.com/api'
const OF_API_KEY = process.env.OF_API_KEY || 'ofapi_bT4J1Er2YBow46EihDfjlSFf5HRmiM15M4DCOoHn7889d8b4'

// Dynamic account ID lookup - fetches from OF API, caches in memory
let accountIdCache: { [username: string]: string } = {}
let cacheTimestamp = 0
const CACHE_TTL = 5 * 60 * 1000 // 5 minutes

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
    if (!res.ok) {
      console.error(`Failed to fetch accounts: ${res.status}`)
      return accountIdCache // return stale cache on error
    }
    const data = await res.json()
    const rawAccounts: any[] = Array.isArray(data) ? data : data.data || data.accounts || []

    const newCache: { [username: string]: string } = {}
    for (const acct of rawAccounts) {
      const username = acct.onlyfans_username || acct.onlyfans_user_data?.username
      const id = acct.id || acct.prefixed_id
      if (username && id) {
        newCache[username] = id
      }
    }
    accountIdCache = newCache
    cacheTimestamp = now
    console.log(`Refreshed account ID cache: ${Object.keys(newCache).length} accounts`)
    return newCache
  } catch (e) {
    console.error('Failed to refresh account IDs:', e)
    return accountIdCache
  }
}

interface DistributeRequest {
  imageBase64: string  // base64 data URL
  filename: string
  sourceUsername: string  // who the image belongs to
  targetUsernames: string[]  // all other models to distribute to
}

interface VaultResult {
  username: string
  vaultId: string | null
  error?: string
}

// Convert base64 data URL to Buffer
function base64ToBuffer(dataUrl: string): { buffer: Buffer; mimeType: string } {
  const matches = dataUrl.match(/^data:(.+);base64,(.+)$/)
  if (!matches) {
    throw new Error('Invalid base64 data URL')
  }
  return {
    mimeType: matches[1],
    buffer: Buffer.from(matches[2], 'base64')
  }
}

// Upload image and get vault_id via post-then-delete trick
async function uploadToVault(username: string, imageBase64: string, filename: string, sourceUsername: string, accountIds: { [username: string]: string }): Promise<{ vaultId: string | null; error?: string }> {
  const accountId = accountIds[username]
  if (!accountId) {
    return { vaultId: null, error: `No account ID for ${username} (not found in OF API)` }
  }

  try {
    // Convert base64 to buffer for multipart upload
    const { buffer, mimeType } = base64ToBuffer(imageBase64)
    
    // Step 1: Upload the media using multipart/form-data
    const formData = new FormData()
    const blob = new Blob([buffer], { type: mimeType })
    formData.append('file', blob, filename)

    const uploadRes = await fetch(`${OF_API_BASE}/${accountId}/media/upload`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${OF_API_KEY}`
        // Don't set Content-Type - fetch will set it with boundary for FormData
      },
      body: formData
    })

    if (!uploadRes.ok) {
      const err = await uploadRes.text()
      return { vaultId: null, error: `Upload failed: ${err}` }
    }

    const uploadData = await uploadRes.json()
    const mediaId = uploadData.prefixed_id || uploadData.id || uploadData.media_id

    if (!mediaId) {
      return { vaultId: null, error: `No media ID returned from upload: ${JSON.stringify(uploadData)}` }
    }

    // Wait for OF rate limit (10 seconds between upload and post)
    await new Promise(r => setTimeout(r, 11000))

    // Step 2: Create a post with the media (this generates vault_id)
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
      return { vaultId: null, error: `Post creation failed: ${err}` }
    }

    const postResponse = await postRes.json()
    // API wraps response in .data
    const postData = postResponse.data || postResponse
    const postId = postData.id || postData.post_id

    // Extract vault_id from the post's media
    let vaultId: string | null = null
    if (postData.media && postData.media.length > 0) {
      vaultId = postData.media[0].id?.toString() || postData.media[0].vault_id?.toString()
    }

    // Step 3: Delete the post immediately (vault copy remains)
    if (postId) {
      // Small delay before delete to ensure post is registered
      await new Promise(r => setTimeout(r, 2000))
      
      const deleteRes = await fetch(`${OF_API_BASE}/${accountId}/posts/${postId}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${OF_API_KEY}`
        }
      })
      
      if (!deleteRes.ok) {
        console.error(`Failed to delete post ${postId}: ${await deleteRes.text()}`)
      }
    }

    if (!vaultId) {
      return { vaultId: null, error: 'Could not extract vault_id from post' }
    }

    return { vaultId }

  } catch (e) {
    return { vaultId: null, error: `Exception: ${e}` }
  }
}

export async function POST(req: NextRequest) {
  try {
    const body: DistributeRequest = await req.json()
    const { imageBase64, filename, sourceUsername, targetUsernames } = body

    if (!imageBase64 || !targetUsernames || targetUsernames.length === 0) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
    }

    // Fetch account IDs dynamically from OF API
    const accountIds = await getAccountIds()

    // Process all models in parallel (each has its own account, so rate limits are per-account)
    const promises = targetUsernames.map(async (username, index) => {
      // Stagger starts by 1 second to avoid overwhelming the API
      await new Promise(r => setTimeout(r, index * 1000))
      
      console.log(`Distributing to ${username}...`)
      const { vaultId, error } = await uploadToVault(username, imageBase64, filename, sourceUsername, accountIds)
      
      return {
        username,
        vaultId,
        error
      } as VaultResult
    })

    const results = await Promise.all(promises)

    const successful = results.filter(r => r.vaultId !== null)
    const failed = results.filter(r => r.vaultId === null)

    // Save successful vault mappings to KV
    if (successful.length > 0) {
      try {
        const mappings = (await kv.get('vault_mappings') as Record<string, Record<string, string>>) || {}
        if (!mappings[sourceUsername]) {
          mappings[sourceUsername] = {}
        }
        for (const result of successful) {
          mappings[sourceUsername][result.username] = result.vaultId!
        }
        await kv.set('vault_mappings', mappings)
        console.log(`Saved ${successful.length} vault mappings for ${sourceUsername} to KV`)
      } catch (kvError) {
        console.error('Failed to save vault mappings to KV:', kvError)
      }
    }

    return NextResponse.json({
      success: true,
      sourceUsername,
      distributed: successful.length,
      failed: failed.length,
      results
    })

  } catch (e) {
    console.error('Distribution error:', e)
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
