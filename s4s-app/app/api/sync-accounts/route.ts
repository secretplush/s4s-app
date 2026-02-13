import { NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'
export const revalidate = 0

const OF_API_BASE = 'https://app.onlyfansapi.com/api'
const OF_API_KEY = process.env.OF_API_KEY || 'ofapi_bT4J1Er2YBow46EihDfjlSFf5HRmiM15M4DCOoHn7889d8b4'

export interface SyncedAccount {
  id: string
  username: string
  displayName: string
  fans: number
  likes: number
  postsCount: number
  avatar: string
  isAuthenticated: boolean
}

export async function GET() {
  try {
    const res = await fetch(`${OF_API_BASE}/accounts?limit=200`, {
      headers: { 'Authorization': `Bearer ${OF_API_KEY}` },
      cache: 'no-store',
    })

    if (!res.ok) {
      return NextResponse.json({ error: `OF API error: ${res.status} ${await res.text()}` }, { status: 502 })
    }

    const data = await res.json()
    const rawAccounts: any[] = Array.isArray(data) ? data : data.data || data.accounts || []

    const accounts: SyncedAccount[] = rawAccounts.map((acct: any) => {
      const ud = acct.onlyfans_user_data || {}
      return {
        id: acct.id || acct.prefixed_id || '',
        username: acct.onlyfans_username || ud.username || '',
        displayName: acct.display_name || ud.name || acct.onlyfans_username || '',
        fans: ud.subscribesCount ?? ud.subscribersCount ?? 0,
        likes: ud.favoritesCount ?? 0,
        postsCount: ud.postsCount ?? 0,
        avatar: ud.avatarThumbs?.c144 || ud.avatar || '',
        isAuthenticated: acct.is_authenticated ?? false,
      }
    }).filter((a: SyncedAccount) => a.username)

    return NextResponse.json({ accounts, total: accounts.length }, {
      headers: {
        'Cache-Control': 'no-store, no-cache, must-revalidate',
        'CDN-Cache-Control': 'no-store',
        'Vercel-CDN-Cache-Control': 'no-store',
      }
    })
  } catch (e) {
    console.error('Sync accounts error:', e)
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
