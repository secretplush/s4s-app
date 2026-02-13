import { NextResponse } from 'next/server'
import { kv } from '@vercel/kv'

export async function GET() {
  try {
    const mappings = await kv.get('vault_mappings_v2') || {}
    const lastSync = await kv.get('last_sync_v2') || null

    return NextResponse.json({ success: true, mappings, lastSync })
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 })
  }
}

export async function POST(request: Request) {
  try {
    const { mappings_v2, models } = await request.json()

    if (!mappings_v2 || !models) {
      return NextResponse.json({ error: 'Missing mappings_v2 or models' }, { status: 400 })
    }

    await kv.set('vault_mappings_v2', mappings_v2)
    await kv.set('last_sync_v2', new Date().toISOString())

    // Also build and write v1 vault_mappings for backward compat
    // v1 format: { promoter: { target: vaultId } } (picks first available from any use)
    const v1: Record<string, Record<string, string>> = {}
    for (const promoter of Object.keys(mappings_v2)) {
      v1[promoter] = {}
      for (const target of Object.keys(mappings_v2[promoter])) {
        const uses = mappings_v2[promoter][target]
        const firstVault = uses.ghost?.[0] || uses.pinned?.[0] || uses.massDm?.[0]
        if (firstVault) v1[promoter][target] = firstVault
      }
    }
    await kv.set('vault_mappings', v1)

    // Trigger worker schedule regeneration
    try {
      await fetch('https://s4s-worker-production.up.railway.app/api/regenerate-schedule', { method: 'POST' })
    } catch (_) {} // best effort

    // Count stats
    let totalEntries = 0
    for (const promoter of Object.keys(mappings_v2)) {
      for (const target of Object.keys(mappings_v2[promoter])) {
        const uses = mappings_v2[promoter][target]
        totalEntries += (uses.ghost?.length || 0) + (uses.pinned?.length || 0) + (uses.massDm?.length || 0)
      }
    }

    return NextResponse.json({
      success: true,
      modelCount: models.length,
      totalEntries,
      syncedAt: new Date().toISOString(),
    })
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 })
  }
}
