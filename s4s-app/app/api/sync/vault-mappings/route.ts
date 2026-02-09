import { NextResponse } from 'next/server'
import { kv } from '@vercel/kv'

// Vault mapping structure:
// { promoterUsername: { targetUsername: vaultId } }
// e.g., { "milliexhart": { "zoepriceee": "4290919675" } }

export async function GET() {
  try {
    const mappings = await kv.get('vault_mappings') || {}
    const models = await kv.get('models') || []
    const lastSync = await kv.get('last_sync') || null
    
    return NextResponse.json({
      success: true,
      mappings,
      models,
      lastSync,
      modelCount: (models as any[]).length,
      mappingCount: Object.keys(mappings as object).length
    })
  } catch (error) {
    console.error('Get vault mappings error:', error)
    return NextResponse.json({ 
      error: 'Failed to get vault mappings',
      details: String(error)
    }, { status: 500 })
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json()
    const { mappings, models } = body
    
    if (!mappings || !models) {
      return NextResponse.json({ 
        error: 'Missing required fields',
        required: ['mappings', 'models']
      }, { status: 400 })
    }
    
    // Save to Vercel KV
    await kv.set('vault_mappings', mappings)
    await kv.set('models', models)
    await kv.set('last_sync', new Date().toISOString())
    
    // Count stats
    let totalVaultIds = 0
    for (const promoter of Object.keys(mappings)) {
      totalVaultIds += Object.keys(mappings[promoter] || {}).length
    }
    
    return NextResponse.json({
      success: true,
      modelCount: models.length,
      mappingCount: Object.keys(mappings).length,
      totalVaultIds,
      syncedAt: new Date().toISOString(),
      message: `Synced ${models.length} models with ${totalVaultIds} vault mappings`
    })
    
  } catch (error) {
    console.error('Sync vault mappings error:', error)
    return NextResponse.json({ 
      error: 'Failed to sync vault mappings',
      details: String(error)
    }, { status: 500 })
  }
}
