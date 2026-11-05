'use strict';

const IMAGE_LIMIT = 20 * 1024 * 1024;
const ASSET_REQUEST_TIMEOUT = 660000;
const MAX_PIXELS = 40000000;
const VIEWS = ['front', 'left', 'back', 'right'];
const $ = id => document.getElementById(id);
let currentMode = 'single';
let singleFileObj = null;
let multiFileObjs = [null, null, null, null];
let singleRevision = 0;
const multiRevisions = [0, 0, 0, 0];
let activeMultiSlot = 0;
let toggleState = { texture: true, pbr: true };
let currentTaskId = null;
let latestModelUrl = null;
let resultSettings = null;
let jobSettings = null;
let busy = false;
let assetBusy = false;
let sessionKeyReady = false;
let importSupported = false;
let bridgeReady = false;
let pollTimer = null;
let pollEpoch = 0;
let nextRequest = 0;
let assetRequest = null;
const requests = new Map();
const sessionAssets = new Map();
let inspectorTab = 'properties';
let previewZoom = 1;
let modelViewer = null;
let modelProfiles = {};
let previousModel = null;
let readingSingle = false;
const readingViews = new Set();

// Official generation pricing snapshot checked 2026-10-10.
// P-series HD/8K surcharges are not specified in the published P table.
function estimateCredits(settings) {
  const profile = modelProfiles[settings.model];
  if (!profile) return null;
  const base = profile.family === 'H' ? 20 : settings.model.startsWith('P2') ? 100 : 40;
  const items = [{label: 'Generation', credits: base}];
  if (settings.texture) items.push({label: 'Texture', credits: 10});
  let incomplete = false;
  if (settings.texture && profile.texture_quality && ['detailed', 'extreme'].includes(settings.texture_quality)) {
    if (profile.family === 'H') items.push({label: settings.texture_quality === 'extreme' ? '8K texture' : 'HD texture', credits: settings.texture_quality === 'extreme' ? 20 : 10});
    else incomplete = true;
  }
  if (profile.geometry_quality && settings.geometry_quality === 'detailed') items.push({label: 'Ultra geometry', credits: 20});
  if (profile.smart_low_poly && settings.smart_low_poly) items.push({label: 'Smart low-poly', credits: 10});
  return {credits: items.reduce((sum, item) => sum + item.credits, 0), items, incomplete};
}

function updateCreditEstimate() {
  const settings = {model: $('aiModel').value, texture: toggleState.texture,
    texture_quality: $('textureQuality').value, geometry_quality: $('geometryQuality').value,
    smart_low_poly: $('meshStyle').value === 'smart_low_poly'};
  const estimate = estimateCredits(settings);
  $('creditEstimate').textContent = estimate
    ? 'Estimate: ' + sgaiTripoCharge(estimate.credits).toFixed(1) + ' SGAI credits'
    : 'Credit estimate loading…';
  $('creditBreakdown').textContent = estimate ? 'Final SGAI price is checked before submission. Each refinement is charged separately.' : '';
}

function qualityLimits(settings) {
  const profile = modelProfiles[settings.model];
  if (!profile) throw new Error('Unsupported model. Reopen the plugin to load its capabilities.');
  return { profile, min: settings.smart_low_poly ? 500 : profile.face_min,
    max: settings.smart_low_poly ? 20000 : settings.geometry_quality === 'detailed' ? profile.ultra_max : profile.face_max };
}

function syncQualityControls(adjustFaces = false) {
  const model = $('aiModel').value;
  const profile = modelProfiles[model];
  if (!profile) return;
  const changedModel = model !== previousModel;
  for(const option of $('textureQuality').options)option.disabled=profile.family==='P'&&['detailed','extreme'].includes(option.value);
  if(profile.family==='P'&&['detailed','extreme'].includes($('textureQuality').value))$('textureQuality').value='standard';
  if (!profile.smart_low_poly) $('meshStyle').value = 'standard';
  const lowPoly = $('meshStyle').value === 'smart_low_poly';
  if (!profile.geometry_quality || lowPoly) $('geometryQuality').value = 'standard';
  else if (changedModel) $('geometryQuality').value = 'detailed';
  if (!profile.texture_quality) { $('textureQuality').value = 'standard'; $('textureVersion').value = 'auto'; }
  else if (changedModel && previousModel && !modelProfiles[previousModel].texture_quality) {
    $('textureQuality').value = 'detailed'; $('textureVersion').value = 'v3.5-20260815';
  }
  if (!profile.auto_size) $('autoSize').checked = false;
  if (currentMode !== 'single') $('imageAutofix').checked = false;
  const settings = { model, smart_low_poly: lowPoly, geometry_quality: $('geometryQuality').value };
  const limits = qualityLimits(settings);
  const faces = Number($('faceLimit').value);
  if (adjustFaces && faces !== 0 && (!Number.isInteger(faces) || faces < limits.min || faces > limits.max)) {
    $('faceLimit').value = String(lowPoly ? 10000 : profile.suggested_faces);
    $('fileStatus').textContent = 'Face count adjusted for the selected model and mesh style.';
  }
  $('faceLimit').max = String(limits.max);
  $('faceRange').textContent = '0 = adaptive · ' + limits.min.toLocaleString() + '–' + limits.max.toLocaleString() + ' faces. ' +
    (profile.family === 'P' ? 'Very low counts can lose complex details.' : 'Higher counts preserve detail but can make SketchUp slower.');
  $('modelGuide').textContent = profile.family === 'P'
    ? (model.startsWith('P2') ? 'P2 is a preview model. Clean low-poly triangle output; no Ultra geometry setting.' : 'P1 favors clean topology and precise face-count control for game and mobile assets.')
    : model === 'v2.5-20250123' ? 'Legacy model: advanced geometry, texture quality and size estimation are unavailable.'
    : lowPoly ? 'Smart low-poly favors simple objects and clean topology; complex objects can fail.' : 'Ultra geometry retains finer surface detail. Use multiple real views for hidden geometry.';
  const locked = busy || assetBusy;
  $('geometryQuality').disabled = locked || !profile.geometry_quality || lowPoly;
  $('meshStyle').disabled = locked || !profile.smart_low_poly;
  for (const id of ['textureQuality', 'textureVersion']) $(id).disabled = locked || !toggleState.texture || !profile.texture_quality;
  for (const id of ['textureAlignment', 'orientation', 'textureSeed']) $(id).disabled = locked || !toggleState.texture;
  $('delight').disabled = locked || !toggleState.texture || $('textureVersion').value !== 'v3.5-20260815';
  $('imageAutofix').disabled = locked || currentMode !== 'single';
  $('autoSize').disabled = locked || !profile.auto_size;
  $('exportUv').disabled = locked;
  $('modelSeed').disabled = locked;
  $('qualityCost').textContent = toggleState.texture && $('textureQuality').value === 'extreme'
    ? '8K textures use additional credits and can take longer.' : toggleState.texture && $('textureQuality').value === 'fast'
    ? 'Fast textures require the latest texture engine and trade detail for speed.' : 'Higher detail can take longer. Extreme textures use additional credits.';
  if(profile.family==='P'&&['detailed','extreme'].includes($('textureQuality').value))$('textureQuality').value='standard';
  previousModel = model;
  $('versionGuide').textContent = 'Pinned version: ' + model + '. Fixed versions help keep results consistent across model updates.';
  updateCreditEstimate();
}

function optionalSeed(id) {
  const text = $(id).value.trim();
  if (!text) return null;
  const value = Number(text);
  if (!/^\d+$/.test(text) || !Number.isSafeInteger(value) || value > 2147483647) throw new Error('Seeds must be whole numbers from 0 to 2147483647.');
  return value;
}

function generationSettings() {
  const settings = { mode: currentMode, model: $('aiModel').value, face_limit: Number($('faceLimit').value),
    texture: toggleState.texture, pbr: toggleState.texture && toggleState.pbr,
    geometry_quality: $('geometryQuality').value, smart_low_poly: $('meshStyle').value === 'smart_low_poly',
    enable_image_autofix: currentMode === 'single' && $('imageAutofix').checked,
    texture_quality: $('textureQuality').value, texture_version: $('textureVersion').value,
    texture_alignment: $('textureAlignment').value, orientation: $('orientation').value,
    delight: $('delight').checked, auto_size: $('autoSize').checked, export_uv: $('exportUv').checked,
    model_seed: optionalSeed('modelSeed'), texture_seed: toggleState.texture ? optionalSeed('textureSeed') : null };
  const limits = qualityLimits(settings);
  if (!Number.isInteger(settings.face_limit) || (settings.face_limit !== 0 && (settings.face_limit < limits.min || settings.face_limit > limits.max))) {
    throw new Error('Face count must be 0 (adaptive) or ' + limits.min + '–' + limits.max + ' for this model.');
  }
  return Object.freeze(settings);
}

function setInspectorTab(tab, focus = false) {
  if (!['properties', 'assets'].includes(tab)) return;
  inspectorTab = tab;
  for (const name of ['properties', 'assets']) {
    const button = $(name === 'properties' ? 'inspectorPropertiesTab' : 'inspectorAssetsTab');
    button.classList.toggle('active', name === tab);
    button.setAttribute('aria-selected', String(name === tab));
    button.tabIndex = name === tab ? 0 : -1;
    $(name + 'Panel').hidden = name !== tab;
  }
  $('railAssets').classList.toggle('active', tab === 'assets');
  $('railProperties').classList.toggle('active', tab === 'properties');
  $('railGenerate').classList.remove('active');
  if (focus) {
    $('inspectorPane').scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    $(tab === 'properties' ? 'inspectorPropertiesTab' : 'inspectorAssetsTab').focus();
  }
}

function updatePreviewZoom(value = 1) {
  previewZoom = Math.min(2.5, Math.max(.5, value));
  for (const id of ['sourceStageImage', 'modelThumbnail']) $(id).style.transform = 'scale(' + previewZoom + ')';
  $('zoomLabel').textContent = Math.round(previewZoom * 100) + '%';
}

function setPreviewControls(available) {
  if (modelViewer?.ready) {
    for (const id of ['zoomIn','zoomOut','fitPreview']) $(id).disabled = false;
    return;
  }
  $('zoomIn').disabled = !available || previewZoom >= 2.5;
  $('zoomOut').disabled = !available || previewZoom <= .5;
  $('fitPreview').disabled = !available;
}

function syncSourcePreview() {
  if (busy || assetBusy || currentTaskId || latestModelUrl) return;
  const image = currentMode === 'single' ? singleFileObj : multiFileObjs[0];
  const source = image && (image.previewUrl || image.dataUrl);
  $('emptyStage').hidden = !!source;
  $('sourceStageImage').hidden = !source;
  $('modelThumbnail').hidden = true;
  $('thumbnailFallback').hidden = true;
  if (source) $('sourceStageImage').src = source;
  else $('sourceStageImage').removeAttribute('src');
  $('stageTitle').textContent = source ? 'Reference preview' : 'Your next creation';
  $('stageBadge').textContent = source ? 'REFERENCE' : 'EMPTY';
  $('stageBadge').className = 'stage-badge';
  $('canvasState').textContent = source ? 'Reference ready' : 'Waiting for a reference';
  $('previewCaption').textContent = source ? 'Reference image · interactive 3D preview appears after generation' : 'Generate a model for an interactive 3D preview';
  updatePreviewZoom();
  setPreviewControls(!!source);
}

function renderAssetLibrary() {
  $('assetCount').textContent = String(sessionAssets.size);
  $('assetLibraryEmpty').hidden = sessionAssets.size > 0;
  $('assetLibrary').replaceChildren();
  for (const [id, asset] of Array.from(sessionAssets.entries()).reverse()) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'asset-tile' + (id === currentTaskId ? ' selected' : '');
    button.disabled = busy || assetBusy;
    button.setAttribute('aria-label', 'Select ' + asset.name);
    button.setAttribute('aria-pressed', String(id === currentTaskId));
    const preview = document.createElement('span');
    preview.className = 'asset-tile-preview';
    preview.textContent = '◇';
    if (asset.thumbnail) {
      const image = document.createElement('img');
      image.src = asset.thumbnail;
      image.alt = asset.name + ' preview';
      image.addEventListener('error', () => { preview.replaceChildren(); preview.textContent = '◇'; });
      preview.textContent = '';
      preview.appendChild(image);
    }
    const label = document.createElement('span');
    label.className = 'asset-tile-name';
    label.textContent = asset.name;
    button.appendChild(preview);
    button.appendChild(label);
    button.addEventListener('click', () => selectSessionAsset(id));
    $('assetLibrary').appendChild(button);
  }
}

function selectSessionAsset(id) {
  if (busy || assetBusy || !sessionAssets.has(id)) return;
  const asset = sessionAssets.get(id);
  currentTaskId = id;
  jobSettings = asset.settings;
  $('taskIdDisplay').textContent = id;
  onTaskSucceeded(asset.task);
  $('resultSection').classList.add('visible');
}

function rpc(operation,data={},timeout=45000){return window.sgaiTripoRPC(operation,data,timeout);}
async function configureKey(){const account=await rpc('configure');sessionKeyReady=true;$('keyState').textContent=account.message;}
function safeAssetUrl(value){const url=new URL(value,location.origin);if(url.origin!==location.origin||!/^\/api\/tripo\/jobs\/[a-f0-9-]{36}\/model$/.test(url.pathname))throw new Error('The model link is not a private SGAI asset.');return url.href;}

function switchMode(mode) {
  if (busy || assetBusy || !['single', 'multi'].includes(mode)) return;
  currentMode = mode;
  for (const item of ['single', 'multi']) {
    $('tab-' + item).classList.toggle('active', item === mode);
    $('tab-' + item).setAttribute('aria-selected', String(item === mode));
    $('tab-' + item).tabIndex = item === mode ? 0 : -1;
    $('panel-' + item).classList.toggle('active', item === mode);
  }
  syncSourcePreview();
  syncQualityControls(true);
  lockControls();
}

function toggleOption(key) {
  if (busy || assetBusy || (key === 'pbr' && !toggleState.texture)) return;
  toggleState[key] = !toggleState[key];
  if (!toggleState.texture) toggleState.pbr = false;
  for (const item of ['texture', 'pbr']) {
    $('toggle-' + item).classList.toggle('on', toggleState[item]);
    $('toggle-' + item).setAttribute('aria-checked', String(toggleState[item]));
  }
  $('toggle-pbr').disabled = !toggleState.texture;
  $('pbrRow').classList.toggle('unavailable', !toggleState.texture);
  syncQualityControls();
}

function headerDimensions(bytes, type) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (type === 'image/png') {
    if (bytes.length < 24 || String.fromCharCode(...bytes.slice(12,16)) !== 'IHDR') return null;
    return [view.getUint32(16), view.getUint32(20)];
  }
  if (type === 'image/jpeg') {
    let offset = 2;
    while (offset + 4 <= bytes.length) {
      if (bytes[offset++] !== 255) return null;
      while (bytes[offset] === 255) offset++;
      const marker = bytes[offset++];
      if (marker === 218 || marker === 217 || marker === undefined) return null;
      if (marker === 1 || (marker >= 208 && marker <= 216)) continue;
      if (offset + 2 > bytes.length) return null;
      const length = view.getUint16(offset);
      if (length < 2 || offset + length > bytes.length) return null;
      if ([192,193,194,195,197,198,199,201,202,203,205,206,207].includes(marker)) {
        return length >= 8 ? [view.getUint16(offset+5), view.getUint16(offset+3)] : null;
      }
      offset += length;
    }
    return null;
  }
  const u24 = offset => bytes[offset] | bytes[offset+1] << 8 | bytes[offset+2] << 16;
  let offset = 12;
  while (offset + 8 <= bytes.length) {
    const kind = String.fromCharCode(...bytes.slice(offset, offset+4));
    const length = view.getUint32(offset+4, true);
    const start = offset+8;
    if (start + length > bytes.length) return null;
    if (kind === 'VP8X' && length >= 10) return [u24(start+4)+1, u24(start+7)+1];
    if (kind === 'VP8L' && length >= 5 && bytes[start] === 47) {
      const packed = view.getUint32(start+1,true);
      return [(packed & 16383)+1, ((packed >>> 14) & 16383)+1];
    }
    if (kind === 'VP8 ' && length >= 10 && bytes[start+3] === 157 && bytes[start+4] === 1 && bytes[start+5] === 42) {
      return [view.getUint16(start+6,true) & 16383, view.getUint16(start+8,true) & 16383];
    }
    offset = start + length + (length % 2);
  }
  return null;
}

function validateDimensions(width, height) {
  if (!Number.isInteger(width) || !Number.isInteger(height) || width < 1 || height < 1 || width > 16384 || height > 16384
    || width * height > MAX_PIXELS) throw new Error('Choose an image below 40 megapixels and 16,384 pixels per side.');
}

async function readImage(file) {
  if (!file || !Number.isFinite(file.size) || file.size <= 0 || file.size > IMAGE_LIMIT) {
    throw new Error('Choose a nonempty image of at most 20 MB.');
  }
  // Upload API documents JPEG/PNG; WebP is converted to PNG before upload.
  if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type)) throw new Error('Choose a JPG, PNG, or WebP image.');
  const bytes = new Uint8Array(await file.arrayBuffer());
  const png = [137,80,78,71,13,10,26,10].every((b,i) => bytes[i] === b);
  const jpeg = bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255;
  const webp = String.fromCharCode(...bytes.slice(0,4)) === 'RIFF' && String.fromCharCode(...bytes.slice(8,12)) === 'WEBP';
  if (!((png && file.type === 'image/png') || (jpeg && file.type === 'image/jpeg') || (webp && file.type === 'image/webp'))) {
    throw new Error('The image contents do not match its file type.');
  }
  // Check encoded dimensions before asking CEF to allocate decoded image pixels.
  const dimensions = headerDimensions(bytes, file.type);
  if (!dimensions) throw new Error('This image has invalid dimensions or metadata.');
  validateDimensions(...dimensions);
  const dataUrl = await new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = event => resolve(event.target.result);
    reader.onerror = () => reject(new Error('Could not read the selected image. Choose it again.'));
    reader.onabort = () => reject(new Error('Image reading was interrupted.'));
    reader.readAsDataURL(file);
  });
  const image = await new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('This image is damaged or cannot be decoded.'));
    img.src = dataUrl;
  });
  validateDimensions(image.naturalWidth, image.naturalHeight);
  let uploadUrl = dataUrl;
  let name = file.name;
  if (webp) {
    const canvas = document.createElement('canvas');
    canvas.width = image.naturalWidth;
    canvas.height = image.naturalHeight;
    canvas.getContext('2d').drawImage(image, 0, 0);
    uploadUrl = canvas.toDataURL('image/png');
    canvas.width = canvas.height = 0;
    if (uploadUrl.length > Math.ceil(IMAGE_LIMIT / 3) * 4 + 128) throw new Error('WebP conversion exceeds 20 MB. Export a smaller PNG or JPG.');
    name = file.name.replace(/\.webp$/i, '') + '.png';
  }
  return Object.freeze({ name, size: file.size, dataUrl: uploadUrl, previewUrl: dataUrl,
    width: image.naturalWidth, height: image.naturalHeight });
}

async function setSingleFile(file) {
  if (busy || assetBusy) return;
  const revision = ++singleRevision;
  readingSingle = true;
  singleFileObj = null;
  syncSourcePreview();
  $('singlePreviewBox').style.display = 'none';
  $('singleDropZone').setAttribute('aria-busy', 'true');
  $('fileStatus').textContent = 'Reading image…';
  lockControls();
  try {
    const image = await readImage(file);
    if (revision !== singleRevision) return;
    singleFileObj = image;
    $('singleFileName').textContent = image.name;
    $('singleFileSize').textContent = (image.size / 1048576).toFixed(2) + ' MB · ' + image.width + ' × ' + image.height;
    $('singlePreviewImg').src = image.previewUrl;
    $('singlePreviewBox').style.display = 'flex';
    $('fileStatus').textContent = image.width < 256 || image.height < 256 ? 'Image ready · below the recommended 256 × 256 resolution.' : 'Image ready';
    syncSourcePreview();
  } catch (error) { if (revision === singleRevision) { $('fileStatus').textContent = ''; showError(error.message); } }
  finally {
    if (revision === singleRevision) {
      readingSingle = false;
      $('singleDropZone').setAttribute('aria-busy', 'false');
      lockControls();
    }
  }
}

function removeSingleFile() {
  if (busy || assetBusy) return;
  singleRevision++;
  readingSingle = false;
  singleFileObj = null;
  $('singleInput').value = '';
  $('singlePreviewBox').style.display = 'none';
  $('singlePreviewImg').removeAttribute('src');
  $('singleDropZone').setAttribute('aria-busy', 'false');
  $('fileStatus').textContent = '';
  syncSourcePreview();
  lockControls();
}

function renderMultiSlots() {
  const container = $('multiSlotsContainer');
  container.replaceChildren();
  VIEWS.forEach((view, index) => {
    const wrapper = document.createElement('div');
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'slot-card' + (multiFileObjs[index] ? ' filled' : '');
    button.disabled = busy || assetBusy;
    button.setAttribute('aria-label', 'Choose ' + view + ' view' + (index === 0 ? ' (required)' : ''));
    button.addEventListener('click', () => openMultiSlotPicker(index));
    if (multiFileObjs[index]) {
      const img = document.createElement('img');
      img.src = multiFileObjs[index].previewUrl;
      img.alt = view + ' view';
      button.appendChild(img);
    }
    const label = document.createElement('span');
    label.className = 'slot-card-badge';
    label.textContent = view.charAt(0).toUpperCase() + view.slice(1) + (index === 0 ? ' · required' : '');
    button.appendChild(label);
    wrapper.appendChild(button);
    if (multiFileObjs[index]) {
      const remove = document.createElement('button');
      remove.type = 'button';
      remove.className = 'btn-remove slot-remove';
      remove.textContent = 'Remove ' + view;
      remove.disabled = busy || assetBusy;
      remove.addEventListener('click', () => clearMultiSlot(index));
      wrapper.appendChild(remove);
    }
    container.appendChild(wrapper);
  });
}

function openMultiSlotPicker(index) {
  if (busy || assetBusy) return;
  activeMultiSlot = index;
  $('multiInput').value = '';
  $('multiInput').click();
}

async function onMultiFileChosen(event) {
  const file = event.target.files[0];
  const index = activeMultiSlot;
  event.target.value = '';
  if (!file || busy || assetBusy) return;
  const revision = ++multiRevisions[index];
  readingViews.add(index);
  multiFileObjs[index] = null;
  renderMultiSlots();
  syncSourcePreview();
  $('fileStatus').textContent = 'Reading ' + VIEWS[index] + ' image…';
  lockControls();
  try {
    const image = await readImage(file);
    if (revision !== multiRevisions[index]) return;
    multiFileObjs[index] = image;
    renderMultiSlots();
    $('fileStatus').textContent = VIEWS[index] + ' image ready' + (image.width < 256 || image.height < 256 ? ' · below recommended resolution' : '');
    syncSourcePreview();
  } catch (error) { if (revision === multiRevisions[index]) { $('fileStatus').textContent = ''; showError(error.message); } }
  finally { if (revision === multiRevisions[index]) { readingViews.delete(index); lockControls(); } }
}

function clearMultiSlot(index) {
  if (busy || assetBusy) return;
  multiRevisions[index]++;
  readingViews.delete(index);
  multiFileObjs[index] = null;
  renderMultiSlots();
  syncSourcePreview();
  lockControls();
}

function lockControls() {
  const locked = busy || assetBusy;
  for (const id of ['tab-single','tab-multi','singleInput','multiInput','aiModel','faceLimit','activateBtn','toggle-texture','removeSingle']) $(id).disabled = locked;
  $('toggle-pbr').disabled = locked || !toggleState.texture;
  $('singleDropZone').setAttribute('aria-disabled', String(locked));
  const waitingForImages = currentMode === 'single' ? readingSingle : readingViews.size > 0;
  $('generateBtn').disabled = locked || waitingForImages || !!currentTaskId || !bridgeReady;
  $('generateBtn').textContent = assetBusy ? 'Downloading model…' : busy ? (currentTaskId ? 'Generating model…' : 'Preparing generation…')
    : currentTaskId ? (latestModelUrl ? 'Model ready' : 'Generation paused') : 'Generate 3D Model with Tripo AI';
  $('importBtn').disabled = locked || !latestModelUrl || !importSupported;
  $('downloadGlbBtn').disabled = locked || !latestModelUrl;
  $('copyUrlBtn').disabled = locked || !latestModelUrl;
  $('resumeBtn').disabled = locked;
  $('newJobBtn').disabled = locked;
  renderMultiSlots();
  renderAssetLibrary();
  syncQualityControls();
  syncProcessingControls();
}

const PROCESS_LABELS = {texture:'Regenerate textures', segment:'Segment for completion', complete:'Complete segmented parts', smart_image:'Smart segment image', smart_model:'Smart segment model'};

function processingImage() { return currentMode === 'single' ? singleFileObj : multiFileObjs[0]; }

function syncProcessingControls() {
  const action = $('processAction').value || 'texture';
  const locked = busy || assetBusy;
  const source = sessionAssets.get(currentTaskId);
  const waiting = currentMode === 'single' ? readingSingle : readingViews.size > 0;
  const image = processingImage();
  const ready = action === 'smart_image' ? !!image && !waiting && (!currentTaskId || !!latestModelUrl)
    : !!source && !!latestModelUrl && (action !== 'complete' || source.settings?.operation === 'segment');
  const model = $('processTextureModel').value;
  if (model === 'v2.5-20250123') $('processTextureQuality').value = 'standard';
  $('processTextureFields').hidden = action !== 'texture';
  $('processSmartFields').hidden = !action.startsWith('smart_');
  $('processCompleteFields').hidden = action !== 'complete';
  for (const id of ['processAction','processTextureModel','processTextureQuality','processPrompt','processReference','processPbr','processDelight','processSeed','processGranularity','processHint','processCompletionMode','processParts']) $(id).disabled = locked;
  $('processTextureQuality').disabled = locked || model === 'v2.5-20250123';
  $('processDelight').disabled = locked || model !== 'v3.5-20260815';
  $('processPrompt').disabled = locked || $('processReference').checked;
  $('processBtn').disabled = locked || !bridgeReady || !ready;
  const quality = $('processTextureQuality').value;
  const cost = action === 'texture' ? (quality === 'extreme' ? 30 : quality === 'detailed' ? 20 : 10)
    : action === 'segment' ? 40 : action === 'complete' ? ($('processCompletionMode').value === 'quick_cap' ? 30 : 50) : action === 'smart_image' ? 85 : 55;
  $('processCost').textContent = 'Estimate: ' + sgaiTripoCharge(cost).toFixed(1) + ' SGAI credits per action';
  $('processBtn').textContent = locked ? 'Processing unavailable while busy…' : (PROCESS_LABELS[action] || 'Run processing') + ' · ' + sgaiTripoCharge(cost).toFixed(1) + ' SGAI credits';
  $('processGuide').textContent = action === 'smart_image' ? 'Uses the single image or front view selected in Create.'
    : action === 'complete' ? (ready ? 'Blank part names processes all parts. Use exact names from your segmented model.' : 'Run Segment for completion, then select its result in Assets.')
    : action === 'segment' ? 'Split the selected model into parts. Then choose Complete segmented parts (an additional paid action).'
    : action === 'smart_model' ? 'Uses the selected GLB in its original coordinates. This result cannot be sent directly to completion.'
    : 'Uses the selected asset. Reference option uses the current single image or front view; select a matching reference.';
}

async function startProcessing() {
  if (busy || assetBusy || !bridgeReady) return;
  const action = $('processAction').value;
  const originalTask = currentTaskId;
  const source = sessionAssets.get(originalTask);
  const reference = processingImage();
  const waiting = currentMode === 'single' ? readingSingle : readingViews.size > 0;
  let body;
  try {
    if (!PROCESS_LABELS[action]) throw new Error('Choose a processing action.');
    if (action !== 'smart_image' && (!source || !latestModelUrl)) throw new Error('Select a completed asset in Assets first.');
    if (action === 'smart_image' && currentTaskId && !latestModelUrl) throw new Error('Resume the pending task or choose New generation first.');
    if (action === 'complete' && source.settings?.operation !== 'segment') throw new Error('Run Segment for completion and select its result first.');
    const needsImage = action === 'smart_image' || action === 'texture' && $('processReference').checked;
    if (needsImage && (!reference || waiting)) throw new Error('Select a reference image in Create and wait until it is ready.');
    body = {action, source_task: action === 'smart_image' ? undefined : originalTask};
    if (action === 'texture') {
      Object.assign(body, {model:$('processTextureModel').value, texture_quality:$('processTextureQuality').value,
        prompt: $('processReference').checked ? '' : $('processPrompt').value.trim(),
        pbr: !!$('processPbr').checked, delight: !!$('processDelight').checked, texture_seed: optionalSeed('processSeed')});
      if ($('processReference').checked) body.reference_token = 'pending_reference';
    }
    if (action.startsWith('smart_')) Object.assign(body, {granularity:$('processGranularity').value, hint:$('processHint').value.trim()});
    if (action === 'complete') Object.assign(body, {completion_mode:$('processCompletionMode').value,
      part_names:$('processParts').value.split(/\r?\n/).map(s => s.trim()).filter(Boolean)});
    if (action === 'smart_image') body.input = 'pending_image';
    busy = true;
    lockControls();
    await rpc('validate_process', body);
    await configureKey();
    if (action === 'smart_image') await rpc('begin');
    if (needsImage) {
      showProgressCard('Uploading processing reference…', 0, 'queued');
      const uploaded = await rpc('upload', {data_url:reference.dataUrl, filename:reference.name}, 125000);
      if (!validId(uploaded.file_token)) throw new Error('Reference upload returned an invalid token.');
      if (action === 'smart_image') body.input = uploaded.file_token;
      else body.reference_token = uploaded.file_token;
    }
    showProgressCard('Submitting ' + PROCESS_LABELS[action].toLowerCase() + '…', 0, 'queued');
    const submitted = await rpc('process', body);
    if (!validId(submitted.task_id)) throw new Error('Submission returned no task ID. Check your Tripo account before submitting again.');
    // Preserve the source until submission succeeds. Polling uses an immutable summary.
    jobSettings = Object.freeze({...source?.settings, operation:action, source_task:body.source_task || null,
      texture:action === 'texture' ? true : source?.settings?.texture || false,
      pbr:action === 'texture' ? body.pbr : source?.settings?.pbr || false,
      texture_quality:action === 'texture' ? body.texture_quality : source?.settings?.texture_quality,
      processing_model:body.model || null, completion_mode:body.completion_mode || null});
    currentTaskId = submitted.task_id;
    resetResultUI();
    $('taskIdDisplay').textContent = currentTaskId;
    startPollingTask(currentTaskId);
  } catch (error) {
    busy = false;
    lockControls();
    showError(error.message);
  }
}

async function startGeneration() {
  if (busy || assetBusy || currentTaskId) return;
  if (currentMode === 'single' ? readingSingle : readingViews.size > 0) {
    showError('Wait until all selected images have finished reading.'); return;
  }
  // Snapshot everything before the first asynchronous operation.
  let options;
  try { options = generationSettings(); }
  catch (error) { showError(error.message); return; }
  const settings = Object.freeze({ ...options, files: Object.freeze(currentMode === 'single' ? [singleFileObj] : multiFileObjs.slice()) });
  if (settings.mode === 'single' && !settings.files[0]) { showError('Select an image and wait until it is ready.'); return; }
  if (settings.mode === 'multi' && (!settings.files[0] || settings.files.filter(Boolean).length < 2)) {
    showError('Choose a front image and at least one additional view. Wait until both images are ready.'); return;
  }
  busy = true;
  jobSettings = settings;
  resetResultUI();
  lockControls();
  showProgressCard('Preparing image upload…', 0, 'queued');
  $('resultSection').scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  try {
    await rpc('validate', options);
    await configureKey();
    await rpc('begin');
    const inputs = [];
    for (let i = 0; i < settings.files.length; i++) {
      const image = settings.files[i];
      if (!image) continue;
      showProgressCard('Uploading ' + (settings.mode === 'multi' ? VIEWS[i] + ' view' : 'image') + '…', 0, 'queued');
      const uploaded = await rpc('upload', { data_url: image.dataUrl, filename: image.name }, 125000);
      if (!validId(uploaded.file_token)) throw new Error('Image upload returned no valid file token.');
      inputs.push({ [VIEWS[i]]: uploaded.file_token });
    }
    showProgressCard('Submitting generation request…', 0, 'queued');
    const body = { ...options };
    if (settings.mode === 'single') body.input = inputs[0].front;
    else body.inputs = inputs;
    const submitted = await rpc('generate', body);
    if (!validId(submitted.task_id)) throw new Error('Service returned no valid task identifier. Check your Tripo account before submitting again.');
    currentTaskId = submitted.task_id;
    $('taskIdDisplay').textContent = currentTaskId;
    startPollingTask(currentTaskId);
  } catch (error) {
    busy = false;
    lockControls();
    showError(error.message);
  }
}

function validId(value) { return typeof value === 'string' && /^[a-zA-Z0-9_-]{1,200}$/.test(value); }

function startPollingTask(taskId) {
  clearTimeout(pollTimer);
  const epoch = ++pollEpoch;
  const started = Date.now();
  let failures = 0;
  busy = true;
  $('resumeControls').hidden = true;
  $('stopPollingBtn').hidden = false;
  lockControls();
  async function poll() {
    if (epoch !== pollEpoch) return;
    try {
      if (Date.now() - started > 20 * 60 * 1000) throw new Error('Checking paused after 20 minutes. The cloud task may still be running; resume when ready.');
      const task = await rpc('task', { task_id: taskId });
      if (epoch !== pollEpoch) return;
      if (task.task_id !== taskId) throw new Error('The service returned a different task.');
      const taskStatus = ['queued','running','success','failed','cancelled'].includes(task.status) ? task.status : 'failed';
      failures = 0;
      const elapsed = Math.floor((Date.now() - started) / 1000);
      showProgressCard((taskStatus === 'queued' ? 'Waiting in Tripo queue' : jobSettings?.operation ? PROCESS_LABELS[jobSettings.operation] : 'Generating your model') + ' · ' + elapsed + 's', task.progress, taskStatus);
      if (taskStatus === 'success') {
        onTaskSucceeded(task);
        return;
      }
      if (['failed','cancelled'].includes(taskStatus)) {
        const message = typeof task.error_message === 'string' ? task.error_message.slice(0,2000) : 'Cloud task finished with status: ' + taskStatus;
        currentTaskId = null;
        pausePolling(message + (Number.isInteger(task.error_code) ? '\nTripo error code: ' + task.error_code : ''), false);
        return;
      }
      pollTimer = setTimeout(poll, 2500);
    } catch (error) {
      if (epoch !== pollEpoch) return;
      if (error.retryable && ++failures <= 3) {
        showProgressCard('Connection interrupted. Retrying (' + failures + '/3)…', 0, 'queued');
        pollTimer = setTimeout(poll, Math.min(15000, 2500 * 2 ** failures));
      } else pausePolling(error.message, true);
    }
  }
  poll();
}

function pausePolling(message, resumable = true) {
  pollEpoch++;
  clearTimeout(pollTimer);
  busy = false;
  $('stopPollingBtn').hidden = true;
  $('resumeControls').hidden = !resumable || !currentTaskId;
  $('resumeBtn').hidden = false;
  lockControls();
  showError(message);
}

async function resumePolling() {
  if (!currentTaskId || busy || assetBusy) return;
  busy = true;
  lockControls();
  try { await configureKey(); startPollingTask(currentTaskId); }
  catch (error) { pausePolling(error.message); }
}

function newGeneration() {
  if (busy || assetBusy) return;
  pollEpoch++;
  clearTimeout(pollTimer);
  currentTaskId = null;
  resetResultUI();
  $('resumeControls').hidden = true;
  lockControls();
  syncSourcePreview();
}

function onTaskSucceeded(task) {
  if(task.settings)jobSettings=Object.freeze({...jobSettings,...task.settings});
  const output = task.output || {};
  latestModelUrl = safeAssetUrl(output.model_url);
  resultSettings = jobSettings;
  let thumbnail = null;
  try { if (output.rendered_image_url) thumbnail = safeAssetUrl(output.rendered_image_url); } catch (_) { /* Optional preview. */ }
  const existing = sessionAssets.get(task.task_id);
  const name = existing ? existing.name : 'Model ' + String(sessionAssets.size + 1).padStart(2, '0');
  // Keep small asset summaries rather than retaining every uploaded base64 image.
  const settings = jobSettings ? Object.freeze(Object.fromEntries(Object.entries(jobSettings).filter(([key]) => key !== 'files'))) : null;
  const summary = { task_id: task.task_id, type: typeof task.type === 'string' ? task.type.slice(0, 200) : 'image_to_model',
    status: 'success', output: { model_url: latestModelUrl, rendered_image_url: thumbnail } };
  if (typeof task.credits_consumed === 'number' && Number.isFinite(task.credits_consumed) && task.credits_consumed >= 0) summary.credits_consumed = task.credits_consumed;
  sessionAssets.set(task.task_id, { name, task: summary, settings, thumbnail });
  busy = false;
  pollEpoch++;
  clearTimeout(pollTimer);
  $('progressCard').style.display = 'none';
  $('errorCard').style.display = 'none';
  $('modelCard').style.display = 'block';
  $('propertyPlaceholder').hidden = true;
  $('emptyStage').hidden = true;
  $('sourceStageImage').hidden = true;
  $('sourceStageImage').removeAttribute('src');
  $('stageTitle').textContent = name;
  $('stageBadge').textContent = 'READY';
  $('stageBadge').className = 'stage-badge ready';
  $('importStatusBanner').style.display = 'none';
  $('modelLink').value = '';
  $('modelLink').hidden = true;
  $('canvasState').textContent = 'Ready for SketchUp';
  $('previewCaption').textContent = 'Generated image preview · import into SketchUp to explore in 3D';
  $('importHeight').value = '0';
  $('importRotation').value = '0';
  updatePreviewZoom();
  setPreviewControls(false);
  $('stopPollingBtn').hidden = true;
  const materials = resultSettings && resultSettings.texture ? (resultSettings.pbr ? 'PBR materials' : 'color textures') : 'geometry only';
  const requestedDetail = resultSettings && resultSettings.geometry_quality === 'detailed' ? 'Ultra geometry' : 'Standard geometry';
  const requestedModel = resultSettings && resultSettings.model ? resultSettings.model : (task.type || 'image_to_model');
  const budget = resultSettings && resultSettings.face_limit ? resultSettings.face_limit.toLocaleString() + ' target faces' : 'Adaptive face count';
  $('modelMeta').textContent = 'Task: ' + task.task_id + '\nEngine: ' + requestedModel + '\nRequested: ' + requestedDetail + ' · ' + budget + '\nAsset: ' + materials +
    (resultSettings && resultSettings.texture ? ' · ' + (resultSettings.texture_quality || 'standard') + ' texture detail' : '') +
    (summary.credits_consumed !== undefined ? '\nSGAI credits used: ' + summary.credits_consumed : '');
  if (resultSettings?.operation) $('modelMeta').textContent = 'Task: ' + task.task_id + '\nAction: ' + PROCESS_LABELS[resultSettings.operation] +
    (resultSettings.source_task ? '\nSource task: ' + resultSettings.source_task : '\nSource: reference image') +
    (resultSettings.processing_model ? '\nTexture engine: ' + resultSettings.processing_model : '') +
    (resultSettings.operation === 'texture' ? '\nTexture detail: ' + resultSettings.texture_quality : '') +
    (summary.credits_consumed !== undefined ? '\nSGAI credits used: ' + summary.credits_consumed : '');
  $('thumbnailFallback').hidden = false;
  $('modelThumbnail').hidden = true;
  $('modelThumbnail').removeAttribute('src');
  if (thumbnail) $('modelThumbnail').src = thumbnail;
  $('importHelp').textContent = importSupported ? 'Scale is estimated from a photo. Set a measured height below to calibrate it.' : 'Direct import requires SketchUp 2025 or newer. Save the GLB for another importer.';
  $('newJobBtn').hidden = false;
  $('resumeControls').hidden = false;
  $('resumeBtn').hidden = true;
  lockControls();
  if (modelViewer) modelViewer.load(task.task_id);
}

async function assetAction(operation) {
  if (!latestModelUrl || !currentTaskId || busy || assetBusy) return;
  const height = Number($('importHeight').value);
  const rotation = Number($('importRotation').value);
  if (!Number.isFinite(height) || height < 0 || height > 1000000 || !Number.isFinite(rotation) || Math.abs(rotation) > 360) {
    showError('Enter height from 0 to 1,000,000 mm and rotation from −360° to 360°.'); return;
  }
  assetBusy = true;
  lockControls();
  const banner = $('importStatusBanner');
  banner.style.display = 'block';
  banner.textContent = operation === 'save' ? 'Choose where to save the GLB…' : 'Downloading and validating model…';
  try {
    const result = await rpc(operation, { task_id: currentTaskId, height_mm: height, rotation }, ASSET_REQUEST_TIMEOUT);
    banner.textContent = result.cancelled ? 'Save cancelled.' : result.saved ? 'GLB download started.' : result.requested ? 'Import requested in SketchUp.' : 'Model imported. Use Undo to remove the import.';
  } catch (error) { banner.textContent = error.message; }
  finally { assetBusy = false; assetRequest = null; lockControls(); }
}

window.onAssetProgress = function(id, bytes, total) {
  if (id !== assetRequest || !assetBusy) return;
  const progress = total > 0 ? Math.min(100, Math.max(0, Math.floor(bytes / total * 100))) + '%' : (bytes / 1048576).toFixed(1) + ' MB';
  $('importStatusBanner').textContent = 'Downloading model… ' + progress;
};

async function copyModelUrl(){
 if(!latestModelUrl||!currentTaskId)return;
 try{const link=await rpc('link',{task_id:currentTaskId});try{await navigator.clipboard.writeText(link.url);$('importStatusBanner').textContent='Temporary private model link copied.';$('importStatusBanner').style.display='block';}catch(_){$('modelLink').value=link.url;$('modelLink').hidden=false;$('modelLink').focus();$('modelLink').select();}}catch(error){showError(error.message);}
}

function showProgressCard(message, percent, status) {
  $('resultSection').classList.add('visible');
  $('progressCard').style.display = 'block';
  $('modelCard').style.display = 'none';
  $('propertyPlaceholder').hidden = false;
  $('stageBadge').textContent = 'GENERATING';
  $('stageBadge').className = 'stage-badge';
  $('canvasState').textContent = 'Generation in progress';
  $('errorCard').style.display = 'none';
  const safePercent = Number.isFinite(Number(percent)) ? Math.min(100, Math.max(0, Number(percent))) : 0;
  $('statusBadge').className = 'status-badge ' + (['queued','running','success','failed','cancelled'].includes(status) ? status : 'failed');
  $('statusBadge').textContent = status;
  $('progressFill').style.width = safePercent + '%';
  $('progressTrack').setAttribute('aria-valuenow', String(safePercent));
  $('progressPercent').textContent = Math.round(safePercent) + '%';
  $('progressMessage').textContent = message;
}

function showError(message) {
  $('resultSection').classList.add('visible');
  $('progressCard').style.display = 'none';
  // Asset-setting errors should leave the completed asset's actions available.
  $('errorCard').style.display = 'flex';
  $('errorMessage').textContent = String(message);
  $('canvasState').textContent = latestModelUrl ? 'Model ready · check the message above' : currentTaskId ? 'Checking paused' : 'Check the message above';
}

function resetResultUI() {
  modelViewer?.clear();
  latestModelUrl = null;
  resultSettings = null;
  for (const id of ['progressCard','modelCard','errorCard','importStatusBanner']) $(id).style.display = 'none';
  $('modelThumbnail').removeAttribute('src');
  $('modelThumbnail').hidden = true;
  $('modelMeta').textContent = '';
  $('modelLink').value = '';
  $('modelLink').hidden = true;
  $('taskIdDisplay').textContent = '—';
  $('resumeBtn').hidden = false;
  $('resumeControls').hidden = true;
  $('stopPollingBtn').hidden = true;
  $('propertyPlaceholder').hidden = false;
  $('thumbnailFallback').hidden = true;
  updatePreviewZoom();
  setPreviewControls(false);
}

async function initialize() {
  if (window.createSGPreview) modelViewer = window.createSGPreview(rpc,
    {canvas:$('modelCanvas'), status:$('viewerStatus'), retry:$('reloadPreview'), zoom:$('zoomLabel')},
    (state, text) => {
      if (state === 'ready') {
        $('modelThumbnail').hidden = true;
        $('thumbnailFallback').hidden = true;
        $('sourceStageImage').hidden = true;
        $('emptyStage').hidden = true;
        $('previewCaption').textContent = text;
        setPreviewControls(true);
      } else if (state === 'loading') $('previewCaption').textContent = 'Loading actual 3D model · image preview shown while loading';
      else if (state === 'error') {
        const hasImage = $('modelThumbnail').naturalWidth > 0;
        $('modelThumbnail').hidden = !hasImage;
        $('thumbnailFallback').hidden = hasImage;
        $('previewCaption').textContent = text;
        setPreviewControls(!$('modelThumbnail').hidden);
      }
    });
  try { localStorage.removeItem('tripo_api_key'); } catch (_) { /* Some hosts disable browser storage. */ }
  $('activateBtn').addEventListener('click',async()=>{if(busy||assetBusy)return;try{await configureKey();await sgaiTripoRestore(await rpc('hello'));}catch(error){showError(error.message);}});
  for (const mode of ['single','multi']) {
    $('tab-' + mode).addEventListener('click', () => switchMode(mode));
    $('tab-' + mode).addEventListener('keydown', event => {
      if (!['ArrowLeft','ArrowRight','Home','End'].includes(event.key)) return;
      event.preventDefault();
      const next = event.key === 'Home' ? 'single' : event.key === 'End' ? 'multi' : mode === 'single' ? 'multi' : 'single';
      switchMode(next); $('tab-' + next).focus();
    });
  }
  const pick = () => { if (!busy && !assetBusy) { $('singleInput').value = ''; $('singleInput').click(); } };
  $('singleDropZone').addEventListener('click', pick);
  $('singleDropZone').addEventListener('keydown', event => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); pick(); } });
  $('singleDropZone').addEventListener('dragover', event => { event.preventDefault(); if (!busy && !assetBusy) $('singleDropZone').classList.add('dragging'); });
  $('singleDropZone').addEventListener('dragleave', () => $('singleDropZone').classList.remove('dragging'));
  $('singleDropZone').addEventListener('drop', event => { event.preventDefault(); $('singleDropZone').classList.remove('dragging'); if (event.dataTransfer.files[0]) setSingleFile(event.dataTransfer.files[0]); });
  $('singleInput').addEventListener('change', event => { if (event.target.files[0]) setSingleFile(event.target.files[0]); });
  $('multiInput').addEventListener('change', onMultiFileChosen);
  $('removeSingle').addEventListener('click', removeSingleFile);
  for (const key of ['texture','pbr']) $('toggle-' + key).addEventListener('click', () => toggleOption(key));
  $('generateBtn').addEventListener('click', startGeneration);
  $('stopPollingBtn').addEventListener('click', () => pausePolling('Checking stopped. The cloud task continues and may use credits. Resume to retrieve it, or start a new generation.'));
  $('resumeBtn').addEventListener('click', resumePolling);
  $('newJobBtn').addEventListener('click', newGeneration);
  $('importBtn').addEventListener('click', () => assetAction('import'));
  $('downloadGlbBtn').addEventListener('click', () => assetAction('save'));
  $('copyUrlBtn').addEventListener('click', copyModelUrl);
  $('processBtn').addEventListener('click', startProcessing);
  for (const id of ['processAction','processTextureModel','processTextureQuality','processCompletionMode','processReference']) $(id).addEventListener('change', () => {
    if (id === 'processTextureQuality' && $('processTextureQuality').value === 'fast') $('processTextureModel').value = 'v3.5-20260815';
    if (id === 'processTextureModel' && $('processTextureModel').value !== 'v3.5-20260815' && $('processTextureQuality').value === 'fast') $('processTextureQuality').value = 'standard';
    syncProcessingControls();
  });
  for (const id of ['aiModel', 'geometryQuality', 'meshStyle']) $(id).addEventListener('change', () => syncQualityControls(true));
  $('textureQuality').addEventListener('change', () => { if ($('textureQuality').value === 'fast') $('textureVersion').value = 'v3.5-20260815'; syncQualityControls(); });
  $('textureVersion').addEventListener('change', () => { if ($('textureQuality').value === 'fast' && $('textureVersion').value !== 'v3.5-20260815') $('textureQuality').value = 'standard'; syncQualityControls(); });
  $('modelThumbnail').addEventListener('load', () => { if (!latestModelUrl || modelViewer?.ready) return; $('modelThumbnail').hidden = false; $('thumbnailFallback').hidden = true; setPreviewControls(true); });
  $('modelThumbnail').addEventListener('error', () => { if (!latestModelUrl) return; $('modelThumbnail').hidden = true; $('thumbnailFallback').hidden = false; setPreviewControls(false); });
  $('zoomIn').addEventListener('click', () => { if (modelViewer?.ready) modelViewer.zoom(.8); else updatePreviewZoom(previewZoom + .25); setPreviewControls(true); });
  $('zoomOut').addEventListener('click', () => { if (modelViewer?.ready) modelViewer.zoom(1.25); else updatePreviewZoom(previewZoom - .25); setPreviewControls(true); });
  $('fitPreview').addEventListener('click', () => { if (modelViewer?.ready) modelViewer.fit(); else updatePreviewZoom(); setPreviewControls(true); });
  $('reloadPreview').addEventListener('click', () => { if (modelViewer && latestModelUrl && currentTaskId) { modelViewer.retry(); modelViewer.load(currentTaskId); } });
  $('railGenerate').addEventListener('click', () => { $('generationPane').scrollIntoView({ block: 'nearest', behavior: 'smooth' }); $('railGenerate').classList.add('active'); $('railProperties').classList.remove('active'); $('railAssets').classList.remove('active'); $('tab-' + currentMode).focus(); });
  $('railAssets').addEventListener('click', () => setInspectorTab('assets', true));
  $('railProperties').addEventListener('click', () => setInspectorTab('properties', true));
  $('railAccount').addEventListener('click', () => { $('accountSettings').open = true; $('activateBtn').focus(); });
  for (const tab of ['properties', 'assets']) {
    const button = $(tab === 'properties' ? 'inspectorPropertiesTab' : 'inspectorAssetsTab');
    button.addEventListener('click', () => setInspectorTab(tab));
    button.addEventListener('keydown', event => {
      if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
      event.preventDefault();
      const next = event.key === 'Home' ? 'properties' : event.key === 'End' ? 'assets' : tab === 'properties' ? 'assets' : 'properties';
      setInspectorTab(next, true);
    });
  }
  syncSourcePreview();
  lockControls();
  try {
    const host = await rpc('hello', {}, 8000);
    if (!host.profiles || !host.profiles[$('aiModel').value]) throw new Error('Model capabilities did not load. Reinstall the complete plugin and reopen this window.');
    modelProfiles = host.profiles;
    sessionKeyReady = host.configured === true;
    $('deviceId').value = host.email || '';
    $('keyState').textContent = sessionKeyReady ? 'Signed in. SGAI credits are checked before each paid task.' : 'Add TRIPO_API_KEY to the hosted server environment.';
    bridgeReady = true;
    syncQualityControls(true);
    importSupported = host.import_supported === true;
    $('hostVersion').textContent = 'SG 3D Engine · SGAI ' + host.version;
    lockControls();
    await sgaiTripoRestore(host);
    if(host.warning)showError(host.warning);
  } catch (error) { showError(error.message); }
}

window.addEventListener('beforeunload', () => {
  modelViewer?.dispose();
  pollEpoch++;
  clearTimeout(pollTimer);
  for (const request of requests.values()) clearTimeout(request.timer);
  requests.clear();
});
initialize();

async function sgaiTripoRestore(host){
 for(const job of (host.jobs||[]).slice().reverse())if(job.status==='completed'){
  const settings=job.settings||{};sessionAssets.set(job.id,{name:'Model '+job.id.slice(0,8),thumbnail:null,settings,task:{task_id:job.id,status:'success',output:{model_url:"https://sketchupgurus-ai-server.onrender.com/api/tripo/jobs/"+job.id+'/model'},credits_consumed:Number(job.cost)}});
 }
 renderAssetLibrary();
 if(host.pending){jobSettings=host.pending.settings||{};currentTaskId=host.pending.id;$('taskIdDisplay').textContent=currentTaskId;startPollingTask(currentTaskId);}
}
window.sgaiTripoOpenJob=async function(id){if(busy||assetBusy)return;jobSettings=sessionAssets.get(id)?.settings||{};currentTaskId=id;startPollingTask(id);};
