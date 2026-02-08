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

export async function getImageCounts(): Promise<{ [username: string]: { total: number; active: number } }> {
  if (typeof window === 'undefined') return {}
  
  try {
    const db = await openDB()
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readonly')
      const store = tx.objectStore(STORE_NAME)
      const request = store.getAll()
      
      request.onerror = () => reject(request.error)
      request.onsuccess = () => {
        const results: { [username: string]: { total: number; active: number } } = {}
        for (const data of request.result as StoredData[]) {
          results[data.username] = {
            total: data.images.length,
            active: data.images.filter(img => img.isActive).length
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
