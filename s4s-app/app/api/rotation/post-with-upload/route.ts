import { NextResponse } from 'next/server'

const OF_API_KEY = process.env.OF_API_KEY || 'ofapi_bT4J1Er2YBow46EihDfjlSFf5HRmiM15M4DCOoHn7889d8b4'
const OF_API_BASE = 'https://app.onlyfansapi.com/api'

function base64ToBuffer(base64String: string): { buffer: Buffer; mimeType: string } {
  const matches = base64String.match(/^data:(.+);base64,(.+)$/)
  if (matches) {
    return {
      buffer: Buffer.from(matches[2], 'base64'),
      mimeType: matches[1]
    }
  }
  return {
    buffer: Buffer.from(base64String, 'base64'),
    mimeType: 'image/jpeg'
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json()
    const { 
      account,           // promoter's account ID
      imageBase64,       // base64 of the image
      filename,          // filename
      caption            // caption with @mention
    } = body
    
    if (!account || !imageBase64 || !caption) {
      return NextResponse.json({ 
        error: 'Missing required fields',
        required: ['account', 'imageBase64', 'caption']
      }, { status: 400 })
    }
    
    // Step 1: Upload the image to promoter's account
    const { buffer, mimeType } = base64ToBuffer(imageBase64)
    
    const formData = new FormData()
    const blob = new Blob([buffer], { type: mimeType })
    formData.append('file', blob, filename || 'promo.jpg')

    const uploadRes = await fetch(`${OF_API_BASE}/${account}/media/upload`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${OF_API_KEY}`
      },
      body: formData
    })

    if (!uploadRes.ok) {
      const err = await uploadRes.text()
      return NextResponse.json({ 
        error: 'Upload failed',
        details: err 
      }, { status: 500 })
    }

    const uploadData = await uploadRes.json()
    const mediaId = uploadData.prefixed_id || uploadData.id

    if (!mediaId) {
      return NextResponse.json({ 
        error: 'No media ID returned',
        data: uploadData
      }, { status: 500 })
    }
    
    // Step 2: Wait for OF rate limit
    await new Promise(r => setTimeout(r, 11000))
    
    // Step 3: Create the post
    const postRes = await fetch(`${OF_API_BASE}/${account}/posts`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${OF_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        text: caption,
        mediaFiles: [mediaId]
      })
    })

    if (!postRes.ok) {
      const err = await postRes.text()
      return NextResponse.json({ 
        error: 'Post creation failed',
        details: err 
      }, { status: 500 })
    }

    const postData = await postRes.json()
    const postId = postData.id || postData.post_id

    // Also grab the vault_id for future use
    const vaultId = postData.media?.[0]?.vault_id || postData.vault_id
    
    return NextResponse.json({
      success: true,
      postId,
      mediaId,
      vaultId,
      message: `Ghost tag created! Post ID: ${postId}`
    })
    
  } catch (error) {
    console.error('Post with upload error:', error)
    return NextResponse.json({ 
      error: 'Internal server error',
      details: String(error)
    }, { status: 500 })
  }
}
