import { NextResponse } from 'next/server'
import { kv } from '@vercel/kv'

export const dynamic = 'force-dynamic'

const OF_API_BASE = 'https://app.onlyfansapi.com/api'
const OF_API_KEY = process.env.OF_API_KEY || 'ofapi_bT4J1Er2YBow46EihDfjlSFf5HRmiM15M4DCOoHn7889d8b4'

export async function POST(request: Request) {
  try {
    const { username } = await request.json()
    if (!username || typeof username !== 'string') {
      return NextResponse.json({ error: 'Missing username' }, { status: 400 })
    }

    // Check if already exists in Redis
    const existing = await kv.hget('sfs_exclude_lists', username)
    if (existing) {
      return NextResponse.json({ listId: String(existing), cached: true })
    }

    // Get account ID for this username
    const accountsRes = await fetch(`${OF_API_BASE}/accounts?limit=200`, {
      headers: { 'Authorization': `Bearer ${OF_API_KEY}` },
      cache: 'no-store',
    })
    if (!accountsRes.ok) {
      return NextResponse.json({ error: `Failed to fetch accounts: ${accountsRes.status}` }, { status: 502 })
    }
    const accountsData = await accountsRes.json()
    const accounts = accountsData.data || accountsData.accounts || accountsData || []
    const account = accounts.find((a: any) =>
      (a.username || a.onlyfans_username || '').toLowerCase() === username.toLowerCase()
    )
    if (!account) {
      return NextResponse.json({ error: `Account not found for @${username}` }, { status: 404 })
    }
    const accountId = account.id || account.account_id

    // Create the SFS Exclude list via OF API
    const createRes = await fetch(`${OF_API_BASE}/${accountId}/user-lists`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${OF_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ name: 'SFS Exclude' }),
    })
    if (!createRes.ok) {
      const errText = await createRes.text()
      return NextResponse.json({ error: `Failed to create list: ${createRes.status} ${errText}` }, { status: 502 })
    }
    const createData = await createRes.json()
    const listId = String(createData.data?.id || createData.id)

    // Save to Redis hash
    await kv.hset('sfs_exclude_lists', { [username]: listId })

    return NextResponse.json({ listId, cached: false })
  } catch (e: any) {
    return NextResponse.json({ error: e.message || String(e) }, { status: 500 })
  }
}
