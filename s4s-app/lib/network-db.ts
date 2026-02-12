// IndexedDB storage for network settings

export interface NetworkModel {
  username: string
  displayName: string
  accountId: string | null  // null = not connected
  inRotation: boolean
  addedAt: string
}

const DB_NAME = 's4s-network'
const DB_VERSION = 1
const STORE_NAME = 'models'

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

export async function loadNetworkModels(): Promise<NetworkModel[]> {
  const db = await openDB()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readonly')
    const store = tx.objectStore(STORE_NAME)
    const request = store.getAll()
    
    request.onerror = () => reject(request.error)
    request.onsuccess = () => resolve(request.result || [])
  })
}

export async function saveNetworkModel(model: NetworkModel): Promise<void> {
  const db = await openDB()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite')
    const store = tx.objectStore(STORE_NAME)
    const request = store.put(model)
    
    request.onerror = () => reject(request.error)
    request.onsuccess = () => resolve()
  })
}

export async function deleteNetworkModel(username: string): Promise<void> {
  const db = await openDB()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite')
    const store = tx.objectStore(STORE_NAME)
    const request = store.delete(username)
    
    request.onerror = () => reject(request.error)
    request.onsuccess = () => resolve()
  })
}

export async function initializeDefaultModels(): Promise<void> {
  const existing = await loadNetworkModels()
  if (existing.length > 0) return // Already initialized
  
  // Fetch models dynamically from OF API
  try {
    const res = await fetch('/api/sync-accounts', { cache: 'no-store' })
    if (!res.ok) throw new Error(`Sync API ${res.status}`)
    const { accounts } = await res.json()
    
    for (const acct of accounts) {
      await saveNetworkModel({
        username: acct.username,
        displayName: acct.displayName,
        accountId: acct.id,
        inRotation: true,
        addedAt: new Date().toISOString(),
      })
    }
  } catch (e) {
    console.error('Failed to initialize models from API:', e)
  }
}
