const API_KEY = 'ofapi_bT4J1Er2YBow46EihDfjlSFf5HRmiM15M4DCOoHn7889d8b4'
const API_BASE = 'https://app.onlyfansapi.com/api'

// Starting from Sara (sarahnic@plush.la) per Kiefer's instruction
// Skipping: xoharper (2FA), brittanyhalden (password)
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

async function main() {
  console.log(`Connecting ${models.length} accounts...\n`)
  const results = { success: [], needs2fa: [], error: [] }

  for (let i = 0; i < models.length; i++) {
    const m = models[i]
    process.stdout.write(`[${i+1}/${models.length}] ${m.username} (${m.email})... `)
    
    try {
      const res = await fetch(`${API_BASE}/authenticate`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${API_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ email: m.email, password: m.password, force_connect: true }),
      })
      const data = await res.json()
      
      if (data.authentication_progress === 'waiting_for_2fa') {
        results.needs2fa.push({ ...m, id: data.id })
        console.log(`⚠️ 2FA → ${data.id}`)
      } else if (data.is_authenticated === true) {
        results.success.push({ ...m, id: data.id, ofUsername: data.onlyfans_username })
        console.log(`✅ ${data.onlyfans_username} → ${data.id}`)
      } else if (data.id) {
        results.success.push({ ...m, id: data.id, ofUsername: data.onlyfans_username || '?' })
        console.log(`🔶 ${data.id} (auth: ${data.is_authenticated}, progress: ${data.authentication_progress})`)
      } else {
        results.error.push({ ...m, err: JSON.stringify(data).substring(0, 150) })
        console.log(`❌ ${JSON.stringify(data).substring(0, 100)}`)
      }
    } catch (e) {
      results.error.push({ ...m, err: e.message })
      console.log(`❌ ${e.message}`)
    }
    
    await new Promise(r => setTimeout(r, 3000))
  }

  console.log(`\n${'='.repeat(60)}`)
  console.log(`✅ Success: ${results.success.length}`)
  console.log(`⚠️  2FA: ${results.needs2fa.length}`)
  console.log(`❌ Error: ${results.error.length}`)
  
  if (results.success.length) {
    console.log(`\nConnected:`)
    results.success.forEach(r => console.log(`  ${r.username} (${r.ofUsername}) → ${r.id}`))
  }
  if (results.needs2fa.length) {
    console.log(`\n2FA needed:`)
    results.needs2fa.forEach(r => console.log(`  ${r.username} (${r.email}) → ${r.id}`))
  }
  if (results.error.length) {
    console.log(`\nErrors:`)
    results.error.forEach(r => console.log(`  ${r.username}: ${r.err}`))
  }
}

main()
