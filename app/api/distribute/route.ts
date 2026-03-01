import { NextRequest, NextResponse } from 'next/server'
import { kv } from '@vercel/kv'

// Increase timeout for long-running distribution
export const maxDuration = 300 // 5 minutes

const OF_API_BASE = 'https://app.onlyfansapi.com/api'
const OF_API_KEY = process.env.OF_API_KEY || 'ofapi_bT4J1Er2YBow46EihDfjlSFf5HRmiM15M4DCOoHn7889d8b4'

// Dynamic account ID cache — fetches from OF API, refreshes every 10 min
let _accountIdsCache: { [username: string]: string } = {}
let _accountIdsCacheTs = 0
const ACCOUNT_IDS_CACHE_TTL = 10 * 60 * 1000

async function getAccountIds(): Promise<{ [username: string]: string }> {
  if (Date.now() - _accountIdsCacheTs < ACCOUNT_IDS_CACHE_TTL && Object.keys(_accountIdsCache).length > 0) {
    return _accountIdsCache
  }
  try {
    const res = await fetch(`${OF_API_BASE}/accounts`, {
      headers: { 'Authorization': `Bearer ${OF_API_KEY}` }
    })
    const accounts = await res.json()
    const rawAccounts = Array.isArray(accounts) ? accounts : accounts.data || accounts.accounts || []
    const map: { [username: string]: string } = {}
    for (const acct of rawAccounts) {
      const username = acct.onlyfans_username || ''
      const id = acct.id || ''
      if (username && id) {
        map[username] = id
      }
    }
    _accountIdsCache = map
    _accountIdsCacheTs = Date.now()
    console.log(`Refreshed account IDs cache: ${Object.keys(map).length} accounts`)
    return map
  } catch (e) {
    console.error('Failed to fetch accounts:', e)
    return _accountIdsCache // return stale cache on error
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
async function uploadToVault(username: string, imageBase64: string, filename: string, sourceUsername: string, accountIds: { [k: string]: string }): Promise<{ vaultId: string | null; error?: string }> {
  const accountId = accountIds[username]
  if (!accountId) {
    return { vaultId: null, error: `No account ID for ${username}` }
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
