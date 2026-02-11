#!/usr/bin/env node
/**
 * Fix all vault gaps server-side.
 * 
 * For each gap (source model's image missing from target model's vault):
 * 1. Find source's promo image URL from a vault where it exists
 * 2. Download the image
 * 3. Upload to target's account via OF API
 * 4. Save correct vault_id to KV
 * 
 * Usage: node scripts/fix-vault-gaps.js
 */

const OF_API_KEY = 'ofapi_bT4J1Er2YBow46EihDfjlSFf5HRmiM15M4DCOoHn7889d8b4'
const OF_API_BASE = 'https://app.onlyfansapi.com/api'
const S4S_APP = 'https://s4s-app.vercel.app'

const ACCOUNT_IDS = {
  'milliexhart': 'acct_ebca85077e0a4b7da04cf14176466411',
  'zoepriceee': 'acct_f05bf7874c974a5d875a1ef01c5bbc3b',
  'novaleighh': 'acct_9ee32f0bac4e4e8394a09f2c9fa2fbb7',
  'lucymonroee': 'acct_0653d6e6c3984bea8d3adc84cc616c7c',
  'chloecookk': 'acct_6bb6d77ac2c741ecb54d865237bb04f4',
  'jackiesmithh': 'acct_bd6a75d6943141589cf5e43586653258',
  'brookeewest': 'acct_749c75e13d7e4685813f2a2867ce614d',
  'ayaaann': 'acct_b0b0698a614643c5932cfccd23f7c430',
  'chloeecavalli': 'acct_b5e739f9f40a4da99b2f5ca559168012',
  'sadieeblake': 'acct_cfb853d0ba714aeaa9a89e3026ec6190',
  'lolasinclairr': 'acct_bde8d615937548f18c4e54b7cedf8c1d',
  'maddieharperr': 'acct_a50799a789a6422c8389d7d055fcbd1a',
  'zoeemonroe': 'acct_fbd172e2681f4dfbb6026ce806ecaa28',
  'biancaawoods': 'acct_54e3119e77da4429b6537f7dd2883a05',
  'aviannaarose': 'acct_2648cedf59644b0993ade9608bd868a1',
  'jessicaparkerrr': 'acct_29037b1ef83d4c838ab2ec49d61d26f6',
  'kaliblakexo': 'acct_487806e5751b487bb302793ee1c3ef2c',
  'laceythomass': 'acct_c85c710e083f4b4a94d826f76855543d',
  'lindamarievip': 'acct_04d878af1813422fa6b310991f687d73',
  'lilyyymonroee': 'acct_e84886b3217e4fbd8f82ee63ca8894e8',
  'dollyrhodesss': 'acct_bfd09358f67849cba6d9f8cf4a565cd2',
  'chelseapaige': 'acct_b5f1a5fc3cfd4a959dbea7230814ae71',
  'thesarasky': 'acct_8b4b062aeef1441ba8f51a7b0f3fe5f2',
  'yourrfavblondie': 'acct_15870053c2604e0f9e94d14a10749923',
  'skyyroseee': 'acct_7a273714a275417992b0f7c1d3389a2c',
  'tyybabyy': 'acct_766a8451ee6946009d20581ab11fdfc4',
  'itsmealexisrae': 'acct_ac70731a489741f0b6abc45a050f0301',
  'lolaxmae': 'acct_40e51b831b3247ac806755362b494fe5',
  'rebeccabrownn': 'acct_6f2328ebe4c446038ea1847d2dbecc17',
  'oliviabrookess': 'acct_9665889fec2b46e9a05232afee59ef19'
}

const OG_MODELS = ['milliexhart', 'zoepriceee', 'novaleighh', 'lucymonroee', 'chloecookk',
  'jackiesmithh', 'brookeewest', 'ayaaann', 'chloeecavalli', 'sadieeblake',
  'lolasinclairr', 'maddieharperr', 'zoeemonroe', 'biancaawoods', 'aviannaarose']

const NEW_MODELS = ['jessicaparkerrr', 'kaliblakexo', 'laceythomass', 'lindamarievip', 'lilyyymonroee',
  'dollyrhodesss', 'chelseapaige', 'thesarasky', 'yourrfavblondie', 'skyyroseee',
  'tyybabyy', 'itsmealexisrae', 'lolaxmae', 'rebeccabrownn', 'oliviabrookess']

async function apiFetch(path, options = {}) {
  const res = await fetch(`${OF_API_BASE}${path}`, {
    ...options,
    headers: {
      'Authorization': `Bearer ${OF_API_KEY}`,
      'User-Agent': 'Mozilla/5.0',
      ...(options.headers || {})
    }
  })
  return res
}

async function sleep(ms) {
  return new Promise(r => setTimeout(r, ms))
}

// Get all vault items for an account
async function getVaultItems(accountId) {
  const items = []
  let offset = 0
  while (true) {
    const res = await apiFetch(`/${accountId}/media/vault?offset=${offset}`)
    const data = await res.json()
    const list = data?.data?.list || []
    if (list.length === 0) break
    items.push(...list)
    offset += list.length
    if (list.length < 24) break // less than page size = last page
    await sleep(500)
  }
  return items
}

// Download image from URL to buffer
async function downloadImage(url) {
  const res = await fetch(url)
  if (!res.ok) throw new Error(`Download failed: ${res.status}`)
  return Buffer.from(await res.arrayBuffer())
}

// Upload image buffer to a target account's vault (upload→post→delete trick)
async function uploadToVault(targetAccountId, imageBuffer, sourceUsername) {
  // Step 1: Upload media
  const formData = new FormData()
  const blob = new Blob([imageBuffer], { type: 'image/jpeg' })
  formData.append('file', blob, `${sourceUsername}_promo.jpg`)

  const uploadRes = await apiFetch(`/${targetAccountId}/media/upload`, {
    method: 'POST',
    body: formData
  })

  if (!uploadRes.ok) {
    const err = await uploadRes.text()
    throw new Error(`Upload failed: ${err}`)
  }

  const uploadData = await uploadRes.json()
  const mediaId = uploadData.prefixed_id || uploadData.id || uploadData.media_id
  if (!mediaId) throw new Error(`No media ID: ${JSON.stringify(uploadData)}`)

  // Wait for rate limit
  await sleep(11000)

  // Step 2: Create post
  const postRes = await apiFetch(`/${targetAccountId}/posts`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      text: `@${sourceUsername}`,
      mediaFiles: [mediaId]
    })
  })

  if (!postRes.ok) {
    const err = await postRes.text()
    throw new Error(`Post failed: ${err}`)
  }

  const postResponse = await postRes.json()
  const postData = postResponse.data || postResponse
  const postId = postData.id || postData.post_id

  let vaultId = null
  if (postData.media && postData.media.length > 0) {
    vaultId = postData.media[0].id?.toString() || postData.media[0].vault_id?.toString()
  }

  // Step 3: Delete post
  if (postId) {
    await sleep(2000)
    await apiFetch(`/${targetAccountId}/posts/${postId}`, { method: 'DELETE' })
  }

  if (!vaultId) throw new Error('No vault_id from post')
  return vaultId
}

// Update KV vault mappings via the S4S app API
async function updateKV(sourceUsername, targetUsername, vaultId) {
  // We'll batch these and update at the end
  return { sourceUsername, targetUsername, vaultId }
}

async function main() {
  console.log('=== Vault Gap Fixer ===')
  console.log(`OG models: ${OG_MODELS.length}`)
  console.log(`New models: ${NEW_MODELS.length}`)
  console.log(`Total gaps to fix: ${OG_MODELS.length * NEW_MODELS.length} (OG images → new girl vaults)`)
  console.log()

  // Step 1: For each OG model, find their promo image from another OG model's vault
  // We'll use sadieeblake's vault as the reference (she's OG and should have all OG images)
  const refAccount = ACCOUNT_IDS['sadieeblake']
  console.log('Fetching reference vault (sadieeblake)...')
  const refVault = await getVaultItems(refAccount)
  console.log(`Found ${refVault.length} items in sadieeblake's vault`)

  // Get existing KV mappings to figure out which vault items belong to which model
  const kvRes = await fetch(`${S4S_APP}/api/sync-new-model?target=sadieeblake`)
  const kvData = await kvRes.json()
  
  // Build vault_id → source_username lookup from KV
  const vaultIdToSource = {}
  for (const entry of kvData.existing || []) {
    vaultIdToSource[entry.vaultId] = entry.username
  }

  // Match vault items to source models
  const sourceImages = {} // sourceUsername → { url, buffer }
  let matched = 0
  for (const item of refVault) {
    const source = vaultIdToSource[item.id.toString()]
    if (source && OG_MODELS.includes(source) && !sourceImages[source]) {
      const url = item.files?.full?.url || item.files?.preview?.url
      if (url) {
        sourceImages[source] = { url, id: item.id }
        matched++
      }
    }
  }

  console.log(`\nMatched ${matched}/${OG_MODELS.length} OG models to vault images`)
  for (const model of OG_MODELS) {
    const status = sourceImages[model] ? `✅ vault_id=${sourceImages[model].id}` : '❌ NOT FOUND'
    console.log(`  ${model}: ${status}`)
  }

  const missingModels = OG_MODELS.filter(m => !sourceImages[m])
  if (missingModels.length > 0) {
    console.log(`\n⚠️ Missing ${missingModels.length} models from sadieeblake's vault. Trying other references...`)
    
    // Try other OG models' vaults for missing images
    for (const missingModel of missingModels) {
      if (missingModel === 'sadieeblake') {
        // For sadieeblake, we need to find HER image in someone else's vault
        // Use milliexhart
        const altAccount = ACCOUNT_IDS['milliexhart']
        console.log(`  Looking for ${missingModel} in milliexhart's vault...`)
        const altVault = await getVaultItems(altAccount)
        
        const altKvRes = await fetch(`${S4S_APP}/api/sync-new-model?target=milliexhart`)
        const altKvData = await altKvRes.json()
        
        for (const entry of altKvData.existing || []) {
          if (entry.username === missingModel) {
            const item = altVault.find(i => i.id.toString() === entry.vaultId)
            if (item) {
              const url = item.files?.full?.url || item.files?.preview?.url
              if (url) {
                sourceImages[missingModel] = { url, id: item.id }
                console.log(`  ✅ Found ${missingModel} in milliexhart's vault: ${item.id}`)
              }
            }
            break
          }
        }
      }
    }
  }

  const readyModels = OG_MODELS.filter(m => sourceImages[m])
  console.log(`\nReady to distribute: ${readyModels.length} OG models → ${NEW_MODELS.length} new models`)
  console.log(`Total uploads: ${readyModels.length * NEW_MODELS.length}`)
  console.log()

  // Step 2: Download all images first
  console.log('Downloading source images...')
  const imageBuffers = {}
  for (const model of readyModels) {
    try {
      console.log(`  Downloading ${model}...`)
      imageBuffers[model] = await downloadImage(sourceImages[model].url)
      console.log(`  ✅ ${model}: ${imageBuffers[model].length} bytes`)
    } catch (e) {
      console.log(`  ❌ ${model}: ${e.message}`)
    }
    await sleep(200)
  }

  const downloadedModels = Object.keys(imageBuffers)
  console.log(`\nDownloaded ${downloadedModels.length}/${readyModels.length} images`)

  // Step 3: Upload to each new model's account
  const results = []
  let completed = 0
  const total = downloadedModels.length * NEW_MODELS.length

  for (const targetModel of NEW_MODELS) {
    const targetAccountId = ACCOUNT_IDS[targetModel]
    console.log(`\n--- Uploading to ${targetModel} (${completed}/${total} done) ---`)

    for (const sourceModel of downloadedModels) {
      completed++
      process.stdout.write(`  [${completed}/${total}] ${sourceModel} → ${targetModel}... `)
      
      try {
        const vaultId = await uploadToVault(targetAccountId, imageBuffers[sourceModel], sourceModel)
        console.log(`✅ vault_id=${vaultId}`)
        results.push({ source: sourceModel, target: targetModel, vaultId, success: true })
      } catch (e) {
        console.log(`❌ ${e.message}`)
        results.push({ source: sourceModel, target: targetModel, error: e.message, success: false })
      }
    }
  }

  // Step 4: Update KV mappings via the S4S app
  console.log('\n=== Updating KV mappings ===')
  const successful = results.filter(r => r.success)
  
  if (successful.length > 0) {
    // Fetch existing mappings first
    const existingRes = await fetch(`${S4S_APP}/api/sync/vault-mappings`)
    const existingData = await existingRes.json()
    const existingMappings = existingData.mappings || {}
    const existingModels = existingData.models || []

    // Merge new results into existing
    for (const r of successful) {
      if (!existingMappings[r.source]) existingMappings[r.source] = {}
      existingMappings[r.source][r.target] = r.vaultId
    }

    // Also clear any bad mappings for OG→new pairs that failed
    for (const r of results.filter(x => !x.success)) {
      if (existingMappings[r.source]?.[r.target]) {
        delete existingMappings[r.source][r.target]
      }
    }

    // Ensure all models are in the models list
    const modelSet = new Set(existingModels.map(m => m.username))
    const allModels = [...existingModels]
    for (const u of Object.keys(ACCOUNT_IDS)) {
      if (!modelSet.has(u)) {
        allModels.push({ id: ACCOUNT_IDS[u], username: u })
      }
    }

    const syncRes = await fetch(`${S4S_APP}/api/sync/vault-mappings`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ mappings: existingMappings, models: allModels })
    })
    const syncData = await syncRes.json()
    console.log('KV sync result:', JSON.stringify(syncData))
  }

  // Summary
  const failed = results.filter(r => !r.success)
  console.log(`\n=== SUMMARY ===`)
  console.log(`✅ Successful: ${successful.length}/${total}`)
  console.log(`❌ Failed: ${failed.length}/${total}`)
  
  if (failed.length > 0) {
    console.log('\nFailed uploads:')
    for (const f of failed) {
      console.log(`  ${f.source} → ${f.target}: ${f.error}`)
    }
  }

  // Save results to file
  const fs = require('fs')
  fs.writeFileSync('/Users/moltplush/.openclaw/workspace/scripts/vault-fix-results.json', 
    JSON.stringify({ results, timestamp: new Date().toISOString() }, null, 2))
  console.log('\nResults saved to scripts/vault-fix-results.json')
}

main().catch(e => {
  console.error('FATAL:', e)
  process.exit(1)
})
