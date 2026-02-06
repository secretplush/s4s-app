#!/usr/bin/env node
/**
 * Plush Tagging - Folder Setup Helper
 * 
 * This script scans vault lists for all connected accounts
 * and helps configure which folders contain promo pics.
 * 
 * Run: node setup-folders.js
 */

const fs = require('fs');
const path = require('path');
const readline = require('readline');

require('dotenv').config({ path: path.join(__dirname, '.env') });

const API_KEY = process.env.ONLYFANS_API_KEY;
const API_BASE = 'https://app.onlyfansapi.com/api';

const config = JSON.parse(fs.readFileSync(path.join(__dirname, 'config.json'), 'utf8'));

async function apiCall(method, endpoint) {
  const url = `${API_BASE}${endpoint}`;
  
  return new Promise((resolve, reject) => {
    const req = require('https').request(url, {
      method,
      headers: {
        'Authorization': `Bearer ${API_KEY}`,
        'Content-Type': 'application/json'
      }
    }, (res) => {
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
    req.end();
  });
}

async function getVaultLists(accountId) {
  const result = await apiCall('GET', `/${accountId}/media/vault/lists`);
  return result.data?.list || [];
}

async function scanAllAccounts() {
  console.log('\n🔍 Scanning vault lists for all accounts...\n');
  
  for (const model of config.models) {
    console.log(`\n📁 ${model.displayName} (@${model.name})`);
    console.log('─'.repeat(50));
    
    const lists = await getVaultLists(model.accountId);
    
    if (lists.length === 0) {
      console.log('  No custom lists found');
      continue;
    }
    
    // Filter to custom lists only
    const customLists = lists.filter(l => l.type === 'custom');
    
    for (const list of customLists) {
      console.log(`  [${list.id}] ${list.name}`);
    }
    
    // Check for promo-like folders
    const promoFolders = customLists.filter(l => 
      l.name.toLowerCase().includes('promo') ||
      l.name.toLowerCase().includes('sfs') ||
      l.name.toLowerCase().includes('tag')
    );
    
    if (promoFolders.length > 0) {
      console.log('\n  🎯 Potential promo folders:');
      promoFolders.forEach(f => console.log(`     → ${f.name} (ID: ${f.id})`));
    }
  }
  
  console.log('\n\n📋 FOLDER NAMING CONVENTION FOR MANAGERS:');
  console.log('═'.repeat(50));
  console.log('Create folders in each account\'s vault named:');
  console.log('');
  for (const model of config.models) {
    console.log(`  "Promo - ${model.name}"`);
  }
  console.log('');
  console.log('Each folder should contain 5-10 pics of that model.');
  console.log('');
  console.log('Example for @jackiesmithh\'s vault:');
  console.log('  📁 Promo - zoeemonroe     (pics of Zoe)');
  console.log('  📁 Promo - biancaawoods   (pics of Bianca)');
  console.log('  📁 Promo - maddieharperr  (pics of Maddie)');
  console.log('  📁 Promo - aviannaarose   (pics of Avianna)');
}

async function autoConfigureFolders() {
  console.log('\n🔄 Auto-configuring promo folders...\n');
  
  let configured = 0;
  
  for (const model of config.models) {
    const lists = await getVaultLists(model.accountId);
    const customLists = lists.filter(l => l.type === 'custom');
    
    model.promoFolders = {};
    
    for (const otherModel of config.models) {
      if (otherModel.name === model.name) continue;
      
      // Look for folder matching "Promo - {name}" pattern
      const promoFolder = customLists.find(l => 
        l.name.toLowerCase().includes(`promo - ${otherModel.name}`.toLowerCase()) ||
        l.name.toLowerCase().includes(`promo-${otherModel.name}`.toLowerCase()) ||
        l.name.toLowerCase() === otherModel.name.toLowerCase()
      );
      
      if (promoFolder) {
        model.promoFolders[otherModel.name] = promoFolder.id;
        console.log(`  ✅ ${model.name} → ${otherModel.name}: folder "${promoFolder.name}" (ID: ${promoFolder.id})`);
        configured++;
      }
    }
  }
  
  // Save config
  fs.writeFileSync(path.join(__dirname, 'config.json'), JSON.stringify(config, null, 2));
  
  console.log(`\n✅ Configured ${configured} folder mappings`);
  console.log('📝 Saved to config.json');
}

// Main
async function main() {
  const args = process.argv.slice(2);
  
  if (args.includes('--scan')) {
    await scanAllAccounts();
  } else if (args.includes('--auto')) {
    await autoConfigureFolders();
  } else {
    console.log(`
╔════════════════════════════════════════════╗
║     🔧 PLUSH FOLDER SETUP HELPER           ║
╚════════════════════════════════════════════╝

Usage:
  node setup-folders.js --scan   Show all vault lists
  node setup-folders.js --auto   Auto-configure promo folders

Run --scan first to see current folders, then have managers
create the promo folders, then run --auto to configure.
    `);
    
    // Default: scan
    await scanAllAccounts();
  }
}

main().catch(console.error);
