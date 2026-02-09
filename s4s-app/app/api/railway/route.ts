import { NextRequest, NextResponse } from 'next/server'

const RAILWAY_URL = 'https://s4s-worker-production.up.railway.app'

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const endpoint = searchParams.get('endpoint') || 'stats'
  
  try {
    const response = await fetch(`${RAILWAY_URL}/${endpoint}`, {
      cache: 'no-store',
      headers: { 'Content-Type': 'application/json' }
    })
    const data = await response.json()
    return NextResponse.json(data)
  } catch (error) {
    console.error('Railway GET error:', error)
    return NextResponse.json({ error: 'Cannot reach Railway backend' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const endpoint = searchParams.get('endpoint') || 'start'
  
  try {
    const response = await fetch(`${RAILWAY_URL}/${endpoint}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      cache: 'no-store'
    })
    const data = await response.json()
    // Normalize response format
    return NextResponse.json({
      success: true,
      ...data
    })
  } catch (error) {
    console.error('Railway POST error:', error)
    return NextResponse.json({ success: false, error: 'Cannot reach Railway backend' }, { status: 500 })
  }
}
