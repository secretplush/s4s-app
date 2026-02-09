import { NextResponse } from 'next/server'

const OF_API_KEY = process.env.OF_API_KEY || 'ofapi_bT4J1Er2YBow46EihDfjlSFf5HRmiM15M4DCOoHn7889d8b4'
const OF_API_BASE = 'https://app.onlyfansapi.com/api'

export async function POST(request: Request) {
  try {
    const body = await request.json()
    const { postId, account } = body
    
    if (!postId || !account) {
      return NextResponse.json({ 
        error: 'Missing required fields',
        required: ['postId', 'account']
      }, { status: 400 })
    }
    
    // Delete the post
    const deleteResponse = await fetch(`${OF_API_BASE}/${account}/posts/${postId}`, {
      method: 'DELETE',
      headers: {
        'Authorization': `Bearer ${OF_API_KEY}`,
        'Content-Type': 'application/json'
      }
    })
    
    if (!deleteResponse.ok) {
      const error = await deleteResponse.text()
      return NextResponse.json({ 
        error: 'Failed to delete post',
        details: error 
      }, { status: 500 })
    }
    
    return NextResponse.json({
      success: true,
      postId,
      message: `Ghost tag deleted successfully`
    })
    
  } catch (error) {
    console.error('Delete post error:', error)
    return NextResponse.json({ 
      error: 'Internal server error',
      details: String(error)
    }, { status: 500 })
  }
}
