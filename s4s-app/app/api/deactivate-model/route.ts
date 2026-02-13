import { NextResponse } from 'next/server'
import { kv } from '@vercel/kv'

export async function POST(request: Request) {
  try {
    const { username } = await request.json()

    if (!username || typeof username !== 'string') {
      return NextResponse.json({ error: 'Missing username' }, { status: 400 })
    }

    let cleanedV1 = 0
    let cleanedV2 = 0

    // Clean vault_mappings (v1)
    const v1 = (await kv.get<Record<string, Record<string, string>>>('vault_mappings')) || {}
    if (v1[username]) { delete v1[username]; cleanedV1++ }
    for (const promoter of Object.keys(v1)) {
      if (v1[promoter][username]) { delete v1[promoter][username]; cleanedV1++ }
    }
    await kv.set('vault_mappings', v1)

    // Clean vault_mappings_v2
    const v2 = (await kv.get<Record<string, Record<string, any>>>('vault_mappings_v2')) || {}
    if (v2[username]) { delete v2[username]; cleanedV2++ }
    for (const promoter of Object.keys(v2)) {
      if (v2[promoter][username]) { delete v2[promoter][username]; cleanedV2++ }
    }
    await kv.set('vault_mappings_v2', v2)

    // Trigger schedule regeneration
    try {
      await fetch('https://s4s-worker-production.up.railway.app/api/regenerate-schedule', { method: 'POST' })
    } catch (_) {}

    return NextResponse.json({
      success: true,
      username,
      cleaned: { v1: cleanedV1, v2: cleanedV2 },
    })
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 })
  }
}
