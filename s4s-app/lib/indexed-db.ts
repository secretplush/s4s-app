// IndexedDB storage for promo images
// Handles much larger data than localStorage (hundreds of MB vs 5MB)

const DB_NAME = 's4s_promo_db'
const DB_VERSION = 1
const STORE_NAME = 'promo_images'

export interface PromoImage {
  id: string
  url: string
  filename: string
  uploadedAt: string
  isActive: boolean
  vaultIds: { [modelId: string]: string }
  performance?: number
  base64?: string
}

interface StoredData {
  username: string
  images: PromoImage[]
}

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION)
    
    request.onerror = () => reject(request.error)
    request.onsuccess = () => resolve(request.result)
    
    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'username' })
      }
    }
  })
}

export async function loadImages(username: string): Promise<PromoImage[]> {
  if (typeof window === 'undefined') return []
  
  try {
    const db = await openDB()
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readonly')
      const store = tx.objectStore(STORE_NAME)
      const request = store.get(username)
      
      request.onerror = () => reject(request.error)
      request.onsuccess = () => {
        const data = request.result as StoredData | undefined
        resolve(data?.images || [])
      }
    })
  } catch (e) {
    console.error('Failed to load from IndexedDB:', e)
    // Fallback to localStorage for migration
    return loadFromLocalStorage(username)
  }
}

export async function saveImages(username: string, images: PromoImage[]): Promise<void> {
  if (typeof window === 'undefined') return
  
  try {
    const db = await openDB()
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite')
      const store = tx.objectStore(STORE_NAME)
      const data: StoredData = { username, images }
      const request = store.put(data)
      
      request.onerror = () => reject(request.error)
      request.onsuccess = () => resolve()
    })
  } catch (e) {
    console.error('Failed to save to IndexedDB:', e)
    throw e
  }
}

export async function deleteImages(username: string): Promise<void> {
  if (typeof window === 'undefined') return
  
  try {
    const db = await openDB()
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite')
      const store = tx.objectStore(STORE_NAME)
      const request = store.delete(username)
      
      request.onerror = () => reject(request.error)
      request.onsuccess = () => resolve()
    })
  } catch (e) {
    console.error('Failed to delete from IndexedDB:', e)
    throw e
  }
}

export async function getAllUsernames(): Promise<string[]> {
  if (typeof window === 'undefined') return []
  
  try {
    const db = await openDB()
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readonly')
      const store = tx.objectStore(STORE_NAME)
      const request = store.getAllKeys()
      
      request.onerror = () => reject(request.error)
      request.onsuccess = () => resolve(request.result as string[])
    })
  } catch (e) {
    console.error('Failed to get usernames from IndexedDB:', e)
    return []
  }
}

export async function getImageCounts(totalModels: number = 15): Promise<{ [username: string]: { total: number; active: number; needsDistribution: boolean; vaultStatus: string } }> {
  if (typeof window === 'undefined') return {}
  
  try {
    const db = await openDB()
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readonly')
      const store = tx.objectStore(STORE_NAME)
      const request = store.getAll()
      
      request.onerror = () => reject(request.error)
      request.onsuccess = () => {
        const results: { [username: string]: { total: number; active: number; needsDistribution: boolean; vaultStatus: string } } = {}
        const expectedVaults = totalModels - 1 // Each model's image goes to all OTHER models
        
        for (const data of request.result as StoredData[]) {
          const activeImages = data.images.filter(img => img.isActive)
          // Check if any active image is missing vaults
          let needsDistribution = false
          let minVaults = expectedVaults
          let maxVaults = 0
          
          for (const img of activeImages) {
            const vaultCount = Object.keys(img.vaultIds || {}).length
            if (vaultCount < expectedVaults) {
              needsDistribution = true
            }
            minVaults = Math.min(minVaults, vaultCount)
            maxVaults = Math.max(maxVaults, vaultCount)
          }
          
          // Generate status string
          let vaultStatus = ''
          if (activeImages.length === 0) {
            vaultStatus = 'No active images'
            needsDistribution = true
          } else if (needsDistribution) {
            vaultStatus = `${minVaults}/${expectedVaults} vaults`
          } else {
            vaultStatus = `✓ All ${expectedVaults} vaults`
          }
          
          results[data.username] = {
            total: data.images.length,
            active: activeImages.length,
            needsDistribution,
            vaultStatus
          }
        }
        resolve(results)
      }
    })
  } catch (e) {
    console.error('Failed to get image counts:', e)
    return {}
  }
}

// Migration helper: load from old localStorage
function loadFromLocalStorage(username: string): PromoImage[] {
  try {
    const data = localStorage.getItem('s4s_promo_images')
    if (!data) return []
    const all = JSON.parse(data)
    return all[username] || []
  } catch {
    return []
  }
}

// Migrate all data from localStorage to IndexedDB
export async function migrateFromLocalStorage(): Promise<number> {
  if (typeof window === 'undefined') return 0
  
  try {
    const data = localStorage.getItem('s4s_promo_images')
    if (!data) return 0
    
    const all = JSON.parse(data) as { [username: string]: PromoImage[] }
    let migrated = 0
    
    for (const [username, images] of Object.entries(all)) {
      if (images && images.length > 0) {
        await saveImages(username, images)
        migrated += images.length
      }
    }
    
    // Clear localStorage after successful migration
    if (migrated > 0) {
      localStorage.removeItem('s4s_promo_images')
      console.log(`Migrated ${migrated} images from localStorage to IndexedDB`)
    }
    
    return migrated
  } catch (e) {
    console.error('Migration failed:', e)
    return 0
  }
}

// Export all vault mappings for KV sync
export async function exportVaultMappings(): Promise<{
  mappings: { [promoter: string]: { [target: string]: string } }
  models: string[]
}> {
  if (typeof window === 'undefined') return { mappings: {}, models: [] }
  
  try {
    const db = await openDB()
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readonly')
      const store = tx.objectStore(STORE_NAME)
      const request = store.getAll()
      
      request.onerror = () => reject(request.error)
      request.onsuccess = () => {
        const mappings: { [promoter: string]: { [target: string]: string } } = {}
        const models: string[] = []
        
        for (const data of request.result as StoredData[]) {
          models.push(data.username)
          
          // For each image owned by this target model
          for (const img of data.images) {
            if (!img.isActive) continue
            
            // vaultIds maps promoter -> vaultId
            // So when promoter posts, they use this vaultId
            for (const [promoter, vaultId] of Object.entries(img.vaultIds || {})) {
              if (!mappings[promoter]) {
                mappings[promoter] = {}
              }
              // promoter -> target -> vaultId
              mappings[promoter][data.username] = vaultId
            }
          }
        }
        
        resolve({ mappings, models })
      }
    })
  } catch (e) {
    console.error('Failed to export vault mappings:', e)
    return { mappings: {}, models: [] }
  }
}

// Sync vault mappings to KV
export async function syncToKV(): Promise<{ success: boolean; message: string }> {
  try {
    const { mappings, models } = await exportVaultMappings()
    
    const response = await fetch('/api/sync/vault-mappings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ mappings, models })
    })
    
    const result = await response.json()
    
    if (result.success) {
      return { 
        success: true, 
        message: `Synced ${models.length} models with ${result.totalVaultIds} vault mappings` 
      }
    } else {
      return { success: false, message: result.error || 'Sync failed' }
    }
  } catch (e) {
    return { success: false, message: String(e) }
  }
}

// Get total storage used (approximate)
export async function getStorageUsed(): Promise<string> {
  if (typeof window === 'undefined') return '0 KB'
  
  try {
    const db = await openDB()
    return new Promise((resolve) => {
      const tx = db.transaction(STORE_NAME, 'readonly')
      const store = tx.objectStore(STORE_NAME)
      const request = store.getAll()
      
      request.onsuccess = () => {
        const data = JSON.stringify(request.result)
        const bytes = new Blob([data]).size
        if (bytes < 1024) resolve(`${bytes} B`)
        else if (bytes < 1024 * 1024) resolve(`${(bytes / 1024).toFixed(1)} KB`)
        else resolve(`${(bytes / (1024 * 1024)).toFixed(1)} MB`)
      }
      request.onerror = () => resolve('Unknown')
    })
  } catch {
    return 'Unknown'
  }
}
