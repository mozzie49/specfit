import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
test('runtime has no remote assets, network APIs, accounts or persistence',async()=>{
 const html=await readFile('index.html','utf8'); assert.ok(html.includes("connect-src 'none'")); assert.ok(!/(?:src|href)="https?:\/\//.test(html));
 for(const file of (await readdir('src')).filter(f=>f.endsWith('.js'))){ const code=await readFile(`src/${file}`,'utf8'); assert.ok(!/\b(fetch|XMLHttpRequest|WebSocket|sendBeacon|localStorage|indexedDB)\s*[.(]/.test(code),file); }
});
test('language dictionaries cover all UI labels and errors',async()=>{ const {en,zh}=await import('../src/i18n.js'); assert.deepEqual(Object.keys(en).sort(),Object.keys(zh).sort()); assert.deepEqual(Object.keys(en.errors).sort(),Object.keys(zh.errors).sort()); const html=await readFile('index.html','utf8'); for(const [,key] of html.matchAll(/data-i18n="([^"]+)"/g))assert.ok(en[key] && zh[key],key); });
