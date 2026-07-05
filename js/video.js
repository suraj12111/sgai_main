/* =====================================================
   SGAI RENDER ENGINE — video.js
   Video options panel, camera/duration/res selectors,
   video player loader, play/pause utilities
   ===================================================== */

// ── VIDEO OPTIONS STATE ───────────────────────────────
window._vidCameraMotion   = 'none';
window._vidDuration       = 6;
window._vidResolution     = '720p';
window._vidAspectRatio    = '16:9';
window._vidMotionSpeed    = 'medium';
window._vidCustomImageB64 = null;
var _vidSrcMode   = 'capture';


// ── SOURCE MODE SWITCH ────────────────────────────────
function vidSrcSwitch(mode) {
  _vidSrcMode = mode;
  ['capture', 'upload', 'history'].forEach(m => {
    const el = document.getElementById('vsrc-tab-' + m);
    if (el) el.classList.toggle('active', m === mode);
  });
  const ua = document.getElementById('vsrc-upload-area');
  const ha = document.getElementById('vsrc-history-area');
  if (ua) ua.style.display = mode === 'upload'  ? '' : 'none';
  if (ha) ha.style.display = mode === 'history' ? '' : 'none';
  if (mode !== 'upload' && mode !== 'history') window._vidCustomImageB64 = null;
  if (mode === 'history') vidLoadHistoryGrid();
}

// ── UPLOAD HANDLING ───────────────────────────────────
// ── END FRAME UPLOAD HANDLING ─────────────────────────
// ── FRAME 1 UPLOAD HANDLING (START FRAME) ─────────────
function vidHandleUpload(e) {
  const file = e.target.files[0]; 
  if (!file) return; 
  e.target.value = '';
  
  const r = new FileReader();
  r.onload = (ev) => {
    if (typeof window.resizeImageBase64 === 'function') {
      window.resizeImageBase64(ev.target.result, 1280, 1280, (resizedB64) => {
        window._vidCustomImageB64 = resizedB64;
        const img  = document.getElementById('vid-upload-img');
        const wrap = document.getElementById('vid-upload-preview');
        const lbl  = document.getElementById('vid-upload-lbl');
        
        if (img) img.src = resizedB64;
        if (wrap) wrap.style.display = 'block';
        if (lbl) lbl.textContent = file.name.substring(0, 22);
      });
    } else {
      window._vidCustomImageB64 = ev.target.result;
      const img  = document.getElementById('vid-upload-img');
      const wrap = document.getElementById('vid-upload-preview');
      const lbl  = document.getElementById('vid-upload-lbl');
      
      if (img) img.src = ev.target.result;
      if (wrap) wrap.style.display = 'block';
      if (lbl) lbl.textContent = file.name.substring(0, 22);
    }
  };
  r.readAsDataURL(file);
}

function vidClearUpload() {
  window._vidCustomImageB64 = null;
  const wrap = document.getElementById('vid-upload-preview');
  const img  = document.getElementById('vid-upload-img');
  const lbl  = document.getElementById('vid-upload-lbl');
  if (wrap) wrap.style.display = 'none';
  if (img) img.src = '';
  if (lbl) lbl.textContent = 'Upload Starting Image';
}

// ── FRAME 2 UPLOAD HANDLING (END INTERPOLATION FRAME) ──
function vidHandleEndFrameUpload(e) {
  const file = e.target.files[0]; 
  if (!file) return; 
  e.target.value = '';
  
  const r = new FileReader();
  r.onload = (ev) => {
    if (typeof window.resizeImageBase64 === 'function') {
      window.resizeImageBase64(ev.target.result, 1280, 1280, (resizedB64) => {
        window._vidEndImageB64 = resizedB64;
        const img  = document.getElementById('vid-end-upload-img');
        const wrap = document.getElementById('vid-end-upload-preview');
        const lbl  = document.getElementById('vid-end-upload-lbl');
        
        if (img) img.src = resizedB64;
        if (wrap) wrap.style.display = 'block';
        if (lbl) lbl.textContent = file.name.substring(0, 22);
        
        window._vidMotionMode = 'transition';
      });
    } else {
      window._vidEndImageB64 = ev.target.result;
      const img  = document.getElementById('vid-end-upload-img');
      const wrap = document.getElementById('vid-end-upload-preview');
      const lbl  = document.getElementById('vid-end-upload-lbl');
      
      if (img) img.src = ev.target.result;
      if (wrap) wrap.style.display = 'block';
      if (lbl) lbl.textContent = file.name.substring(0, 22);
      
      window._vidMotionMode = 'transition';
    }
  };
  r.readAsDataURL(file);
}

function vidClearEndFrame() {
  window._vidEndImageB64 = null;
  window._vidMotionMode = 'standard';
  const wrap = document.getElementById('vid-end-upload-preview');
  const img  = document.getElementById('vid-end-upload-img');
  const lbl  = document.getElementById('vid-end-upload-lbl');
  if (wrap) wrap.style.display = 'none';
  if (img) img.src = '';
  if (lbl) lbl.textContent = 'Upload Target End Image';
}

// ── HISTORY GRID IN VIDEO PANEL ───────────────────────
function vidLoadHistoryGrid() {
  const grid = document.getElementById('vid-hist-grid');
  if (!grid) return;
  grid.innerHTML = '<div style="font-size:9px;color:var(--text-muted);font-family:var(--font-mono);padding:8px;grid-column:1/-1;">Loading...</div>';
  initDB((db) => {
    const tx  = db.transaction(STORE_NAME, 'readonly');
    const req = tx.objectStore(STORE_NAME).getAll();
    req.onsuccess = () => {
      const records = req.result
        .filter(r => r.generated || r.thumbBase64)
        .sort((a, b) => b.timestamp - a.timestamp)
        .slice(0, 24);
      if (!records.length) {
        grid.innerHTML = '<div style="font-size:9px;color:var(--text-muted);font-family:var(--font-mono);padding:8px;grid-column:1/-1;">No history yet.</div>';
        return;
      }
      grid.innerHTML = '';
      records.forEach(item => {
        const src = item.generated
          ? 'data:image/png;base64,' + item.generated
          : (item.thumbBase64 ? 'data:image/png;base64,' + item.thumbBase64 : null);
        const div = document.createElement('div');
        div.className = 'vid-hist-thumb';
        div.innerHTML = src ? `<img src="${src}" alt="">` : '<div class="vid-hist-no-img">No img</div>';
        div.onclick = () => {
          document.querySelectorAll('.vid-hist-thumb').forEach(el => el.classList.remove('selected'));
          div.classList.add('selected');
          window._vidCustomImageB64 = src;
          const si = document.getElementById('vid-hist-selected-img');
          const sw = document.getElementById('vid-hist-selected-wrap');
          if (si && src) si.src = src;
          if (sw) sw.style.display = src ? '' : 'none';
        };
        grid.appendChild(div);
      });
    };
  });
}

function vidClearHistoryPick() {
  window._vidCustomImageB64 = null;
  const wrap = document.getElementById('vid-hist-selected-wrap');
  const img  = document.getElementById('vid-hist-selected-img');
  if (wrap) wrap.style.display = 'none';
  if (img) img.src = '';
  document.querySelectorAll('.vid-hist-thumb').forEach(el => el.classList.remove('selected'));
}

window._vidEndImageB64 = null;
var _vidEndSrcMode = 'none';

function vidEndSrcSwitch(mode) {
  _vidEndSrcMode = mode;
  ['none', 'upload', 'history'].forEach(m => {
    const el = document.getElementById('vsrc-end-tab-' + m);
    if (el) el.classList.toggle('active', m === mode);
  });
  const ua = document.getElementById('vsrc-end-upload-area');
  const ha = document.getElementById('vsrc-end-history-area');
  if (ua) ua.style.display = mode === 'upload'  ? '' : 'none';
  if (ha) ha.style.display = mode === 'history' ? '' : 'none';
  
  if (mode !== 'upload' && mode !== 'history') {
    window._vidEndImageB64 = null;
    window._vidMotionMode = 'standard';
  } else if (mode === 'history') {
    vidLoadEndHistoryGrid();
  }
}

function vidLoadEndHistoryGrid() {
  const grid = document.getElementById('vid-end-hist-grid');
  if (!grid) return;
  grid.innerHTML = '<div style="font-size:9px;color:var(--text-muted);font-family:var(--font-mono);padding:8px;grid-column:1/-1;">Loading...</div>';
  initDB((db) => {
    const tx  = db.transaction(STORE_NAME, 'readonly');
    const req = tx.objectStore(STORE_NAME).getAll();
    req.onsuccess = () => {
      const records = req.result
        .filter(r => r.generated || r.thumbBase64)
        .sort((a, b) => b.timestamp - a.timestamp);
      grid.innerHTML = '';
      if (records.length === 0) {
        grid.innerHTML = '<div style="font-size:9px;color:var(--text-muted);font-family:var(--font-mono);padding:8px;grid-column:1/-1;">No history yet.</div>';
        return;
      }
      records.forEach(item => {
        const src = item.generated
          ? 'data:image/png;base64,' + item.generated
          : (item.thumbBase64 ? 'data:image/png;base64,' + item.thumbBase64 : null);
        const div = document.createElement('div');
        div.className = 'vid-hist-thumb';
        div.innerHTML = src ? `<img src="${src}" alt="">` : '<div class="vid-hist-no-img">No img</div>';
        div.onclick = () => {
          document.querySelectorAll('#vsrc-end-history-area .vid-hist-thumb').forEach(el => el.classList.remove('selected'));
          div.classList.add('selected');
          window._vidEndImageB64 = src;
          window._vidMotionMode = 'transition';
          const si = document.getElementById('vid-end-hist-selected-img');
          const sw = document.getElementById('vid-end-hist-selected-wrap');
          if (si && src) si.src = src;
          if (sw) sw.style.display = src ? '' : 'none';
        };
        grid.appendChild(div);
      });
    };
  });
}

function vidClearEndHistoryPick() {
  window._vidEndImageB64 = null;
  window._vidMotionMode = 'standard';
  const wrap = document.getElementById('vid-end-hist-selected-wrap');
  const img  = document.getElementById('vid-end-hist-selected-img');
  if (wrap) wrap.style.display = 'none';
  if (img) img.src = '';
  document.querySelectorAll('#vsrc-end-history-area .vid-hist-thumb').forEach(el => el.classList.remove('selected'));
}

// ── PILL SELECTORS ────────────────────────────────────
function vidSelectCam(el, val) {
  document.querySelectorAll('.cam-pill').forEach(p => p.classList.remove('selected'));
  if (el) el.classList.add('selected');
  window._vidCameraMotion = val;
}

function vidSelectDur(el, val) {
  document.querySelectorAll('.vid-dur-pill').forEach(p => p.classList.remove('selected'));
  if (el) el.classList.add('selected');
  window._vidDuration = val;
  
  let cost = 10.0;
  if (val === 4) cost = 8.0;
  else if (val === 8) cost = 15.0;
  
  const btn = document.getElementById('btn-video-run-trigger');
  if (btn) {
    btn.innerHTML = `<span data-i18n="btn_video_run">Run Video Render</span> (${cost} CR)`;
    if (typeof window.localizeDOM === 'function') {
      window.localizeDOM(btn);
    }
  }
}

function vidSelectRes(el, val) {
  document.querySelectorAll('.vid-res-pill').forEach(p => p.classList.remove('selected'));
  if (el) el.classList.add('selected');
  window._vidResolution = val;
}

function vidSelectAR(el, val) {
  document.querySelectorAll('.vid-ar-pill').forEach(p => p.classList.remove('selected'));
  if (el) el.classList.add('selected');
  window._vidAspectRatio = val;
}

function vidSelectSpeed(el, val) {
  document.querySelectorAll('.vid-speed-pills .vid-speed-pill').forEach(p => p.classList.remove('selected'));
  if (el) el.classList.add('selected');
  window._vidMotionSpeed = val;
}

const VIDEO_PRESETS = {
  drone: {
    camera: "orbit_left",
    prompt: "Slow majestic drone aerial orbit around the building, golden hour sunset flare, panning shot, high cinematic detail, volumetric shadows",
  },
  timelapse: {
    camera: "none",
    prompt: "Ultra realistic night-to-day architectural timelapse, transition lighting, moving stars and clouds, shadows sweeping across facade",
  },
  walkthrough: {
    camera: "dolly_forward",
    prompt: "Smooth architectural interior walkthrough tour, steadycam glide movement, realistic materials, slow pacing, cinematic lighting",
  },
  dolly: {
    camera: "dolly_forward",
    prompt: "Slow cinematic dolly push-in focus, dramatic depth of field blur, highlighting facade details and landscaping reflections",
  }
};

function selectVideoPreset(presetId) {
  const preset = VIDEO_PRESETS[presetId];
  if (!preset) return;

  // Highlight card
  document.querySelectorAll('.video-preset-card').forEach(card => {
    if (card.getAttribute('data-id') === presetId) {
      card.classList.add('active');
    } else {
      card.classList.remove('active');
    }
  });

  // Set camera motion
  const camPills = document.querySelectorAll('.cam-grid .cam-pill');
  camPills.forEach(pill => {
    const clickAttr = pill.getAttribute('onclick') || '';
    if (clickAttr.includes(preset.camera)) {
      document.querySelectorAll('.cam-pill').forEach(p => p.classList.remove('selected'));
      pill.classList.add('selected');
      window._vidCameraMotion = preset.camera;
    }
  });

  // Set motion prompt
  const promptEl = document.getElementById('vid-motion-prompt');
  if (promptEl) {
    promptEl.value = preset.prompt;
    promptEl.dispatchEvent(new Event('input'));
  }

  showToast(`Cinematic Preset Applied 🎬`);
}

// ── RENDER FROM RESULT IMAGE ──────────────────────────
function vidRenderFromResult(genB64) {
  const fullSrc = 'data:image/png;base64,' + genB64;
  window._vidCustomImageB64 = fullSrc;
  
  // Transition workspace
  if (typeof switchTab === 'function') switchTab('video');
  vidSrcSwitch('upload');
  
  const prevImg  = document.getElementById('vid-upload-img');
  const prevWrap = document.getElementById('vid-upload-preview');
  const prevLbl  = document.getElementById('vid-upload-lbl');
  if (prevImg) prevImg.src = fullSrc;
  if (prevWrap) prevWrap.style.display = '';
  if (prevLbl) prevLbl.textContent = 'From render result';
  
  showToast('Starting frame preloaded in Video Settings 🎬');
}

function getSgaiServerBase() {
  const el = document.getElementById('i3d-server-url');
  let val = el ? el.value.trim().replace(/\/$/, '') : '';
  if (val && !val.startsWith('http://') && !val.startsWith('https://')) {
    val = 'http://' + val;
  }
  return val || 'http://localhost:3000';
}

// ── VIDEO PLAYER LOADER ───────────────────────────────
window.sgaiLoadVideo = function(videoElId, url, statusElId) {
  const video  = document.getElementById(videoElId);
  const status = statusElId ? document.getElementById(statusElId) : null;
  if (!video || !url) return;

  const btnId = videoElId.replace('sgai-', 'vid-play-btn-').replace('-video', '');
  const btn   = document.getElementById(btnId);

  function setStatus(msg, color) {
    if (status) { status.textContent = msg; if (color) status.style.color = color; }
  }
  function bindNativeEvents() {
    video.onplay  = () => { if (btn) btn.innerHTML = '&#9646;&#9646; PAUSE'; };
    video.onpause = () => { if (btn) btn.innerHTML = '&#9654; PLAY'; };
    video.onended = () => { if (btn) btn.innerHTML = '&#9654; PLAY'; };
  }
  function onPlaySuccess() { setStatus('Ready', 'var(--accent-green)'); if (btn) btn.innerHTML = '&#9646;&#9646; PAUSE'; }

  const SERVER = getSgaiServerBase();
  const proxyUrl = SERVER + '/api/proxy-video?url=' + encodeURIComponent(url);

  setStatus('Loading...', '');
  bindNativeEvents();

  let triedDirect = false, triedBlob = false;

  function tryProxy() {
    video.src = proxyUrl; video.load();
    video.oncanplay = () => { setStatus('Ready', 'var(--accent-green)'); video.play().then(onPlaySuccess).catch(() => setStatus('Ready - click PLAY', '')); };
    video.onerror   = () => { if (!triedDirect) tryDirect(); };
    setTimeout(() => { if (video.readyState === 0 && !triedDirect) tryDirect(); }, 5000);
  }
  function tryDirect() {
    triedDirect = true; setStatus('Connecting...', '');
    video.src = url; video.load();
    video.oncanplay = () => { setStatus('Ready', 'var(--accent-green)'); video.play().then(onPlaySuccess).catch(() => setStatus('Ready - click PLAY', '')); };
    video.onerror   = () => { if (!triedBlob) tryBlob(); };
    setTimeout(() => { if (video.readyState === 0 && !triedBlob) tryBlob(); }, 6000);
  }
  function tryBlob() {
    triedBlob = true; setStatus('Fetching...', '');
    fetch(proxyUrl)
      .then(r => { if (!r.ok) throw new Error('proxy'); return r.blob(); })
      .then(blob => {
        video.src = URL.createObjectURL(blob); video.load();
        video.oncanplay = () => { setStatus('Ready', 'var(--accent-green)'); video.play().then(onPlaySuccess).catch(() => setStatus('Ready - click PLAY', '')); };
        video.onerror   = () => setStatus('Use Download button', 'var(--danger)');
      })
      .catch(() => {
        fetch(url).then(r => r.blob()).then(blob => {
          video.src = URL.createObjectURL(blob); video.load();
          video.oncanplay = () => { setStatus('Ready', 'var(--accent-green)'); video.play().then(onPlaySuccess).catch(() => setStatus('Ready - click PLAY', '')); };
        }).catch(() => setStatus('Use Download button', 'var(--danger)'));
      });
  }
  tryProxy();
}

window.sgaiVideoPlay = function(videoElId, btnId) {
  const video = document.getElementById(videoElId);
  const btn   = document.getElementById(btnId);
  if (!video) return;
  video.onplay  = () => { if (btn) btn.innerHTML = '&#9646;&#9646; PAUSE'; };
  video.onpause = () => { if (btn) btn.innerHTML = '&#9654; PLAY'; };
  video.onended = () => { if (btn) btn.innerHTML = '&#9654; PLAY'; };
  if (video.paused || video.ended) {
    video.play()
      .then(() => { if (btn) btn.innerHTML = '&#9646;&#9646; PAUSE'; })
      .catch(e => {
        console.warn('[SGAI] play() failed:', e.message);
        if (typeof showToast === 'function') {
          showToast("⚠️ Video playback is restricted inside SketchUp's webview. Please use 'Open in Browser' to watch!", 5000);
        }
        const savedSrc = video.currentSrc || video.src;
        if (savedSrc && savedSrc !== window.location.href) {
          video.load();
          setTimeout(() => video.play().catch(() => {}), 300);
        }
      });
  } else {
    video.pause();
    if (btn) btn.innerHTML = '&#9654; PLAY';
  }
}
