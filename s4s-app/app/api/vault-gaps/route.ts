import { NextResponse } from 'next/server'
import { kv } from '@vercel/kv'

export const dynamic = 'force-dynamic'
export const revalidate = 0

const ACCOUNT_IDS: { [username: string]: string } = {
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

// KV schema: vault_mappings = { [sourceUsername]: { [targetUsername]: vaultId } }
// meaning: sourceUsername's promo image has vault_id=X in targetUsername's account

export async function GET() {
  try {
    const mappings = (await kv.get('vault_mappings') as Record<string, Record<string, string>>) || {}
    const allModels = Object.keys(ACCOUNT_IDS)

    // For each target model, check which source models are missing
    // A "gap" means: sourceModel's image is NOT in targetModel's vault
    // i.e., mappings[sourceModel][targetModel] doesn't exist
    const gaps: { targetUsername: string; missingFrom: string[] }[] = []
    let totalGaps = 0
    let modelsWithGaps = 0

    for (const target of allModels) {
      const missing: string[] = []
      for (const source of allModels) {
        if (source === target) continue
        if (!mappings[source]?.[target]) {
          missing.push(source)
        }
      }
      if (missing.length > 0) {
        gaps.push({ targetUsername: target, missingFrom: missing })
        totalGaps += missing.length
        modelsWithGaps++
      }
    }

    return NextResponse.json({
      success: true,
      totalGaps,
      modelsWithGaps,
      totalModels: allModels.length,
      gaps
    })
  } catch (error) {
    console.error('Vault gaps error:', error)
    return NextResponse.json({ error: String(error) }, { status: 500 })
  }
}
