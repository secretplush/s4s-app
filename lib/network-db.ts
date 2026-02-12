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
  
  // Default models from the hardcoded list
  const defaults: NetworkModel[] = [
    { username: 'milliexhart', displayName: 'Millie Hart', accountId: 'acct_ebca85077e0a4b7da04cf14176466411', inRotation: true, addedAt: new Date().toISOString() },
    { username: 'zoepriceee', displayName: 'Zoe Price', accountId: 'acct_f05bf7874c974a5d875a1ef01c5bbc3b', inRotation: true, addedAt: new Date().toISOString() },
    { username: 'novaleighh', displayName: 'Nova Leigh', accountId: 'acct_9ee32f0bac4e4e8394a09f2c9fa2fbb7', inRotation: true, addedAt: new Date().toISOString() },
    { username: 'lucymonroee', displayName: 'Lucy Monroe', accountId: 'acct_0653d6e6c3984bea8d3adc84cc616c7c', inRotation: true, addedAt: new Date().toISOString() },
    { username: 'chloecookk', displayName: 'Chloe Cook', accountId: 'acct_6bb6d77ac2c741ecb54d865237bb04f4', inRotation: true, addedAt: new Date().toISOString() },
    { username: 'jackiesmithh', displayName: 'Jackie Smith', accountId: 'acct_bd6a75d6943141589cf5e43586653258', inRotation: true, addedAt: new Date().toISOString() },
    { username: 'brookeewest', displayName: 'Brooke West', accountId: 'acct_749c75e13d7e4685813f2a2867ce614d', inRotation: true, addedAt: new Date().toISOString() },
    { username: 'ayaaann', displayName: 'Aya', accountId: 'acct_b0b0698a614643c5932cfccd23f7c430', inRotation: true, addedAt: new Date().toISOString() },
    { username: 'chloeecavalli', displayName: 'Chloe Cavalli', accountId: 'acct_b5e739f9f40a4da99b2f5ca559168012', inRotation: true, addedAt: new Date().toISOString() },
    { username: 'sadieeblake', displayName: 'Sadie Blake', accountId: 'acct_cfb853d0ba714aeaa9a89e3026ec6190', inRotation: true, addedAt: new Date().toISOString() },
    { username: 'lolasinclairr', displayName: 'Lola Sinclair', accountId: 'acct_bde8d615937548f18c4e54b7cedf8c1d', inRotation: true, addedAt: new Date().toISOString() },
    { username: 'maddieharperr', displayName: 'Maddie Harper', accountId: 'acct_a50799a789a6422c8389d7d055fcbd1a', inRotation: true, addedAt: new Date().toISOString() },
    { username: 'zoeemonroe', displayName: 'Zoe Monroe', accountId: 'acct_fbd172e2681f4dfbb6026ce806ecaa28', inRotation: true, addedAt: new Date().toISOString() },
    { username: 'biancaawoods', displayName: 'Bianca Woods', accountId: 'acct_54e3119e77da4429b6537f7dd2883a05', inRotation: true, addedAt: new Date().toISOString() },
    { username: 'aviannaarose', displayName: 'Avianna Rose', accountId: 'acct_2648cedf59644b0993ade9608bd868a1', inRotation: true, addedAt: new Date().toISOString() },
  ]
  
  for (const model of defaults) {
    await saveNetworkModel(model)
  }
}
