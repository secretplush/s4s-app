import { NextResponse } from 'next/server'

const OF_API_BASE = 'https://app.onlyfansapi.com/api'
const OF_API_KEY = process.env.OF_API_KEY || 'ofapi_bT4J1Er2YBow46EihDfjlSFf5HRmiM15M4DCOoHn7889d8b4'
const KV_URL = process.env.KV_REST_API_URL!
const KV_TOKEN = process.env.KV_REST_API_TOKEN!

async function kvGet(key: string) {
  const res = await fetch(`${KV_URL}/get/${key}`, { headers: { Authorization: `Bearer ${KV_TOKEN}` }, cache: 'no-store' })
  const data = await res.json()
  return data.result ? JSON.parse(data.result) : null
}

async function kvSet(key: string, value: any, ttl?: number) {
  const body = ttl 
    ? ['SET', key, JSON.stringify(value), 'EX', String(ttl)]
    : ['SET', key, JSON.stringify(value)]
  await fetch(`${KV_URL}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${KV_TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

async function fetchEarnings(accountId: string): Promise<number> {
  try {
    const res = await fetch(
      `${OF_API_BASE}/${accountId}/statistics/statements/earnings?start_date=2022-01-01&end_date=${new Date().toISOString().slice(0, 10)}&type=total`,
      { headers: { Authorization: `Bearer ${OF_API_KEY}` }, cache: 'no-store' }
    )
    if (!res.ok) return -1
    const data = await res.json()
    const chart = data?.data?.total?.chartCount || []
    return chart.reduce((sum: number, c: any) => sum + (c.count || 0), 0)
  } catch {
    return -1
  }
}

export async function GET() {
  // Return cached earnings if fresh (< 1 hour)
  const cached = await kvGet('s4s:model-earnings')
  if (cached && cached.updatedAt && Date.now() - cached.updatedAt < 60 * 60 * 1000) {
    return NextResponse.json(cached)
  }
  
  // Fetch all accounts
  const acctRes = await fetch(`${OF_API_BASE}/accounts`, {
    headers: { Authorization: `Bearer ${OF_API_KEY}` },
    cache: 'no-store',
  })
  const acctData = await acctRes.json()
  const accounts = (Array.isArray(acctData) ? acctData : acctData.data || acctData.accounts || [])
    .filter((a: any) => a.onlyfans_username && a.id)

  // Fetch earnings in batches of 5 to avoid rate limits
  const earnings: Record<string, number> = {}
  const BATCH_SIZE = 5
  
  for (let i = 0; i < accounts.length; i += BATCH_SIZE) {
    const batch = accounts.slice(i, i + BATCH_SIZE)
    const results = await Promise.all(
      batch.map(async (a: any) => {
        const amount = await fetchEarnings(a.id)
        return { username: a.onlyfans_username, amount }
      })
    )
    results.forEach(r => {
      if (r.amount >= 0) earnings[r.username] = r.amount
    })
    // Small delay between batches
    if (i + BATCH_SIZE < accounts.length) {
      await new Promise(r => setTimeout(r, 1000))
    }
  }

  const result = { earnings, updatedAt: Date.now(), count: Object.keys(earnings).length }
  await kvSet('s4s:model-earnings', result, 3600) // cache 1 hour
  
  return NextResponse.json(result)
}

// POST to force refresh
export async function POST() {
  // Clear cache and refetch
  await kvSet('s4s:model-earnings', null)
  return GET()
}
