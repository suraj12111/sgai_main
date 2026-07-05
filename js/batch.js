/* =====================================================
   SGAI Batch Rendering Engine
   Handles SketchUp Scenes, Multi-image Uploads & Viewport Screenshots
   ===================================================== */

window.batchQueue = [];
window.batchIsRunning = false;
window.batchCancelToken = false;
window.batchFilesQueue = [];
window.batchScreenshotsQueue = [];
window._batchSceneResolver = null;
window._batchAddOnCapture = false;

// Open the batch render modal
window.openBatchRenderModal = function() {
  const modal = document.getElementById('batch-render-modal');
  if (!modal) return;
  
  modal.style.display = 'flex';
  
  // Show setup view, hide progress view
  document.getElementById('batch-setup-view').style.display = 'block';
  document.getElementById('batch-progress-view').style.display = 'none';
  
  // Populate the default prompt
  const mainPrompt = document.getElementById('prompt').value || '';
  document.getElementById('batch-prompt-override').value = mainPrompt;
  
  // Clear file uploads queue
  window.batchFilesQueue = [];
  const fileGrid = document.getElementById('batch-files-grid');
  if (fileGrid) fileGrid.innerHTML = '';
  
  // Clear screenshots queue
  window.batchScreenshotsQueue = [];
  const screenshotGrid = document.getElementById('batch-screenshots-grid');
  if (screenshotGrid) screenshotGrid.innerHTML = '';
  
  // Default to scenes tab
  window.switchBatchTab('scenes');
  
  // Request scenes list from SketchUp
  const scenesList = document.getElementById('batch-scenes-list');
  if (scenesList) {
    scenesList.innerHTML = '<div style="font-family:var(--font-mono); font-size:10px; color:var(--text-muted);">Querying SketchUp scenes...</div>';
  }
  
  try {
    if (typeof sketchup !== 'undefined') {
      sketchup.request_scenes();
      // Set a 3-second timeout. If SketchUp doesn't respond, we mock scenes for convenience.
      setTimeout(() => {
        const list = document.getElementById('batch-scenes-list');
        if (list && list.innerHTML.includes('Querying SketchUp scenes')) {
          console.warn('[Batch] SketchUp scenes request timed out. Loading mock scenes.');
          window.receiveScenesList(['Scene 1', 'Scene 2', 'Scene 3']);
        }
      }, 3000);
    } else {
      window.receiveScenesList(['Scene 1', 'Scene 2', 'Scene 3']);
    }
  } catch (e) {
    console.warn('[Batch] sketchup.request_scenes not bound. Rendering mock scenes.', e.message);
    window.receiveScenesList(['Scene 1', 'Scene 2', 'Scene 3']);
  }
}

// Switch between Scenes, Upload, and Screenshots tabs
window.switchBatchTab = function(tabName) {
  document.querySelectorAll('#batch-render-modal .vid-src-tab').forEach(t => t.classList.remove('active'));
  document.getElementById(`batch-tab-${tabName}`)?.classList.add('active');
  
  document.getElementById('batch-content-scenes').style.display = tabName === 'scenes' ? 'block' : 'none';
  document.getElementById('batch-content-upload').style.display = tabName === 'upload' ? 'block' : 'none';
  document.getElementById('batch-content-screenshot').style.display = tabName === 'screenshot' ? 'block' : 'none';
}

// Close modal
window.hideBatchRenderModal = function() {
  if (window.batchIsRunning) {
    if (!confirm("A batch render is currently running. Exit and cancel remaining items?")) return;
    window.cancelBatch();
  }
  const modal = document.getElementById('batch-render-modal');
  if (modal) modal.style.display = 'none';
}

// Receive scenes list callback from Ruby
window.receiveScenesList = function(scenes) {
  const container = document.getElementById('batch-scenes-list');
  if (!container) return;
  
  if (!scenes || scenes.length === 0) {
    container.innerHTML = '<div style="font-family:var(--font-mono); font-size:10px; color:var(--text-muted);">No scenes found in SketchUp. Please create scenes first or upload images below.</div>';
    return;
  }
  
  container.innerHTML = '';
  scenes.forEach(scene => {
    const label = document.createElement('label');
    label.style.cssText = 'display: flex; align-items: center; gap: 8px; font-family: var(--font-mono); font-size: 10px; color: var(--text-main); margin-bottom: 6px; cursor: pointer;';
    label.innerHTML = `
      <input type="checkbox" name="batch-scenes-checked" value="${scene}" checked onchange="window.updateBatchCost()">
      <span>${scene}</span>
    `;
    container.appendChild(label);
  });
  
  window.updateBatchCost();
}

// Handle multiple file upload selection in browser fallback
window.handleBatchFileUpload = function(event) {
  const files = event.target.files;
  if (!files) return;
  
  const fileGrid = document.getElementById('batch-files-grid');
  
  Array.from(files).forEach(file => {
    if (!file.type.startsWith('image/')) return;
    
    const reader = new FileReader();
    reader.onload = (e) => {
      const b64 = e.target.result.replace(/^data:image\/\w+;base64,/, '');
      const fileId = 'file_' + Date.now() + '_' + Math.floor(Math.random() * 1000);
      
      window.batchFilesQueue.push({
        id: fileId,
        name: file.name,
        b64: b64
      });
      
      const thumb = document.createElement('div');
      thumb.id = fileId;
      thumb.className = 'batch-file-thumb';
      thumb.style.cssText = 'position: relative; border-radius: 6px; border: 1px solid rgba(255,255,255,0.1); background: #000; overflow: hidden; width: 64px; height: 64px; margin-right: 4px;';
      thumb.innerHTML = `
        <img src="data:image/jpeg;base64,${b64}" onclick="window.showBatchLightbox('data:image/jpeg;base64,${b64}')" style="width:100%; height:100%; object-fit:cover; opacity:0.8; cursor:pointer;" title="Click to preview">
        <button onclick="window.removeBatchFile('${fileId}')" style="position:absolute; top:2px; right:2px; width:14px; height:14px; line-height:12px; background:rgba(230,51,41,0.85); color:#fff; border:none; border-radius:50%; font-size:8px; cursor:pointer; text-align:center;">&times;</button>
      `;
      if (fileGrid) fileGrid.appendChild(thumb);
      
      window.updateBatchCost();
    };
    reader.readAsDataURL(file);
  });
}

// Remove uploaded file from queue
window.removeBatchFile = function(fileId) {
  window.batchFilesQueue = window.batchFilesQueue.filter(f => f.id !== fileId);
  const el = document.getElementById(fileId);
  if (el) el.remove();
  window.updateBatchCost();
}

// Add captured screenshot to batch queue list
window.addCapturedScreenshotToBatch = function(b64) {
  const fileId = 'screenshot_' + Date.now() + '_' + Math.floor(Math.random() * 1000);
  const name = 'Screenshot ' + (window.batchScreenshotsQueue.length + 1);
  
  window.batchScreenshotsQueue.push({
    id: fileId,
    name: name,
    b64: b64
  });
  
  const grid = document.getElementById('batch-screenshots-grid');
  if (grid) {
    const thumb = document.createElement('div');
    thumb.id = fileId;
    thumb.className = 'batch-screenshot-thumb';
    thumb.style.cssText = 'position: relative; border-radius: 6px; border: 1px solid rgba(0, 229, 255, 0.15); background: #000; overflow: hidden; width: 64px; height: 64px; margin-right: 4px;';
    thumb.innerHTML = `
      <img src="data:image/jpeg;base64,${b64}" onclick="window.showBatchLightbox('data:image/jpeg;base64,${b64}')" style="width:100%; height:100%; object-fit:cover; opacity:0.8; cursor:pointer;" title="Click to preview">
      <button onclick="window.removeBatchScreenshot('${fileId}')" style="position:absolute; top:2px; right:2px; width:14px; height:14px; line-height:12px; background:rgba(230,51,41,0.85); color:#fff; border:none; border-radius:50%; font-size:8px; cursor:pointer; text-align:center;">&times;</button>
    `;
    grid.appendChild(thumb);
  }
  
  window.updateBatchCost();
}

// Grab fresh viewport capture in batch panel
window.grabBatchScreenshot = function() {
  window._batchAddOnCapture = true;
  if (typeof sketchup !== 'undefined') {
    try {
      sketchup.capture_viewport();
    } catch(e) {
      console.warn('[Batch] sketchup.capture_viewport call failed:', e.message);
      window._batchAddOnCapture = false;
    }
  } else {
    // Browser Mock capture fallback
    setTimeout(() => {
      const canvas = document.createElement('canvas');
      canvas.width = 320;
      canvas.height = 180;
      const ctx = canvas.getContext('2d');
      ctx.fillStyle = '#' + Math.floor(Math.random()*16777215).toString(16);
      ctx.fillRect(0, 0, 320, 180);
      ctx.fillStyle = '#ffffff';
      ctx.font = '10px monospace';
      ctx.fillText('Screenshot ' + (window.batchScreenshotsQueue.length + 1), 10, 90);
      const b64 = canvas.toDataURL('image/jpeg').replace(/^data:image\/\w+;base64,/, '');
      window.addCapturedScreenshotToBatch(b64);
      window._batchAddOnCapture = false;
    }, 500);
  }
}

// Add last captured viewport image to batch queue list
window.addExistingScreenshotToBatch = function() {
  if (!window.capturedB64) {
    alert("Please capture the viewport first (or use the Grab Viewport button)!");
    return;
  }
  window.addCapturedScreenshotToBatch(window.capturedB64);
}

// Remove screenshot from queue
window.removeBatchScreenshot = function(screenshotId) {
  window.batchScreenshotsQueue = window.batchScreenshotsQueue.filter(s => s.id !== screenshotId);
  const el = document.getElementById(screenshotId);
  if (el) el.remove();
  window.updateBatchCost();
}

// Wrap global receiveCapturedImage to support batch viewport grabs
if (typeof window.receiveCapturedImage === 'function') {
  const originalReceiveCapturedImage = window.receiveCapturedImage;
  window.receiveCapturedImage = function(b64) {
    originalReceiveCapturedImage(b64);
    if (window._batchAddOnCapture) {
      window.addCapturedScreenshotToBatch(b64);
      window._batchAddOnCapture = false;
    }
  };
}

// Lightbox popup renderer
window.showBatchLightbox = function(src) {
  const lightbox = document.getElementById('batch-lightbox-modal');
  const img = document.getElementById('batch-lightbox-img');
  if (lightbox && img) {
    img.src = src;
    lightbox.style.display = 'flex';
  }
}

// Update total credit cost label
window.updateBatchCost = function() {
  const sceneChecked = document.querySelectorAll('input[name="batch-scenes-checked"]:checked');
  const sceneCount = sceneChecked.length;
  const fileCount = window.batchFilesQueue.length;
  const screenshotCount = window.batchScreenshotsQueue.length;
  
  const totalCount = sceneCount + fileCount + screenshotCount;
  
  const renderQuality = document.querySelector('input[name="render_quality"]:checked')?.value || 'hd';
  const unitCost = renderQuality === '4k' ? 4.0 : 1.0;
  const totalCost = totalCount * unitCost;
  
  const costLabel = document.getElementById('batch-total-cost');
  if (costLabel) {
    costLabel.innerText = `${totalCost.toFixed(1)} CR (${totalCount} renders * ${unitCost} CR)`;
  }
}

// Switch callback from Ruby containing viewport scene capture
window.receiveSceneCapture = function(b64Data, sceneName) {
  const cleanB64 = b64Data.replace(/^data:image\/\w+;base64,/, '');
  if (window._batchSceneResolver) {
    window._batchSceneResolver(cleanB64);
    window._batchSceneResolver = null;
  }
}

// Switch scenes helper returning Promise
window.captureWorkflowScene = function(sceneName) {
  return new Promise((resolve) => {
    window._batchSceneResolver = resolve;
    
    // Safety timeout to prevent locking if Ruby doesn't respond
    const safetyTimeout = setTimeout(() => {
      if (window._batchSceneResolver) {
        console.warn(`[Batch] Scene capture timeout for: ${sceneName}. Using canvas placeholder.`);
        resolve("data:image/gif;base64,R0lGODlhAQABAIAAAP///wAAACH5BAEAAAAALAAAAAABAAEAAAICRAEAOw==");
        window._batchSceneResolver = null;
      }
    }, 15000);
    
    if (typeof sketchup !== 'undefined') {
      try {
        sketchup.capture_scene(sceneName);
      } catch (e) {
        console.error(`[Batch] sketchup.capture_scene call failed for ${sceneName}:`, e.message);
        clearTimeout(safetyTimeout);
        resolve(null);
        window._batchSceneResolver = null;
      }
    } else {
      // Browser Mock capture response
      setTimeout(() => {
        clearTimeout(safetyTimeout);
        resolve("data:image/gif;base64,R0lGODlhAQABAIAAAP///wAAACH5BAEAAAAALAAAAAABAAEAAAICRAEAOw==");
        window._batchSceneResolver = null;
      }, 1000);
    }
  });
}

// Cancel active queue loop
window.cancelBatch = function() {
  window.batchCancelToken = true;
  const cancelBtn = document.getElementById('batch-cancel-btn');
  if (cancelBtn) cancelBtn.innerText = 'CANCELLING...';
}

// Start rendering queue loop
window.startBatchRender = async function() {
  if (window.batchIsRunning) return;
  
  let items = [];
  
  // 1. Collect checked scenes
  const checked = document.querySelectorAll('input[name="batch-scenes-checked"]:checked');
  checked.forEach(chk => {
    items.push({ type: 'scene', name: chk.value });
  });
  
  // 2. Collect uploaded files
  window.batchFilesQueue.forEach(file => {
    items.push({ type: 'file', name: file.name, b64: file.b64 });
  });
  
  // 3. Collect captured screenshots
  window.batchScreenshotsQueue.forEach(shot => {
    items.push({ type: 'screenshot', name: shot.name, b64: shot.b64 });
  });
  
  if (items.length === 0) {
    alert("Please select at least one scene, upload an image, or capture a screenshot to begin!");
    return;
  }
  
  // Calculate total costs
  const renderQuality = document.querySelector('input[name="render_quality"]:checked')?.value || 'hd';
  const unitCost = renderQuality === '4k' ? 4.0 : 1.0;
  const totalCost = items.length * unitCost;
  
  // Verify credits
  const currentCreditsText = document.getElementById('credit-counter').innerText;
  const currentCredits = parseFloat(currentCreditsText.replace(/[^0-9.]/g, '')) || 0;
  if (currentCredits < totalCost) {
    alert(`Insufficient credits! Total Cost: ${totalCost} CR. You have: ${currentCredits} CR.`);
    return window.showPaywall();
  }
  
  // Initialize progress panel
  document.getElementById('batch-setup-view').style.display = 'none';
  document.getElementById('batch-progress-view').style.display = 'block';
  
  const statusContainer = document.getElementById('batch-status-list');
  const galleryContainer = document.getElementById('batch-results-gallery');
  statusContainer.innerHTML = '';
  galleryContainer.innerHTML = '';
  
  // Populate statuses
  items.forEach((item, index) => {
    const row = document.createElement('div');
    row.id = `batch-row-${index}`;
    row.style.cssText = 'display:flex; justify-content:space-between; align-items:center; font-family:var(--font-mono); font-size:10px; padding:6px 0; border-bottom:1px solid rgba(255,255,255,0.04);';
    row.innerHTML = `
      <span style="color:var(--text-main); font-weight:700;">${item.name}</span>
      <span id="batch-status-lbl-${index}" style="color:var(--text-muted);">Pending</span>
    `;
    statusContainer.appendChild(row);
  });
  
  const progressBar = document.getElementById('batch-progress-bar');
  const progressText = document.getElementById('batch-progress-text');
  progressBar.style.width = '0%';
  progressText.innerText = '0%';
  
  window.batchIsRunning = true;
  window.batchCancelToken = false;
  
  const batchPrompt = document.getElementById('batch-prompt-override').value || 'Generative render';
  const negativePrompt = document.getElementById('negative-prompt').value || '';
  
  let combinedPrompt = batchPrompt;
  if (window.selectedPresetPrompt) {
    combinedPrompt = window.selectedPresetPrompt + (batchPrompt && batchPrompt !== 'Generative render' ? ". " + batchPrompt : "");
  }
  
  let combinedNegative = negativePrompt;
  if (window.selectedPresetNegative) {
    combinedNegative = window.selectedPresetNegative + (negativePrompt ? ", " + negativePrompt : "");
  }

  const presetStyle = document.getElementById('architectural_style_select').value;
  const presetEnv = document.getElementById('environment_preset_select').value;
  const presetBackdrop = document.getElementById('backdrop_preset_select').value;
  const presetMaterial = document.getElementById('material_preset_select').value;
  const geoVal = document.getElementById('geometry-lock').value || '10';
  
  let geoPrompt = "STRICT GEOMETRY LOCK: Do not alter the fundamental architectural structure, walls, or layout.";
  if (geoVal > 33 && geoVal < 66) geoPrompt = "Maintain the general structure but you can alter minor details and furniture.";
  if (geoVal >= 66) geoPrompt = "Be highly creative. You are free to redesign the space, structure, and layout.";
  
  let negPromptString = combinedNegative ? ` NEGATIVE PROMPT (AVOID THESE): ${combinedNegative}.` : "";
  const qualitySuffix = renderQuality === '4k'
    ? " RENDER QUALITY: Ultra-high resolution 4K output. Extreme detail, hyper-realistic textures, crisp edges, studio-grade photorealism."
    : " RENDER QUALITY: High definition HD output, high quality photorealistic render.";
  
  let matPrompt = presetMaterial ? ` Material Override: ${presetMaterial}.` : "";
  let backdropPrompt = presetBackdrop ? ` Backdrop: ${presetBackdrop}.` : "";
  const fullPromptText = `${combinedPrompt}. Style: ${presetStyle}. Environment: ${presetEnv}.${backdropPrompt}${matPrompt} ${geoPrompt}${negPromptString}${qualitySuffix}`;
  
  const token = localStorage.getItem('sgai_auth_token');
  const SERVER = (document.getElementById('i3d-server-url') || {value:'http://localhost:3000'}).value.replace(/\/$/, '') || 'http://localhost:3000';
  
  // Sequential batch processing loop
  for (let i = 0; i < items.length; i++) {
    if (window.batchCancelToken) {
      for (let j = i; j < items.length; j++) {
        document.getElementById(`batch-status-lbl-${j}`).innerText = 'Cancelled ⚠️';
        document.getElementById(`batch-status-lbl-${j}`).style.color = 'var(--accent-gold)';
      }
      break;
    }
    
    const item = items[i];
    const statusLbl = document.getElementById(`batch-status-lbl-${i}`);
    statusLbl.innerText = 'Rendering... ⏳';
    statusLbl.style.color = 'var(--accent-primary)';
    
    // Resolve base64 source image
    let base64Image = '';
    if (item.type === 'file' || item.type === 'screenshot') {
      base64Image = item.b64;
    } else {
      // In SketchUp, trigger scene switch and screen capture
      const captured = await window.captureWorkflowScene(item.name);
      base64Image = captured;
    }
    
    if (!base64Image) {
      statusLbl.innerText = 'Capture Failed ❌';
      statusLbl.style.color = 'var(--danger)';
      continue;
    }
    
    // Construct payload
    const parts = [{ inlineData: { mimeType: "image/jpeg", data: base64Image } }];
    if (window.styleB64) parts.push({ inlineData: { mimeType: "image/jpeg", data: window.styleB64 } });
    if (window.propImages) {
      window.propImages.forEach(p => parts.push({ inlineData: { mimeType: "image/jpeg", data: p.data } }));
    }
    parts.push({ text: fullPromptText });
    
    const payload = {
      mode: "draft", version: "2.0",
      renderQuality, geminiPayload: { contents: [{ role: "user", parts }] },
      model: document.getElementById('render-model').value || 'gemini',
      aspectRatio: window.capturedAspectRatio || (16/9)
    };
    
    try {
      const res = await fetch(`${SERVER}/api/generate`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer ' + token
        },
        body: JSON.stringify(payload)
      });
      
      const data = await res.json();
      
      if (!res.ok || !data.data || !data.data.candidates) {
        throw new Error(data.error || 'Server Generation Failed');
      }
      
      const outputB64 = data.data.candidates[0].content.parts[0].inlineData.data;
      
      // Save item to IndexedDB history
      if (typeof window.saveToHistory === 'function') {
        window.saveToHistory(
          base64Image,
          outputB64,
          `[Batch: ${item.name}] ${batchPrompt}`,
          window.capturedAspectRatio || (16/9)
        );
      }
      
      // Show render output in batch gallery
      const thumb = document.createElement('div');
      thumb.style.cssText = 'position: relative; border-radius: 6px; border: 1px solid rgba(0, 229, 255, 0.2); background: #000; overflow: hidden; display: flex; align-items:center; justify-content:center;';
      thumb.innerHTML = `
        <img src="data:image/jpeg;base64,${outputB64}" onclick="window.showBatchLightbox('data:image/jpeg;base64,${outputB64}')" style="width:100%; height:100%; object-fit:cover; cursor:pointer;" title="Click to view full size">
        <div style="position:absolute; bottom:4px; left:4px; font-family:var(--font-mono); font-size:7px; color:#fff; background:rgba(8,10,15,0.85); padding:2px 4px; border-radius:3px; border:1px solid rgba(255,255,255,0.1);">${item.name}</div>
      `;
      galleryContainer.appendChild(thumb);
      
      statusLbl.innerText = 'Completed ✅';
      statusLbl.style.color = 'var(--accent-green)';
      
    } catch (err) {
      console.error(`[Batch] Rendering failed for ${item.name}:`, err.message);
      statusLbl.innerText = 'Failed ❌';
      statusLbl.style.color = 'var(--danger)';
    }
    
    // Update progress bar
    const progress = Math.round(((i + 1) / items.length) * 100);
    progressBar.style.width = progress + '%';
    progressText.innerText = progress + '%';
  }
  
  // Cleanup
  window.batchIsRunning = false;
  const cancelBtn = document.getElementById('batch-cancel-btn');
  if (cancelBtn) cancelBtn.innerText = 'CLOSE';
  
  if (typeof window.syncCredits === 'function') {
    window.syncCredits();
  }
  if (typeof window.loadHistoryUI === 'function') {
    window.loadHistoryUI();
  }
}
