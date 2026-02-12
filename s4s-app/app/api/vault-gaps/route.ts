import { NextRequest, NextResponse } from 'next/server'
import { kv } from '@vercel/kv'

export const dynamic = 'force-dynamic'
export const revalidate = 0

const OF_API_BASE = 'https://app.onlyfansapi.com/api'
const OF_API_KEY = process.env.OF_API_KEY || 'ofapi_bT4J1Er2YBow46EihDfjlSFf5HRmiM15M4DCOoHn7889d8b4'

// Dynamic account ID lookup - fetches from OF API
let accountIdCache: { [username: string]: string } = {}
let cacheTimestamp = 0
const CACHE_TTL = 5 * 60 * 1000 // 5 minutes

async function getAccountIds(): Promise<{ [username: string]: string }> {
  const now = Date.now()
  if (Object.keys(accountIdCache).length > 0 && now - cacheTimestamp < CACHE_TTL) {
    return accountIdCache
  }

  try {
    const res = await fetch(`${OF_API_BASE}/accounts`, {
      headers: { 'Authorization': `Bearer ${OF_API_KEY}` },
      cache: 'no-store',
    })
    if (!res.ok) {
      console.error(`Failed to fetch accounts: ${res.status}`)
      return accountIdCache
    }
    const data = await res.json()
    const rawAccounts: any[] = Array.isArray(data) ? data : data.data || data.accounts || []

    const newCache: { [username: string]: string } = {}
    for (const acct of rawAccounts) {
      const username = acct.onlyfans_username || acct.onlyfans_user_data?.username
      const id = acct.id || acct.prefixed_id
      if (username && id) {
        newCache[username] = id
      }
    }
    accountIdCache = newCache
    cacheTimestamp = now
    console.log(`Refreshed account ID cache: ${Object.keys(newCache).length} accounts`)
    return newCache
  } catch (e) {
    console.error('Failed to refresh account IDs:', e)
    return accountIdCache
  }
}

// KV schema: vault_mappings = { [sourceUsername]: { [targetUsername]: vaultId } }

export async function GET(request: NextRequest) {
  try {
    const mappings = (await kv.get('vault_mappings') as Record<string, Record<string, string>>) || {}
    const accountIds = await getAccountIds()
    const allModels = Object.keys(accountIds)

    // If raw=1, return mappings directly for client-side cross-referencing
    const { searchParams } = new URL(request.url)
    if (searchParams.get('raw') === '1') {
      return NextResponse.json({ success: true, mappings, totalModels: allModels.length })
    }

    const gaps: { targetUsername: string; missingFrom: string[] }[] = []
    let totalGaps = 0
    let modelsWithGaps = 0

    for (const target of allModels) {
      const missing: string[] = []
      for (const source of allModels) {
        if (source === target) continue
        if (!mappings[source]?.[target]) {
          missing.push(source)
        }
      }
      if (missing.length > 0) {
        gaps.push({ targetUsername: target, missingFrom: missing })
        totalGaps += missing.length
        modelsWithGaps++
      }
    }

    return NextResponse.json({
      success: true,
      totalGaps,
      modelsWithGaps,
      totalModels: allModels.length,
      gaps
    })
  } catch (error) {
    console.error('Vault gaps error:', error)
    return NextResponse.json({ error: String(error) }, { status: 500 })
  }
}
