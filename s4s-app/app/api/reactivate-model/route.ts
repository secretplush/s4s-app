import { NextResponse } from 'next/server'
import { kv } from '@vercel/kv'

export async function POST(request: Request) {
  try {
    const { username, vaultMappingsV1, vaultMappingsV2 } = await request.json()

    if (!username || typeof username !== 'string') {
      return NextResponse.json({ error: 'Missing username' }, { status: 400 })
    }

    // Restore vault_mappings (v1)
    // vaultMappingsV1: { asPromoter: { target: vaultId }, asTarget: { promoter: vaultId } }
    const v1 = (await kv.get<Record<string, Record<string, string>>>('vault_mappings')) || {}
    
    if (vaultMappingsV1?.asPromoter) {
      v1[username] = { ...(v1[username] || {}), ...vaultMappingsV1.asPromoter }
    }
    if (vaultMappingsV1?.asTarget) {
      for (const [promoter, vaultId] of Object.entries(vaultMappingsV1.asTarget)) {
        if (!v1[promoter]) v1[promoter] = {}
        v1[promoter][username] = vaultId as string
      }
    }
    await kv.set('vault_mappings', v1)

    // Restore vault_mappings_v2
    // vaultMappingsV2: { asPromoter: { target: { ghost: [], pinned: [], massDm: [] } }, asTarget: { promoter: { ghost: [], pinned: [], massDm: [] } } }
    const v2 = (await kv.get<Record<string, Record<string, any>>>('vault_mappings_v2')) || {}
    
    if (vaultMappingsV2?.asPromoter) {
      v2[username] = { ...(v2[username] || {}), ...vaultMappingsV2.asPromoter }
    }
    if (vaultMappingsV2?.asTarget) {
      for (const [promoter, useMap] of Object.entries(vaultMappingsV2.asTarget)) {
        if (!v2[promoter]) v2[promoter] = {}
        v2[promoter][username] = useMap
      }
    }
    await kv.set('vault_mappings_v2', v2)

    // Trigger schedule regeneration
    try {
      await fetch('https://s4s-worker-production.up.railway.app/api/regenerate-schedule', { method: 'POST' })
    } catch (_) {}

    return NextResponse.json({ success: true, username })
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 })
  }
}
