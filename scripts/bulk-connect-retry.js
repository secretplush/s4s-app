const API_KEY = 'ofapi_bT4J1Er2YBow46EihDfjlSFf5HRmiM15M4DCOoHn7889d8b4'
const API_BASE = 'https://app.onlyfansapi.com/api'

// Skip: xoharper (2FA), brittanyhalden (password issue)
const models = [
  { username: 'jessicaparkerrr', email: 'sarahnic@plush.la', password: 'cZ*707w_' },
  { username: 'kaliblakexo', email: 'jocelynpul@plush.la', password: 'HgZ4k!XK' },
  { username: 'laceythomass', email: 'tadeumgof@erotiqa.co', password: 'yo2eHBTe' },
  { username: 'lindamarievip', email: 'Fanslindamarie44@gmail.com', password: 'z3j8z7WC' },
  { username: 'lilyyymonroee', email: 'sarahdai@plush.la', password: '3DWbkAZj' },
  { username: 'andreaelizabethxo', email: 'Andreamcpeak@yahoo.com', password: 'Sivryc-2zyfgy-nuvdoc' },
  { username: 'dollyrhodesss', email: 'damarisrod@plush.la', password: 'Z42vQ28_' },
  { username: 'nickyecker', email: 'nicolebluecker@outlook.com', password: 'nZ3q3Byf' },
  { username: 'chelseapaige', email: 'shanialyn@iluvplush.com', password: 'dEuZi3X7B' },
  { username: 'Thesarasky', email: 'sarat@erotiqa.co', password: '5x0hSjFa' },
  { username: 'yourrfavblondie', email: 'paristay@iluvplush.com', password: 'uFYcUr7h' },
  { username: 'skyyroseee', email: 'francescahal@iluvplush.com', password: 'Fuzzycoco45!' },
  { username: 'caraaawesley', email: 'sydneysny@iluvplush.com', password: 'DoveHeart62!' },
  { username: 'keelydavidson', email: 'jenitawil@plush.la', password: '3U86eJrQ' },
  { username: 'kaitlynxbeckham', email: 'evelynhan@plush.la', password: 'qS!Wm3V7' },
  { username: 'rachelxbennett', email: 'nataliagro@plush.la', password: '4geJrD7A' },
  { username: 'laylaxjones', email: 'giselemar@plush.la', password: 'dSGP1D+4' },
  { username: 'chloecollinsxo', email: 'kassideedav@erotiqa.co', password: 'R8w!j5n2B7SL' },
  { username: 'Kybabyrae', email: 'taylork@erotiqa.co', password: 'aI7hxU6F' },
  { username: 'Itsprettykiti', email: 'Kitkp@yahoo.com', password: 'Bodyrenew1!' },
  { username: 'Saralovexx', email: 'sarabru@plush.la', password: 'YNPI1KzH' },
  { username: 'caddieissues', email: 'caddieissuesof@gmail.com', password: 'txDBh2Jr' },
  { username: 'winterclaire', email: 'winter@erotiqa.co', password: 'eDoI7h1B' },
  { username: 'madsabigail', email: 'madisonang@erotiqa.co', password: 'BY4KiV}J' },
  { username: 'carlybora', email: 'carlybor@plush.la', password: '62DfM5/m' },
  { username: 'lilywestt', email: 'emmawen@iluvplush.com', password: 'Pinkcandy86!' },
  { username: 'Taylorskully', email: 'taylorscilufo@gmail.com', password: 'X7ItmqZE' },
]

async function testApi() {
  // Test with one account first
  const test = await fetch(`${API_BASE}/accounts`, {
    headers: { 'Authorization': `Bearer ${API_KEY}` },
  })
  if (!test.ok) {
    console.log('❌ API still down. Will retry in 5 minutes...')
    return false
  }
  console.log('✅ API is responding\n')
  return true
}

async function connectAccount(model) {
  const res = await fetch(`${API_BASE}/authenticate`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ email: model.email, password: model.password, force_connect: true }),
  })
  const data = await res.json()
  return { ...model, ok: res.ok, response: data }
}

async function main() {
  // Retry loop - check if API is back every 5 min
  for (let attempt = 1; attempt <= 12; attempt++) {
    console.log(`\n=== Attempt ${attempt} at ${new Date().toISOString()} ===`)
    
    // Quick test
    const testRes = await fetch(`${API_BASE}/authenticate`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: models[0].email, password: models[0].password, force_connect: true }),
    }).then(r => r.json()).catch(e => ({ message: e.message }))
    
    if (testRes.message === 'Server Error') {
      console.log('API still returning Server Error. Waiting 5 min...')
      if (attempt < 12) await new Promise(r => setTimeout(r, 300000))
      continue
    }
    
    console.log('API is back! Processing all accounts...\n')
    
    const results = { success: [], needs2fa: [], error: [] }
    // First result is our test
    const first = { ...models[0], response: testRes }
    processResult(first, results)
    
    for (let i = 1; i < models.length; i++) {
      const m = models[i]
      console.log(`[${i+1}/${models.length}] ${m.username}...`)
      try {
        const result = await connectAccount(m)
        processResult(result, results)
      } catch (e) {
        console.log(`  ❌ ${e.message}`)
        results.error.push({ ...m, response: { error: e.message } })
      }
      await new Promise(r => setTimeout(r, 5000))
    }
    
    console.log(`\n${'='.repeat(50)}`)
    console.log(`✅ Success: ${results.success.length}`)
    console.log(`⚠️  Needs 2FA: ${results.needs2fa.length}`)
    console.log(`❌ Errors: ${results.error.length}`)
    if (results.needs2fa.length) {
      console.log(`\n2FA:`)
      results.needs2fa.forEach(r => console.log(`  - ${r.username} (${r.email})`))
    }
    if (results.error.length) {
      console.log(`\nErrors:`)
      results.error.forEach(r => console.log(`  - ${r.username}: ${JSON.stringify(r.response).substring(0, 150)}`))
    }
    if (results.success.length) {
      console.log(`\nConnected:`)
      results.success.forEach(r => console.log(`  - ${r.username} → ${r.accountId}`))
    }
    return
  }
  console.log('\n❌ API never came back after 1 hour of retries.')
}

function processResult(result, results) {
  const r = result.response
  const label = result.username || models[0].username
  if (r.authentication_progress === 'waiting_for_2fa') {
    results.needs2fa.push(result)
    console.log(`  ⚠️  ${label} needs 2FA → ${r.id}`)
  } else if (r.is_authenticated === true) {
    results.success.push({ ...result, accountId: r.id })
    console.log(`  ✅ ${label} → ${r.id} (${r.onlyfans_username})`)
  } else if (r.id) {
    results.success.push({ ...result, accountId: r.id })
    console.log(`  🔶 ${label} → ${r.id} (auth: ${r.is_authenticated})`)
  } else {
    results.error.push(result)
    console.log(`  ❌ ${label}: ${JSON.stringify(r).substring(0, 150)}`)
  }
}

main()
