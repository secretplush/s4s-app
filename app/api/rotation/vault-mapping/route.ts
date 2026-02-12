import { NextResponse } from 'next/server'
import { readFile, writeFile, mkdir } from 'fs/promises'
import path from 'path'

// Store vault mappings in a JSON file (simple solution for MVP)
// Production would use a proper database
const DATA_DIR = path.join(process.cwd(), 'data')
const MAPPING_FILE = path.join(DATA_DIR, 'vault-mappings.json')

interface VaultMapping {
  [promoterUsername: string]: {
    accountId: string
    images: {
      imageId: string
      vaultIds: { [targetUsername: string]: string }
    }[]
  }
}

async function loadMappings(): Promise<VaultMapping> {
  try {
    const data = await readFile(MAPPING_FILE, 'utf-8')
    return JSON.parse(data)
  } catch {
    return {}
  }
}

async function saveMappings(mappings: VaultMapping): Promise<void> {
  await mkdir(DATA_DIR, { recursive: true })
  await writeFile(MAPPING_FILE, JSON.stringify(mappings, null, 2))
}

// GET: Retrieve all vault mappings
export async function GET() {
  const mappings = await loadMappings()
  
  // Calculate stats
  const promoters = Object.keys(mappings)
  let totalVaults = 0
  for (const promoter of promoters) {
    for (const img of mappings[promoter]?.images || []) {
      totalVaults += Object.keys(img.vaultIds || {}).length
    }
  }
  
  return NextResponse.json({
    promoterCount: promoters.length,
    totalVaults,
    mappings
  })
}

// POST: Save vault mappings from browser
export async function POST(request: Request) {
  try {
    const body = await request.json()
    const { promoterUsername, accountId, images } = body
    
    if (!promoterUsername || !accountId || !images) {
      return NextResponse.json({ 
        error: 'Missing required fields',
        required: ['promoterUsername', 'accountId', 'images']
      }, { status: 400 })
    }
    
    const mappings = await loadMappings()
    
    mappings[promoterUsername] = {
      accountId,
      images: images.map((img: any) => ({
        imageId: img.id,
        vaultIds: img.vaultIds || {}
      }))
    }
    
    await saveMappings(mappings)
    
    return NextResponse.json({
      success: true,
      promoter: promoterUsername,
      imageCount: images.length,
      message: 'Vault mappings saved'
    })
    
  } catch (error) {
    console.error('Save vault mapping error:', error)
    return NextResponse.json({ 
      error: 'Internal server error',
      details: String(error)
    }, { status: 500 })
  }
}

// PUT: Bulk sync all mappings at once
export async function PUT(request: Request) {
  try {
    const body = await request.json()
    const { mappings } = body
    
    if (!mappings || typeof mappings !== 'object') {
      return NextResponse.json({ 
        error: 'Missing mappings object'
      }, { status: 400 })
    }
    
    await saveMappings(mappings)
    
    const promoters = Object.keys(mappings)
    let totalVaults = 0
    for (const promoter of promoters) {
      for (const img of mappings[promoter]?.images || []) {
        totalVaults += Object.keys(img.vaultIds || {}).length
      }
    }
    
    return NextResponse.json({
      success: true,
      promoterCount: promoters.length,
      totalVaults,
      message: 'All vault mappings synced'
    })
    
  } catch (error) {
    console.error('Bulk sync error:', error)
    return NextResponse.json({ 
      error: 'Internal server error',
      details: String(error)
    }, { status: 500 })
  }
}
