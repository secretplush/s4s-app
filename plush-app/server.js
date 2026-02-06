const http = require('http');
const fs = require('fs');
const path = require('path');

// Load environment
require('dotenv').config({ path: path.join(__dirname, '.env') });

const API_KEY = process.env.ONLYFANS_API_KEY;
const API_BASE = 'https://app.onlyfansapi.com/api';

// State
let config = JSON.parse(fs.readFileSync(path.join(__dirname, 'config.json'), 'utf8'));
let state = {
  running: false,
  currentPair: null,
  pendingDeletes: [],
  activityLog: [],
  stats: { postsCreated: 0, postsDeleted: 0, errors: 0 },
  rotationIndex: 0,  // Track position in rotation
  pairRotation: []   // Ordered list of pairs to cycle through
};

// Build rotation order - each girl takes turns posting, tagging the next girl in sequence
function buildRotation() {
  const models = config.models.filter(m => Object.keys(m.promoFolders).length > 0);
  state.pairRotation = [];
  
  if (models.length < 2) return;
  
  // Each model posts in order, tagging the next model (wrapping around)
  // This creates a round-robin: A→B, B→C, C→D, D→E, E→A, A→C, B→D, etc.
  const numModels = models.length;
  
  // Create offset-based rotation for variety
  for (let offset = 1; offset < numModels; offset++) {
    for (let i = 0; i < numModels; i++) {
      const poster = models[i];
      const targetIdx = (i + offset) % numModels;
      const target = models[targetIdx];
      
      if (poster.promoFolders[target.name]) {
        state.pairRotation.push({ poster, target, folderId: poster.promoFolders[target.name] });
      }
    }
  }
  
  log(`Built rotation with ${state.pairRotation.length} pairs`);
}

// Calculate delay based on number of models (target: ~60 min full cycle)
function getDelayMs() {
  const models = config.models.filter(m => Object.keys(m.promoFolders).length > 0);
  const numModels = Math.max(models.length, 1);
  
  // Base delay: 60 minutes / number of models
  const baseDelayMs = (60 * 60 * 1000) / numModels;
  
  // Add random jitter: 30-55 seconds
  const jitterMs = (30 + Math.random() * 25) * 1000;
  
  return baseDelayMs + jitterMs;
}

// Logging
function log(message, type = 'info') {
  const entry = { time: new Date().toISOString(), type, message };
  state.activityLog.unshift(entry);
  if (state.activityLog.length > 100) state.activityLog.pop();
  console.log(`[${type.toUpperCase()}] ${message}`);
}

// API Helper
async function apiCall(method, endpoint, body = null) {
  const url = `${API_BASE}${endpoint}`;
  const options = {
    method,
    headers: {
      'Authorization': `Bearer ${API_KEY}`,
      'Content-Type': 'application/json'
    }
  };
  
  return new Promise((resolve, reject) => {
    const req = require('https').request(url, options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          resolve(JSON.parse(data));
        } catch (e) {
          resolve({ error: data });
        }
      });
    });
    req.on('error', reject);
    if (body) req.write(JSON.stringify(body));
    req.end();
  });
}

// Get vault media from a list
async function getVaultMedia(accountId, listId) {
  const result = await apiCall('GET', `/${accountId}/media/vault?list=${listId}&limit=24`);
  return result.data?.list || [];
}

// Get all vault lists for an account
async function getVaultLists(accountId) {
  const result = await apiCall('GET', `/${accountId}/media/vault/lists`);
  return result.data?.list || [];
}

// Create a post with media
async function createPost(accountId, text, mediaId) {
  const result = await apiCall('POST', `/${accountId}/posts`, {
    text,
    mediaFiles: [mediaId.toString()]
  });
  return result.data;
}

// Delete a post
async function deletePost(accountId, postId) {
  const result = await apiCall('DELETE', `/${accountId}/posts/${postId}`);
  return result.data?.success || false;
}

// Pick a random caption
function getCaption(targetUsername) {
  const templates = config.settings.captionTemplates;
  const template = templates[Math.floor(Math.random() * templates.length)];
  return template.replace('{target}', targetUsername);
}

// Main tagging loop
let loopTimeout = null;

async function runTaggingCycle() {
  if (!state.running) return;
  
  // Build rotation if needed
  if (state.pairRotation.length === 0) {
    buildRotation();
  }
  
  if (state.pairRotation.length === 0) {
    log('No promo folders configured yet. Waiting...', 'warn');
    scheduleNextCycle();
    return;
  }
  
  // Get next pair in rotation
  const pair = state.pairRotation[state.rotationIndex];
  state.rotationIndex = (state.rotationIndex + 1) % state.pairRotation.length;
  state.currentPair = `${pair.poster.name} → @${pair.target.name}`;
  
  try {
    // Get media from the promo folder
    const media = await getVaultMedia(pair.poster.accountId, pair.folderId);
    if (media.length === 0) {
      log(`No media in ${pair.poster.name}'s folder for ${pair.target.name}`, 'warn');
      return;
    }
    
    // Pick media with rotation (track last used per folder)
    if (!state.mediaRotation) state.mediaRotation = {};
    const folderKey = `${pair.poster.name}_${pair.target.name}`;
    const lastIndex = state.mediaRotation[folderKey] || 0;
    const nextIndex = (lastIndex + 1) % media.length;
    state.mediaRotation[folderKey] = nextIndex;
    const selectedMedia = media[nextIndex];
    const caption = getCaption(pair.target.name);
    
    // Create post
    log(`Posting: ${pair.poster.name} tagging @${pair.target.name}`);
    const post = await createPost(pair.poster.accountId, caption, selectedMedia.id);
    
    if (post?.id) {
      state.stats.postsCreated++;
      log(`✅ Post created: ${post.id} on ${pair.poster.name}`);
      
      // Schedule deletion
      const deleteAt = Date.now() + (config.settings.postDurationMinutes * 60 * 1000);
      state.pendingDeletes.push({
        postId: post.id,
        accountId: pair.poster.accountId,
        posterName: pair.poster.name,
        deleteAt
      });
    } else {
      log(`❌ Failed to create post: ${JSON.stringify(post)}`, 'error');
      state.stats.errors++;
    }
  } catch (err) {
    log(`❌ Error: ${err.message}`, 'error');
    state.stats.errors++;
  }
  
  // Schedule next cycle
  scheduleNextCycle();
}

// Process pending deletes
async function processPendingDeletes() {
  const now = Date.now();
  const toDelete = state.pendingDeletes.filter(p => p.deleteAt <= now);
  
  for (const item of toDelete) {
    try {
      const success = await deletePost(item.accountId, item.postId);
      if (success) {
        state.stats.postsDeleted++;
        log(`🗑️ Deleted post ${item.postId} from ${item.posterName}`);
      }
    } catch (err) {
      log(`❌ Failed to delete ${item.postId}: ${err.message}`, 'error');
    }
  }
  
  state.pendingDeletes = state.pendingDeletes.filter(p => p.deleteAt > now);
}

// Schedule next cycle with dynamic delay
function scheduleNextCycle() {
  if (!state.running) return;
  
  const delayMs = getDelayMs();
  const delayMin = (delayMs / 1000 / 60).toFixed(1);
  log(`Next post in ${delayMin} minutes`);
  
  loopTimeout = setTimeout(() => {
    runTaggingCycle();
    processPendingDeletes();
  }, delayMs);
}

// Start/stop automation
function startAutomation() {
  if (state.running) return;
  state.running = true;
  state.rotationIndex = 0;
  buildRotation();
  
  const models = config.models.filter(m => Object.keys(m.promoFolders).length > 0);
  const delayMin = (60 / Math.max(models.length, 1)).toFixed(1);
  log(`🚀 Automation STARTED - ${models.length} models, ~${delayMin} min between posts`);
  
  // Run immediately, then schedule next
  runTaggingCycle();
}

function stopAutomation() {
  state.running = false;
  if (loopTimeout) clearTimeout(loopTimeout);
  log('⏹️ Automation STOPPED');
}

// HTTP Server
const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  
  // CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  
  if (req.method === 'OPTIONS') {
    res.writeHead(200);
    res.end();
    return;
  }
  
  // Routes
  if (url.pathname === '/' || url.pathname === '/dashboard') {
    res.writeHead(200, { 'Content-Type': 'text/html' });
    res.end(fs.readFileSync(path.join(__dirname, 'dashboard.html'), 'utf8'));
    return;
  }
  
  if (url.pathname === '/api/status') {
    const activeModels = config.models.filter(m => Object.keys(m.promoFolders).length > 0);
    const delayMin = activeModels.length > 0 ? (60 / activeModels.length).toFixed(1) : 'N/A';
    
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      running: state.running,
      currentPair: state.currentPair,
      pendingDeletes: state.pendingDeletes.length,
      stats: state.stats,
      activityLog: state.activityLog.slice(0, 20),
      models: config.models.map(m => ({
        name: m.name,
        displayName: m.displayName,
        foldersConfigured: Object.keys(m.promoFolders).length
      })),
      activeModels: activeModels.length,
      calculatedDelayMin: delayMin,
      totalPairs: state.pairRotation.length,
      rotationIndex: state.rotationIndex
    }));
    return;
  }
  
  if (url.pathname === '/api/start' && req.method === 'POST') {
    startAutomation();
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ success: true }));
    return;
  }
  
  if (url.pathname === '/api/stop' && req.method === 'POST') {
    stopAutomation();
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ success: true }));
    return;
  }
  
  if (url.pathname === '/api/config') {
    if (req.method === 'GET') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(config));
      return;
    }
    if (req.method === 'POST') {
      let body = '';
      req.on('data', chunk => body += chunk);
      req.on('end', () => {
        config = JSON.parse(body);
        fs.writeFileSync(path.join(__dirname, 'config.json'), JSON.stringify(config, null, 2));
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true }));
      });
      return;
    }
  }
  
  if (url.pathname === '/api/vault-lists') {
    const accountId = url.searchParams.get('account');
    if (!accountId) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Missing account parameter' }));
      return;
    }
    const lists = await getVaultLists(accountId);
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(lists));
    return;
  }
  
  if (url.pathname === '/api/test-post' && req.method === 'POST') {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', async () => {
      try {
        const { posterAccount, targetUsername, folderId } = JSON.parse(body);
        
        // Get media
        const media = await getVaultMedia(posterAccount, folderId);
        if (media.length === 0) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'No media in folder' }));
          return;
        }
        
        // Create post
        const caption = getCaption(targetUsername);
        const post = await createPost(posterAccount, caption, media[0].id);
        
        if (post?.id) {
          // Schedule delete in 5 min
          setTimeout(async () => {
            await deletePost(posterAccount, post.id);
            log(`🗑️ Test post ${post.id} deleted`);
          }, 5 * 60 * 1000);
          
          log(`✅ Test post created: ${post.id}, will delete in 5 min`);
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: true, postId: post.id }));
        } else {
          res.writeHead(500, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Failed to create post', details: post }));
        }
      } catch (err) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: err.message }));
      }
    });
    return;
  }
  
  res.writeHead(404);
  res.end('Not found');
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`
╔════════════════════════════════════════════╗
║     🔥 PLUSH TAGGING DASHBOARD 🔥          ║
║                                            ║
║     http://localhost:${PORT}                  ║
║                                            ║
║     5 Models Connected                     ║
║     Ready to automate!                     ║
╚════════════════════════════════════════════╝
  `);
});

// Check for pending deletes every 30 seconds
setInterval(processPendingDeletes, 30000);
