let currentMode = 'scenes'; // 'scenes' or 'screenshot'
let scenes = [];
let screenshotData = null;
let currentSavedVideoPath = null;
let isInitialized = false;
let busy = false;
let uploadedImages = [];
let presetGroup = 'Interior';

function refreshIcons() {
  if (window.lucide) window.lucide.createIcons();
}

function togglePreviewFocus() {
  document.getElementById('app-container').classList.toggle('preview-focus');
}

function updatePreviewSettings() {
  document.getElementById('preview-format').innerText = document.getElementById('aspect-ratio').value + ' / ' + document.getElementById('video-res').value;
  document.getElementById('preview-duration').innerText = document.getElementById('video-duration').value + ' seconds';
}

function markCustomPrompt() {
  document.getElementById('architecture-preset').value = '';
  renderPresetGallery();
}

function clearPrompt() {
  if (busy) return;
  document.getElementById('prompt-input').value = '';
  markCustomPrompt();
  document.getElementById('prompt-input').focus();
}

function setPresetGroup(group) {
  if (busy) return;
  presetGroup = group;
  renderPresetGallery();
}

function renderPresetGallery() {
  const selected = document.getElementById('architecture-preset').value;
  document.getElementById('filter-interior').classList.toggle('active', presetGroup === 'Interior');
  document.getElementById('filter-exterior').classList.toggle('active', presetGroup === 'Exterior');
  const thumbnails = {
    interior_daylight: 'interior-daylight.jpg', interior_luxury: 'interior-warm.jpg',
    interior_minimal: 'interior-minimal.jpg', interior_scandinavian: 'interior-daylight.jpg',
    interior_evening: 'interior-warm.jpg', interior_industrial: 'interior-minimal.jpg',
    interior_kitchen: 'interior-minimal.jpg', interior_hospitality: 'interior-warm.jpg',
    exterior_golden: 'exterior-daylight.jpg', exterior_blue: 'exterior-entry.jpg',
    exterior_overcast: 'exterior-urban.jpg', exterior_tropical: 'exterior-garden.jpg',
    exterior_urban: 'exterior-urban.jpg', exterior_night: 'exterior-evening.jpg',
    exterior_rain: 'exterior-entry.jpg', exterior_courtyard: 'exterior-garden.jpg'
  };
  document.getElementById('preset-gallery').innerHTML = architecturePresets.filter(p => p.group === presetGroup).map(preset => {
    const image = thumbnails[preset.id];
    return `<button class="gallery-card ${selected === preset.id ? 'active' : ''}" data-sg-click="action199" data-sg-arg-0="${sgaiMarkupText(JSON.stringify(preset.id))}" title="${escapeHtml(preset.name)}" aria-pressed="${selected === preset.id}">
      <img src="assets/${image}" alt="${preset.group} architectural inspiration">
      <span class="selection-marker"><i data-lucide="check"></i></span>
      <strong>${escapeHtml(preset.name)}</strong><small>${preset.group} / Atmosphere</small></button>`;
  }).join('');
  refreshIcons();
}

function sourceFrames() {
  if (currentMode === 'images') return uploadedImages;
  if (currentMode === 'screenshot') return screenshotData ? [{ ...screenshotData, name: 'Viewport', transition_time: 1 }] : [];
  return scenes.filter(scene => scene.selected);
}

function showReference(index) {
  if (currentSavedVideoPath) return;
  const frames = sourceFrames();
  const ref = document.getElementById('workspace-reference');
  if (!frames[index]) return;
  ref.src = frames[index].thumb;
  ref.style.display = 'block';
  document.getElementById('player-empty').style.display = 'none';
  document.getElementById('preview-state').innerText = 'REFERENCE';
}

function renderStoryboard() {
  const frames = sourceFrames();
  const duration = Number(document.getElementById('video-duration').value) || 10;
  const total = frames.reduce((sum, frame) => sum + Number(frame.transition_time || 3), 0);
  document.getElementById('storyboard-count').innerText = `${frames.length} ${frames.length === 1 ? 'FRAME' : 'FRAMES'}`;
  document.getElementById('storyboard').innerHTML = frames.length ? frames.map((frame, index) =>
    `<button class="frame-tile" data-sg-click="action200" data-sg-arg-0="${sgaiMarkupText(JSON.stringify(index))}" title="${escapeHtml(frame.name || 'Viewport')}">
      <img src="${escapeHtml(frame.thumb || '')}" alt="${escapeHtml(frame.name || 'Viewport')}">
      <div><strong>${String(index + 1).padStart(2, '0')} / ${escapeHtml(frame.name || 'Viewport')}</strong><small>${(Number(frame.transition_time || 3) / total * duration).toFixed(1)}s</small></div></button>`).join('') : '<span class="storyboard-empty">No frames selected</span>';
  if (!currentSavedVideoPath) {
    if (frames.length) showReference(0);
    else {
      document.getElementById('workspace-reference').style.display = 'none';
      document.getElementById('player-empty').style.display = 'flex';
      document.getElementById('preview-state').innerText = 'AWAITING INPUT';
    }
  }
}
const architecturePresets = [
  { id: 'interior_daylight', group: 'Interior', name: 'Natural Daylight',
    prompt: 'Photorealistic interior in soft natural daylight. Gentle window light, balanced exposure, realistic indirect illumination and contact shadows. Show the existing finishes, furnishings and spatial proportions clearly. Preserve the reference architecture and furniture layout. Calm atmosphere, restrained contrast, no added objects or people.' },
  { id: 'interior_luxury', group: 'Interior', name: 'Luxury Residence',
    prompt: 'High-end residential interior with refined architectural photography. Warm layered lighting, subtle reflections on existing stone and metal, detailed fabric and timber textures. Preserve the reference geometry, furnishings and material palette. Rich but balanced exposure, elegant quiet atmosphere, no new furniture or decorative objects.' },
  { id: 'interior_minimal', group: 'Interior', name: 'Minimalist Gallery',
    prompt: 'Minimalist interior with clean architectural composition. Soft diffuse daylight, neutral color balance, precise edges, fine surface texture and gentle shadow gradients. Emphasize the existing open space and simple forms. Preserve the reference layout and materials. No added artwork, furniture, clutter or people.' },
  { id: 'interior_scandinavian', group: 'Interior', name: 'Scandinavian Warmth',
    prompt: 'Warm Scandinavian interior atmosphere. Soft cool daylight balanced with subtle warm practical lighting, natural timber grain, tactile upholstery and realistic matte finishes. Retain the existing architecture, furniture and colors from the references. Airy exposure, comfortable domestic mood, no additional decor or people.' },
  { id: 'interior_evening', group: 'Interior', name: 'Cozy Evening',
    prompt: 'Photorealistic interior at evening with warm practical lighting from existing fixtures. Soft pools of light, subtle reflections, gentle falloff and visible detail in darker corners. Preserve the reference architecture and furniture arrangement. Comfortable intimate mood, no extra lamps, objects or people.' },
  { id: 'interior_industrial', group: 'Interior', name: 'Industrial Detail',
    prompt: 'Architectural interior study emphasizing existing concrete, brick, steel and timber surfaces. Directional daylight, realistic texture variation, crisp structural details and restrained cinematic contrast. Preserve the reference finishes and construction exactly; do not introduce industrial elements that are absent. No added furniture or people.' },
  { id: 'interior_kitchen', group: 'Interior', name: 'Kitchen and Joinery',
    prompt: 'Premium kitchen interior visualization. Clean daylight, realistic cabinet joinery, detailed worktop textures, subtle appliance reflections and accurate contact shadows. Maintain every opening, cabinet position and furniture item shown in the references. Balanced exposure, polished but natural finish, no added appliances, utensils or people.' },
  { id: 'interior_hospitality', group: 'Interior', name: 'Hotel and Hospitality',
    prompt: 'Sophisticated hospitality interior with inviting layered illumination. Highlight existing reception, seating and circulation spaces through soft shadows, realistic upholstery and restrained reflections. Preserve the reference architecture, fixtures and furniture. Warm professional atmosphere, balanced highlights, no added signage, guests or decorative objects.' },
  { id: 'exterior_golden', group: 'Exterior', name: 'Golden Hour',
    prompt: 'Photorealistic architectural exterior in late-afternoon golden-hour light. Warm sunlight grazing the existing facade, long soft shadows, detailed materials and natural glass reflections. Preserve the building geometry, landscape layout and surroundings from the references. Clear architectural visibility, realistic sky, no added buildings, vehicles or people.' },
  { id: 'exterior_blue', group: 'Exterior', name: 'Blue Hour',
    prompt: 'Architectural exterior at blue hour just after sunset. Cool ambient sky light balanced against warm illumination from existing windows and fixtures. Realistic glass reflections, fine facade details and readable shadows. Preserve the reference building and landscape. Restrained cinematic contrast, no new lights, buildings or people.' },
  { id: 'exterior_overcast', group: 'Exterior', name: 'Soft Overcast',
    prompt: 'Photorealistic exterior under bright soft overcast daylight. Even facade illumination, neutral colors, subtle contact shadows and clearly visible material textures. Preserve the exact reference massing, openings and site arrangement. Clean architectural documentation atmosphere, natural cloud cover, no added vegetation, vehicles or people.' },
  { id: 'exterior_tropical', group: 'Exterior', name: 'Tropical Resort',
    prompt: 'Architectural exterior with a warm tropical-resort atmosphere. Clear daylight, humid natural air, realistic reflections and gentle movement in vegetation already present. Preserve the reference building, planting, water features and site boundaries. Rich natural colors without oversaturation, no new pools, palm trees, structures or people.' },
  { id: 'exterior_urban', group: 'Exterior', name: 'Urban Streetscape',
    prompt: 'Contemporary urban architectural exterior in clear daylight. Emphasize the existing building frontage, ground-level access and relationship to the street. Realistic facade textures, balanced window reflections and natural shadows. Preserve neighboring structures and street layout from the references. No added traffic, signage or pedestrians.' },
  { id: 'exterior_night', group: 'Exterior', name: 'Night Facade',
    prompt: 'Photorealistic night exterior emphasizing the existing architectural lighting. Warm window glow, controlled highlights, subtle glass reflections and readable facade detail against a dark natural sky. Preserve the building and site geometry. Elegant quiet atmosphere, no invented light fixtures, neon signs, vehicles or people.' },
  { id: 'exterior_rain', group: 'Exterior', name: 'After the Rain',
    prompt: 'Architectural exterior immediately after light rain. Subtle wet reflections on existing paving, realistic damp material response, soft cloudy daylight and gentle atmospheric depth. Preserve the reference building, landscape and site layout. Keep the facade clearly visible, no heavy fog, new puddle features, traffic or people.' },
  { id: 'exterior_courtyard', group: 'Exterior', name: 'Courtyard and Landscape',
    prompt: 'Calm architectural courtyard and landscape visualization. Soft morning light, detailed existing paving and planting, gentle movement in leaves and natural shadow patterns. Preserve the reference architecture, planting beds, paths and furniture. Balanced exposure and tranquil atmosphere, no new plants, fountains, structures or people.' }
];

function loadArchitecturePresets() {
  const select = document.getElementById('architecture-preset');
  select.innerHTML = '<option value="">Custom Prompt</option>' + ['Interior', 'Exterior'].map(group =>
    `<optgroup label="${group}">${architecturePresets.filter(preset => preset.group === group).map(preset =>
      `<option value="${preset.id}">${escapeHtml(preset.name)}</option>`).join('')}</optgroup>`).join('');
  renderPresetGallery();
}

function applyArchitecturePreset(id) {
  if (busy) return;
  const preset = architecturePresets.find(item => item.id === id);
  if (!preset) return;
  const prompt = document.getElementById('prompt-input');
  prompt.value = preset.prompt;
  prompt.scrollTop = 0;
  prompt.focus();
  document.getElementById('architecture-preset').value = id;
  presetGroup = preset.group;
  renderPresetGallery();
}

function setBusy(value) {
  busy = value;
  document.getElementById('app-container').classList.toggle('is-busy', value);
  document.querySelectorAll('button, input, select, textarea').forEach(el => {
    el.disabled = value || !!(el.dataset && el.dataset.unavailable === 'true');
  });
  document.getElementById('btn-export').disabled = value || !currentSavedVideoPath;
  document.getElementById('btn-open-video').disabled = value || !currentSavedVideoPath;
  if (typeof updateCost === 'function') updateCost();
}

function invalidateScreenshot() {
  screenshotData = null;
  document.getElementById('shot-preview-img').style.display = 'none';
  document.getElementById('shot-empty-msg').innerText = 'Capture the viewport for this aspect ratio';
  renderStoryboard();
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
}

window.addEventListener('DOMContentLoaded', () => {
  loadArchitecturePresets();
  refreshIcons();
  updatePreviewSettings();
  renderScenes();
  document.getElementById('connection-state').innerText = 'SGAI Connected';
});

function setMode(mode) {
  currentMode = mode;
  document.getElementById('tab-scenes').classList.toggle('active', mode === 'scenes');
  document.getElementById('tab-screenshot').classList.toggle('active', mode === 'screenshot');
  document.getElementById('tab-images').classList.toggle('active', mode === 'images');
  
  document.getElementById('scenes-panel').style.display = mode === 'scenes' ? 'flex' : 'none';
  document.getElementById('screenshot-panel').style.display = mode === 'screenshot' ? 'flex' : 'none';
  document.getElementById('images-panel').style.display = mode === 'images' ? 'flex' : 'none';
  if (mode === 'images') renderImages();
  renderStoryboard();

  if (mode === 'screenshot' && !screenshotData) {
    takeScreenshot();
  }
}

function refreshScenes() {
  if (window.sketchup) sketchup.refresh_scenes();
}

function takeScreenshot() {
  const ratio = document.getElementById('aspect-ratio').value;
  if (window.sketchup) sketchup.capture_live_screenshot(ratio);
}

function setScreenshotData(data) {
  screenshotData = data;
  const img = document.getElementById('shot-preview-img');
  img.src = data.thumb;
  img.style.display = 'block';
  document.getElementById('shot-empty-msg').innerText = 'Screenshot captured from active camera view';
  renderStoryboard();
}

function loadScenes(data) {
  const previous = new Map(scenes.map(s => [s.id, s]));
  scenes = Array.isArray(data) ? data.map(s => {
    const old = previous.get(s.id);
    return { ...s, motion: old ? old.motion : (s.motion || 'auto'),
      selected: old ? old.selected : s.selected,
      transition_time: old ? old.transition_time : s.transition_time };
  }) : [];
  renderScenes();
}

function renderScenes() {
  const container = document.getElementById('scenes-container');
  container.innerHTML = '';
  let rank = 1;

  if (scenes.length === 0) {
    container.innerHTML = '<li class="empty-state" style="padding:28px 0;">No saved scenes</li>';
    document.getElementById('active-count').innerText = '0 Active';
    renderStoryboard();
    return;
  }

  scenes.forEach((sc, i) => {
    const li = document.createElement('li');
    li.className = `scene-item ${sc.selected ? '' : 'excluded'}`;

    li.innerHTML = `
      <span class="order-pill">${sc.selected ? rank++ : '-'}</span>
      <img class="thumb" src="${escapeHtml(sc.thumb || '')}" />
      <div class="info">
        <div class="name" title="${escapeHtml(sc.name)}">${escapeHtml(sc.name)}</div>
        <div class="controls-sub">
          <select data-sg-change="action201" data-sg-arg-0="${sgaiMarkupText(JSON.stringify(i))}">
            <option value="auto" ${sc.motion === 'auto' ? 'selected' : ''}>Auto Path</option>
            <option value="dolly_in" ${sc.motion === 'dolly_in' ? 'selected' : ''}>Dolly In</option>
            <option value="dolly_out" ${sc.motion === 'dolly_out' ? 'selected' : ''}>Dolly Out</option>
            <option value="orbit_clockwise" ${sc.motion === 'orbit_clockwise' ? 'selected' : ''}>Orbit</option>
            <option value="orbit_counter" ${sc.motion === 'orbit_counter' ? 'selected' : ''}>Orbit CCW</option>
            <option value="pan_left_to_right" ${sc.motion === 'pan_left_to_right' ? 'selected' : ''}>Pan</option>
            <option value="pan_right_to_left" ${sc.motion === 'pan_right_to_left' ? 'selected' : ''}>Pan Left</option>
            <option value="crane_up" ${sc.motion === 'crane_up' ? 'selected' : ''}>Crane</option>
            <option value="drone_flythrough" ${sc.motion === 'drone_flythrough' ? 'selected' : ''}>Glide</option>
          </select>
          <span>Weight:</span>
          <input type="number" min="1" max="15" step="0.5" value="${escapeHtml(sc.transition_time)}"
                 title="Relative share of video duration" aria-label="Scene timing weight"
                 data-sg-change="action202" data-sg-arg-0="${sgaiMarkupText(JSON.stringify(i))}">
        </div>
      </div>
      <label class="scene-include"><input type="checkbox" ${sc.selected ? 'checked' : ''} data-sg-change="action203" data-sg-arg-0="${sgaiMarkupText(JSON.stringify(i))}">Include</label>
    `;
    container.appendChild(li);
  });

  document.getElementById('active-count').innerText = `${scenes.filter(s => s.selected).length} Active`;
  renderStoryboard();
}

function applyBatchMotion(motionKey) {
  if (currentMode === 'scenes') {
    scenes.forEach(s => { if (s.selected) s.motion = motionKey; });
    renderScenes();
  } else if (currentMode === 'images') {
    uploadedImages.forEach(image => { image.motion = motionKey; });
    renderImages();
  } else if (screenshotData) {
    screenshotData.motion = motionKey;
    updateStatus(`Motion preset set to: ${motionKey}`);
  }
}

function updateSceneMotion(idx, motionKey) {
  scenes[idx].motion = motionKey;
}

function toggleScene(idx) {
  scenes[idx].selected = !scenes[idx].selected;
  renderScenes();
}

function updateDuration(idx, val) {
  const duration = Number(val);
  scenes[idx].transition_time = Number.isFinite(duration) ? Math.max(1, Math.min(15, duration)) : 3;
  renderScenes();
}

function readImage(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Could not read ' + file.name));
    reader.onload = () => {
      const image = new Image();
      image.onerror = () => reject(new Error('Could not decode ' + file.name));
          image.onload = () => {
            if (image.naturalWidth > 8192 || image.naturalHeight > 8192 || image.naturalWidth * image.naturalHeight > 24000000) {
              reject(new Error('Image dimensions are too large. Use up to 24 megapixels and 8192 pixels per side.'));
              return;
            }
            resolve({ name: file.name, data: String(reader.result).split(',')[1],
              thumb: reader.result, size: file.size, motion: 'auto', transition_time: 3 });
          };
      image.src = reader.result;
    };
    reader.readAsDataURL(file);
  });
}

async function uploadImages(fileList) {
  if (busy) return;
  const files = Array.from(fileList);
  if (!files.length) return;
  try {
    if (uploadedImages.length + files.length > 8) throw new Error('Upload up to eight images per clip.');
    if (files.some(file => !['image/png', 'image/jpeg', 'image/webp'].includes(file.type))) {
      throw new Error('Upload PNG, JPEG or WebP images only.');
    }
    if (files.some(file => file.size > 4 * 1024 * 1024)) throw new Error('Each image must be 4 MB or smaller.');
    const total = uploadedImages.reduce((sum, image) => sum + image.size, 0) + files.reduce((sum, file) => sum + file.size, 0);
    if (total > 16 * 1024 * 1024) throw new Error('Images must total 16 MB or less.');
    setBusy(true);
    updateStatus('Loading images...');
    const added = [];
    for (const file of files) added.push(await readImage(file));
    uploadedImages.push(...added);
    renderImages();
    updateStatus('Images ready');
  } catch (error) {
    updateStatus('Error: ' + error.message);
  } finally {
    setBusy(false);
    document.getElementById('image-files').value = '';
  }
}

function renderImages() {
  const container = document.getElementById('images-container');
  container.innerHTML = '';
  document.getElementById('image-count').innerText = `${uploadedImages.length} / 8`;
  renderStoryboard();
  if (!uploadedImages.length) {
    container.innerHTML = '<li class="empty-state" style="padding:14px;">No images selected</li>';
    return;
  }
  const motions = { auto: 'Auto Path', dolly_in: 'Dolly In', dolly_out: 'Dolly Out',
    orbit_clockwise: 'Orbit', orbit_counter: 'Orbit CCW', pan_left_to_right: 'Pan Right',
    pan_right_to_left: 'Pan Left', crane_up: 'Crane', drone_flythrough: 'Glide' };
  uploadedImages.forEach((image, index) => {
    const row = document.createElement('li');
    row.className = 'scene-item';
    row.innerHTML = `<span class="order-pill">${index + 1}</span>
      <img class="thumb" src="${escapeHtml(image.thumb)}" alt="${escapeHtml(image.name)}">
      <div class="info"><div class="name" title="${escapeHtml(image.name)}">${escapeHtml(image.name)}</div>
        <div class="controls-sub"><select aria-label="Image camera motion" data-sg-change="action204" data-sg-arg-0="${sgaiMarkupText(JSON.stringify(index))}">
          ${Object.entries(motions).map(([key, name]) => `<option value="${key}" ${image.motion === key ? 'selected' : ''}>${name}</option>`).join('')}
        </select><input type="number" min="1" max="15" step="0.5" value="${image.transition_time}"
          title="Relative share of video duration" aria-label="Image timing weight" data-sg-change="action205" data-sg-arg-0="${sgaiMarkupText(JSON.stringify(index))}"></div>
      </div><div class="image-actions">
        <button class="btn-sm" title="Move image earlier" aria-label="Move image earlier" data-sg-click="action206" data-sg-arg-0="${sgaiMarkupText(JSON.stringify(index))}" data-unavailable="${index === 0}" ${index === 0 ? 'disabled' : ''}><i data-lucide="arrow-up"></i></button>
        <button class="btn-sm" title="Move image later" aria-label="Move image later" data-sg-click="action207" data-sg-arg-0="${sgaiMarkupText(JSON.stringify(index))}" data-unavailable="${index === uploadedImages.length - 1}" ${index === uploadedImages.length - 1 ? 'disabled' : ''}><i data-lucide="arrow-down"></i></button>
        <button class="btn-sm" title="Remove image" aria-label="Remove image" data-sg-click="action208" data-sg-arg-0="${sgaiMarkupText(JSON.stringify(index))}"><i data-lucide="x"></i></button>
      </div>`;
    container.appendChild(row);
  });
  refreshIcons();
}

function updateImageMotion(index, value) { uploadedImages[index].motion = value; }
function updateImageWeight(index, value) {
  const weight = Number(value);
  uploadedImages[index].transition_time = Number.isFinite(weight) ? Math.max(1, Math.min(15, weight)) : 3;
  renderImages();
}
function removeImage(index) {
  uploadedImages.splice(index, 1);
  renderImages();
}
function moveImage(index, direction) {
  const target = index + direction;
  if (target < 0 || target >= uploadedImages.length) return;
  [uploadedImages[index], uploadedImages[target]] = [uploadedImages[target], uploadedImages[index]];
  renderImages();
}

function triggerRender() {
  onApiError('The SGAI server connection has not loaded.');
}

function updateStatus(msg) {
  document.getElementById('status-text').innerText = msg;
}

function onVideoReady(streamSrc, localFilePath, warning) {
  currentSavedVideoPath = localFilePath;
  document.getElementById('workspace-reference').style.display = 'none';
  document.getElementById('preview-state').innerText = streamSrc ? 'GENERATED VIDEO' : 'MP4 READY';

  setBusy(false);
  document.getElementById('status-text').innerText = warning || 'Complete!';
  const empty = document.getElementById('player-empty');
  empty.style.display = streamSrc ? 'none' : 'block';
  empty.innerText = streamSrc ? '' : 'Preview unavailable. MP4 ready to open or export.';

  const player = document.getElementById('player-video');
  player.style.display = streamSrc ? 'block' : 'none';
  if (!streamSrc) { player.removeAttribute('src'); player.load(); return; }
  player.muted = true;
  player.src = streamSrc;
  player.load();
  player.play().catch(e => {
    if (e.name === 'NotAllowedError') updateStatus('Video ready. Press Play to preview.');
    else if (e.name !== 'AbortError') onPlaybackError();
  });

  // Enable Export Button
  document.getElementById('btn-export').disabled = false;
}

function onPlaybackError() {
  if (!currentSavedVideoPath) return;
  const player = document.getElementById('player-video');
  const code = player.error ? player.error.code : 0;
  const reason = code === 4 ? 'This browser cannot play the supplied video format.' :
    code === 3 ? 'The preview could not be decoded.' : 'The preview could not be loaded.';
  player.style.display = 'none';
  document.getElementById('player-empty').style.display = 'block';
  document.getElementById('player-empty').innerText = reason;
  updateStatus(reason + ' MP4 is ready to open or export.');
}

function openVideo() {
  if (currentSavedVideoPath && window.sketchup) sketchup.open_video();
}

function exportVideo() {
  if (!currentSavedVideoPath) {
    alert('No generated video available to export.');
    return;
  }
  sketchup.export_video_file(currentSavedVideoPath);
}

function onApiError(err) {
  setBusy(false);
  document.getElementById('status-text').innerText = 'Error: ' + err;
}
