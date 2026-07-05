/* =====================================================
   SGAI RENDER ENGINE — history.js
   IndexedDB render history: save, load, delete, limit
   ===================================================== */

const DB_NAME     = 'SGAI_HistoryDB';
const STORE_NAME  = 'renders';
const HISTORY_LIMIT = 50;

function historyDbErrorMessage(error) {
  return error && error.message ? error.message : String(error || 'Unknown IndexedDB error');
}

function showHistoryDBError(cont, error) {
  if (!cont) return;
  cont.innerHTML = `<div style="color:var(--danger);font-family:var(--font-mono);font-size:10px;padding:16px;line-height:1.7;">
    initDB error: ${historyDbErrorMessage(error)}<br>
    <button onclick="loadHistoryUI()" style="margin-top:10px;background:transparent;border:1px solid var(--border-color);color:var(--accent-primary);border-radius:5px;padding:5px 10px;font-family:var(--font-mono);font-size:9px;cursor:pointer;">Retry</button>
  </div>`;
}

function createHistoryStore(db) {
  if (!db.objectStoreNames.contains(STORE_NAME)) {
    db.createObjectStore(STORE_NAME, { keyPath: 'id', autoIncrement: true });
  }
}

function initDB(callback, onError) {
  if (!window.indexedDB) {
    const error = new Error('IndexedDB is not available in this browser context.');
    if (onError) onError(error); return;
  }
  const request = indexedDB.open(DB_NAME);
  request.onupgradeneeded = (e) => createHistoryStore(e.target.result);
  request.onsuccess = (e) => {
    const db = e.target.result;
    if (db.objectStoreNames.contains(STORE_NAME)) { callback(db); return; }
    const nextVersion = (db.version || 1) + 1;
    db.close();
    const upgradeRequest = indexedDB.open(DB_NAME, nextVersion);
    upgradeRequest.onupgradeneeded = (ev) => createHistoryStore(ev.target.result);
    upgradeRequest.onsuccess = (ev) => {
      const upgradedDb = ev.target.result;
      if (upgradedDb.objectStoreNames.contains(STORE_NAME)) { callback(upgradedDb); }
      else { upgradedDb.close(); if (onError) onError(new Error('History object store could not be created.')); }
    };
    upgradeRequest.onerror = () => { if (onError) onError(upgradeRequest.error); };
    upgradeRequest.onblocked = () => { if (onError) onError(new Error('History database upgrade blocked. Close other SGAI tabs.')); };
  };
  request.onerror  = () => { if (onError) onError(request.error); };
  request.onblocked = () => { if (onError) onError(new Error('History database blocked. Close other SGAI tabs.')); };
}

function saveToHistory(orig, gen, prompt, aspectRatio, extra) {
  initDB((db) => {
    try {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      const item = {
        original:    orig,
        generated:   gen,
        prompt:      prompt,
        aspectRatio: aspectRatio,
        date:        new Date().toLocaleString(),
        timestamp:   Date.now(),
        type:        (extra && extra.type)        || 'image',
        videoUrl:    (extra && extra.videoUrl)    || null,
        thumbBase64: (extra && extra.thumbBase64) || null,
      };
      if (extra) {
        for (const k in extra) {
          if (!item.hasOwnProperty(k)) item[k] = extra[k];
        }
      }
      store.add(item);
      tx.oncomplete = () => { db.close(); enforceHistoryLimit(); };
      tx.onerror    = () => { console.error('[History] Save failed:', tx.error); db.close(); };
    } catch (error) { console.error('[History] Save failed:', error); db.close(); }
  }, (error) => console.error('[History] initDB failed:', error));
}

function enforceHistoryLimit() {
  initDB((db) => {
    try {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      let seen = 0;
      const req = store.openCursor(null, 'prev');
      req.onsuccess = (e) => {
        const cursor = e.target.result;
        if (!cursor) return;
        seen++;
        if (seen > HISTORY_LIMIT) cursor.delete();
        cursor.continue();
      };
      req.onerror = () => console.error('[History] Limit cursor failed:', req.error);
      tx.oncomplete = () => { db.close(); loadHistoryUI(); };
      tx.onerror    = () => { console.error('[History] Limit cleanup failed:', tx.error); db.close(); };
    } catch (error) { console.error('[History] Limit cleanup failed:', error); db.close(); }
  }, (error) => console.error('[History] initDB failed:', error));
}

function deleteHistoryItem(event, id) {
  event.stopPropagation();
  if (confirm("Do you want to delete this render?")) {
    initDB((db) => {
      try {
        const tx = db.transaction(STORE_NAME, 'readwrite');
        const store = tx.objectStore(STORE_NAME);
        store.delete(id);
        tx.oncomplete = () => { db.close(); loadHistoryUI(); };
        tx.onerror    = () => { alert('Could not delete: ' + historyDbErrorMessage(tx.error)); db.close(); };
      } catch (error) { db.close(); alert('Could not delete: ' + historyDbErrorMessage(error)); }
    }, (error) => alert('Could not open DB: ' + historyDbErrorMessage(error)));
  }
}

function escapeHistoryText(str) {
  return String(str || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

function historyImageSrc(b64) {
  if (!b64) return null;
  if (b64.startsWith('data:') || b64.startsWith('http://') || b64.startsWith('https://')) return b64;
  return 'data:image/png;base64,' + b64;
}

function loadHistoryUI() {
  const cont = document.getElementById('history-container');
  if (!cont) return;
  cont.innerHTML = '<div style="font-family:var(--font-mono);font-size:10px;color:var(--text-muted);text-align:center;padding:24px;">Loading history...</div>';
  try {
    initDB((db) => {
      try {
        const tx = db.transaction(STORE_NAME, 'readonly');
        const store = tx.objectStore(STORE_NAME);
        let h = [], total = 0;
        const request = store.openCursor(null, 'prev');
        request.onsuccess = (e) => {
          const cursor = e.target.result;
          if (cursor) {
            total++;
            if (h.length < HISTORY_LIMIT) h.push(cursor.value);
            cursor.continue(); return;
          }
          const badge = document.getElementById('history-count-badge');
          if (!h || h.length === 0) {
            if (badge) badge.textContent = '0 renders';
            cont.innerHTML = '<div style="font-family:var(--font-mono);font-size:10px;color:var(--text-muted);text-align:center;padding:24px;line-height:1.8;">No renders yet.<br>Generate an image first.</div>';
            return;
          }
          if (badge) badge.textContent = total + ' render' + (total !== 1 ? 's' : '');
          cont.innerHTML = '';
          h.forEach((item) => {
            const div = document.createElement('div');
            div.className = 'history-item'; div.style.display = 'block';
            const isVideoItem = item.type === 'video' || item.type === 'animate';
            const promptText = escapeHistoryText(item.prompt || '(No prompt)');
            const dateText   = escapeHistoryText(item.date || '');
            if (item.type === '3d') {
              div.onclick = () => {
                switchTab('3d');
                i3dShowModel({
                  id: item.taskId,
                  thumbnail_url: item.thumbnailUrl,
                  model_urls: item.modelUrls
                });
                document.getElementById('i3d-result-area').style.display = '';
                document.getElementById('i3d-model-card').style.display = '';
                document.getElementById('i3d-progress-card').style.display = 'none';
                document.getElementById('i3d-error-area').style.display = 'none';
              };
              const thumbSrc = item.thumbnailUrl || '';
              div.innerHTML = `
                <button class="prop-remove-btn" style="top:8px;right:8px;width:22px;height:22px;font-size:14px;" onclick="deleteHistoryItem(event,${item.id})">&times;</button>
                <div class="history-thumb" style="display:flex;align-items:center;justify-content:center;background:#0a0d14;position:relative;overflow:hidden;">
                  ${thumbSrc ? '<img src="' + thumbSrc + '" style="width:100%;height:100%;object-fit:cover;opacity:0.5;">' : ''}
                  <div style="position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:4px;">
                    <div style="font-size:22px;">🧊</div>
                    <div style="font-family:var(--font-mono);font-size:8px;letter-spacing:1.5px;color:rgba(230,51,41,0.9);text-transform:uppercase;">3D Model</div>
                  </div>
                </div>
                <div class="history-prompt">${promptText}</div>
                <div style="font-size:0.8em;color:rgba(230,51,41,0.9);">${dateText}</div>`;
            } else if (isVideoItem) {
              div.onclick = () => {
                switchTab('studio');
                const rc = document.getElementById('results-container');
                const borderColor = item.type === 'animate' ? 'rgba(16,185,129,0.3)' : 'var(--border-color)';
                const accentColor = item.type === 'animate' ? '#10b981' : 'var(--accent-primary)';
                const thumbSrc = historyImageSrc(item.thumbBase64 || item.original);
                
                rc.innerHTML = `
                  <div style="width:100%;max-width:860px;margin:0 auto;background:rgba(0,0,0,0.6);border:1px solid ${borderColor};border-radius:10px;overflow:hidden;">
                    <div style="font-family:var(--font-mono);font-size:9px;letter-spacing:1.5px;color:${accentColor};padding:10px 14px;border-bottom:1px solid ${borderColor};display:flex;align-items:center;justify-content:space-between;">
                      <span>${item.type === 'animate' ? '&#127916; ANIMATION' : '&#9654; VIDEO'}</span>
                      <span id="vid-status-hist" style="color:var(--text-muted);">Loading...</span>
                    </div>
                    <video id="sgai-hist-video" poster="${thumbSrc || ''}" controls autoplay loop muted playsinline preload="auto"
                      style="width:100%;display:block;max-height:480px;background:#000;outline:none;"></video>
                    <div style="display:flex;gap:10px;padding:12px 14px;border-top:1px solid ${borderColor};">
                      <button onclick="window.open('${item.videoUrl}', '_blank')"
                        style="flex:1;display:flex;align-items:center;justify-content:center;padding:9px;border-radius:6px;border:1px solid ${borderColor};background:transparent;color:${accentColor};font-family:var(--font-mono);font-size:10px;letter-spacing:1px;cursor:pointer;outline:none;">&#127760; OPEN IN BROWSER</button>
                      <button onclick="window.downloadVideoFile('${item.videoUrl}', 'SGAI_Video.mp4')"
                        style="flex:1;display:flex;align-items:center;justify-content:center;padding:9px;border-radius:6px;border:1px solid ${borderColor};background:transparent;color:${accentColor};font-family:var(--font-mono);font-size:10px;letter-spacing:1px;cursor:pointer;outline:none;">&#11015; DOWNLOAD</button>
                    </div>
                  </div>`;
                window.sgaiLoadVideo('sgai-hist-video', item.videoUrl, 'vid-status-hist');
              };
              const thumbSrc = historyImageSrc(item.thumbBase64 || item.original);
              div.innerHTML = `
                <button class="prop-remove-btn" style="top:8px;right:8px;width:22px;height:22px;font-size:14px;" onclick="deleteHistoryItem(event,${item.id})">&times;</button>
                <div class="history-thumb" style="display:flex;align-items:center;justify-content:center;background:#0a0d14;position:relative;overflow:hidden;">
                  ${thumbSrc ? '<img src="' + thumbSrc + '" style="width:100%;height:100%;object-fit:cover;opacity:0.5;">' : ''}
                  <div style="position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:4px;">
                    <div style="font-size:22px;">${item.type === 'animate' ? '&#127916;' : '&#127909;'}</div>
                    <div style="font-family:var(--font-mono);font-size:8px;letter-spacing:1.5px;color:var(--accent-primary);text-transform:uppercase;">${item.type === 'animate' ? 'ANIMATION' : 'VIDEO'}</div>
                  </div>
                </div>
                <div class="history-prompt">${promptText}</div>
                <div style="font-size:0.8em;color:var(--accent-primary);">${dateText}</div>`;
            } else {
              div.onclick = () => { capturedAspectRatio = item.aspectRatio || 16/9; displayResult(item.original, item.generated, capturedAspectRatio); switchTab('studio'); };
              const thumbHtml = item.generated
                ? `<img class="history-thumb" src="${historyImageSrc(item.generated)}" style="object-fit:contain;">`
                : `<div class="history-thumb" style="display:flex;align-items:center;justify-content:center;background:rgba(0,0,0,0.3);font-family:var(--font-mono);font-size:9px;color:var(--text-muted);">No Preview</div>`;
              div.innerHTML = `
                <button class="prop-remove-btn" style="top:8px;right:8px;width:22px;height:22px;font-size:14px;" onclick="deleteHistoryItem(event,${item.id})">&times;</button>
                ${thumbHtml}
                <div class="history-prompt">${promptText}</div>
                <div style="font-size:0.8em;color:var(--accent-primary);">${dateText}</div>`;
            }
            cont.appendChild(div);
          });
        };
        tx.oncomplete = () => db.close();
        tx.onerror    = () => { showHistoryDBError(cont, tx.error); db.close(); };
      } catch(dbErr) {
        db.close();
        cont.innerHTML = `<div style="color:var(--danger);font-family:var(--font-mono);font-size:10px;padding:16px;">Transaction error: ${dbErr.message}</div>`;
      }
    }, (error) => showHistoryDBError(cont, error));
  } catch(outerErr) {
    cont.innerHTML = `<div style="color:var(--danger);font-family:var(--font-mono);font-size:10px;padding:16px;">initDB error: ${outerErr.message}</div>`;
  }
}

function clearAllHistory() {
  if (!confirm('Clear all render history? This cannot be undone.')) return;
  initDB((db) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    tx.objectStore(STORE_NAME).clear();
    tx.oncomplete = () => { loadHistoryUI(); console.log('[History] All records cleared.'); };
  });
}

window._historyPickerCallback = null;

window.showHistoryPicker = function(onSelectCallback) {
  window._historyPickerCallback = onSelectCallback;
  const modal = document.getElementById('history-picker-modal');
  const grid = document.getElementById('history-picker-grid');
  if (!modal || !grid) return;
  
  modal.style.display = 'flex';
  grid.innerHTML = '<div style="font-size:9px;color:var(--text-muted);font-family:var(--font-mono);padding:8px;grid-column:1/-1;">Loading...</div>';
  
  initDB((db) => {
    const tx = db.transaction(STORE_NAME, 'readonly');
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
        div.style.backgroundImage = `url('${src}')`;
        div.style.width = '100%';
        div.style.height = '80px';
        div.style.backgroundSize = 'cover';
        div.style.backgroundPosition = 'center';
        div.style.borderRadius = '6px';
        div.style.border = '1px solid rgba(255,255,255,0.08)';
        div.style.cursor = 'pointer';
        div.style.transition = '0.2s';
        
        div.onclick = () => {
          if (window._historyPickerCallback) {
            window._historyPickerCallback(src);
          }
          window.hideHistoryPicker();
        };
        grid.appendChild(div);
      });
    };
  });
};

window.hideHistoryPicker = function() {
  const modal = document.getElementById('history-picker-modal');
  if (modal) modal.style.display = 'none';
  window._historyPickerCallback = null;
};
