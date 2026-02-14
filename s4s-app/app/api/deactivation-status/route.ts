import { NextRequest, NextResponse } from 'next/server'
import { kv } from '@vercel/kv'

export async function GET(request: NextRequest) {
  const username = request.nextUrl.searchParams.get('username')
  if (!username) {
    return NextResponse.json({ error: 'Missing username' }, { status: 400 })
  }
  const deactivated = (await kv.get<string[]>('deactivated_models')) || []
  return NextResponse.json({ deactivated: deactivated.includes(username) })
}
