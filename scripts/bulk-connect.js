const API_KEY = 'ofapi_bT4J1Er2YBow46EihDfjlSFf5HRmiM15M4DCOoHn7889d8b4'
const API_BASE = 'https://app.onlyfansapi.com/api'

const models = [
  { modelId: 'ISABELLADAV', username: 'oliviabrookess', email: 'isabelladav@erotiqa.co', password: 'au9I8nat' },
  { modelId: 'EMMATRO', username: 'rebeccabrownn', email: 'emmatro@iluvplush.com', password: 'Moonberry30!' },
  { modelId: 'LAURENGAR', username: 'lolaxmae', email: 'lauren@iluvplush.com', password: 'Cherryglow55!' },
  { modelId: 'MIAJON', username: 'brittanyhalden', email: 'miajon@plush.la', password: 's03K0BqNr' },
  { modelId: 'ALEXISTAR', username: 'itsmealexisrae', email: 'alexisraex888@gmail.com', password: 'ftLX)z4#' },
  { modelId: 'TYLAOTE', username: 'Tyybabyy', email: 'Tylaraeotero@yahoo.com', password: 'IPo50#NC' },
  { modelId: 'LAINEYH AY', username: 'xoharper', email: 'Harpermccoyyy24@gmail.com', password: 'tudget-qyDzyv-mibxo4' },
  { modelId: 'SARAHNIC', username: 'jessicaparkerrr', email: 'sarahnic@plush.la', password: 'cZ*707w_' },
  { modelId: 'JOCELYNPUL', username: 'kaliblakexo', email: 'jocelynpul@plush.la', password: 'HgZ4k!XK' },
  { modelId: 'TADEUMGOF', username: 'laceythomass', email: 'tadeumgof@erotiqa.co', password: 'yo2eHBTe' },
  { modelId: 'LINDADEC', username: 'lindamarievip', email: 'Fanslindamarie44@gmail.com', password: 'z3j8z7WC' },
  { modelId: 'SARAHDAI', username: 'lilyyymonroee', email: 'sarahdai@plush.la', password: '3DWbkAZj' },
  { modelId: 'ANDREAMCP', username: 'andreaelizabethxo', email: 'Andreamcpeak@yahoo.com', password: 'Sivryc-2zyfgy-nuvdoc' },
  { modelId: 'DAMARISROD', username: 'dollyrhodesss', email: 'damarisrod@plush.la', password: 'Z42vQ28_' },
  { modelId: 'NICKYECK', username: 'nickyecker', email: 'nicolebluecker@outlook.com', password: 'nZ3q3Byf' },
  { modelId: 'SHANIALYN', username: 'chelseapaige', email: 'shanialyn@iluvplush.com', password: 'dEuZi3X7B' },
  { modelId: 'SARATAG', username: 'Thesarasky', email: 'sarat@erotiqa.co', password: '5x0hSjFa' },
  { modelId: 'PARISTAY', username: 'yourrfavblondie', email: 'paristay@iluvplush.com', password: 'uFYcUr7h' },
  { modelId: 'FRANCESCAHAL', username: 'skyyroseee', email: 'francescahal@iluvplush.com', password: 'Fuzzycoco45!' },
  { modelId: 'SYDNEYSNY', username: 'caraaawesley', email: 'sydneysny@iluvplush.com', password: 'DoveHeart62!' },
  { modelId: 'JENITAWIL', username: 'keelydavidson', email: 'jenitawil@plush.la', password: '3U86eJrQ' },
  { modelId: 'EVELYNHAN', username: 'kaitlynxbeckham', email: 'evelynhan@plush.la', password: 'qS!Wm3V7' },
  { modelId: 'NATALIAGRO', username: 'rachelxbennett', email: 'nataliagro@plush.la', password: '4geJrD7A' },
  { modelId: 'GISELEMAR', username: 'laylaxjones', email: 'giselemar@plush.la', password: 'dSGP1D+4' },
  { modelId: 'KASSIDEEDAV', username: 'chloecollinsxo', email: 'kassideedav@erotiqa.co', password: 'R8w!j5n2B7SL' },
  { modelId: 'TAYLORKIN', username: 'Kybabyrae', email: 'taylork@erotiqa.co', password: 'aI7hxU6F' },
  { modelId: 'KITANYAKAM', username: 'Itsprettykiti', email: 'Kitkp@yahoo.com', password: 'Bodyrenew1!' },
  { modelId: 'SABRU', username: 'Saralovexx', email: 'sarabru@plush.la', password: 'YNPI1KzH' },
  { modelId: 'CLAIREKIL', username: 'caddieissues', email: 'caddieissuesof@gmail.com', password: 'txDBh2Jr' },
  { modelId: 'WINTERLUC', username: 'winterclaire', email: 'winter@erotiqa.co', password: 'eDoI7h1B' },
  { modelId: 'MADISONANG', username: 'madsabigail', email: 'madisonang@erotiqa.co', password: 'BY4KiV}J' },
  { modelId: 'CARLYBOR', username: 'carlybora', email: 'carlybor@plush.la', password: '62DfM5/m' },
  { modelId: 'EMMAWEN', username: 'lilywestt', email: 'emmawen@iluvplush.com', password: 'Pinkcandy86!' },
  { modelId: 'TAYLORSCI', username: 'Taylorskully', email: 'taylorscilufo@gmail.com', password: 'X7ItmqZE' },
]

async function connectAccount(model) {
  try {
    const res = await fetch(`${API_BASE}/authenticate`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        email: model.email,
        password: model.password,
        force_connect: false,
      }),
    })
    const data = await res.json()
    return { ...model, status: res.ok ? 'success' : 'error', response: data }
  } catch (err) {
    return { ...model, status: 'error', response: { error: err.message } }
  }
}

async function main() {
  console.log(`Connecting ${models.length} accounts...\n`)
  
  const results = { success: [], needs2fa: [], error: [] }
  
  for (let i = 0; i < models.length; i++) {
    const m = models[i]
    console.log(`[${i+1}/${models.length}] ${m.username} (${m.email})...`)
    
    const result = await connectAccount(m)
    const r = result.response
    
    if (r.needs_2fa || r.authentication_progress === '2fa_required') {
      results.needs2fa.push(result)
      console.log(`  ⚠️  Needs 2FA`)
    } else if (result.status === 'success') {
      const acctId = r.id || r.account_id || 'unknown'
      results.success.push({ ...result, accountId: acctId })
      console.log(`  ✅ Connected → ${acctId}`)
    } else {
      results.error.push(result)
      console.log(`  ❌ Error: ${JSON.stringify(r).substring(0, 150)}`)
    }
    
    // Longer delay to avoid rate limiting
    await new Promise(r => setTimeout(r, 5000))
  }
  
  console.log(`\n${'='.repeat(50)}`)
  console.log(`✅ Success: ${results.success.length}`)
  console.log(`⚠️  Needs 2FA: ${results.needs2fa.length}`)
  console.log(`❌ Errors: ${results.error.length}`)
  
  if (results.needs2fa.length > 0) {
    console.log(`\n2FA Required:`)
    results.needs2fa.forEach(r => console.log(`  - ${r.username} (${r.email})`))
  }
  if (results.error.length > 0) {
    console.log(`\nErrors:`)
    results.error.forEach(r => console.log(`  - ${r.username}: ${JSON.stringify(r.response).substring(0, 100)}`))
  }
  if (results.success.length > 0) {
    console.log(`\nSuccessful connections:`)
    results.success.forEach(r => console.log(`  - ${r.username} → ${r.accountId}`))
  }
}

main()
