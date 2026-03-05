import { NextRequest, NextResponse } from 'next/server'
import { kv } from '@vercel/kv'

const OF_API_BASE = 'https://app.onlyfansapi.com/api'
const OF_API_KEY = process.env.OF_API_KEY || 'ofapi_bT4J1Er2YBow46EihDfjlSFf5HRmiM15M4DCOoHn7889d8b4'

// Models that only promote others (don't receive promo images)
const PROMOTER_ONLY: string[] = ['taylorskully']

async function getConnectedAccounts(): Promise<string[]> {
  const res = await fetch(`${OF_API_BASE}/accounts?limit=200`, {
    headers: { 'Authorization': `Bearer ${OF_API_KEY}` },
    cache: 'no-store',
  })
  if (!res.ok) throw new Error(`Failed to fetch accounts: ${res.status}`)
  const data = await res.json()
  const raw: any[] = Array.isArray(data) ? data : data.data || data.accounts || []
  return raw
    .map((a: any) => a.onlyfans_username || a.onlyfans_user_data?.username)
    .filter(Boolean)
}

export async function GET(req: NextRequest) {
  try {
    const filterUsername = req.nextUrl.searchParams.get('username')
    // direction=reverse: check how many OTHER models have this username's photo in their vault
    // (used by Step 3 "Distribute → All" which puts new model's photo into all other vaults)
    const direction = req.nextUrl.searchParams.get('direction') || 'forward'
    const connectedAccounts = await getConnectedAccounts()
    const mappings = (await kv.get('vault_mappings') as Record<string, Record<string, string>>) || {}

    const eligible = connectedAccounts.filter(u => !PROMOTER_ONLY.includes(u))

    const healthy: any[] = []
    const unhealthy: any[] = []

    const usernames = filterUsername ? [filterUsername] : eligible

    for (const username of usernames) {
      const expectedTargets = eligible.filter(u => u !== username)
      const expected = expectedTargets.length
      let targets: number
      let missing: string[]

      if (direction === 'reverse') {
        // Reverse: check how many promoters have this username as a target in their vault
        const promotersWithPhoto = expectedTargets.filter(promoter => mappings[promoter]?.[username])
        targets = promotersWithPhoto.length
        missing = expectedTargets.filter(promoter => !mappings[promoter]?.[username])
      } else {
        // Forward (default): check what's in this username's vault
        const currentMappings = mappings[username] || {}
        const actualTargets = Object.keys(currentMappings).filter(t => expectedTargets.includes(t))
        targets = actualTargets.length
        missing = expectedTargets.filter(t => !currentMappings[t])
      }
      const ratio = expected > 0 ? targets / expected : 1

      const entry = {
        username,
        targets,
        expected,
        missing,
        completeness: `${targets}/${expected}`,
      }

      if (ratio >= 0.9) {
        healthy.push(entry)
      } else {
        unhealthy.push(entry)
      }
    }

    return NextResponse.json({
      healthy,
      unhealthy,
      summary: {
        total: healthy.length + unhealthy.length,
        healthy: healthy.length,
        unhealthy: unhealthy.length,
      }
    })
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
