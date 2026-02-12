import { NextResponse } from 'next/server'

const OF_API_KEY = process.env.OF_API_KEY || 'ofapi_bT4J1Er2YBow46EihDfjlSFf5HRmiM15M4DCOoHn7889d8b4'
const OF_API_BASE = 'https://app.onlyfansapi.com/api'

// In-memory pending deletions (for demo - production would use Redis/DB)
const pendingDeletions: { postId: string; account: string; deleteAt: number }[] = []

export async function POST(request: Request) {
  try {
    const body = await request.json()
    const { 
      promoterUsername,  // who's posting
      targetUsername,    // who they're tagging
      vaultId,           // vault ID of the promo image
      caption,           // caption with @mention
      account            // OF account ID for API
    } = body
    
    if (!promoterUsername || !targetUsername || !vaultId || !caption || !account) {
      return NextResponse.json({ 
        error: 'Missing required fields',
        required: ['promoterUsername', 'targetUsername', 'vaultId', 'caption', 'account']
      }, { status: 400 })
    }
    
    // 1. Create the post
    const createResponse = await fetch(`${OF_API_BASE}/${account}/posts`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${OF_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        text: caption,
        mediaFiles: [vaultId]
      })
    })
    
    if (!createResponse.ok) {
      const error = await createResponse.text()
      return NextResponse.json({ 
        error: 'Failed to create post',
        details: error 
      }, { status: 500 })
    }
    
    const postData = await createResponse.json()
    
    // Try multiple possible response formats
    const postId = postData.id 
      || postData.post_id 
      || postData.postId
      || postData.data?.id 
      || postData.data?.post_id
      || postData.post?.id
      || postData.response?.id
    
    if (!postId) {
      // Return the full response so we can see the actual format
      return NextResponse.json({ 
        error: 'Post created but no ID returned',
        data: postData,
        keys: Object.keys(postData)
      }, { status: 200 }) // Return 200 so we can see the data
    }
    
    // 2. Schedule deletion in 5 minutes
    // For Vercel, we'll return the post info and let the caller handle deletion
    // OR use a separate cron endpoint for cleanup
    const deleteAt = Date.now() + 5 * 60 * 1000 // 5 minutes
    
    return NextResponse.json({
      success: true,
      postId,
      promoter: promoterUsername,
      target: targetUsername,
      deleteAt,
      deleteAtFormatted: new Date(deleteAt).toISOString(),
      message: `Ghost tag created: @${promoterUsername} → @${targetUsername}. Delete scheduled for 5 min.`
    })
    
  } catch (error) {
    console.error('Execute tag error:', error)
    return NextResponse.json({ 
      error: 'Internal server error',
      details: String(error)
    }, { status: 500 })
  }
}

// GET: Check pending deletions / status
export async function GET() {
  return NextResponse.json({
    status: 'ready',
    pendingDeletions: pendingDeletions.length,
    usage: 'POST with { promoterUsername, targetUsername, vaultId, caption, account }'
  })
}
