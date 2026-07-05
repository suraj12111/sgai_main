/* =====================================================
   SGAI RENDER ENGINE — results.js
   Draft grid, result display, slider, edit/mask mode,
   animate (image-to-video), upscale
   ===================================================== */

// ── DRAFT GRID ────────────────────────────────────────
function displayDraftGrid(draftsArray) {
  selectedDraftIndex = -1;
  const c = document.getElementById('results-container');
  let gridImages = draftsArray.map((b64, index) => `
    <div style="position:relative;width:100%;">
      <img src="data:image/png;base64,${b64}" class="draft-item" id="draft-img-${index}"
        onclick="selectDraft(${index})" style="aspect-ratio:${capturedAspectRatio};">
      <a href="data:image/png;base64,${b64}" download="SGAI_Render_${index+1}.png"
        style="position:absolute;bottom:10px;right:10px;background:rgba(0,0,0,0.8);color:white;padding:6px 12px;font-size:10px;text-transform:uppercase;font-weight:bold;text-decoration:none;border:1px solid var(--border-color);border-radius:4px;z-index:10;transition:0.2s;"
        onmouseover="this.style.borderColor='var(--accent-primary)';this.style.color='var(--accent-primary)';"
        onmouseout="this.style.borderColor='var(--border-color)';this.style.color='white';">⬇ Save</a>
    </div>`).join('');

  c.innerHTML = `
    <div style="width:100%;text-align:center;position:relative;">
      <h3 style="font-size:0.7em;color:var(--accent-gold);margin-top:0;text-transform:uppercase;">SELECT IMAGE TO MODIFY (OPTIONAL):</h3>
      <div class="draft-grid">${gridImages}</div>
    </div>`;
}

function selectDraft(index) {
  selectedDraftIndex = index;
  document.querySelectorAll('.draft-item').forEach(el => el.classList.remove('selected'));
  document.getElementById(`draft-img-${index}`).classList.add('selected');
  displayResult(capturedB64, currentDrafts[index], capturedAspectRatio);
}

// ── RESULT DISPLAY (slider view) ─────────────────────
function imageDataOnly(value) {
  if (!value) return '';
  const text = String(value);
  return text.startsWith('data:') ? text.split(',').slice(1).join(',') : text;
}

function imageSrcFromData(value, fallbackMime) {
  if (!value) return '';
  const text = String(value);
  return text.startsWith('data:') ? text : `data:${fallbackMime || 'image/png'};base64,${text}`;
}

function displayResult(orig, gen, aspectRatio) {
  const genData = imageDataOnly(gen);
  const origData = imageDataOnly(orig) || genData;
  currentEditBase64 = genData;
  const c = document.getElementById('results-container');
  if (!c) return;
  if (!genData) {
    c.innerHTML = '<div style="font-family:var(--font-mono);font-size:10px;color:var(--danger);text-align:center;padding:24px;">This history item has no render preview data.</div>';
    return;
  }
  const safeAspect = aspectRatio || capturedAspectRatio || (16 / 9);
  const origSrc = imageSrcFromData(origData, 'image/jpeg');
  const genSrc  = imageSrcFromData(genData,  'image/png');
  const maxW = 800;

  c.innerHTML = `
    <div style="width:100%;text-align:center;position:relative;">
      <div id="render-view-mode" style="width:100%;max-width:${maxW}px;margin:0 auto;">

        <div class="slider-container" style="border-radius:8px;position:relative;overflow:hidden;aspect-ratio:${safeAspect};background:#05070a;">
          <img class="img-original" src="${origSrc}" style="width:100%;height:100%;display:block;object-fit:cover;filter:grayscale(30%);opacity:0.8;">
          <img class="img-generated" src="${genSrc}" style="position:absolute;top:0;left:0;width:100%;height:100%;object-fit:cover;clip-path:polygon(0 0,50% 0,50% 100%,0 100%);">
          <div class="slider-line" style="position:absolute;top:0;bottom:0;left:50%;width:2px;background:var(--accent-primary);pointer-events:none;z-index:5;">
            <div class="slider-handle" style="position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);width:36px;height:36px;border-radius:50%;background:var(--accent-primary);display:flex;align-items:center;justify-content:center;box-shadow:0 0 12px rgba(0,229,255,0.5);">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="width:16px;height:16px;color:#000;"><polyline points="15 18 9 12 15 6"/><polyline points="9 18 3 12 9 6" transform="translate(6,0)"/></svg>
            </div>
          </div>
          <input type="range" class="slider-control" min="0" max="100" value="50" oninput="updateSlider(this)"
            style="position:absolute;top:0;left:0;width:100%;height:100%;opacity:0;cursor:ew-resize;z-index:10;margin:0;">
        </div>

        <div style="display:flex;gap:10px;margin-top:10px;justify-content:center;flex-wrap:wrap;">
          <a id="inline-export-btn" class="btn-secondary" href="${genSrc}" download="SGAI_Render.png"
            style="display:flex;align-items:center;justify-content:center;flex:1;min-width:140px;max-width:220px;">⬇ Save Image</a>
          <button id="inline-modify-btn" class="btn-secondary"
            style="border-color:var(--accent-primary);color:var(--accent-primary);flex:1;min-width:140px;max-width:220px;"
            onclick="enterEditMode()">✏️ Modify Region (1 CR)</button>
          <button id="inline-animate-btn" class="btn-secondary"
            onclick="vidRenderFromResult('${genData}')"
            style="border-color:rgba(217,70,239,0.7);color:rgba(217,70,239,1);background:rgba(217,70,239,0.08);flex:1;min-width:140px;max-width:240px;display:flex;align-items:center;gap:6px;justify-content:center;">
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polygon points="23 7 16 12 23 17 23 7"/><rect x="1" y="5" width="15" height="14" rx="2" ry="2"/></svg>
            Render with Veo (10 CR)
          </button>
          <button id="inline-upscale-btn" class="btn-secondary" onclick="upscaleRender('${genData}')"
            style="border-color:rgba(0,229,160,0.6);color:#00e5a0;background:rgba(0,229,160,0.07);flex:1;min-width:140px;max-width:220px;display:flex;align-items:center;gap:6px;justify-content:center;">
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="15 3 21 3 21 9"/><polyline points="9 21 3 21 3 15"/><line x1="21" y1="3" x2="14" y2="10"/><line x1="3" y1="21" x2="10" y2="14"/></svg>
            Upscale 4x (1 CR)
          </button>
        </div>

        <!-- UPSCALE RESULT PANEL -->
        <div id="upscale-panel-current" style="display:none;margin-top:12px;border:1px solid rgba(0,229,160,0.25);border-radius:8px;overflow:hidden;background:rgba(0,229,160,0.04);">
          <div style="padding:10px 14px;border-bottom:1px solid rgba(0,229,160,0.15);display:flex;align-items:center;justify-content:space-between;">
            <span style="font-family:var(--font-mono);font-size:9px;font-weight:700;color:#00e5a0;letter-spacing:1.5px;text-transform:uppercase;">&#9651; 4x Upscaled Output</span>
            <span id="upscale-status-current" style="font-family:var(--font-mono);font-size:9px;color:var(--text-muted);"></span>
          </div>
          <div id="upscale-img-wrap-current" style="padding:12px;display:flex;flex-direction:column;gap:10px;">
            <div id="upscale-spinner-current" style="text-align:center;padding:24px;font-family:var(--font-mono);font-size:10px;color:#00e5a0;letter-spacing:1px;animation:skeletonPulse 1.4s ease infinite;">
              Running Real-ESRGAN 4x...
            </div>
          </div>
        </div>

        <!-- ANIMATE PANEL -->
        <div id="animate-panel" style="display:none;margin-top:14px;background:rgba(16,185,129,0.05);border:1px solid rgba(16,185,129,0.25);border-radius:6px;padding:16px;max-width:${maxW}px;margin-left:auto;margin-right:auto;">
          <div style="font-size:0.78em;font-weight:700;color:#10b981;text-transform:uppercase;letter-spacing:1px;margin-bottom:10px;">▶ Animation Prompt (optional)</div>
          <textarea id="video-prompt-input" placeholder="e.g. Slow cinematic dolly forward, warm lighting, subtle camera drift..."
            style="width:100%;padding:10px;background:var(--input-bg);border:1px solid rgba(16,185,129,0.3);color:var(--text-main);border-radius:4px;font-family:inherit;font-size:0.88em;line-height:1.5;resize:vertical;min-height:60px;box-sizing:border-box;outline:none;margin-bottom:10px;"></textarea>
          <div style="font-size:0.7em;color:var(--text-muted);margin-bottom:12px;">Leave blank for smart architectural default.</div>
          <div style="display:flex;gap:8px;">
            <button onclick="startAnimate('${genData}')"
              style="flex:2;padding:11px;background:rgba(16,185,129,0.12);color:#10b981;border:1px solid rgba(16,185,129,0.4);cursor:pointer;font-weight:700;font-size:0.88em;text-transform:uppercase;letter-spacing:0.5px;border-radius:4px;transition:0.2s;">▶ Generate Animation</button>
            <button onclick="document.getElementById('animate-panel').style.display='none'"
              style="flex:1;padding:11px;background:transparent;color:var(--text-muted);border:1px solid var(--border-color);cursor:pointer;font-size:0.82em;border-radius:4px;">Cancel</button>
          </div>
        </div>

      </div>

      <!-- EDIT MODE (mask/inpaint) -->
      <div id="render-edit-mode" style="display:none;width:100%;max-width:${maxW}px;margin:0 auto;">
        <div class="canvas-container">
          <canvas id="base-image-canvas"></canvas>
          <canvas id="draw-canvas"></canvas>
        </div>
      </div>
    </div>`;
}

function updateSlider(e) {
  const p = e.parentElement;
  const genImg = p.querySelector('.img-generated');
  const sliderLine = p.querySelector('.slider-line');
  const v = e.value + '%';
  const poly = `polygon(0 0, ${v} 0, ${v} 100%, 0 100%)`;
  genImg.style.clipPath = poly;
  genImg.style.WebkitClipPath = poly;
  sliderLine.style.left = v;
}

// ── EDIT / MASK MODE ──────────────────────────────────
function enterEditMode() {
  document.getElementById('render-view-mode').style.display = 'none';
  document.getElementById('render-edit-mode').style.display = 'block';
  const bc = document.getElementById('base-image-canvas');
  const dc = document.getElementById('draw-canvas');
  baseCtx = bc.getContext('2d'); drawCtx = dc.getContext('2d');
  const img = new Image();
  img.onload = () => {
    const maxW = document.getElementById('render-edit-mode').clientWidth;
    bc.width = dc.width = maxW; bc.height = dc.height = maxW / capturedAspectRatio;
    baseCtx.drawImage(img, 0, 0, bc.width, bc.height);
    clearMask(); setupCanvasEvents();
  };
  img.src = `data:image/png;base64,${currentEditBase64}`;
  document.getElementById('floating-toolbar').style.display = 'flex';
}

function exitEditMode() {
  document.getElementById('render-edit-mode').style.display = 'none';
  document.getElementById('render-view-mode').style.display = 'block';
  document.getElementById('floating-toolbar').style.display = 'none';
}

function clearMask() { drawCtx.clearRect(0, 0, baseCtx.canvas.width, baseCtx.canvas.height); }

function setupCanvasEvents() {
  const c = document.getElementById('draw-canvas');
  const getP = e => {
    const r = c.getBoundingClientRect();
    return { x: (e.clientX - r.left) * (c.width / r.width), y: (e.clientY - r.top) * (c.height / r.height) };
  };
  c.onmousedown = e => {
    isDrawing = true;
    const p = getP(e);
    drawCtx.strokeStyle = 'rgba(0,229,255,0.6)';
    drawCtx.lineWidth = document.getElementById('brush-size').value;
    drawCtx.lineCap = 'round'; drawCtx.beginPath(); drawCtx.moveTo(p.x, p.y);
  };
  c.onmousemove = e => { if (!isDrawing) return; const p = getP(e); drawCtx.lineTo(p.x, p.y); drawCtx.stroke(); };
  c.onmouseup = () => isDrawing = false;
}

async function submitEdit() {
  const p = document.getElementById('inline-edit-prompt').value;
  if (!p) return alert("Please enter a modification prompt.");
  const currentCredits = parseFloat((document.getElementById('credit-counter').innerText).replace(/[^0-9.]/g, '')) || 0;
  if (currentCredits < 1.0) { exitEditMode(); document.getElementById('status').innerText = "PLEASE RECHARGE."; document.getElementById('status').style.color = "var(--danger)"; return showPaywall(); }
  document.getElementById('status').innerText = "MODIFYING..."; exitEditMode();
  try {
    const mc = document.createElement('canvas'); mc.width = baseCtx.canvas.width; mc.height = baseCtx.canvas.height;
    const mtx = mc.getContext('2d'); mtx.fillStyle = '#000'; mtx.fillRect(0, 0, mc.width, mc.height);
    mtx.globalCompositeOperation = 'source-over'; mtx.drawImage(document.getElementById('draw-canvas'), 0, 0);
    mtx.globalCompositeOperation = 'source-in'; mtx.fillStyle = '#fff'; mtx.fillRect(0, 0, mc.width, mc.height);
    const payload = {
      mode: "edit", version: "2.0",
      geminiPayload: { contents: [{ role: "user", parts: [
        { inlineData: { mimeType: "image/png", data: currentEditBase64 } },
        { inlineData: { mimeType: "image/png", data: mc.toDataURL('image/png').split(',')[1] } },
        { text: p }
      ]}]}
    };
    const token = localStorage.getItem('sgai_auth_token');
    const r = await fetch(SERVER_URL + '/generate', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + token
      },
      body: JSON.stringify(payload)
    });
    const d = await r.json();
    if (r.status === 403) return showPaywall();
    const gen = d.data.candidates[0].content.parts[0].inlineData.data;
    displayResult(currentEditBase64, gen, capturedAspectRatio);
    saveToHistory(currentEditBase64, gen, "[EDIT] " + p, capturedAspectRatio);
    syncCredits();
  } catch(e) {}
  finally { document.getElementById('status').innerText = "Complete."; }
}

// ── ANIMATE ───────────────────────────────────────────
function showAnimatePanel(gen) {
  window._currentAnimateGen = gen;
  const panel = document.getElementById('animate-panel');
  if (panel) panel.style.display = panel.style.display === 'none' ? 'block' : 'none';
}

async function startAnimate(gen) {
  const statusEl  = document.getElementById('status');
  const resultsEl = document.getElementById('results-container');
  const panel     = document.getElementById('animate-panel');
  const promptEl  = document.getElementById('video-prompt-input');
  const videoPrompt = promptEl ? promptEl.value.trim() : '';
  if (panel) panel.style.display = 'none';
  statusEl.innerText = '▶ Generating animation... (30–90 seconds)';
  statusEl.style.color = '#10b981';

  resultsEl.innerHTML += `
    <div id="animate-skeleton" style="width:100%;max-width:800px;margin:20px auto 0;text-align:center;">
      <div style="font-size:0.72em;color:#10b981;text-transform:uppercase;letter-spacing:1.5px;font-weight:700;margin-bottom:12px;animation:skeletonPulse 1.6s ease-in-out infinite;">Rendering animation...</div>
      <div style="width:100%;aspect-ratio:16/9;background:linear-gradient(135deg,rgba(16,185,129,0.08) 0%,rgba(16,185,129,0.16) 40%,rgba(16,185,129,0.08) 100%);border-radius:8px;border:1px solid rgba(16,185,129,0.2);animation:skeletonPulse 1.6s ease-in-out infinite;"></div>
    </div>`;

  try {
    const token = localStorage.getItem('sgai_auth_token');
    const res = await fetch(`${SERVER_URL}/animate`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + token
      },
      body: JSON.stringify({ imageBase64: gen, videoPrompt })
    });
    const data = await res.json();
    const sk = document.getElementById('animate-skeleton');
    if (sk) sk.remove();
    if (res.status === 403) { statusEl.innerText = 'Not enough credits.'; statusEl.style.color = 'var(--danger)'; showPaywall(); return; }
    if (!res.ok || data.error) { statusEl.innerText = 'Animation failed: ' + (data.error || 'Unknown error'); statusEl.style.color = 'var(--danger)'; return; }
    if (data.creditsLeft !== undefined) {
      const sidebarCredits = document.getElementById('sidebar-credits');
      if (sidebarCredits) sidebarCredits.innerText = `${data.creditsLeft.toFixed(1)} CR REMAINING`;
    }
    statusEl.innerText = '✓ Animation ready!';
    statusEl.style.color = '#10b981';
    resultsEl.innerHTML += `
      <div style="width:100%;max-width:800px;margin:16px auto 0;text-align:center;">
        <div style="font-size:0.72em;font-weight:700;color:#10b981;text-transform:uppercase;letter-spacing:1px;margin-bottom:8px;">▶ Animation Output</div>
        <video id="sgai-anim-video" controls autoplay loop muted playsinline preload="auto"
          style="width:100%;border-radius:8px;border:1px solid rgba(16,185,129,0.3);display:block;max-height:360px;background:#000;outline:none;"></video>
        <div style="display:flex;gap:8px;margin-top:8px;">
          <button id="vid-play-btn-anim" onclick="sgaiVideoPlay('sgai-anim-video','vid-play-btn-anim')"
            style="flex:1;padding:8px;border-radius:6px;border:1px solid rgba(16,185,129,0.3);background:transparent;color:#10b981;font-family:var(--font-mono);font-size:10px;letter-spacing:1px;cursor:pointer;">
            &#9654; PLAY
          </button>
        </div>
        <div style="display:flex;gap:10px;margin-top:10px;justify-content:center;">
          <a href="${data.videoUrl}" download="SGAI_Animation.mp4"
            style="display:flex;align-items:center;justify-content:center;flex:1;max-width:220px;padding:10px;border:1px solid rgba(16,185,129,0.4);color:#10b981;text-decoration:none;font-size:0.82em;font-weight:600;text-transform:uppercase;letter-spacing:0.4px;border-radius:4px;">⬇ Download Video</a>
        </div>
      </div>`;
    sgaiLoadVideo('sgai-anim-video', data.videoUrl, null);
    saveToHistory(capturedB64 || null, null, '[ANIMATE] ' + (videoPrompt || 'Animation'), capturedAspectRatio || (16/9), { type: 'animate', videoUrl: data.videoUrl, thumbBase64: capturedB64 || null });
  } catch (err) {
    const sk = document.getElementById('animate-skeleton');
    if (sk) sk.remove();
    statusEl.innerText = 'Connection error: ' + (err.message || 'Could not reach server.');
    statusEl.style.color = 'var(--danger)';
  }
}

// ── UPSCALE ───────────────────────────────────────────
var _upscaleCallCount = 0;

function upscaleRender(genB64) {
  if (!genB64) { alert('No rendered image to upscale.'); return; }
  const email = (typeof userEmail !== 'undefined' ? userEmail : null) || localStorage.getItem('sgai_user_email') || '';
  if (!email) { alert('Please log in to upscale.'); return; }

  var panels = document.querySelectorAll('[id^="upscale-panel-"]');
  var panel = panels[panels.length - 1];
  if (!panel) { alert('Upscale panel not found. Try rendering first.'); return; }

  const panelId   = panel.id.replace('upscale-panel-', '');
  const statusEl  = document.getElementById('upscale-status-' + panelId);
  const spinnerEl = document.getElementById('upscale-spinner-' + panelId);
  const imgWrap   = document.getElementById('upscale-img-wrap-' + panelId);

  panel.style.display = '';
  if (statusEl)  statusEl.textContent = 'Upscaling...';
  if (spinnerEl) { spinnerEl.style.display = ''; spinnerEl.textContent = 'Running Real-ESRGAN 4x...'; }
  setTimeout(() => panel.scrollIntoView({ behavior: 'smooth', block: 'nearest' }), 80);

  const SERVER = (document.getElementById('i3d-server-url') || {value:'http://localhost:3000'}).value.replace(/\/$/, '') || 'http://localhost:3000';

  const token = localStorage.getItem('sgai_auth_token');
  fetch(SERVER + '/api/upscale', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': 'Bearer ' + token
    },
    body: JSON.stringify({ imageBase64: genB64 })
  })
  .then(res => res.json())
  .then(data => {
    if (data.error === 'INSUFFICIENT_FUNDS') {
      if (spinnerEl) spinnerEl.style.display = 'none';
      if (statusEl) { statusEl.textContent = 'Not enough credits'; statusEl.style.color = 'var(--danger)'; }
      panel.style.borderColor = 'rgba(255,79,112,0.3)'; return;
    }
    if (data.error) {
      if (spinnerEl) spinnerEl.style.display = 'none';
      if (statusEl) { statusEl.textContent = 'Error: ' + data.error; statusEl.style.color = 'var(--danger)'; }
      return;
    }
    if (spinnerEl) spinnerEl.style.display = 'none';
    if (statusEl) { statusEl.textContent = 'Done — 4x upscaled'; statusEl.style.color = '#00e5a0'; }
    const imgSrc = data.upscaledUrl ? data.upscaledUrl : 'data:image/png;base64,' + data.upscaledBase64;
    if (imgWrap) {
      imgWrap.innerHTML =
        '<img class="upscale-img-out" src="' + imgSrc + '" alt="4x Upscaled">' +
        '<div class="upscale-actions">' +
          '<a class="upscale-save-btn" href="' + imgSrc + '" download="SGAI_4K_Upscaled.png">' +
            '<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>' +
            '&#11015; Save 4K Image' +
          '</a>' +
        '</div>';
    }
    if (data.creditsLeft !== undefined) {
      const cc = document.getElementById('credit-counter');
      if (cc) cc.innerText = parseFloat(data.creditsLeft).toFixed(1) + ' CR';
    }
  })
  .catch(err => {
    if (spinnerEl) spinnerEl.style.display = 'none';
    if (statusEl) { statusEl.textContent = 'Request failed'; statusEl.style.color = 'var(--danger)'; }
    console.error('[Upscale]', err.message);
  });
}



