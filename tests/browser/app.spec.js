import { test, expect } from '@playwright/test';
async function demo(page) { await page.goto('/'); await page.locator('#demo').click(); await expect(page.locator('#run')).toBeEnabled(); await expect(page.locator('#queue li')).toHaveCount(3); }
async function run(page) { await page.locator('#run').click(); await expect(page.locator('#status')).toContainText('Finished', { timeout:60000 }); }
async function downloadBytes(page, selector) { const [download] = await Promise.all([page.waitForEvent('download'), page.locator(selector).click()]); const stream = await download.createReadStream(); const chunks=[]; for await(const chunk of stream)chunks.push(chunk); return Buffer.concat(chunks); }
function zipEntries(buffer) { const entries=[]; let pos=0; while(buffer.readUInt32LE(pos)===0x04034b50){ const size=buffer.readUInt32LE(pos+18), n=buffer.readUInt16LE(pos+26), extra=buffer.readUInt16LE(pos+28); const start=pos+30+n+extra; entries.push({name:buffer.subarray(pos+30,pos+30+n).toString('utf8'),data:buffer.subarray(start,start+size)});pos=start+size; } return entries; }
async function jpeg(page, width=120,height=80,orientation=1) {
  const data = await page.evaluate(async({width,height,orientation})=>{
    const c=document.createElement('canvas');c.width=width;c.height=height;const ctx=c.getContext('2d');
    ctx.fillStyle='#ff0000';ctx.fillRect(0,0,width/2,height/2);ctx.fillStyle='#00ff00';ctx.fillRect(width/2,0,width/2,height/2);
    ctx.fillStyle='#0000ff';ctx.fillRect(0,height/2,width/2,height/2);ctx.fillStyle='#ffff00';ctx.fillRect(width/2,height/2,width/2,height/2);
    const blob=await new Promise(r=>c.toBlob(r,'image/jpeg',1)); const bytes=new Uint8Array(await blob.arrayBuffer());
    const exif=new Uint8Array(36),v=new DataView(exif.buffer);exif.set([255,225,0,34,69,120,105,102,0,0,73,73]);v.setUint16(12,42,true);v.setUint32(14,8,true);v.setUint16(18,1,true);v.setUint16(20,0x112,true);v.setUint16(22,3,true);v.setUint32(24,1,true);v.setUint16(28,orientation,true);
    return [...bytes.slice(0,2),...exif,...bytes.slice(2)];
  },{width,height,orientation});return Buffer.from(data);
}
async function permissive(page) { await page.locator('#min-width').fill('1');await page.locator('#min-height').fill('1'); }
test('demo exports exact constraints; skips impossible dimensions; preview and ZIP report agree',async({page})=>{
  const errors=[];page.on('pageerror',e=>errors.push(e.message));await demo(page);await run(page);
  await expect(page.locator('[data-status=passed]')).toHaveCount(1);await expect(page.locator('[data-status=failed]')).toHaveCount(2);
  await expect(page.locator('.result-card').filter({hasText:'too-small.jpg'})).toContainText('Source is below');
  await page.getByRole('button',{name:'Compare',exact:true}).click();await expect(page.locator('#preview')).toBeVisible();await expect(page.locator('#after-image')).toBeVisible();await page.keyboard.press('Escape');await expect(page.locator('#preview')).not.toBeVisible();
  const entries=zipEntries(await downloadBytes(page,'#zip'));expect(entries.map(e=>e.name)).toEqual(['studio-study.jpg','report.json']);
  const report=JSON.parse(entries.at(-1).data);expect(report.files).toHaveLength(3);expect(report.files[0].output.bytes).toBe(entries[0].data.length);expect(entries[0].data.length).toBeLessThanOrEqual(300000);expect(report.files[0].output.width).toBeGreaterThanOrEqual(800);expect(report.files[0].output.height).toBeGreaterThanOrEqual(600);expect(report.files[2].reason).toBe('sourceSmall');expect(errors).toEqual([]);
  for (const entry of entries.filter(e=>e.name.endsWith('.jpg'))) {
    const decoded = await page.evaluate(async data=>{const bitmap=await createImageBitmap(new Blob([new Uint8Array(data)],{type:'image/jpeg'}));const result={width:bitmap.width,height:bitmap.height};bitmap.close();return result;}, [...entry.data]);
    const recorded=report.files.find(f=>f.output?.name===entry.name).output;
    expect(decoded).toEqual({width:recorded.width,height:recorded.height});expect(entry.data.length).toBe(recorded.bytes);expect(recorded.bytes).toBeLessThanOrEqual(report.settings.maxBytes);
  }
  await page.screenshot({path:test.info().outputPath('demo-results.png'),fullPage:true});
});
test('no hidden downscale; a tiny byte budget fails and report has attempted qualities',async({page})=>{
  await demo(page);await page.locator('#amount').fill('0.001');await run(page);await expect(page.locator('[data-status=passed]')).toHaveCount(0);await expect(page.locator('#zip')).toBeDisabled();const report=JSON.parse(await downloadBytes(page,'#report'));expect(report.files[0].reason).toBe('noFit');expect(report.files[0].attempts.at(-1).quality).toBe(.5);expect(report.files[0].output).toBeNull();
});
test('all eight EXIF orientations transform pixels once and remove original metadata',async({page})=>{
  const expectedTopLeft = {1:[255,0,0],2:[0,255,0],3:[255,255,0],4:[0,0,255],5:[255,0,0],6:[0,0,255],7:[255,255,0],8:[0,255,0]};
  await page.goto('/');await permissive(page);
  for(let orientation=1;orientation<=8;orientation++) {
    const buffer=await jpeg(page,120,80,orientation);await page.locator('#file-input').setInputFiles({name:`orientation-${orientation}.jpg`,mimeType:'image/jpeg',buffer});await run(page);
    const output=await downloadBytes(page,'.card-actions button:last-child');expect(output.includes(Buffer.from('Exif\0\0'))).toBe(false);
    const result=await page.evaluate(async data=>{const image=await createImageBitmap(new Blob([new Uint8Array(data)],{type:'image/jpeg'}));const c=document.createElement('canvas');c.width=image.width;c.height=image.height;const ctx=c.getContext('2d');ctx.drawImage(image,0,0);const pixel=[...ctx.getImageData(10,10,1,1).data].slice(0,3);const size=[image.width,image.height];image.close();return {pixel,size};},[...output]);
    expect(result.size).toEqual(orientation>=5?[80,120]:[120,80]);for(let channel=0;channel<3;channel++)expect(Math.abs(result.pixel[channel]-expectedTopLeft[orientation][channel])).toBeLessThan(30);
  }
});
test('duplicate and unsafe filenames remain plain text and ZIP names unique',async({page})=>{
  await page.goto('/');await permissive(page);const buffer=await jpeg(page);
  await page.locator('#file-input').setInputFiles([{name:'same.jpg',mimeType:'image/jpeg',buffer},{name:'SAME.JPG',mimeType:'image/jpeg',buffer},{name:'<svg onload=alert(1)>.jpg',mimeType:'image/jpeg',buffer}]);await run(page);
  const entries=zipEntries(await downloadBytes(page,'#zip'));expect(new Set(entries.map(e=>e.name.toLowerCase())).size).toBe(4);expect(entries[1].name).toBe('SAME-2.jpg');expect(entries[2].name).not.toContain('<');expect(await page.locator('.result-card svg').count()).toBe(0);
});
test('cancel drains current work; repeated submit and next job cannot revive stale output',async({page})=>{
  await demo(page);await page.evaluate(()=>{const original=HTMLCanvasElement.prototype.toBlob;HTMLCanvasElement.prototype.toBlob=function(...args){setTimeout(()=>original.apply(this,args),80);};document.querySelector('#settings-form').requestSubmit();document.querySelector('#settings-form').requestSubmit();});
  await expect(page.locator('[data-status=processing]')).toHaveCount(1);await page.locator('#cancel').click();await expect(page.locator('#status')).toContainText('Cancelled batch');await expect(page.locator('#run')).toBeEnabled();
  await page.locator('#clear').click();await expect(page.locator('#results-section')).toBeHidden();await page.locator('#demo').click();await expect(page.locator('#run')).toBeEnabled();await run(page);await expect(page.locator('.result-card')).toHaveCount(3);await expect(page.locator('[data-status=passed]')).toHaveCount(1);
});
test('source resource cap rejects before pixel decode',async({page})=>{
  await page.goto('/');const buffer=await jpeg(page);let pos=2;while(pos<buffer.length){const marker=buffer[pos+1],len=buffer.readUInt16BE(pos+2);if([0xc0,0xc1,0xc2].includes(marker)){buffer.writeUInt16BE(8000,pos+5);buffer.writeUInt16BE(8000,pos+7);break;}pos+=2+len;}
  await page.evaluate(()=>{window.decodeCount=0;const original=window.createImageBitmap;window.createImageBitmap=(...args)=>{window.decodeCount++;return original(...args);};});
  await page.locator('#file-input').setInputFiles({name:'oversized.jpg',mimeType:'image/jpeg',buffer});await run(page);await expect(page.locator('.reason')).toContainText('16-megapixel');expect(await page.evaluate(()=>window.decodeCount)).toBe(0);
});
test('non-JPEG content is rejected even with a JPEG extension',async({page})=>{await page.goto('/');await page.locator('#file-input').setInputFiles({name:'pretend.jpg',mimeType:'image/jpeg',buffer:Buffer.from('not an image')});await run(page);await expect(page.locator('[data-status=rejected]')).toHaveCount(1);});
test('Chinese labels, target dimension conflict, keyboard focus and mobile layout',async({page})=>{
  await page.setViewportSize({width:390,height:844});await demo(page);await page.locator('#target-width').fill('600');await run(page);await expect(page.locator('.result-card').first()).toContainText('would violate');await page.locator('#language').click();await expect(page.locator('html')).toHaveAttribute('lang','zh-CN');await expect(page.locator('#run')).toHaveText('检查并导出');expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);await page.screenshot({path:test.info().outputPath('mobile-chinese.png'),fullPage:true});
});
test('no external requests while running the demo',async({page})=>{const requests=[];page.on('request',request=>{if(!request.url().startsWith('http://127.0.0.1:4173')&&!request.url().startsWith('blob:')&&!request.url().startsWith('data:'))requests.push(request.url());});await demo(page);await run(page);expect(requests).toEqual([]);});

test('minimum dimensions are evaluated after EXIF orientation',async({page})=>{
  await page.goto('/');await page.locator('#min-width').fill('100');await page.locator('#min-height').fill('80');
  const buffer=await jpeg(page,120,80,6);await page.locator('#file-input').setInputFiles({name:'rotated-too-narrow.jpg',mimeType:'image/jpeg',buffer});await run(page);
  await expect(page.locator('.result-card')).toContainText('80 × 120 px');await expect(page.locator('.reason')).toContainText('Source is below');await expect(page.locator('#zip')).toBeDisabled();
  const report=JSON.parse(await downloadBytes(page,'#report'));expect(report.files[0].sourceDimensions).toEqual({width:80,height:120});expect(report.files[0].reason).toBe('sourceSmall');expect(report.files[0].output).toBeNull();
});
