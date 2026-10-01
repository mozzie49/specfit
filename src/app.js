import { LIMITS, SpecError, parseSettings, dimensions, findFittingEncode, safeName, checkFiles, inspectJpeg, decodeBlob, orientationMatrix, makeReport } from './core.js';
import { makeZip } from './zip.js';
import { en, zh } from './i18n.js';
const $ = id => document.getElementById(id);
let language = 'en', files = [], results = [], busy = false, active = null, serial = 0, settings = null, cancelled = false, errorCode = null, demoMessage = false;
const urls = new Set();
const t = key => (language === 'en' ? en : zh)[key];
const errorText = code => (language === 'en' ? en : zh).errors[code] || t('errors').unknown;
const bytes = n => `${n.toLocaleString(language === 'en' ? 'en-US' : 'zh-CN')} ${t('bytes')}`;
const tick = () => new Promise(resolve => setTimeout(resolve, 0));
function url(blob) { const value = URL.createObjectURL(blob); urls.add(value); return value; }
function cleanup() { for (const value of urls) URL.revokeObjectURL(value); urls.clear(); $('before-image').removeAttribute('src'); $('after-image').removeAttribute('src'); $('preview').close(); }
function showError(code) { errorCode = code; $('error').hidden = !code; $('error').textContent = code ? errorText(code) : ''; }
function updateSettingsHint() {
  const count = Math.floor(Number($('amount').value) * ($('unit').value === 'KiB' ? 1024 : 1000));
  $('byte-total').textContent = Number.isFinite(count) && count >= 1 ? `≤ ${bytes(count)}` : '—';
  $('amount').max = String(LIMITS.fileBytes / ($('unit').value === 'KiB' ? 1024 : 1000));
  $('floor-value').textContent = Number($('floor').value).toFixed(2);
}
function setBusy(value) {
  busy = value;
  document.querySelectorAll('#settings-form input,#settings-form select').forEach(el => el.disabled = value);
  $('file-input').disabled = value; $('demo').disabled = value; $('clear').disabled = value || !files.length;
  $('run').disabled = value || !files.length; $('cancel').hidden = !value; $('cancel').disabled = false;
  $('zip').disabled = value || !results.some(r => r.status === 'passed');
  $('report').disabled = value || !results.length;
  $('dropzone').setAttribute('aria-disabled', String(value));
  $('settings-form').setAttribute('aria-busy', String(value));
}
function renderSelection() {
  $('selection').textContent = files.length ? `${files.length} ${t('selected')} · ${bytes(files.reduce((n, f) => n + f.size, 0))}` : '';
  $('queue').replaceChildren(...files.map(file => { const row = document.createElement('li'); row.textContent = `${file.name} · ${bytes(file.size)}`; return row; }));
}
function element(tag, className, text) { const el = document.createElement(tag); if (className) el.className = className; if (text !== undefined) el.textContent = text; return el; }
function renderResults() {
  $('results-section').hidden = !results.length;
  $('result-spec').textContent = settings && results.length ? `${t('snapshot')}: ≤ ${bytes(settings.maxBytes)} · ≥ ${settings.minWidth} × ${settings.minHeight} px · ${t('quality')} ${settings.floor.toFixed(2)}${settings.targetWidth ? ` · ${t('target')} ${settings.targetWidth}` : ''}` : '';
  $('results-grid').replaceChildren(...results.map((result, index) => {
    const card = element('article', 'result-card'); card.dataset.status = result.status;
    card.append(element('span', `badge ${result.status}`, t(result.status)), element('h3', '', result.file.name));
    const stats = element('dl');
    stats.append(element('dt', '', t('input')), element('dd', '', `${bytes(result.file.size)}${result.info ? ` · ${result.info.width} × ${result.info.height} px` : ''}`));
    if (result.output) {
      stats.append(element('dt', '', t('output')), element('dd', 'output-stats', `${bytes(result.output.size)} · ${result.info.outputWidth} × ${result.info.outputHeight} px`));
      stats.append(element('dt', '', t('qualityLabel')), element('dd', '', `${result.quality.toFixed(2)} · ${result.attempts.length} ${t('tests')}`));
    }
    card.append(stats);
    if (result.code) card.append(element('p', 'reason', errorText(result.code)));
    if (result.status === 'failed' && result.attempts?.length) card.append(element('p', 'hint', `${result.attempts.length} ${t('tests')} · ${t('smallest')} ${bytes(Math.min(...result.attempts.map(a => a.bytes)))}`));
    if (result.output) {
      const actions = element('div', 'card-actions');
      const compare = element('button', 'secondary', t('preview')); compare.type = 'button'; compare.addEventListener('click', () => preview(index));
      const download = element('button', 'secondary', t('download')); download.type = 'button'; download.addEventListener('click', () => save(result.output, result.name));
      actions.append(compare, download); card.append(actions);
    }
    return card;
  }));
}
function status(text) { $('status').textContent = text; }
function completionStatus() { status(`${cancelled ? t('stopped') : t('finished')} · ${results.filter(r => r.status === 'passed').length} ${t('of')} ${results.length} ${t('passCount')}`); }
function localize() {
  document.documentElement.lang = language === 'en' ? 'en' : 'zh-CN';
  document.querySelectorAll('[data-i18n]').forEach(el => { el.textContent = t(el.dataset.i18n); });
  $('target-width').placeholder = t('original'); $('language').textContent = language === 'en' ? '中文' : 'English';
  $('language').setAttribute('aria-label', language === 'en' ? 'Switch to Chinese' : '切换为英文');
  $('unit').setAttribute('aria-label', language === 'en' ? 'Byte unit' : '字节单位');
  $('before-image').alt = t('before'); $('after-image').alt = t('after');
  updateSettingsHint(); renderSelection(); renderResults(); showError(errorCode);
  if (!busy && results.length) completionStatus();
  if (demoMessage && !results.length) $('selection').textContent += ` ${t('demoNote')}`;
}
function choose(next) {
  if (busy) return;
  cleanup(); serial++; active = null; results = []; settings = null; cancelled = false; demoMessage = false;
  try { checkFiles(next); files = next; showError(null); } catch (error) { files = []; showError(error.code || 'unknown'); }
  renderSelection(); renderResults(); setBusy(false);
}
function canvas(width, height) { const c = document.createElement('canvas'); c.width = width; c.height = height; return c; }
function encode(c, quality) { return new Promise((resolve, reject) => { try { c.toBlob(blob => blob ? resolve(blob) : reject(new SpecError('encode')), 'image/jpeg', quality); } catch { reject(new SpecError('encode')); } }); }
async function thumbnail(source) {
  const scale = Math.min(1, 640 / Math.max(source.width, source.height));
  const c = canvas(Math.max(1, Math.round(source.width * scale)), Math.max(1, Math.round(source.height * scale)));
  try { c.getContext('2d').drawImage(source, 0, 0, c.width, c.height); const blob = await encode(c, 0.7); if (blob.size > 1024 ** 2) throw new SpecError('encode'); return blob; }
  finally { c.width = c.height = 1; }
}
async function processFile(result, spec, check, retainedBytes) {
  let bitmap = null, oriented = null, target = null, outputBitmap = null;
  try {
    check();
    const info = result.info, out = dimensions(info.width, info.height, spec);
    const buffer = await result.file.arrayBuffer(); check();
    bitmap = await createImageBitmap(decodeBlob(buffer, info)); check();
    if (bitmap.width !== info.rawWidth || bitmap.height !== info.rawHeight) throw new SpecError('decode');
    oriented = canvas(info.width, info.height);
    const context = oriented.getContext('2d');
    if (!context) throw new SpecError('decode');
    context.setTransform(...orientationMatrix(info.orientation, info.rawWidth, info.rawHeight)); context.drawImage(bitmap, 0, 0); context.resetTransform();
    bitmap.close(); bitmap = null;
    const before = await thumbnail(oriented); check();
    if (out.width === info.width && out.height === info.height) target = oriented;
    else {
      target = canvas(out.width, out.height); const ctx = target.getContext('2d');
      ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = 'high'; ctx.drawImage(oriented, 0, 0, out.width, out.height);
      oriented.width = oriented.height = 1;
    }
    const fit = await findFittingEncode(quality => encode(target, quality), spec.maxBytes, spec.floor, check); check();
    result.attempts = fit.attempts;
    if (!fit.blob) throw new SpecError('noFit');
    if (retainedBytes + fit.blob.size > LIMITS.outputBytes) throw new SpecError('outputBudget');
    target.width = target.height = 1;
    outputBitmap = await createImageBitmap(fit.blob); check();
    if (outputBitmap.width !== out.width || outputBitmap.height !== out.height) throw new SpecError('encode');
    const after = await thumbnail(outputBitmap); check();
    Object.assign(result, { output: fit.blob, quality: fit.quality, before, after, status: 'passed' });
    info.outputWidth = out.width; info.outputHeight = out.height;
  } finally {
    bitmap?.close(); outputBitmap?.close();
    if (oriented) oriented.width = oriented.height = 1;
    if (target) target.width = target.height = 1;
  }
}
$('settings-form').addEventListener('submit', async event => {
  event.preventDefault(); if (busy) return;
  try { settings = parseSettings({ amount: $('amount').value, unit: $('unit').value, minWidth: $('min-width').value, minHeight: $('min-height').value, targetWidth: $('target-width').value, floor: $('floor').value }); checkFiles(files); }
  catch (error) { showError(error.code || 'settings'); return; }
  if (!globalThis.createImageBitmap) { showError('unsupported'); return; }
  cleanup(); showError(null); cancelled = false; demoMessage = false;
  const id = ++serial, controller = new AbortController(); active = controller;
  const check = () => { if (controller.signal.aborted || id !== serial) throw new DOMException('Cancelled', 'AbortError'); };
  const used = new Set(); results = files.map(file => ({ file, name: safeName(file.name, used), status: 'pending' }));
  setBusy(true); renderResults(); status(t('preparing'));
  try {
    let totalPixels = 0;
    for (const result of results) {
      check();
      try { const buffer = await result.file.arrayBuffer(); check(); result.info = inspectJpeg(buffer); totalPixels += result.info.width * result.info.height; }
      catch (error) { if (error.name === 'AbortError') throw error; result.status = 'rejected'; result.code = error.code || 'jpeg'; }
    }
    if (totalPixels > LIMITS.batchPixels) throw new SpecError('batchPixels');
    let retainedBytes = 0;
    for (const [index, result] of results.entries()) {
      check(); if (result.status === 'rejected') continue;
      result.status = 'processing'; renderResults(); status(`${t('processing')} ${index + 1} ${t('of')} ${results.length} · ${result.file.name}`); await tick(); check();
      try { await processFile(result, settings, check, retainedBytes); retainedBytes += result.output.size; }
      catch (error) { if (error.name === 'AbortError') throw error; result.status = ['sourceSmall', 'targetSmall', 'noFit'].includes(error.code) ? 'failed' : 'rejected'; result.code = error.code || 'decode'; }
      renderResults(); await tick();
    }
    check();
  } catch (error) {
    cancelled = error.name === 'AbortError';
    if (!cancelled) showError(error.code || 'unknown');
    for (const result of results) if (['pending', 'processing'].includes(result.status)) { result.status = cancelled ? 'cancelled' : 'rejected'; result.code = cancelled ? 'cancelled' : error.code || 'unknown'; }
  } finally {
    if (id === serial) { active = null; setBusy(false); renderResults(); completionStatus(); }
  }
});
$('cancel').addEventListener('click', () => { active?.abort(); $('cancel').disabled = true; status(t('cancelling')); });
$('file-input').addEventListener('change', event => choose([...event.target.files]));
$('clear').addEventListener('click', () => { if (busy) return; cleanup(); serial++; files = []; results = []; settings = null; $('file-input').value = ''; demoMessage = false; showError(null); renderSelection(); renderResults(); setBusy(false); });
$('language').addEventListener('click', () => { language = language === 'en' ? 'zh' : 'en'; localize(); });
for (const name of ['amount', 'unit', 'floor']) $(name).addEventListener('input', updateSettingsHint);
const dropzone = $('dropzone');
for (const eventName of ['dragenter', 'dragover']) dropzone.addEventListener(eventName, event => { event.preventDefault(); if (!busy) dropzone.classList.add('drag'); });
for (const eventName of ['dragleave', 'drop']) dropzone.addEventListener(eventName, event => { event.preventDefault(); dropzone.classList.remove('drag'); });
dropzone.addEventListener('drop', event => { if (!busy) choose([...event.dataTransfer.files]); });
document.addEventListener('dragover', event => event.preventDefault());
document.addEventListener('drop', event => event.preventDefault());
function save(blob, name) {
  const href = URL.createObjectURL(blob), anchor = document.createElement('a'); anchor.href = href; anchor.download = name; document.body.append(anchor); anchor.click(); anchor.remove();
  setTimeout(() => URL.revokeObjectURL(href), 30000);
}
function preview(index) {
  const result = results[index]; if (!result?.output) return;
  $('preview-title').textContent = `${result.file.name} → ${result.name}`;
  $('before-image').src = result.beforeURL ||= url(result.before); $('after-image').src = result.afterURL ||= url(result.after);
  $('preview').showModal();
}
$('close-preview').addEventListener('click', () => $('preview').close());
$('preview').addEventListener('click', event => { if (event.target === $('preview')) { const rect = $('preview').getBoundingClientRect(); if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) $('preview').close(); } });
$('report').addEventListener('click', () => { if (!busy && settings && results.length) save(new Blob([JSON.stringify(makeReport(settings, results, cancelled), null, 2)], { type:'application/json' }), 'specfit-report.json'); });
$('zip').addEventListener('click', async () => {
  if (busy || !settings || !results.some(r => r.status === 'passed')) return;
  const id = serial, controller = new AbortController(); active = controller; setBusy(true); status(t('packing'));
  const check = () => { if (id !== serial || controller.signal.aborted) throw new DOMException('Cancelled', 'AbortError'); };
  try {
    const entries = results.filter(r => r.output).map(r => ({ name: r.name, blob: r.output }));
    entries.push({ name: 'report.json', blob: new Blob([JSON.stringify(makeReport(settings, results, cancelled), null, 2)], { type: 'application/json' }) });
    const zip = await makeZip(entries, check); check(); save(zip, 'specfit-passing.zip');
  } catch (error) { if (error.name !== 'AbortError') showError('unknown'); }
  finally { if (id === serial) { active = null; setBusy(false); completionStatus(); } }
});
$('demo').addEventListener('click', async () => {
  if (busy) return;
  const id = ++serial, controller = new AbortController(); active = controller; setBusy(true); showError(null);
  const check = () => { if (id !== serial || controller.signal.aborted) throw new DOMException('Cancelled', 'AbortError'); };
  try {
    const examples = [];
    for (const [index, size] of [[1200,900],[1200,900],[480,320]].entries()) {
      check(); const c = canvas(...size), ctx = c.getContext('2d');
      try {
        if (index === 1) {
          const pixels = ctx.createImageData(c.width, c.height); let seed = 71;
          for (let i = 0; i < pixels.data.length; i += 4) { for (let j = 0; j < 3; j++) { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; pixels.data[i + j] = seed >>> 24; } pixels.data[i + 3] = 255; }
          ctx.putImageData(pixels, 0, 0);
        } else {
          ctx.fillStyle = '#e5ead7'; ctx.fillRect(0,0,c.width,c.height);
          ctx.fillStyle = '#284838'; ctx.fillRect(c.width*.1,c.height*.16,c.width*.35,c.height*.68);
          ctx.fillStyle = '#ddab7d'; ctx.beginPath(); ctx.arc(c.width*.65,c.height*.47,c.height*.31,0,Math.PI*2); ctx.fill();
          ctx.strokeStyle = '#a3b36f'; ctx.lineWidth = c.width*.013; ctx.beginPath(); ctx.moveTo(c.width*.2,c.height*.7); ctx.bezierCurveTo(c.width*.6,0,c.width*.55,c.height,c.width*.9,c.height*.18); ctx.stroke();
        }
        const blob = await encode(c, .96); check(); examples.push(new File([blob], ['studio-study.jpg','noise-study.jpg','too-small.jpg'][index], { type:'image/jpeg' }));
      } finally { c.width = c.height = 1; }
      await tick();
    }
    check(); setBusy(false); choose(examples);
    $('amount').value = '300'; $('unit').value = 'kB'; $('min-width').value = '800'; $('min-height').value = '600'; $('target-width').value = ''; $('floor').value = '.5';
    demoMessage = true; updateSettingsHint(); renderSelection(); $('selection').textContent += ` ${t('demoNote')}`;
  } catch (error) { if (error.name !== 'AbortError') showError('unknown'); }
  finally { if (id === serial) { active = null; setBusy(false); } }
});
window.addEventListener('pagehide', () => { active?.abort(); cleanup(); });
localize(); setBusy(false);
