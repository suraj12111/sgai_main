/* =====================================================
   SGAI RENDER ENGINE — app.js
   Core state, init, auth, credits, viewport capture,
   render pipeline, prompt builder
   ===================================================== */

const SERVER_URL = 'https://sketchupgurus-ai-server.onrender.com/api'; // ← mock server (change to Render.com URL for production)
let userEmail = localStorage.getItem('sgai_user_email');
let systemHardwareId = "pending";

// ── GLOBAL STATE ──────────────────────────────────────
let capturedB64 = null;
let styleB64 = null;
let propImages = [];
let currentEditBase64 = null;
let isDrawing = false, startX, startY, drawCtx, baseCtx;
let currentDrafts = [];
let selectedDraftIndex = -1;
let lastPromptText = "";
let capturedAspectRatio = 16 / 9;
window.selectedPresetPrompt = "";
window.selectedPresetNegative = "";

// ── GLOBAL RESIZE HELPER ─────────────────────────────
window.resizeImageBase64 = function(base64Str, maxWidth, maxHeight, callback) {
  if (!base64Str || !base64Str.startsWith('data:')) {
    return callback(base64Str);
  }
  const img = new Image();
  img.onload = function() {
    let width = img.width;
    let height = img.height;
    if (width > maxWidth || height > maxHeight) {
      if (width > height) {
        height = Math.round((height * maxWidth) / width);
        width = maxWidth;
      } else {
        width = Math.round((width * maxHeight) / height);
        height = maxHeight;
      }
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0, width, height);
      callback(canvas.toDataURL('image/jpeg', 0.85));
    } else {
      callback(base64Str);
    }
  };
  img.onerror = function() {
    callback(base64Str);
  };
  img.src = base64Str;
};

// ── SKETCHUP BRIDGE ───────────────────────────────────
function receiveMachineId(token) { systemHardwareId = token; syncCredits(); }

// ── INIT ──────────────────────────────────────────────
document.addEventListener("DOMContentLoaded", () => {
  // Request machine ID — Ruby: add_action_callback("requestMachineId")
  // Call directly without property check (SketchUp bridge resolves at runtime)
  if (typeof sketchup !== 'undefined') {
    try { sketchup.requestMachineId(); } catch(e) { console.log('[SGAI] requestMachineId skipped:', e.message); }
  }
  initGoogleSignIn();
  if (!userEmail) {
    document.getElementById('auth-modal').style.display = 'flex';
  } else {
    initApp();
  }

  document.getElementById('base-upload').addEventListener('change', (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      document.getElementById('status').innerText = "Uploading base image...";
      receiveViewportImage(ev.target.result);
    };
    reader.readAsDataURL(file);
  });

  document.getElementById('style-input').addEventListener('change', (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      styleB64 = ev.target.result.split(',')[1];
      document.getElementById('style-preview').src = ev.target.result;
      document.getElementById('style-preview-container').style.display = 'block';
    };
    reader.readAsDataURL(file);
  });

  document.getElementById('prop-input').addEventListener('change', (e) => {
    Array.from(e.target.files).forEach(f => {
      const reader = new FileReader();
      reader.onload = (ev) => {
        propImages.push({ data: ev.target.result.split(',')[1], src: ev.target.result });
        renderPropList();
      };
      reader.readAsDataURL(f);
    });
  });

  document.addEventListener('contextmenu', event => event.preventDefault());
  document.addEventListener('dragstart', event => event.preventDefault());
});

function initApp() {
  if (userEmail) {
    const headerEmail = document.getElementById('user-email-display');
    if (headerEmail) headerEmail.innerText = userEmail;
    updateUserInfoArea(userEmail);
  }
  syncCredits();
  loadHistoryUI();
  initPresetsGallery();
}

// ── USER INFO AREA ────────────────────────────────────
function updateUserInfoArea(email) {
  const area = document.getElementById('user-info-area');
  const username = email.split('@')[0];
  area.innerHTML = `
    <div class="user-card" onclick="showProfileModal()">
      <div class="user-avatar">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
      </div>
      <div class="user-info">
        <div class="user-name">${username}</div>
        <div class="user-credits" id="sidebar-credit-display">SYNCING...</div>
      </div>
      <svg class="user-logout-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>
    </div>
  `;
}

// ── TAB SWITCHER ──────────────────────────────────────
function switchTab(tab) {
  document.querySelectorAll('.tab-content').forEach(t => t.classList.remove('active'));
  document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
  const el = document.getElementById('tab-' + tab);
  if (el) el.classList.add('active');
  const btn = document.querySelector(`[data-tab="${tab}"]`);
  if (btn) btn.classList.add('active');

  const studio = document.getElementById('main-studio');
  const threeD = document.getElementById('main-3d');
  const video = document.getElementById('main-video-canvas');
  const rightSidebar = document.querySelector('.right-sidebar');

  // Hide all main output areas first
  if (studio) studio.classList.remove('hidden');
  if (threeD) threeD.classList.remove('active');
  if (video) video.classList.remove('active');
  if (rightSidebar) rightSidebar.classList.remove('hidden');

  if (tab === '3d') {
    if (studio) studio.classList.add('hidden');
    if (threeD) threeD.classList.add('active');
    if (rightSidebar) rightSidebar.classList.add('hidden');
  } else if (tab === 'video') {
    if (studio) studio.classList.add('hidden');
    if (video) video.classList.add('active');
    if (rightSidebar) rightSidebar.classList.add('hidden');
    // Redraw canvas connection paths once visible to align coords
    if (typeof drawAllConnections === 'function') {
      setTimeout(drawAllConnections, 50);
    }
  }
}

// ── AUTH ──────────────────────────────────────────────
let currentAuthMode = 'login';
let otpSent = false;

function toggleAuthMode(mode) {
  currentAuthMode = mode; otpSent = false;
  document.getElementById('auth-error').style.display = 'none';
  document.getElementById('otp-group').style.display = 'none';
  document.getElementById('auth-email').disabled = false;
  document.getElementById('auth-password').disabled = false;
  document.getElementById('tab-login').classList.toggle('active', mode === 'login');
  document.getElementById('tab-signup').classList.toggle('active', mode === 'signup');
  if (mode === 'login') {
    document.getElementById('auth-title').innerText = "Welcome Back";
    document.getElementById('auth-action-btn').innerText = "Login to Account";
  } else {
    document.getElementById('auth-title').innerText = "Create Account";
    document.getElementById('auth-action-btn').innerText = "Send Verification Code";
  }
}

async function submitAuth() {
  const email = document.getElementById('auth-email').value.trim();
  const password = document.getElementById('auth-password').value;
  const errorEl = document.getElementById('auth-error');
  errorEl.style.display = 'none';
  if (!email || !password) { errorEl.innerText = 'Please fill in all fields.'; errorEl.style.display = 'block'; return; }
  const btn = document.getElementById('auth-action-btn');

  if (currentAuthMode === 'login') {
    btn.innerText = 'Authenticating...'; btn.disabled = true;
    try {
      const res = await fetch(`${SERVER_URL}/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password, machineId: systemHardwareId }) });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Login failed.');
      localStorage.setItem('sgai_user_email', email); userEmail = email;
      if (data.token) localStorage.setItem('sgai_auth_token', data.token);
      document.getElementById('auth-modal').style.display = 'none'; initApp();
    } catch(e) { errorEl.innerText = e.message; errorEl.style.display = 'block'; }
    finally { btn.innerText = 'Login to Account'; btn.disabled = false; }
  } else {
    if (!otpSent) {
      btn.innerText = 'Sending...'; btn.disabled = true;
      try {
        const res = await fetch(`${SERVER_URL}/send-otp`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password, machineId: systemHardwareId }) });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Failed to send OTP.');
        otpSent = true;
        document.getElementById('otp-group').style.display = 'block';
        document.getElementById('auth-email').disabled = true;
        document.getElementById('auth-password').disabled = true;
        btn.innerText = 'Create Account';
      } catch(e) { errorEl.innerText = e.message; errorEl.style.display = 'block'; }
      finally { btn.disabled = false; }
    } else {
      const otp = document.getElementById('auth-otp').value.trim();
      if (!otp) { errorEl.innerText = 'Please enter the OTP.'; errorEl.style.display = 'block'; return; }
      btn.innerText = 'Creating account...'; btn.disabled = true;
      try {
        const res = await fetch(`${SERVER_URL}/signup`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, otp }) });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Signup failed.');
        localStorage.setItem('sgai_user_email', email); userEmail = email;
        if (data.token) localStorage.setItem('sgai_auth_token', data.token);
        document.getElementById('auth-modal').style.display = 'none'; initApp();
      } catch(e) { errorEl.innerText = e.message; errorEl.style.display = 'block'; }
      finally { btn.disabled = false; btn.innerText = 'Create Account'; }
    }
  }
}

let googleSignInInitialized = false;
async function initGoogleSignIn() {
  if (googleSignInInitialized) return;

  const isInsidePlugin = (typeof sketchup !== 'undefined');
  if (isInsidePlugin) {
    googleSignInInitialized = true;
    const wrapper = document.getElementById("google-signin-wrapper");
    if (wrapper) wrapper.style.display = 'none';
    return;
  }

  const btnContainer = document.getElementById("google-signin-btn");
  if (!btnContainer || typeof google === 'undefined') return;

  googleSignInInitialized = true;
  try {
    const res = await fetch(`${SERVER_URL}/config`);
    const config = await res.json();
    if (config.googleClientId) {
      google.accounts.id.initialize({
        client_id: config.googleClientId,
        callback: handleGoogleCredentialResponse
      });
      google.accounts.id.renderButton(
        btnContainer,
        { theme: "dark", size: "large", width: "320" }
      );
    }
  } catch (err) {
    console.warn("Failed to initialize Google Sign-in:", err);
    googleSignInInitialized = false;
  }
}

async function handleGoogleCredentialResponse(response) {
  const errorEl = document.getElementById('auth-error');
  if (errorEl) errorEl.style.display = 'none';
  const idToken = response.credential;
  
  const btn = document.getElementById('auth-action-btn');
  const originalText = btn ? btn.innerText : 'Login to Account';
  if (btn) {
    btn.innerText = 'Authenticating via Google...';
    btn.disabled = true;
  }

  try {
    const res = await fetch(`${SERVER_URL}/google-auth`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ idToken, machineId: systemHardwareId })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Google authentication failed.');
    
    localStorage.setItem('sgai_user_email', data.email);
    userEmail = data.email;
    if (data.token) localStorage.setItem('sgai_auth_token', data.token);
    
    const modal = document.getElementById('auth-modal');
    if (modal) modal.style.display = 'none';
    initApp();
  } catch(e) {
    alert("Google Sign-In Error: " + e.message);
    if (errorEl) {
      errorEl.innerText = e.message;
      errorEl.style.display = 'block';
    }
  } finally {
    if (btn) {
      btn.innerText = originalText;
      btn.disabled = false;
    }
  }
}

function logoutUser() { localStorage.removeItem('sgai_user_email'); localStorage.removeItem('sgai_auth_token'); userEmail = null; location.reload(); }

// ── PROFILE & PAYWALL ─────────────────────────────────
function showProfileModal() {
  if (!userEmail) return;
  document.getElementById('profile-modal-email').innerText = userEmail;
  let creditText = document.getElementById('credit-counter').innerText;
  let creditNum = creditText.replace(/[^0-9.]/g, '');
  document.getElementById('profile-modal-credits').innerText = creditNum || "0";
  document.getElementById('profile-modal').style.display = 'flex';
}
function hideProfileModal() { document.getElementById('profile-modal').style.display = 'none'; }
function showPaywall() { 
  document.getElementById('paywall-modal').style.display = 'flex'; 
  fetchLiveExchangeRates().then(() => {
    updatePaywallPrices();
  });
}
function hidePaywall() { document.getElementById('paywall-modal').style.display = 'none'; }

window.paywallExchangeRates = { USD: 1.0, EUR: 0.92, INR: 83.5, GBP: 0.79, JPY: 160.0 };

async function fetchLiveExchangeRates() {
  try {
    const res = await fetch('https://open.er-api.com/v6/latest/USD');
    const data = await res.json();
    if (data && data.result === 'success' && data.rates) {
      window.paywallExchangeRates = {
        USD: 1.0,
        EUR: data.rates.EUR || 0.92,
        INR: data.rates.INR || 83.5,
        GBP: data.rates.GBP || 0.79,
        JPY: data.rates.JPY || 160.0
      };
      console.log('🌍 Live exchange rates loaded successfully:', window.paywallExchangeRates);
    }
  } catch (e) {
    console.warn('⚠️ Failed to fetch live exchange rates, using offline defaults:', e);
  }
}

function updatePaywallPrices() {
  const currencySelect = document.getElementById('paywall-currency');
  if (!currencySelect) return;
  const currency = currencySelect.value;
  const rates = window.paywallExchangeRates;
  const rate = rates[currency] || 1.0;
  
  const symbolMap = {
    USD: '$',
    EUR: '€',
    INR: '₹',
    GBP: '£',
    JPY: '¥'
  };
  const symbol = symbolMap[currency] || '';
  
  const tiers = ['starter', 'pro', 'studio'];
  tiers.forEach(tier => {
    const priceEl = document.getElementById(`price-${tier}`);
    if (priceEl) {
      const baseUSD = parseFloat(priceEl.getAttribute('data-usd') || 0);
      const converted = baseUSD * rate;
      
      let formattedVal;
      if (currency === 'JPY') {
        formattedVal = Math.round(converted).toLocaleString('ja-JP');
      } else if (currency === 'INR') {
        formattedVal = converted.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
      } else {
        formattedVal = converted.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
      }
      
      priceEl.innerText = `${symbol}${formattedVal} ${currency}`;
    }
  });
}


async function payWithRazorpay(tier) {
  const token = localStorage.getItem('sgai_auth_token');
  try {
    document.getElementById('credit-counter').innerText = "CONNECTING...";
    const res = await fetch(`${SERVER_URL}/create-payment-link`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + token
      },
      body: JSON.stringify({ tier })
    });
    const data = await res.json();
    if (data.payment_url) {
      const a = document.createElement('a'); a.href = data.payment_url; a.target = '_blank';
      document.body.appendChild(a); a.click(); document.body.removeChild(a);
      hidePaywall();
      let pollCount = 0;
      const poll = setInterval(async () => {
        pollCount++;
        await syncCredits();
        if (pollCount >= 20) clearInterval(poll);
      }, 5000);
    } else { throw new Error(data.error || 'Payment link failed.'); }
  } catch(e) { syncCredits(); alert('Payment error: ' + e.message); }
}

async function copyPaymentLink(event, tier) {
  if (event) event.stopPropagation();
  const token = localStorage.getItem('sgai_auth_token');
  const btn = event ? event.currentTarget : null;
  const originalText = btn ? btn.innerText : "Copy Link";
  if (btn) btn.innerText = "Generating...";
  
  try {
    const res = await fetch(`${SERVER_URL}/create-payment-link`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + token
      },
      body: JSON.stringify({ tier })
    });
    const data = await res.json();
    if (data.payment_url) {
      const cleanUrl = data.payment_url.replace(/[\r\n\t]/g, '').trim();
      if (!cleanUrl.startsWith('https://')) {
        throw new Error("Invalid payment URL protocol.");
      }
      await navigator.clipboard.writeText(cleanUrl);
      if (btn) {
        btn.innerText = "Copied! 👍";
        setTimeout(() => { btn.innerText = originalText; }, 2000);
      } else {
        alert("Payment link copied to clipboard: " + cleanUrl);
      }
    } else { throw new Error(data.error || 'Failed to generate link.'); }
  } catch(e) {
    if (btn) btn.innerText = "Error ❌";
    alert('Error generating payment link: ' + e.message);
    if (btn) setTimeout(() => { btn.innerText = originalText; }, 2000);
  }
}

// ── CREDITS ───────────────────────────────────────────
async function syncCredits() {
  if (!userEmail) return;
  const token = localStorage.getItem('sgai_auth_token');
  try {
    const res = await fetch(`${SERVER_URL}/get-user`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + token
      }
    });
    const data = await res.json();
    if (data.error) throw new Error(data.error);
    const counter = document.getElementById('credit-counter');
    if (counter) {
      counter.innerText = `${data.credits.toFixed(1)} CREDITS`;
      counter.style.color = data.credits <= 0 ? 'var(--danger)' : 'var(--accent-primary)';
    }
    const sidebarCredits = document.getElementById('sidebar-credit-display');
    if (sidebarCredits) {
      sidebarCredits.innerText = `${data.credits.toFixed(1)} CR REMAINING`;
      sidebarCredits.classList.toggle('low', data.credits <= 0);
    }
  } catch (e) { console.error("Credit sync failed:", e); }
}

// ── VIEWPORT / IMAGE CAPTURE ──────────────────────────
// ── COMPRESS HELPER (called before storing captured image) ──
function compressImage(sourceData, maxWidth, callback) {
  const img = new Image();
  img.onload = () => {
    const cvs = document.createElement('canvas');
    const scale = Math.min(1, maxWidth / img.width);
    cvs.width  = img.width  * scale;
    cvs.height = img.height * scale;
    cvs.getContext('2d').drawImage(img, 0, 0, cvs.width, cvs.height);
    callback(cvs.toDataURL('image/jpeg', 0.8).split(',')[1]);
  };
  img.src = sourceData.startsWith('data:') ? sourceData : 'data:image/png;base64,' + sourceData;
}

// ── CALLED BY RUBY: dialog.execute_script("receiveCapturedImage('...')") ──
function receiveCapturedImage(b64) {
  receiveViewportImage('data:image/jpeg;base64,' + b64);
}

function captureViewport() {
  document.getElementById('status').innerText = 'Capturing SketchUp viewport...';
  document.getElementById('status').style.color = 'var(--accent-primary)';

  // ── KEY FIX ─────────────────────────────────────────────
  // In SketchUp HtmlDialog, callbacks are NOT pre-declared as JS
  // properties — checking sketchup.capture_viewport returns undefined
  // even when inside SketchUp. So we must call directly via try/catch.
  //
  // Ruby side: dialog.add_action_callback("capture_viewport") { ... }
  // JS side:   sketchup.capture_viewport()  ← must match Ruby name exactly
  // ────────────────────────────────────────────────────────
  if (typeof sketchup !== 'undefined') {
    try {
      sketchup.capture_viewport();   // matches Ruby: "capture_viewport"
      return;                        // Ruby will call receiveCapturedImage()
    } catch(e) {
      console.warn('[SGAI] capture_viewport failed:', e.message);
    }
    try {
      sketchup.captureViewport();    // camelCase fallback
      return;
    } catch(e) {
      console.warn('[SGAI] captureViewport failed:', e.message);
    }
  }

  // ── NOT inside SketchUp (browser / local test) ──────────
  document.getElementById('status').innerText = '\u26a0 Capture only works inside SketchUp. Use the Upload zone below.';
  document.getElementById('status').style.color = 'var(--accent-gold)';
  const uploadZone = document.querySelector('.upload-zone');
  if (uploadZone) {
    uploadZone.style.borderColor = 'var(--accent-gold)';
    uploadZone.style.boxShadow   = '0 0 16px rgba(240,192,64,0.25)';
    setTimeout(() => {
      uploadZone.style.borderColor = '';
      uploadZone.style.boxShadow   = '';
    }, 2500);
  }
}

function receiveViewportImage(sourceData) {
  // Normalize: accept raw b64 or full data-URL
  const dataUrl = (typeof sourceData === 'string' && sourceData.startsWith('data:'))
    ? sourceData
    : 'data:image/jpeg;base64,' + sourceData;

  document.getElementById('status').innerText = 'Optimizing image...';
  document.getElementById('status').style.color = 'var(--accent-primary)';

  // Use compressImage (matches original exactly)
  compressImage(dataUrl, 1280, (fastB64) => {
    const img = new Image();
    img.onload = () => {
      capturedAspectRatio = img.width / img.height;
      capturedB64 = fastB64;

      // Update upload zone to show captured preview
      const dzImg = document.getElementById('dz-preview');
      if (dzImg) {
        dzImg.src = 'data:image/jpeg;base64,' + fastB64;
        dzImg.style.display = 'block';
        const icon = document.querySelector('.upload-icon');
        if (icon) icon.style.color = 'var(--accent-primary)';
        const l1 = document.getElementById('dz-text-1');
        if (l1) { l1.innerText = 'CHANGE BASE'; l1.style.color = 'var(--accent-primary)'; }
        const l2 = document.getElementById('dz-text-2');
        if (l2) l2.innerText = 'Click to select a different file';
      }

      document.getElementById('status').innerText = 'Image captured. Ready to render.';
      document.getElementById('status').style.color = 'var(--accent-primary)';

      document.getElementById('results-container').innerHTML = `
        <div style="display:flex;flex-direction:column;align-items:center;justify-content:center;width:100%;text-align:center;">
          <h3 style="font-family:var(--font-mono);font-size:11px;color:var(--accent-primary);margin-top:0;margin-bottom:12px;text-transform:uppercase;letter-spacing:2px;">VIEWPORT PREVIEW</h3>
          <img src="data:image/jpeg;base64,${fastB64}" style="width:100%;max-width:800px;border:1px solid rgba(255,255,255,0.1);opacity:0.8;display:block;object-fit:contain;border-radius:8px;box-shadow:0 10px 30px rgba(0,0,0,0.5);">
        </div>`;
    };
    img.src = 'data:image/jpeg;base64,' + fastB64;
  });
}

// ── QUALITY & PROMPT ──────────────────────────────────
function selectQuality(mode) {
  document.getElementById('quality-hd').checked = (mode === 'hd');
  document.getElementById('quality-4k').checked = (mode === '4k');
  const hdPill = document.getElementById('pill-hd');
  const k4Pill = document.getElementById('pill-4k');
  const label = document.getElementById('render-btn-label');
  const hint = document.getElementById('quality-hint');
  if (mode === '4k') {
    k4Pill.style.cssText = 'background:rgba(0,229,255,0.15);border-color:var(--accent-primary);color:var(--accent-primary);box-shadow:0 0 10px rgba(0,229,255,0.1)';
    hdPill.style.cssText = 'background:rgba(0,0,0,0.4);border-color:var(--border-subtle);color:var(--text-muted);box-shadow:none';
    label.innerText = '4 CR';
    hint.innerHTML = '<span style="color:var(--accent-gold);font-weight:bold;">4K</span> — Ultra-high detail, maximum resolution output. Costs 4 credits.';
  } else {
    hdPill.style.cssText = 'background:rgba(0,229,255,0.15);border-color:var(--accent-primary);color:var(--accent-primary);box-shadow:0 0 10px rgba(0,229,255,0.1)';
    k4Pill.style.cssText = 'background:rgba(0,0,0,0.4);border-color:var(--border-subtle);color:var(--text-muted);box-shadow:none';
    label.innerText = '1 CR';
    hint.innerText = 'HD — Fast, standard quality render.';
  }
}

async function enhancePrompt() {
  const promptEl = document.getElementById('prompt');
  if (!promptEl.value.trim()) return alert("Please enter a basic prompt first!");
  const btn = document.getElementById('enhance-btn');
  const label = document.getElementById('enhance-label');
  btn.disabled = true; label.innerText = 'Enhancing...';
  const token = localStorage.getItem('sgai_auth_token');
  try {
    const res = await fetch(`${SERVER_URL}/enhance`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + token
      },
      body: JSON.stringify({ prompt: promptEl.value })
    });
    const data = await res.json();
    if (data.enhancedPrompt) { promptEl.value = data.enhancedPrompt; }
    else { alert("Failed to enhance prompt. Check server."); }
  } catch(e) { alert("Unable to connect to enhancement server."); }
  finally { btn.disabled = false; label.innerText = 'Enhance'; }
}

// ── PROP HELPERS ──────────────────────────────────────
function clearStyle() {
  styleB64 = null;
  document.getElementById('style-preview-container').style.display = 'none';
  document.getElementById('style-input').value = '';
}
function renderPropList() {
  const cont = document.getElementById('prop-preview-container');
  cont.innerHTML = '';
  propImages.forEach((p, i) => {
    cont.innerHTML += `<div class="prop-thumbnail"><img src="${p.src}"><button class="prop-remove-btn" onclick="removeProp(${i})">x</button></div>`;
  });
}
function removeProp(i) { propImages.splice(i, 1); renderPropList(); }

// ── RENDER PIPELINE ───────────────────────────────────
async function startRender(outputType = 'image') {
  const isVideo = outputType === 'video';
  let inputImageB64 = null;

  if (isVideo) {
    if (typeof _vidSrcMode !== 'undefined' && _vidSrcMode === 'capture') {
      inputImageB64 = capturedB64;
      if (!inputImageB64) return alert("Please capture the SketchUp viewport first!");
    } else {
      inputImageB64 = window._vidCustomImageB64;
      if (!inputImageB64) {
        const sourceName = (typeof _vidSrcMode !== 'undefined' && _vidSrcMode === 'upload') ? 'uploaded image' : 'history image';
        return alert(`Please select or upload a starting image for video generation first!`);
      }
      // Strip base64 prefix
      if (inputImageB64.startsWith('data:')) {
        inputImageB64 = inputImageB64.replace(/^data:image\/\w+;base64,/, '');
      }
    }
  } else {
    inputImageB64 = capturedB64;
    if (!inputImageB64) return alert("Please capture the SketchUp viewport first!");
  }

  const renderQuality = document.querySelector('input[name="render_quality"]:checked').value;
  let creditCost = 1.0;
  if (renderQuality === '4k') creditCost = 4.0;
  if (isVideo) {
    const dur = window._vidDuration || 6;
    if (dur === 4) creditCost = 8.0;
    else if (dur === 8) creditCost = 15.0;
    else creditCost = 10.0;
  }

  const currentCreditsText = document.getElementById('credit-counter').innerText;
  const currentCredits = parseFloat(currentCreditsText.replace(/[^0-9.]/g, '')) || 0;
  if (currentCredits < creditCost) {
    document.getElementById('status').innerText = `NOT ENOUGH CREDITS — ${creditCost} CR REQUIRED.`;
    document.getElementById('status').style.color = "var(--danger)";
    return showPaywall();
  }

  document.getElementById('status').innerText = isVideo
    ? "🎬 Generating Video... This takes 1-2 minutes."
    : (renderQuality === '4k' ? "Generating 4K Renders..." : "Generating Renders...");
  document.getElementById('status').style.color = isVideo ? "#d946ef" : "var(--accent-primary)";
  
  const mainBtn = document.getElementById('main-render-btn');
  if (mainBtn) mainBtn.disabled = true;
  const vidBtn = document.getElementById('btn-video-run-trigger');
  if (vidBtn) vidBtn.disabled = true;

  const userPrompt = document.getElementById('prompt').value;
  const userNegative = document.getElementById('negative-prompt').value;
  
  let combinedPrompt = userPrompt;
  if (window.selectedPresetPrompt) {
    combinedPrompt = window.selectedPresetPrompt + (userPrompt ? ". " + userPrompt : "");
  }
  
  let combinedNegative = userNegative;
  if (window.selectedPresetNegative) {
    combinedNegative = window.selectedPresetNegative + (userNegative ? ", " + userNegative : "");
  }

  const presetStyle = document.getElementById('architectural_style_select').value;
  const presetEnv = document.getElementById('environment_preset_select').value;
  const presetBackdrop = document.getElementById('backdrop_preset_select').value;
  const presetMaterial = document.getElementById('material_preset_select').value;
  const geoVal = document.getElementById('geometry-lock').value;

  let geoPrompt = "STRICT GEOMETRY LOCK: Do not alter the fundamental architectural structure, walls, or layout.";
  if (geoVal > 33 && geoVal < 66) geoPrompt = "Maintain the general structure but you can alter minor details and furniture.";
  if (geoVal >= 66) geoPrompt = "Be highly creative. You are free to redesign the space, structure, and layout.";

  let negPromptString = combinedNegative ? ` NEGATIVE PROMPT (AVOID THESE): ${combinedNegative}.` : "";
  const qualitySuffix = renderQuality === '4k'
    ? " RENDER QUALITY: Ultra-high resolution 4K output. Extreme detail, hyper-realistic textures, crisp edges, studio-grade photorealism."
    : " RENDER QUALITY: High definition HD output, high quality photorealistic render.";

  const parts = [{ inlineData: { mimeType: "image/jpeg", data: inputImageB64 } }];
  if (!isVideo) {
    if (styleB64) parts.push({ inlineData: { mimeType: "image/jpeg", data: styleB64 } });
    propImages.forEach(p => parts.push({ inlineData: { mimeType: "image/jpeg", data: p.data } }));
  }

  let matPrompt = presetMaterial ? ` Material Override: ${presetMaterial}.` : "";
  let backdropPrompt = presetBackdrop ? ` Backdrop: ${presetBackdrop}.` : "";
  lastPromptText = `${combinedPrompt}. Style: ${presetStyle}. Environment: ${presetEnv}.${backdropPrompt}${matPrompt} ${geoPrompt}${negPromptString}${qualitySuffix}`;
  parts.push({ text: lastPromptText });

  var videoOptions = {};
  if (isVideo) {
    videoOptions = {
      cameraMotion: window._vidCameraMotion || 'none',
      duration:     window._vidDuration     || 6,
      resolution:   window._vidResolution   || '720p',
      aspectRatio:  window._vidAspectRatio    || '16:9',
      motionSpeed:  window._vidMotionSpeed    || 'medium',
      generateAudio: document.getElementById('vid-generate-audio')?.checked || false,
      motionPrompt: (document.getElementById('vid-motion-prompt') || {value:''}).value || '',
    };
  }

  const payload = {
    mode: isVideo ? "video" : "draft", version: "2.0",
    renderQuality, geminiPayload: { contents: [{ role: "user", parts }] }, videoOptions,
    model: document.getElementById('render-model').value || 'gemini',
    aspectRatio: capturedAspectRatio
  };

  if (isVideo && window._vidEndImageB64) {
    let cleanEndB64 = window._vidEndImageB64;
    if (cleanEndB64.startsWith('data:')) {
      cleanEndB64 = cleanEndB64.replace(/^data:image\/\w+;base64,/, '');
    }
    payload.lastFrameBase64 = cleanEndB64;
  }

  const token = localStorage.getItem('sgai_auth_token');
  try {
    const res = await fetch(`${SERVER_URL}/generate`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + token
      },
      body: JSON.stringify(payload)
    });
    const data = await res.json();
    const mainBtn = document.getElementById('main-render-btn');
    if (mainBtn) mainBtn.disabled = false;
    const vidBtn = document.getElementById('btn-video-run-trigger');
    if (vidBtn) vidBtn.disabled = false;

    if (res.status === 403) return showPaywall();
    if (!res.ok || data.error) {
      document.getElementById('status').innerText = `API ERROR: ${data.error || "Unknown Error"}`;
      document.getElementById('status').style.color = "var(--danger)"; return;
    }

    if (isVideo && data.videoUrl) {
      const c = document.getElementById('results-container');
      c.innerHTML = `
        <div style="width:100%;max-width:860px;margin:0 auto;background:rgba(0,0,0,0.6);border:1px solid var(--border-color);border-radius:10px;overflow:hidden;">
          <div style="font-family:var(--font-mono);font-size:9px;letter-spacing:1.5px;color:var(--accent-primary);padding:10px 14px;border-bottom:1px solid var(--border-color);display:flex;align-items:center;justify-content:space-between;">
            <span>&#9654; VIDEO OUTPUT</span>
            <span id="vid-status-main" style="color:var(--text-muted);">Loading...</span>
          </div>
          <video id="sgai-main-video" poster="${inputImageB64 || ''}" controls autoplay loop muted playsinline crossorigin="anonymous" preload="auto"
            style="width:100%;display:block;max-height:480px;background:#000;outline:none;"></video>
          <div style="display:flex;gap:10px;padding:12px 14px;border-top:1px solid var(--border-color);">
            <button id="vid-play-btn-main" onclick="window.sgaiVideoPlay('sgai-main-video','vid-play-btn-main')"
              style="flex:1;padding:9px;border-radius:6px;border:1px solid var(--border-color);background:transparent;color:var(--accent-primary);font-family:var(--font-mono);font-size:10px;letter-spacing:1px;cursor:pointer;">
              &#9654; PLAY
            </button>
            <button onclick="window.open('${data.videoUrl}', '_blank')"
              style="flex:1;display:flex;align-items:center;justify-content:center;padding:9px;border-radius:6px;border:1px solid var(--border-color);background:transparent;color:var(--accent-primary);font-family:var(--font-mono);font-size:10px;letter-spacing:1px;cursor:pointer;outline:none;">
              &#127760; OPEN IN BROWSER
            </button>
             <button onclick="window.downloadVideoFile('${data.videoUrl}')"
              style="flex:1;display:flex;align-items:center;justify-content:center;padding:9px;border-radius:6px;border:1px solid rgba(0,229,255,0.3);background:transparent;color:var(--accent-primary);font-family:var(--font-mono);font-size:10px;letter-spacing:1px;cursor:pointer;outline:none;">
              &#11015; DOWNLOAD
            </button>
          </div>
        </div>`;
      window.sgaiLoadVideo('sgai-main-video', data.videoUrl, 'vid-status-main');
      saveToHistory(inputImageB64, null, '[VIDEO] ' + lastPromptText, capturedAspectRatio, { type: 'video', videoUrl: data.videoUrl, thumbBase64: inputImageB64 });
    } else if (data.data && data.data.candidates) {
      const returnParts = data.data.candidates[0].content.parts;
      currentDrafts = returnParts.filter(p => p.inlineData).map(p => p.inlineData.data);
      displayDraftGrid(currentDrafts);
      currentDrafts.forEach(draftB64 => saveToHistory(capturedB64, draftB64, '[RENDER] ' + lastPromptText, capturedAspectRatio));
    }

    syncCredits();
    document.getElementById('status').innerText = isVideo ? "Video Complete." : (renderQuality === '4k' ? "4K Renders Complete." : "Renders Complete.");
    document.getElementById('status').style.color = "var(--accent-primary)";
  } catch(e) {
    const mainBtn = document.getElementById('main-render-btn');
    if (mainBtn) mainBtn.disabled = false;
    const vidBtn = document.getElementById('btn-video-run-trigger');
    if (vidBtn) vidBtn.disabled = false;
    document.getElementById('status').innerText = "Server Error. Check terminal.";
    document.getElementById('status').style.color = "var(--danger)";
  }
}

async function startVideoRender() { startRender('video'); }

// ── GLOBAL VIDEO DOWNLOAD HELPER ─────────────────────
window.downloadVideoFile = function(videoUrl, filename = "SGAI_Render.mp4") {
  if (!videoUrl) {
    alert("No video output generated yet to download.");
    return;
  }
  
  // Use proxy to bypass CORS and force direct file download
  const proxyUrl = `https://sketchupgurus-ai-server.onrender.com/api/proxy-video?url=${encodeURIComponent(videoUrl)}`;
  
  // Create a loading state feedback if needed (optional, just console.log here)
  console.log(`Downloading video via proxy: ${proxyUrl}`);
  
  fetch(proxyUrl)
    .then(res => {
      if (!res.ok) throw new Error("CORS Proxy download failed");
      return res.blob();
    })
    .then(blob => {
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.style.display = 'none';
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
    })
    .catch(err => {
      console.warn("Direct proxy download failed, falling back to opening in a new tab:", err);
      // Fallback: Open in new tab
      window.open(videoUrl, '_blank');
    });
};

// ── ARCHITECTURAL PRESETS GALLERY ──────────────────────
const ARCHITECTURAL_PRESETS = [
  // Layouts
  {
    id: "exterior_render",
    category: "layouts",
    name: "Exterior Render",
    description: "Modern minimalist residential villa exterior in daylight.",
    image: "/assets/exterior.png",
    style: "High quality exterior architectural render, standard HD resolution, realistic lighting, architectural photography, detailed",
    prompt: "Modern minimalist residential villa exterior, wood and steel cladding, natural landscaping, dramatic morning daylight",
    negative: "people, cars, clutter, blurry",
    lighting: "Clear sky, bright daylight, sharp shadows",
    material: ""
  },
  {
    id: "interior_render",
    category: "layouts",
    name: "Interior Render",
    description: "Premium architectural interior space, elegant styling, soft daylight.",
    image: "/assets/interior.png",
    style: "High quality interior design render, soft natural lighting, elegant styling, realistic materials, standard HD, interior design photography",
    prompt: "Modern architectural interior design, elegant styling, premium furniture, soft natural lighting, realistic materials, detailed textures",
    negative: "people, cars, architectural exterior, low quality",
    lighting: "Ambient lighting, soft cinematic atmospheric lighting",
    material: ""
  },
  {
    id: "floor_plan",
    category: "layouts",
    name: "Floor Plan",
    description: "Top-down 3D open-concept furnished apartment layout.",
    image: "/assets/floorplan.png",
    style: "Top-down 3D architectural floor plan render, isometric view, dollhouse perspective, realistic lighting, soft shadows, clear room layout, photorealistic",
    prompt: "Top-down 3D architectural floor plan, modern open-concept apartment layout, fully furnished, clean minimalist design",
    negative: "people, sky, ground, exterior perspective",
    lighting: "Ambient lighting, soft cinematic atmospheric lighting",
    material: ""
  },
  {
    id: "cad_drawing",
    category: "layouts",
    name: "CAD Blueprint",
    description: "Orthographic blueprint schematic on a technical grid.",
    image: "/assets/cad.png",
    style: "Exploded axonometric view, technical illustration, isometric projection, wireframe aesthetic",
    prompt: "CAD orthographic technical drawing, blueprint architectural schematic layout, white drafting lines on blueprint grid background, professional technical illustration",
    negative: "people, colors, realistic textures, photograph, shadows",
    lighting: "Ambient lighting, soft cinematic atmospheric lighting",
    material: ""
  },
  {
    id: "commercial_render",
    category: "layouts",
    name: "Commercial Space",
    description: "Office lobby interior, polished floors, corporate lights.",
    image: "/assets/commercial.png",
    style: "Modern commercial interior render, office space, retail design, professional lighting, realistic, architectural visualization",
    prompt: "Modern commercial office lobby interior design, professional corporate lighting, reception desk, contemporary architectural visualization",
    negative: "residential bedroom, home, bed, cozy",
    lighting: "Ambient lighting, soft cinematic atmospheric lighting",
    material: ""
  },
  {
    id: "master_plan",
    category: "layouts",
    name: "Master Plan",
    description: "Bird's-eye drone aerial view of residential neighborhood.",
    image: "/assets/masterplan.png",
    style: "Bird's-eye view, aerial architectural render, drone photography angle, masterplan view, realistic lighting, detailed landscape",
    prompt: "Bird's-eye view aerial architectural rendering of a masterplan development, residential community with roads, parks, and lush detailed landscape",
    negative: "indoor, room, interior, low-angle, close-up",
    lighting: "Clear sky, bright daylight, sharp shadows",
    material: ""
  },
  {
    id: "exploded_view",
    category: "layouts",
    name: "Exploded View",
    description: "Structural building layers showing timber frame detail.",
    image: "/assets/exploded.png",
    style: "Exploded axonometric view, technical illustration, isometric projection, wireframe aesthetic",
    prompt: "Axonometric exploded structural view of a building, showing timber framing layers, floor slabs, wall build-ups, and technical architectural illustration",
    negative: "people, sky, photorealistic textures",
    lighting: "Ambient lighting, soft cinematic atmospheric lighting",
    material: ""
  },
  {
    id: "moodboard_flatlay",
    category: "layouts",
    name: "Moodboard Design",
    description: "Flatlay materials arrangement with oak wood & terrazzo.",
    image: "/assets/moodboard.png",
    style: "Professional interior design moodboard, architectural flat lay layout, carefully arranged material samples, cohesive color palette swatches, furniture inspiration vignettes, interior design presentation board, top-down photography, photorealistic textures, highly detailed",
    prompt: "Professional interior design moodboard flat lay, warm earth tones color palette swatches, wood samples, linen fabrics, brass fixtures, and furniture clippings",
    negative: "building facade, exterior landscape, birds-eye",
    lighting: "Ambient lighting, soft cinematic atmospheric lighting",
    material: ""
  },
  {
    id: "sketch_to_cad",
    category: "layouts",
    name: "Sketch to CAD",
    description: "Convert architectural hand sketch to clean CAD 2D line drawing.",
    image: "/assets/sketch_to_cad.png",
    style: "Exploded axonometric view, technical illustration, isometric projection, wireframe aesthetic",
    prompt: "Clean CAD 2D line drawing, black lines on pure white background, architectural plan vector schematic, architectural line art drawing, professional technical illustration, minimal line weight, high contrast",
    negative: "people, colors, grayscale, shading, realistic textures, photograph, shadows, gradients, 3d render",
    lighting: "Ambient lighting, soft cinematic atmospheric lighting",
    material: "",
    backdrop: ""
  },

  // Aesthetics
  {
    id: "scandinavian_minimalism",
    category: "styles",
    name: "Scandi Minimal",
    description: "Warm woods, light tones, clean lines, and soft daylight.",
    image: "/assets/scandi.png",
    style: "High quality exterior architectural render, standard HD resolution, realistic lighting, architectural photography, detailed",
    prompt: "Scandinavian minimalist residence, light birch wood cladding, expansive glass panels, clean geometric lines, integration with surrounding pine forest, soft morning sunlight, serene atmosphere",
    negative: "people, cars, clutter, busy, neon, high contrast shadows",
    lighting: "Clear sky, bright daylight, sharp shadows",
    material: "Wood textures and finishes"
  },
  {
    id: "brutalist_concrete",
    category: "styles",
    name: "Brutalist Concrete",
    description: "Raw concrete, monumental geometric shapes, long shadows.",
    image: "/assets/brutalist.png",
    style: "High quality exterior architectural render, standard HD resolution, realistic lighting, architectural photography, detailed",
    prompt: "Brutalist residential villa, raw board-formed concrete walls, massive cantilevered volumes, deep shadow recesses, minimalist detailing, dramatic evening twilight, warm light casting from narrow window slits",
    negative: "people, cars, organic curves, colorful paint, ornate decorations",
    lighting: "Evening twilight, dusk lighting, warm artificial lights",
    material: "Exposed concrete, industrial concrete finish"
  },
  {
    id: "biophilic_glass",
    category: "styles",
    name: "Biophilic Glass",
    description: "Overgrown greenery, floor-to-ceiling glass, soft light.",
    image: "/assets/biophilic.png",
    style: "High quality exterior architectural render, standard HD resolution, realistic lighting, architectural photography, detailed",
    prompt: "Modern biophilic forest house, floor-to-ceiling glass facades, living green walls with draping ivy and ferns, exposed steel structure, natural stone accents, soft ambient overcast lighting, wet stone reflections",
    negative: "people, cars, dry desert, urban concrete skyscraper",
    lighting: "Overcast sky, cloudy day, soft diffused lighting, moody atmosphere, wet puddles with reflections, no harsh shadows",
    material: ""
  },
  {
    id: "cyberpunk_futuristic",
    category: "styles",
    name: "Futuristic Cyberpunk",
    description: "High-contrast neon lights, dark metal, rain reflections.",
    image: "/assets/cyberpunk.png",
    style: "Modern commercial interior render, office space, retail design, professional lighting, realistic, architectural visualization",
    prompt: "Futuristic cyberpunk apartment block, dark metal mesh framing, integrated glowing neon strips (cyan and magenta), reflective dark glass panels, wet pavement, dramatic night scene with high contrast artificial glow",
    negative: "daylight, trees, plants, rustic, traditional materials",
    lighting: "Night time, dark sky, dramatic artificial lighting, illuminated windows",
    material: ""
  },
  {
    id: "mid_century_luxury",
    category: "styles",
    name: "Mid-Century Modern",
    description: "Teak wood panels, retro furniture, warm studio vibes.",
    image: "/assets/midcentury.png",
    style: "High quality interior design render, soft natural lighting, elegant styling, realistic materials, standard HD, interior design photography",
    prompt: "Premium mid-century modern living room, warm teak wood paneling, classic Eames-style lounge chair, large sliding glass doors opening to patio, terrazzo floor, warm studio lighting, elegant styling",
    negative: "gothic, baroque, cyberpunk, futuristic tech, low quality",
    lighting: "Ambient lighting, soft cinematic atmospheric lighting",
    material: "Wood textures and finishes"
  }
];

let activePresetCategory = 'layouts';

function initPresetsGallery(category = activePresetCategory) {
  activePresetCategory = category;
  const container = document.getElementById('presets-cards-container');
  if (!container) return;
  container.innerHTML = '';
  
  // Toggle filter active states
  const layoutsPill = document.getElementById('pill-filter-layouts');
  const stylesPill = document.getElementById('pill-filter-styles');
  if (layoutsPill && stylesPill) {
    layoutsPill.classList.toggle('active', category === 'layouts');
    stylesPill.classList.toggle('active', category === 'styles');
  }

  const filtered = ARCHITECTURAL_PRESETS.filter(p => p.category === category);
  
  filtered.forEach(preset => {
    const card = document.createElement('div');
    card.className = 'preset-card';
    card.setAttribute('data-id', preset.id);
    card.style.backgroundImage = `url('${preset.image}')`;
    card.onclick = () => selectPreset(preset.id);
    
    const overlay = document.createElement('div');
    overlay.className = 'preset-card-overlay';
    card.appendChild(overlay);
    
    const title = document.createElement('div');
    title.className = 'preset-card-title';
    title.innerText = preset.name;
    title.setAttribute('data-i18n', `preset_${preset.id}_name`);
    card.appendChild(title);
    
    const desc = document.createElement('div');
    desc.className = 'preset-card-desc';
    desc.innerText = preset.description;
    desc.setAttribute('data-i18n', `preset_${preset.id}_desc`);
    card.appendChild(desc);
    
    container.appendChild(card);
  });

  if (window.switchLanguage) {
    window.switchLanguage(localStorage.getItem('sgai_lang') || 'en');
  }
}

window.filterPresets = function(category) {
  initPresetsGallery(category);
};

function selectPreset(presetId) {
  const activeCard = document.querySelector(`.preset-card[data-id="${presetId}"]`);
  const isAlreadyActive = activeCard && activeCard.classList.contains('active');

  if (isAlreadyActive) {
    // Deselect preset
    window.selectedPresetPrompt = "";
    window.selectedPresetNegative = "";
    
    document.querySelectorAll('.preset-card').forEach(card => card.classList.remove('active'));
    showToast(`Preset Cleared 💫`);
    return;
  }

  const preset = ARCHITECTURAL_PRESETS.find(p => p.id === presetId);
  if (!preset) return;
  
  // Set hidden preset prompts
  window.selectedPresetPrompt = preset.prompt || "";
  window.selectedPresetNegative = preset.negative || "";
  
  // Clear the prompt text areas visually so they are not visible on screen
  const promptEl = document.getElementById('prompt');
  if (promptEl) {
    promptEl.value = "";
    promptEl.dispatchEvent(new Event('input'));
  }
  
  const negPromptEl = document.getElementById('negative-prompt');
  if (negPromptEl) {
    negPromptEl.value = "";
  }
  
  // Update style dropdown select
  const styleSelect = document.getElementById('architectural_style_select');
  if (styleSelect) {
    styleSelect.value = preset.style;
    styleSelect.dispatchEvent(new Event('change'));
  }
  
  // Update lighting preset dropdown select
  const envSelect = document.getElementById('environment_preset_select');
  if (envSelect) {
    envSelect.value = preset.lighting;
    envSelect.dispatchEvent(new Event('change'));
  }
  
  // Update material preset dropdown select
  const matSelect = document.getElementById('material_preset_select');
  if (matSelect) {
    matSelect.value = preset.material;
    matSelect.dispatchEvent(new Event('change'));
  }

  // Update backdrop preset dropdown select
  const backdropSelect = document.getElementById('backdrop_preset_select');
  if (backdropSelect) {
    backdropSelect.value = preset.backdrop || "";
    backdropSelect.dispatchEvent(new Event('change'));
  }
  
  // Update UI active card states
  document.querySelectorAll('.preset-card').forEach(card => {
    if (card.getAttribute('data-id') === presetId) {
      card.classList.add('active');
    } else {
      card.classList.remove('active');
    }
  });
  
  showToast(`Preset: ${preset.name} Applied ⚡`);
}

function showToast(message, type = 'success') {
  const container = document.getElementById('toast-container') || (() => {
    const el = document.createElement('div');
    el.id = 'toast-container';
    el.style.position = 'fixed';
    el.style.bottom = '24px';
    el.style.right = '24px';
    el.style.zIndex = '9999';
    el.style.display = 'flex';
    el.style.flexDirection = 'column';
    el.style.gap = '8px';
    document.body.appendChild(el);
    return el;
  })();
  
  const toast = document.createElement('div');
  toast.style.background = 'rgba(20, 20, 20, 0.9)';
  toast.style.backdropFilter = 'blur(8px)';
  toast.style.borderLeft = type === 'success' ? '4px solid var(--accent-primary)' : '4px solid var(--accent-gold)';
  toast.style.borderTop = '1px solid rgba(255,255,255,0.05)';
  toast.style.borderBottom = '1px solid rgba(255,255,255,0.05)';
  toast.style.borderRight = '1px solid rgba(255,255,255,0.05)';
  toast.style.color = '#fff';
  toast.style.padding = '12px 18px';
  toast.style.borderRadius = '0 6px 6px 0';
  toast.style.fontFamily = 'var(--font-mono)';
  toast.style.fontSize = '10px';
  toast.style.fontWeight = '700';
  toast.style.textTransform = 'uppercase';
  toast.style.letterSpacing = '1px';
  toast.style.boxShadow = '0 10px 30px rgba(0,0,0,0.5)';
  toast.style.transform = 'translateX(120%)';
  toast.style.transition = 'all 0.3s cubic-bezier(0.16, 1, 0.3, 1)';
  toast.style.display = 'flex';
  toast.style.alignItems = 'center';
  toast.style.gap = '8px';
  
  const icon = document.createElement('span');
  icon.innerText = type === 'success' ? '⚡' : '✨';
  toast.appendChild(icon);
  
  const text = document.createElement('span');
  text.innerText = message;
  toast.appendChild(text);
  
  container.appendChild(toast);
  
  setTimeout(() => {
    toast.style.transform = 'translateX(0)';
  }, 10);
  
  setTimeout(() => {
    toast.style.transform = 'translateX(120%)';
    toast.style.opacity = '0';
    setTimeout(() => {
      toast.remove();
    }, 300);
  }, 3000);
}

