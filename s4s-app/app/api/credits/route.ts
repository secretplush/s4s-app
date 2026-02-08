import { NextResponse } from 'next/server'

const OF_API_KEY = process.env.OF_API_KEY || 'ofapi_bT4J1Er2YBow46EihDfjlSFf5HRmiM15M4DCOoHn7889d8b4'

export async function GET() {
  try {
    // Make a simple API call to get credits from the _meta response
    const res = await fetch('https://app.onlyfansapi.com/api/me', {
      headers: {
        'Authorization': `Bearer ${OF_API_KEY}`
      }
    })
    
    if (!res.ok) {
      // Try an alternative endpoint
      const altRes = await fetch('https://app.onlyfansapi.com/api/acct_ebca85077e0a4b7da04cf14176466411/posts?limit=1', {
        headers: {
          'Authorization': `Bearer ${OF_API_KEY}`
        }
      })
      
      if (altRes.ok) {
        const data = await altRes.json()
        if (data._meta?._credits) {
          return NextResponse.json({
            balance: data._meta._credits.balance,
            used: data._meta._credits.used
          })
        }
      }
      
      return NextResponse.json({ error: 'Could not fetch credits' }, { status: 500 })
    }
    
    const data = await res.json()
    
    return NextResponse.json({
      balance: data._meta?._credits?.balance || 'unknown',
      used: data._meta?._credits?.used || 0
    })
    
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
