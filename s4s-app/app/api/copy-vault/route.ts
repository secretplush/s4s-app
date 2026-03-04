import { NextRequest, NextResponse } from 'next/server'
import { kv } from '@vercel/kv'

export const maxDuration = 300

const OF_API_BASE = 'https://app.onlyfansapi.com/api'
const OF_API_KEY = process.env.OF_API_KEY || 'ofapi_bT4J1Er2YBow46EihDfjlSFf5HRmiM15M4DCOoHn7889d8b4'

async function getAccountIds(): Promise<{ [username: string]: string }> {
  const res = await fetch(`${OF_API_BASE}/accounts?limit=200`, {
    headers: { 'Authorization': `Bearer ${OF_API_KEY}` },
    cache: 'no-store',
  })
  const data = await res.json()
  const accounts: any[] = Array.isArray(data) ? data : data.data || data.accounts || []
  const map: { [username: string]: string } = {}
  for (const a of accounts) {
    const u = a.onlyfans_username || a.onlyfans_user_data?.username
    const id = a.id || a.prefixed_id
    if (u && id) map[u] = id
  }
  return map
}

/**
 * Copy vault items from a donor account to a target account.
 * POST body: { targetUsername, donorUsername, models: [{ username, vaultId }] }
 * 
 * For each source model:
 * 1. Create temp post on donor using existing vaultId → get CDN URL
 * 2. Download image server-side
 * 3. Upload to target account → create post → mint vault_id → delete post
 */
export async function POST(req: NextRequest) {
  try {
    const { targetUsername, donorUsername, models } = await req.json()
    if (!targetUsername || !donorUsername || !models?.length) {
      return NextResponse.json({ error: 'Missing targetUsername, donorUsername, or models' }, { status: 400 })
    }

    const accountIds = await getAccountIds()
    const targetAcct = accountIds[targetUsername]
    const donorAcct = accountIds[donorUsername]
    if (!targetAcct) return NextResponse.json({ error: `Unknown target: ${targetUsername}` }, { status: 400 })
    if (!donorAcct) return NextResponse.json({ error: `Unknown donor: ${donorUsername}` }, { status: 400 })

    const apiHeaders = { 'Authorization': `Bearer ${OF_API_KEY}` }
    const results: { username: string; vaultId: string | null; error?: string }[] = []

    for (let i = 0; i < models.length; i++) {
      const { username: sourceUsername, vaultId: donorVaultId } = models[i]
      console.log(`[${i+1}/${models.length}] ${sourceUsername} (donor vault: ${donorVaultId})`)

      try {
        // Step 1: Create temp post on donor to get CDN URL
        const postRes = await fetch(`${OF_API_BASE}/${donorAcct}/posts`, {
          method: 'POST',
          headers: { ...apiHeaders, 'Content-Type': 'application/json' },
          body: JSON.stringify({ text: 'temp', mediaFiles: [donorVaultId] })
        })
        const postJson = await postRes.json()
        const postData = postJson.data || postJson
        const postId = postData.id
        const cdnUrl = postData.media?.[0]?.files?.full?.url

        if (!cdnUrl) {
          if (postId) fetch(`${OF_API_BASE}/${donorAcct}/posts/${postId}`, { method: 'DELETE', headers: apiHeaders })
          results.push({ username: sourceUsername, vaultId: null, error: 'No CDN URL from donor post' })
          continue
        }

        // Step 2: Download image from CDN (server-side — Vercel IP should work)
        const imgRes = await fetch(cdnUrl)
        if (!imgRes.ok) {
          fetch(`${OF_API_BASE}/${donorAcct}/posts/${postId}`, { method: 'DELETE', headers: apiHeaders })
          results.push({ username: sourceUsername, vaultId: null, error: `CDN download failed: ${imgRes.status}` })
          continue
        }
        const imgBuffer = Buffer.from(await imgRes.arrayBuffer())
        console.log(`  Downloaded ${(imgBuffer.length/1024).toFixed(0)}KB`)

        // Delete donor temp post
        fetch(`${OF_API_BASE}/${donorAcct}/posts/${postId}`, { method: 'DELETE', headers: apiHeaders })

        if (imgBuffer.length < 1000) {
          results.push({ username: sourceUsername, vaultId: null, error: `Image too small (${imgBuffer.length}b) — likely blocked` })
          continue
        }

        // Step 3: Upload to target account
        await new Promise(r => setTimeout(r, 2000))
        const formData = new FormData()
        formData.append('file', new Blob([imgBuffer], { type: 'image/jpeg' }), `${sourceUsername}_promo.jpg`)
        const uploadRes = await fetch(`${OF_API_BASE}/${targetAcct}/media/upload`, {
          method: 'POST',
          headers: apiHeaders,
          body: formData
        })
        const uploadData = await uploadRes.json()
        const mediaId = uploadData.prefixed_id || uploadData.id
        if (!mediaId) {
          results.push({ username: sourceUsername, vaultId: null, error: `Upload failed: ${JSON.stringify(uploadData)}` })
          continue
        }

        // Step 4: Create post to mint vault_id
        await new Promise(r => setTimeout(r, 3000))
        const mintRes = await fetch(`${OF_API_BASE}/${targetAcct}/posts`, {
          method: 'POST',
          headers: { ...apiHeaders, 'Content-Type': 'application/json' },
          body: JSON.stringify({ text: `@${sourceUsername}`, mediaFiles: [mediaId] })
        })
        const mintJson = await mintRes.json()
        const mintData = mintJson.data || mintJson
        const mintPostId = mintData.id
        const newVaultId = mintData.media?.[0]?.id?.toString()

        // Delete mint post
        if (mintPostId) {
          await new Promise(r => setTimeout(r, 2000))
          fetch(`${OF_API_BASE}/${targetAcct}/posts/${mintPostId}`, { method: 'DELETE', headers: apiHeaders })
        }

        if (!newVaultId) {
          results.push({ username: sourceUsername, vaultId: null, error: 'No vault_id from mint post' })
          continue
        }

        results.push({ username: sourceUsername, vaultId: newVaultId })
        console.log(`  ✅ ${sourceUsername} → vault_id ${newVaultId}`)

        // Rate limit between models
        await new Promise(r => setTimeout(r, 3000))

      } catch (e) {
        results.push({ username: sourceUsername, vaultId: null, error: String(e) })
      }
    }

    // Save results to vault_mappings
    const successful = results.filter(r => r.vaultId)
    if (successful.length > 0) {
      const v1 = (await kv.get('vault_mappings') as Record<string, Record<string, string>>) || {}
      if (!v1[targetUsername]) v1[targetUsername] = {}
      for (const r of successful) {
        v1[targetUsername][r.username] = r.vaultId!
      }
      await kv.set('vault_mappings', v1)

      const v2 = (await kv.get('vault_mappings_v2') as Record<string, Record<string, any>>) || {}
      if (!v2[targetUsername]) v2[targetUsername] = {}
      for (const r of successful) {
        v2[targetUsername][r.username] = { ghost: [r.vaultId!], pinned: [r.vaultId!], massDm: [r.vaultId!] }
      }
      await kv.set('vault_mappings_v2', v2)
    }

    return NextResponse.json({
      success: true,
      targetUsername,
      total: models.length,
      successful: successful.length,
      failed: results.filter(r => !r.vaultId).length,
      results
    })
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
