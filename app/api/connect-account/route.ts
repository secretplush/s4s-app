import { NextRequest, NextResponse } from 'next/server'

const API_KEY = process.env.ONLYFANS_API_KEY || 'ofapi_bT4J1Er2YBow46EihDfjlSFf5HRmiM15M4DCOoHn7889d8b4'
const API_BASE = 'https://app.onlyfansapi.com/api'

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { email, password, force_connect } = body

    if (!email || !password) {
      return NextResponse.json({ error: 'Email and password required' }, { status: 400 })
    }

    // Call OnlyFans API authenticate endpoint
    const response = await fetch(`${API_BASE}/authenticate`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        email,
        password,
        force_connect: force_connect || false,
      }),
    })

    const data = await response.json()

    if (!response.ok) {
      return NextResponse.json({ 
        error: data.message || data.error || 'Failed to connect account',
        details: data,
        status: 'error'
      }, { status: response.status })
    }

    // Check authentication status
    // The API may return different statuses:
    // - success with account_id
    // - needs_2fa (requires verification code)
    // - error
    
    return NextResponse.json({
      status: 'success',
      data: data,
      // Extract account ID if available
      accountId: data.id || data.account_id || null,
      username: data.onlyfans_username || null,
      displayName: data.display_name || null,
      needs2fa: data.needs_2fa || data.authentication_progress === '2fa_required',
    })

  } catch (error: any) {
    console.error('Connect account error:', error)
    return NextResponse.json({ 
      error: error.message || 'Internal server error',
      status: 'error'
    }, { status: 500 })
  }
}
