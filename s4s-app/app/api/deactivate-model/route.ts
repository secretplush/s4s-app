import { NextResponse } from 'next/server'
import { kv } from '@vercel/kv'

export async function POST(request: Request) {
  try {
    const { username } = await request.json()

    if (!username || typeof username !== 'string') {
      return NextResponse.json({ error: 'Missing username' }, { status: 400 })
    }

    // Add to deactivated set (vault mappings are PRESERVED)
    const deactivated = (await kv.get<string[]>('deactivated_models')) || []
    if (!deactivated.includes(username)) {
      deactivated.push(username)
      await kv.set('deactivated_models', deactivated)
    }

    // Trigger schedule regeneration (worker will exclude deactivated models)
    try {
      await fetch('https://s4s-worker-production.up.railway.app/api/regenerate-schedule', { method: 'POST' })
    } catch (_) {}

    return NextResponse.json({
      success: true,
      username,
      message: 'Model deactivated (vault data preserved)',
    })
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 })
  }
}
