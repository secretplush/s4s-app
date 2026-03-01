import { NextRequest, NextResponse } from 'next/server'
import { kv } from '@vercel/kv'

export async function POST(req: NextRequest) {
  try {
    const { oldName, newName } = await req.json()
    if (!oldName || !newName) {
      return NextResponse.json({ error: 'oldName and newName required' }, { status: 400 })
    }

    const changes: string[] = []

    // Migrate vault_mappings (v1)
    const v1 = (await kv.get('vault_mappings') as Record<string, Record<string, string>>) || {}
    if (v1[oldName]) {
      v1[newName] = { ...(v1[newName] || {}), ...v1[oldName] }
      delete v1[oldName]
      changes.push(`v1: renamed top-level ${oldName} → ${newName}`)
    }
    for (const [promoter, targets] of Object.entries(v1)) {
      if (targets && targets[oldName]) {
        targets[newName] = targets[oldName]
        delete targets[oldName]
        changes.push(`v1: renamed target ref in ${promoter}`)
      }
    }
    if (changes.length > 0) await kv.set('vault_mappings', v1)

    // Migrate vault_mappings_v2
    const v2 = (await kv.get('vault_mappings_v2') as Record<string, any>) || {}
    const v2Before = changes.length
    if (v2[oldName]) {
      v2[newName] = { ...(v2[newName] || {}), ...v2[oldName] }
      delete v2[oldName]
      changes.push(`v2: renamed top-level ${oldName} → ${newName}`)
    }
    for (const [promoter, targets] of Object.entries(v2)) {
      if (targets && targets[oldName]) {
        targets[newName] = targets[oldName]
        delete targets[oldName]
        changes.push(`v2: renamed target ref in ${promoter}`)
      }
    }
    if (changes.length > v2Before) await kv.set('vault_mappings_v2', v2)

    return NextResponse.json({ success: true, changes })
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
