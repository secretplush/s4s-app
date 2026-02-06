#!/usr/bin/env node
/**
 * Tagging Test Script
 * Posts on jackiesmithh's OF with @zoeemonroe tag
 * Runs: post → 5min → delete → 5min → post again → 5min → delete
 */

const fs = require('fs');
const path = require('path');

const API_KEY = 'ofapi_Sd9Csh1I1W2zaBnoTJKf49kZQ0rFmBK0yvQt225ze7b5501f';
const BASE_URL = 'https://app.onlyfansapi.com/api';
const JACKIE_ACCOUNT_ID = 'acct_5802030761bb4184a4347e90ce55db40';

const IMAGE_PATH = '/Users/moltplush/.openclaw/media/inbound/file_1---653d37f8-7546-4fb6-b0ab-cd47c509926f.jpg';
const CAPTION = 'my friend @zoeemonroe just started OF and is ready to show you everything 😈';

async function sleep(ms) {
  console.log(`⏳ Waiting ${ms/1000/60} minutes...`);
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function uploadMedia(imagePath) {
  console.log('📤 Uploading image to OnlyFans CDN...');
  
  const FormData = (await import('form-data')).default;
  const form = new FormData();
  form.append('file', fs.createReadStream(imagePath));
  
  const response = await fetch(`${BASE_URL}/${JACKIE_ACCOUNT_ID}/media/upload`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${API_KEY}`,
      ...form.getHeaders()
    },
    body: form
  });
  
  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Upload failed: ${response.status} - ${text}`);
  }
  
  const data = await response.json();
  console.log('✅ Upload complete:', data);
  return data;
}

async function createPost(mediaId = null) {
  console.log('📝 Creating post...');
  
  const body = {
    text: CAPTION
  };
  
  if (mediaId) {
    body.mediaFiles = [mediaId];
  }
  
  const response = await fetch(`${BASE_URL}/${JACKIE_ACCOUNT_ID}/posts`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${API_KEY}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(body)
  });
  
  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Post failed: ${response.status} - ${text}`);
  }
  
  const data = await response.json();
  console.log('✅ Post created:', data);
  return data;
}

async function deletePost(postId) {
  console.log(`🗑️ Deleting post ${postId}...`);
  
  const response = await fetch(`${BASE_URL}/${JACKIE_ACCOUNT_ID}/posts/${postId}`, {
    method: 'DELETE',
    headers: {
      'Authorization': `Bearer ${API_KEY}`
    }
  });
  
  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Delete failed: ${response.status} - ${text}`);
  }
  
  console.log('✅ Post deleted');
  return true;
}

async function main() {
  console.log('🚀 Starting tagging test...\n');
  console.log(`Account: jackiesmithh (${JACKIE_ACCOUNT_ID})`);
  console.log(`Caption: ${CAPTION}\n`);
  
  try {
    // Step 1: Upload media
    const uploadResult = await uploadMedia(IMAGE_PATH);
    const mediaId = uploadResult.id || uploadResult.mediaId || uploadResult;
    
    // Step 2: Create first post
    console.log('\n=== ROUND 1 ===');
    const post1 = await createPost(mediaId);
    const postId1 = post1.id || post1.postId;
    
    // Wait 5 minutes
    await sleep(5 * 60 * 1000);
    
    // Delete first post
    await deletePost(postId1);
    
    // Wait 5 minutes
    await sleep(5 * 60 * 1000);
    
    // Step 3: Create second post
    console.log('\n=== ROUND 2 ===');
    const post2 = await createPost(mediaId);
    const postId2 = post2.id || post2.postId;
    
    // Wait 5 minutes
    await sleep(5 * 60 * 1000);
    
    // Delete second post
    await deletePost(postId2);
    
    console.log('\n✅ Test complete!');
    
  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  }
}

main();
