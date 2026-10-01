import test from 'node:test';
import assert from 'node:assert/strict';
import { crc32, makeZip } from '../src/zip.js';
const text=new TextEncoder();
test('CRC32 standard check vector',()=>assert.equal(crc32(text.encode('123456789')),0xcbf43926));
test('ZIP entries have correct UTF8 names, offsets, CRC, lengths and directory',async()=>{
  const entries=[{name:'中文.jpg',blob:new Blob(['jpeg'])},{name:'report.json',blob:new Blob(['{}'])}];
  const data=new Uint8Array(await (await makeZip(entries)).arrayBuffer()), v=new DataView(data.buffer); let offset=0;
  for(const entry of entries){ assert.equal(v.getUint32(offset,true),0x04034b50); assert.equal(v.getUint16(offset+6,true),0x800); const length=v.getUint32(offset+18,true),names=v.getUint16(offset+26,true); assert.equal(new TextDecoder().decode(data.slice(offset+30,offset+30+names)),entry.name); assert.equal(length,entry.blob.size); assert.equal(v.getUint32(offset+14,true),crc32(data.slice(offset+30+names,offset+30+names+length))); offset+=30+names+length; }
  assert.equal(v.getUint32(offset,true),0x02014b50); assert.equal(v.getUint32(data.length-22,true),0x06054b50); assert.equal(v.getUint16(data.length-12,true),2); assert.equal(v.getUint32(data.length-6,true),offset);
});
test('ZIP refuses path names and honours cancel during read',async()=>{ await assert.rejects(makeZip([{name:'../evil.jpg',blob:new Blob()}]),/Unsafe/); let checks=0; await assert.rejects(makeZip([{name:'ok.jpg',blob:new Blob()}],()=>{if(++checks===2)throw new Error('cancel');}),/cancel/); });
