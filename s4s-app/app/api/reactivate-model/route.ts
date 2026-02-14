import { NextResponse } from 'next/server'
import { kv } from '@vercel/kv'

export async function POST(request: Request) {
  try {
    const { username } = await request.json()

    if (!username || typeof username !== 'string') {
      return NextResponse.json({ error: 'Missing username' }, { status: 400 })
    }

    // Remove from deactivated set
    const deactivated = (await kv.get<string[]>('deactivated_models')) || []
    const updated = deactivated.filter(u => u !== username)
    await kv.set('deactivated_models', updated)

    // Trigger schedule regeneration
    try {
      await fetch('https://s4s-worker-production.up.railway.app/api/regenerate-schedule', { method: 'POST' })
    } catch (_) {}

    return NextResponse.json({ success: true, username })
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 })
  }
}
