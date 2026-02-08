import { NextRequest, NextResponse } from 'next/server'

// Increase timeout for long-running distribution
export const maxDuration = 300 // 5 minutes

const OF_API_BASE = 'https://app.onlyfansapi.com/api'
const OF_API_KEY = process.env.OF_API_KEY || 'ofapi_bT4J1Er2YBow46EihDfjlSFf5HRmiM15M4DCOoHn7889d8b4'

// Map usernames to OFAPI account IDs
const ACCOUNT_IDS: { [username: string]: string } = {
  'milliexhart': 'acct_ebca85077e0a4b7da04cf14176466411',
  'zoepriceee': 'acct_f05bf7874c974a5d875a1ef01c5bbc3b',
  'novaleighh': 'acct_9ee32f0bac4e4e8394a09f2c9fa2fbb7',
  'lucymonroee': 'acct_0653d6e6c3984bea8d3adc84cc616c7c',
  'chloecookk': 'acct_6bb6d77ac2c741ecb54d865237bb04f4',
  'jackiesmithh': 'acct_bd6a75d6943141589cf5e43586653258',
  'brookeewest': 'acct_749c75e13d7e4685813f2a2867ce614d',
  'ayaaann': 'acct_b0b0698a614643c5932cfccd23f7c430',
  'chloeecavalli': 'acct_b5e739f9f40a4da99b2f5ca559168012',
  'sadieeblake': 'acct_cfb853d0ba714aeaa9a89e3026ec6190',
  'lolasinclairr': 'acct_bde8d615937548f18c4e54b7cedf8c1d',
  'maddieharperr': 'acct_a50799a789a6422c8389d7d055fcbd1a',
  'zoeemonroe': 'acct_fbd172e2681f4dfbb6026ce806ecaa28',
  'biancaawoods': 'acct_54e3119e77da4429b6537f7dd2883a05',
  'aviannaarose': 'acct_2648cedf59644b0993ade9608bd868a1'
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
async function uploadToVault(username: string, imageBase64: string, filename: string, sourceUsername: string): Promise<{ vaultId: string | null; error?: string }> {
  const accountId = ACCOUNT_IDS[username]
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

    // Process all models in parallel (each has its own account, so rate limits are per-account)
    const promises = targetUsernames.map(async (username, index) => {
      // Stagger starts by 1 second to avoid overwhelming the API
      await new Promise(r => setTimeout(r, index * 1000))
      
      console.log(`Distributing to ${username}...`)
      const { vaultId, error } = await uploadToVault(username, imageBase64, filename, sourceUsername)
      
      return {
        username,
        vaultId,
        error
      } as VaultResult
    })

    const results = await Promise.all(promises)

    const successful = results.filter(r => r.vaultId !== null)
    const failed = results.filter(r => r.vaultId === null)

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
