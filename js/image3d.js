/* =====================================================
   SGAI RENDER ENGINE — image3d.js
   Image-to-3D generation via Meshy API,
   slot management, polling, SKP import
   ===================================================== */

var i3dMode    = 'single';
var i3dSingleFile  = null;
var i3dMultiFiles  = [null, null, null, null];
var i3dActiveSlot  = null;
var i3dToggles     = { texture: true, pbr: true, remesh: true };
var i3dTaskId      = null;
var i3dPollTimer   = null;
var i3dGlbUrl      = null;
var i3dCurrentCost = 10;
var i3dCreditDeducted = false;
var I3D_SLOT_LABELS = ['Front', 'Left', 'Right', 'Back'];
var I3D_SLOT_ICONS  = ['Up', 'Lf', 'Rt', 'Bk'];

function i3dServerBase() {
  return (document.getElementById('i3d-server-url') || { value: 'http://localhost:3000' })
    .value.replace(/\/$/, '');
}

function i3dPingServer() {
  var dot = document.getElementById('i3d-server-dot');
  var txt = document.getElementById('i3d-server-txt');
  if (dot) dot.className = 'i3d-server-dot';
  if (txt) txt.textContent = 'Checking...';
  fetch(i3dServerBase() + '/health', { signal: AbortSignal.timeout(4000) })
    .then(function(r) {
      if (r.ok) {
        if (dot) dot.classList.add('ok');
        if (txt) txt.textContent = 'Connected';
      } else throw 0;
    })
    .catch(function() {
      if (dot) dot.classList.add('err');
      if (txt) txt.textContent = 'Offline';
    });
}

function i3dSwitchMode(mode) {
  i3dMode = mode;
  document.getElementById('i3d-pill-single').classList.toggle('active', mode === 'single');
  document.getElementById('i3d-pill-multi').classList.toggle('active', mode === 'multi');
  document.getElementById('i3d-single-wrap').style.display = mode === 'single' ? '' : 'none';
  document.getElementById('i3d-multi-wrap').style.display  = mode === 'multi'  ? '' : 'none';
}

function i3dHandleFile(e, mode) {
  var f = e.target.files[0]; if (!f) return; e.target.value = '';
  var r = new FileReader();
  r.onload = function(ev) {
    if (mode === 'single') {
      i3dSingleFile = ev.target.result;
      document.getElementById('i3d-prev-single-img').src = i3dSingleFile;
      document.getElementById('i3d-prev-single').style.display = '';
      document.getElementById('i3d-dz-label').textContent = f.name.substring(0, 20);
      var bgBtn = document.getElementById('i3d-remove-bg-btn');
      if (bgBtn) bgBtn.style.display = 'flex';
    } else {
      i3dMultiFiles[i3dActiveSlot] = ev.target.result;
      i3dRenderSlots();
    }
  };
  r.readAsDataURL(f);
}

function i3dClearSingle() {
  i3dSingleFile = null;
  document.getElementById('i3d-prev-single').style.display = 'none';
  document.getElementById('i3d-prev-single-img').src = '';
  document.getElementById('i3d-dz-label').textContent = 'Upload Image';
}

function i3dDragOver(e)  { e.preventDefault(); document.getElementById('i3d-dropzone').classList.add('dragging'); }
function i3dDragLeave()  { document.getElementById('i3d-dropzone').classList.remove('dragging'); }
function i3dDrop(e) {
  e.preventDefault();
  document.getElementById('i3d-dropzone').classList.remove('dragging');
  var f = e.dataTransfer.files[0]; if (!f) return;
  var r = new FileReader();
  r.onload = function(ev) {
    i3dSingleFile = ev.target.result;
    document.getElementById('i3d-prev-single-img').src = ev.target.result;
    document.getElementById('i3d-prev-single').style.display = '';
    document.getElementById('i3d-dz-label').textContent = f.name.substring(0, 20);
    var bgBtn = document.getElementById('i3d-remove-bg-btn');
    if (bgBtn) bgBtn.style.display = 'flex';
  };
  r.readAsDataURL(f);
}

function i3dRenderSlots() {
  var c = document.getElementById('i3d-slots'); if (!c) return; c.innerHTML = '';
  for (var i = 0; i < 4; i++) {
    (function(idx) {
      var s = document.createElement('div');
      s.className = 'i3d-slot' + (i3dMultiFiles[idx] ? ' filled' : '');
      s.onclick = function() { i3dActiveSlot = idx; document.getElementById('i3d-file-multi').click(); };
      if (i3dMultiFiles[idx]) {
        var img = document.createElement('img'); img.src = i3dMultiFiles[idx]; s.appendChild(img);
        var ov = document.createElement('div'); ov.className = 'i3d-slot-ov';
        var rm = document.createElement('button'); rm.className = 'i3d-slot-rm'; rm.textContent = 'x';
        rm.onclick = function(e) { e.stopPropagation(); i3dMultiFiles[idx] = null; i3dRenderSlots(); };
        ov.appendChild(rm); s.appendChild(ov);
      } else {
        var ic = document.createElement('div'); ic.className = 'i3d-slot-icon'; ic.textContent = I3D_SLOT_ICONS[idx];
        var lb = document.createElement('div'); lb.className = 'i3d-slot-lbl'; lb.textContent = I3D_SLOT_LABELS[idx];
        s.appendChild(ic); s.appendChild(lb);
      }
      c.appendChild(s);
    })(i);
  }
}

function i3dToggle(key) {
  i3dToggles[key] = !i3dToggles[key];
  document.getElementById('i3d-tog-' + key).classList.toggle('on', i3dToggles[key]);
  if (key === 'texture') {
    var pr = document.getElementById('i3d-pbr-row');
    var pw = document.getElementById('i3d-prompt-wrap');
    if (pr) { pr.style.opacity = i3dToggles.texture ? '1' : '0.4'; pr.style.pointerEvents = i3dToggles.texture ? '' : 'none'; }
    if (pw) pw.style.display = i3dToggles.texture ? '' : 'none';
    if (!i3dToggles.texture) { i3dToggles.pbr = false; document.getElementById('i3d-tog-pbr').classList.remove('on'); }
  }
  i3dUpdateCostBadge();
}

function i3dUpdateCostBadge() {
  var c = 10;
  if (i3dToggles.texture) c += 5;
  if (i3dToggles.texture && i3dToggles.pbr) c += 3;
  var el = document.getElementById('i3d-cost-num'); if (el) el.textContent = c;
  i3dCurrentCost = c;
  
  var btn = document.getElementById('i3d-gen-btn');
  if (btn) {
    var txt = btn.textContent || "";
    if (txt.indexOf('Generating') === -1 && txt.indexOf('Submitting') === -1) {
      btn.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/></svg> Generate 3D Model (' + c + ' CR)';
    }
  }
}

function i3dShowError(msg) {
  document.getElementById('i3d-result-area').style.display = '';
  document.getElementById('i3d-progress-card').style.display = 'none';
  document.getElementById('i3d-model-card').style.display = 'none';
  var tb = document.getElementById('i3d-viewer-toolbar');
  if (tb) tb.style.display = 'none';
  document.getElementById('i3d-error-area').style.display = 'flex';
  document.getElementById('i3d-error-txt').textContent = msg;
}

function i3dUpdateStatus(status, progress, errMsg) {
  var badge = document.getElementById('i3d-status-badge');
  if (badge) { badge.className = 'i3d-status-badge ' + status.toLowerCase(); badge.textContent = status.replace('_', ' '); }
  var fill = document.getElementById('i3d-bar-fill'); if (fill) fill.style.width = progress + '%';
  var pct  = document.getElementById('i3d-bar-pct'); if (pct) pct.textContent = progress + '%';
  var msgs = { PENDING: 'Waiting in queue...', IN_PROGRESS: 'Processing... ' + progress + '%', SUCCEEDED: 'Done!', FAILED: errMsg || 'Failed.' };
  var msgEl = document.getElementById('i3d-progress-msg'); if (msgEl) msgEl.textContent = msgs[status] || status;
}

function i3dShowModel(task) {
  document.getElementById('i3d-progress-card').style.display = 'none';
  document.getElementById('i3d-model-card').style.display = '';
  var urls = task.model_urls || {};
  i3dGlbUrl = urls.glb || null;

  var thumbContainer = document.getElementById('i3d-thumb');
  if (thumbContainer) {
    if (i3dGlbUrl) {
      thumbContainer.innerHTML = '<model-viewer id="i3d-model-viewer" src="' + i3dGlbUrl + '" camera-controls auto-rotate shadow-intensity="1" alt="3D Model Preview" style="width:100%; height:100%; display:block; outline:none; background:#0d1018;"></model-viewer>';
      i3dWireframeEnabled = false;
      const wfIcon = document.getElementById('i3d-wireframe-btn-icon');
      if (wfIcon) {
        wfIcon.style.color = '';
        wfIcon.style.textShadow = '';
      }
      var tb = document.getElementById('i3d-viewer-toolbar');
      if (tb) tb.style.display = 'flex';
    } else if (task.thumbnail_url) {
      thumbContainer.innerHTML = '<img src="' + task.thumbnail_url + '" alt="Model Thumbnail">';
      var tb = document.getElementById('i3d-viewer-toolbar');
      if (tb) tb.style.display = 'none';
    } else {
      thumbContainer.innerHTML = '<div class="i3d-thumb-empty">No preview</div>';
      var tb = document.getElementById('i3d-viewer-toolbar');
      if (tb) tb.style.display = 'none';
    }
  }

  document.getElementById('i3d-model-meta').textContent = 'Task: ' + task.id;
  var grid = document.getElementById('i3d-dl-grid'); grid.innerHTML = '';
  ['glb', 'fbx', 'obj', 'usdz', 'stl'].forEach(function(fmt) {
    if (urls[fmt]) {
      var a = document.createElement('a');
      a.className = 'i3d-dl-btn'; a.href = urls[fmt]; a.target = '_blank';
      a.innerHTML = 'DL<br><span style="opacity:.6">' + fmt.toUpperCase() + '</span>';
      grid.appendChild(a);
    }
  });
  document.getElementById('i3d-skp-btn').disabled = !i3dGlbUrl;
  if (!i3dCreditDeducted && task.creditsLeft !== undefined) {
    i3dCreditDeducted = true;
    var cc = document.getElementById('credit-counter');
    if (cc) cc.innerText = parseFloat(task.creditsLeft).toFixed(1) + ' CR';
  }
}

function i3dImportSKP() {
  if (!i3dGlbUrl) return;
  var btn = document.getElementById('i3d-skp-btn'); btn.disabled = true; btn.textContent = 'Importing...';
  try {
    var sk = (typeof sketchup !== 'undefined') ? sketchup : null;
    
    if (sk && (typeof sk.import_model === 'function' || typeof sk.import_model === 'object')) {
      sk.import_model(i3dGlbUrl);
      setTimeout(function() {
        btn.disabled = false; btn.textContent = 'Import GLB into SketchUp';
        var s = document.getElementById('i3d-skp-status'); s.className = 'i3d-skp-status ok'; s.textContent = 'Sent to SketchUp';
      }, 400);
    } else {
      // Standalone web browser environment: direct SketchUp import is impossible.
      // Download the GLB model file directly and show a helpful warning.
      btn.disabled = false; btn.textContent = 'Import GLB into SketchUp';
      var s = document.getElementById('i3d-skp-status');
      if (s) {
        s.className = 'i3d-skp-status err';
        s.textContent = 'Direct import is only supported inside the SketchUp Extension. Downloading GLB file instead.';
      }
      
      var a = document.createElement('a');
      a.href = i3dGlbUrl;
      a.target = '_blank';
      a.download = 'model.glb';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
    }
  } catch(e) {
    btn.disabled = false; btn.textContent = 'Import GLB into SketchUp';
    var s = document.getElementById('i3d-skp-status'); if (s) { s.className = 'i3d-skp-status err'; s.textContent = 'Error: ' + e.message; }
  }
}

async function i3dGenerate() {
  if (i3dMode === 'single' && !i3dSingleFile) { i3dShowError('Upload an image first.'); return; }
  if (i3dMode === 'multi' && !i3dMultiFiles.some(Boolean)) { i3dShowError('Upload at least one image.'); return; }
  var email = (typeof userEmail !== 'undefined' ? userEmail : null) || localStorage.getItem('sgai_user_email') || '';
  if (!email) { i3dShowError('Please log in first.'); return; }
  i3dUpdateCostBadge();
  var btn = document.getElementById('i3d-gen-btn'); btn.disabled = true; btn.textContent = 'Submitting...';
  i3dGlbUrl = null; i3dCreditDeducted = false;
  document.getElementById('i3d-result-area').style.display = '';
  document.getElementById('i3d-progress-card').style.display = '';
  document.getElementById('i3d-model-card').style.display = 'none';
  var tb = document.getElementById('i3d-viewer-toolbar');
  if (tb) tb.style.display = 'none';
  document.getElementById('i3d-error-area').style.display = 'none';
  try {
    var ep = i3dMode === 'single' ? 'image-to-3d' : 'multi-image-to-3d';
    var meshyBody = i3dMode === 'single'
      ? { image_url: i3dSingleFile, ai_model: document.getElementById('i3d-model').value, topology: document.getElementById('i3d-topology').value, target_polycount: parseInt(document.getElementById('i3d-polycount').value), should_texture: i3dToggles.texture, enable_pbr: i3dToggles.texture && i3dToggles.pbr, should_remesh: i3dToggles.remesh }
      : { image_urls: i3dMultiFiles.filter(Boolean), ai_model: document.getElementById('i3d-model').value, topology: document.getElementById('i3d-topology').value, target_polycount: parseInt(document.getElementById('i3d-polycount').value), should_texture: i3dToggles.texture, enable_pbr: i3dToggles.texture && i3dToggles.pbr, should_remesh: i3dToggles.remesh };
    var pose = document.getElementById('i3d-pose').value; if (pose) meshyBody.is_a_t_pose = pose;
    if (i3dToggles.texture) {
      var tp = (document.getElementById('i3d-tex-prompt') || { value: '' }).value || '';
      if (tp.trim()) meshyBody.texture_prompt = tp.trim();
    }
    var body = meshyBody;
    var token = localStorage.getItem('sgai_auth_token');
    var res = await fetch(i3dServerBase() + '/api/' + ep, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + token
      },
      body: JSON.stringify(body)
    });
    var data = await res.json();
    if (res.status === 403 && data.error === 'INSUFFICIENT_FUNDS') {
      i3dShowError('Not enough credits. Need ' + (data.required || 10) + ', have ' + (data.available || 0) + '.');
      btn.disabled = false; i3dUpdateCostBadge(); return;
    }
    if (!res.ok) throw new Error(data.message || data.error || 'Error ' + res.status);
    i3dTaskId = data.result; i3dCurrentCost = data.cost || 10;
    document.getElementById('i3d-task-id').textContent = i3dTaskId;
    i3dUpdateStatus('PENDING', 0); btn.textContent = 'Generating...';
    i3dStartPolling(ep, email);
  } catch(err) { i3dShowError(err.message); btn.disabled = false; i3dUpdateCostBadge(); }
}

function i3dStartPolling(ep, email) {
  clearInterval(i3dPollTimer);
  i3dPollTimer = setInterval(async function() {
    try {
      var params = new URLSearchParams({ cost: String(i3dCurrentCost), deducted: i3dCreditDeducted ? '1' : '0' });
      var token = localStorage.getItem('sgai_auth_token');
      var res = await fetch(i3dServerBase() + '/api/' + ep + '/' + i3dTaskId + '?' + params.toString(), {
        headers: {
          'Authorization': 'Bearer ' + token
        }
      });
      var task = await res.json(); if (!res.ok) return;
      i3dUpdateStatus(task.status, task.progress || 0, task.task_error && task.task_error.message);
      if (task.status === 'SUCCEEDED') {
        clearInterval(i3dPollTimer); i3dShowModel(task);
        var btn = document.getElementById('i3d-gen-btn'); btn.disabled = false; i3dUpdateCostBadge();
        if (typeof saveToHistory === 'function') {
          var modelVal = document.getElementById('i3d-model').value;
          var topoVal = document.getElementById('i3d-topology').value;
          var friendlyModel = modelVal.replace('meshy-6', 'Engine 6').replace('meshy-5', 'Engine 5');
          saveToHistory(
            i3dMode === 'single' ? i3dSingleFile : null,
            null,
            '[3D] Model: ' + friendlyModel + ' | Topology: ' + topoVal,
            1.0,
            {
              type: '3d',
              glbUrl: task.model_urls && task.model_urls.glb,
              thumbnailUrl: task.thumbnail_url,
              taskId: task.id,
              modelUrls: task.model_urls
            }
          );
        }
      } else if (task.status === 'FAILED') {
        clearInterval(i3dPollTimer); i3dShowError((task.task_error && task.task_error.message) || 'Generation failed. No credits deducted.');
        var btn = document.getElementById('i3d-gen-btn'); btn.disabled = false; i3dUpdateCostBadge();
      }
    } catch(e) {}
  }, 3000);
}

// Init slots on load
document.addEventListener('DOMContentLoaded', function() { i3dRenderSlots(); i3dUpdateCostBadge(); });

var i3dCurrentLightingIdx = 0;

function i3dToggleViewerRotation() {
  const viewer = document.getElementById('i3d-model-viewer');
  if (!viewer) return;
  viewer.autoRotate = !viewer.autoRotate;
  const icon = document.getElementById('i3d-rotate-btn-icon');
  if (icon) {
    icon.textContent = viewer.autoRotate ? '⏸' : '▶';
  }
}

function i3dCycleViewerLighting() {
  const viewer = document.getElementById('i3d-model-viewer');
  if (!viewer) return;
  
  i3dCurrentLightingIdx = (i3dCurrentLightingIdx + 1) % 3;
  const icon = document.getElementById('i3d-light-btn-icon');
  
  if (i3dCurrentLightingIdx === 0) {
    viewer.exposure = 1.0;
    viewer.shadowIntensity = 1.0;
    if (icon) icon.textContent = '☀️';
  } else if (i3dCurrentLightingIdx === 1) {
    viewer.exposure = 1.5;
    viewer.shadowIntensity = 0.5;
    if (icon) icon.textContent = '💡';
  } else {
    viewer.exposure = 0.6;
    viewer.shadowIntensity = 0.7;
    if (icon) icon.textContent = '🌙';
  }
}

function i3dResetViewerCamera() {
  const viewer = document.getElementById('i3d-model-viewer');
  if (!viewer) return;
  viewer.cameraOrbit = '0deg 75deg auto';
  viewer.cameraTarget = 'auto auto auto';
  viewer.fieldOfView = 'auto';
}

var i3dWireframeEnabled = false;

function i3dToggleViewerWireframe() {
  const viewer = document.getElementById('i3d-model-viewer');
  if (!viewer) return;
  
  i3dWireframeEnabled = !i3dWireframeEnabled;
  
  // Highlight icon when wireframe is enabled
  const icon = document.getElementById('i3d-wireframe-btn-icon');
  if (icon) {
    icon.style.color = i3dWireframeEnabled ? 'var(--accent-primary)' : '';
    icon.style.textShadow = i3dWireframeEnabled ? '0 0 8px var(--accent-primary)' : '';
  }
  
  // Access internal Three.js scene of Google model-viewer
  const symbols = Object.getOwnPropertySymbols(viewer);
  const sceneSymbol = symbols.find(s => s.description === 'scene');
  if (sceneSymbol) {
    const scene = viewer[sceneSymbol];
    if (scene) {
      scene.traverse((child) => {
        if (child.isMesh && child.material) {
          const materials = Array.isArray(child.material) ? child.material : [child.material];
          materials.forEach(material => {
            material.wireframe = i3dWireframeEnabled;
            material.needsUpdate = true;
          });
        }
      });
      // Force model-viewer to redraw/queue render
      if (typeof viewer.queueRender === 'function') {
        viewer.queueRender();
      } else {
        // Fallback: trigger a camera orbit refresh
        const orbit = viewer.getCameraOrbit();
        viewer.cameraOrbit = `${orbit.theta}rad ${orbit.phi}rad ${orbit.radius}m`;
      }
    }
  }
}

function selectSegment(selectId, value, btnEl) {
  var select = document.getElementById(selectId);
  if (select) {
    select.value = value;
    select.dispatchEvent(new Event('change'));
  }
  var parent = btnEl.parentElement;
  parent.querySelectorAll('.segment-btn').forEach(function(btn) {
    btn.classList.remove('active');
  });
  btnEl.classList.add('active');
}

async function i3dRemoveBackground() {
  if (!i3dSingleFile) return;
  
  const btn = document.getElementById('i3d-remove-bg-btn');
  const originalText = btn ? btn.innerHTML : "Remove BG (0.2 CR)";
  
  if (btn) {
    btn.disabled = true;
    btn.innerHTML = "<span>⏳</span> Removing...";
  }
  
  const token = localStorage.getItem('sgai_auth_token');
  try {
    const res = await fetch(i3dServerBase() + '/api/remove-bg', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + token
      },
      body: JSON.stringify({ imageBase64: i3dSingleFile })
    });
    
    const data = await res.json();
    if (!res.ok || data.error) {
      throw new Error(data.error || "Background removal failed.");
    }
    
    // Replace current file with background-removed base64
    i3dSingleFile = data.imageBase64;
    document.getElementById('i3d-prev-single-img').src = i3dSingleFile;
    
    // Sync credits
    if (typeof window.syncCredits === 'function') {
      window.syncCredits();
    }
    
    // Hide the button since background is already removed
    if (btn) btn.style.display = 'none';
    
    console.log("Background removed successfully!");
  } catch (err) {
    alert("Error: " + err.message);
  } finally {
    if (btn && btn.style.display !== 'none') {
      btn.disabled = false;
      btn.innerHTML = originalText;
    }
  }
}
