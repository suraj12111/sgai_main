/* =====================================================
   SGAI RENDER ENGINE — history.js
   IndexedDB render history: save, load, delete, limit
   ===================================================== */

const LEGACY_DB_NAME = 'SGAI_HistoryDB'; // Quarantined: never opened or assigned by normal application code.
const DB_PREFIX = 'SGAI_HistoryDB_v2_';
const STORE_NAME  = 'renders';
const HISTORY_LIMIT = 50;

function historyDbErrorMessage(error) {
  return error && error.message ? error.message : String(error || 'Unknown IndexedDB error');
}

function showHistoryDBError(cont, error) {
  if (!cont) return;
  cont.innerHTML = `<div style="color:var(--danger);font-family:var(--font-mono);font-size:10px;padding:16px;line-height:1.7;">
    initDB error: ${escapeHistoryText(historyDbErrorMessage(error))}<br>
    <button data-sg-click="action137" style="margin-top:10px;background:transparent;border:1px solid var(--border-color);color:#ffffff;border-radius:5px;padding:5px 10px;font-family:var(--font-mono);font-size:9px;cursor:pointer;">Retry</button>
  </div>`;
}

function createHistoryStore(db) {
  if (!db.objectStoreNames.contains(STORE_NAME)) {
    db.createObjectStore(STORE_NAME, { keyPath: 'id', autoIncrement: true });
  }
}

function historyRequestGuard(request,session,transaction){
  for(const name of ['success','error'])request.addEventListener(name,event=>{
    if(!sgaiSessionCurrent(session)){
      event.stopImmediatePropagation();
      try{transaction.abort();}catch(_){}
    }
  },{capture:true});
  return request;
}
function historyDatabaseGuard(db,session){
  const close=db.close.bind(db),transaction=db.transaction.bind(db),transactions=new Set();
  let closed=false;
  const untrack=sgaiSessionResource(()=>{
    for(const tx of transactions){try{tx.abort();}catch(_){}}
    db.close();
  });
  db.close=()=>{if(!closed){closed=true;if(!transactions.size)untrack();close();}};
  db.transaction=(...args)=>{
    sgaiAssertSession(session);
    const tx=transaction(...args);transactions.add(tx);
    for(const name of ['complete','abort','error'])tx.addEventListener(name,event=>{
      transactions.delete(tx);
      if(closed&&!transactions.size)untrack();
      if(!sgaiSessionCurrent(session))event.stopImmediatePropagation();
    },{capture:true});
    const store=tx.objectStore.bind(tx);
    tx.objectStore=(...names)=>{
      const result=store(...names);
      return new Proxy(result,{get(target,key){
        const value=Reflect.get(target,key,target);
        if(typeof value!=='function')return value;
        return(...parameters)=>{
          sgaiAssertSession(session);
          const request=value.apply(target,parameters);
          return request&&typeof request.addEventListener==='function'?historyRequestGuard(request,session,tx):request;
        };
      }});
    };
    return tx;
  };
  db.onversionchange=()=>db.close();
  return db;
}
function initDB(callback,onError,session=sgaiCaptureSession()){
  const fail=error=>{if(onError&&sgaiSessionCurrent(session))onError(error);};
  if(!session)return;
  if(!window.indexedDB||!globalThis.crypto?.subtle){fail(new Error('Secure account history storage is unavailable.'));return;}
  const bytes=new TextEncoder().encode(session.email);
  crypto.subtle.digest('SHA-256',bytes).then(digest=>{
    if(!sgaiSessionCurrent(session))return;
    const name=DB_PREFIX+Array.from(new Uint8Array(digest),byte=>byte.toString(16).padStart(2,'0')).join('');
    const request=indexedDB.open(name,1);
    request.onupgradeneeded=event=>{
      if(!sgaiSessionCurrent(session)){event.target.transaction.abort();return;}
      createHistoryStore(event.target.result);
    };
    request.onsuccess=event=>{
      const db=event.target.result;
      if(!sgaiSessionCurrent(session)){db.close();return;}
      if(!db.objectStoreNames.contains(STORE_NAME)){db.close();fail(new Error('Account history store is unavailable.'));return;}
      try{callback(historyDatabaseGuard(db,session),session);}catch(error){db.close();fail(error);}
    };
    request.onerror=()=>fail(request.error);
    request.onblocked=()=>fail(new Error('Close other SGAI tabs to open this account history.'));
  }).catch(fail);
}

function getApiServerUrl() {
  if (typeof SERVER_URL !== 'undefined') return SERVER_URL;
  return 'https://sketchupgurus-ai-server.onrender.com/api';
}

const sgaiCloudOutputs=new Map();
async function sgaiCloudKey(value){const digest=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(value));return Array.from(new Uint8Array(digest),n=>n.toString(16).padStart(2,'0')).join('');}
window.sgaiCloudReceived=async function(result){
 if(!result.cloudStatus||!result.cloudRequestId)return;const session=sgaiCaptureSession();sgaiAssertSession(session);const values=[];
 for(const candidate of result.data?.candidates||[])for(const part of candidate.content?.parts||[])if(part.inlineData?.data)values.push(part.inlineData.data);
 if(result.upscaledUrl)values.push(result.upscaledUrl);if(result.imageBase64)values.push(result.imageBase64);
 for(const [index,value]of values.entries()){const key=await sgaiCloudKey(value);sgaiAssertSession(session);sgaiCloudOutputs.set(key,{email:session.email,item:result.cloudItems?.[index],requestId:result.cloudRequestId,index});}
 while(sgaiCloudOutputs.size>256)sgaiCloudOutputs.delete(sgaiCloudOutputs.keys().next().value);
 setTimeout(()=>{if(sgaiSessionCurrent(session))void syncCloudHistory();},1000);
};
if(typeof sgaiSessionResource==='function')sgaiSessionResource(()=>sgaiCloudOutputs.clear());
function sgaiCloudCompletion(result,label='Complete.'){
 return result.cloudStatus==='pending'?'Generated. Cloud saving is pending; recovery is automatic.':result.cloudStatus==='saved'?label+' Saved to your cloud account.':label;
}

function cloudHistoryItem(cItem,existing={}) {
  const type=cItem.item_type==='3d_model'?'3d':cItem.item_type==='video'||cItem.item_type==='animate'?'video':'image';
  const meta=cItem.metadata||{};
  return {...existing,_historyOwner:sgaiCaptureSession()?.email,cloudId:cItem.id,original:cItem.original_url||null,generated:cItem.asset_url||null,
    prompt:cItem.prompt||'',aspectRatio:cItem.aspect_ratio||1.777,date:new Date(cItem.created_at).toLocaleString(),
    timestamp:new Date(cItem.created_at).getTime(),type,videoUrl:type==='video'?cItem.asset_url:null,
    thumbBase64:cItem.thumb_url||null,thumbnailUrl:cItem.thumb_url||null,glbUrl:type==='3d'?cItem.asset_url:null,
    _cloudRequestId:meta.requestId||existing._cloudRequestId||null,_cloudOutputIndex:meta.outputIndex??existing._cloudOutputIndex??0,provider:meta.provider==='tripo'?'tripo':null,taskId:meta.taskId||null,modelUrls:meta.modelUrls||{},mediaExpiresAt:cItem.media_expires_at||0};
}

async function freshHistoryItem(item) {
  const session=sgaiCaptureSession();sgaiAssertSession(session);
  if(item._historyOwner&&item._historyOwner!==session.email)throw new Error('Saved media is unavailable for this account.');
  if(!item.cloudId){if(item._historyOwner!==session.email)throw new Error('Ownership of this old local record is unknown.');return item;}
  const token=localStorage.getItem('sgai_auth_token');
  if(!token)throw new Error('Please sign in to open saved media.');
  const response=await fetch(getApiServerUrl()+'/cloud/history/'+encodeURIComponent(item.cloudId)+'/links',
    {headers:{Authorization:'Bearer '+token},cache:'no-store'});
  const data=await response.json();
  if(!response.ok||!data.success||!sgaiSessionCurrent(session))throw new Error('Saved media is unavailable for this account.');
  return cloudHistoryItem(data.item,item);
}

async function historyImageData(value) {
  const session=sgaiCaptureSession();sgaiAssertSession(session);
  if(!value||!value.startsWith('https://'))return value;
  const response=await fetch(value,{credentials:'omit',signal:AbortSignal.timeout(20000)});
  if(!response.ok)throw new Error('Saved image unavailable. Refresh history to renew its link.');
  const blob=await response.blob();
  sgaiAssertSession(session);
  if(!['image/png','image/jpeg','image/webp'].includes(blob.type)||blob.size>12*1024*1024)throw new Error('Invalid saved image.');
  return new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>{try{sgaiAssertSession(session);resolve(reader.result);}catch(error){reject(error);}};reader.onerror=reject;reader.readAsDataURL(blob);});
}

function syncItemToCloud(item, localId,session=sgaiCaptureSession()) {
  if(!sgaiSessionCurrent(session)||item._historyOwner!==session.email||item._cloudRequestId)return;
  const token = localStorage.getItem('sgai_auth_token');
  if (!token) return;

  let itemType = 'render';
  if (item.type === '3d') itemType = '3d_model';
  else if (item.type === 'video' || item.type === 'animate') itemType = 'video';

  const origStr = typeof item.original === 'string' ? item.original : null;
  const genStr = typeof item.generated === 'string' ? item.generated : null;

  const payload = {
    item_type: itemType,
    prompt: item.prompt || '',
    aspect_ratio: item.aspectRatio || 1.777,
    original_base64: (origStr && origStr.startsWith('data:')) ? origStr : null,
    generated_base64: (genStr && !genStr.startsWith('http')) ? genStr : null,
    asset_url: (genStr && genStr.startsWith('http')) ? genStr : (item.videoUrl || item.glbUrl || null),
    thumb_url: item.thumbnailUrl || (item.thumbBase64 && item.thumbBase64.startsWith('http') ? item.thumbBase64 : null),
    metadata: {
      taskId: item.taskId,
      modelUrls: item.modelUrls,
      type: item.type,
      timestamp: item.timestamp
    }
  };

  fetch(getApiServerUrl() + '/cloud/save', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': 'Bearer ' + token
    },
    body: JSON.stringify(payload)
  })
  .then(r => r.json())
  .then(data => {
    if(!sgaiSessionCurrent(session))return;
    if (data && data.success && data.item && localId) {
      console.log('☁️ [Cloud History] Synced to cloud:', data.item.id);
      initDB(db => {
        try {
          const tx = db.transaction(STORE_NAME, 'readwrite');
          const store = tx.objectStore(STORE_NAME);
          const req = store.get(localId);
          req.onsuccess = () => {
            if (req.result) {
              const updated = req.result;
              store.put(cloudHistoryItem(data.item,updated));
            }
          };
        } catch (e) {}
      },undefined,session);
    }
  })
  .catch(err => console.warn('☁️ Cloud sync deferred/offline:', err.message));
}

let _isCloudSyncing = false;
async function syncCloudHistory() {
  const session=sgaiCaptureSession();if(!session)return;
  const token = localStorage.getItem('sgai_auth_token');
  if (!token || _isCloudSyncing) return;
  _isCloudSyncing = true;

  try {
    const res = await fetch(getApiServerUrl() + '/cloud/history?limit=100', {
      headers: { 'Authorization': 'Bearer ' + token }
    });
    if (!res.ok) return;
    const data = await res.json();
    if (!data.success || !Array.isArray(data.items) || !sgaiSessionCurrent(session)) return;

    initDB(db => {
      try {
        const tx = db.transaction(STORE_NAME, 'readwrite');
        const store = tx.objectStore(STORE_NAME);
        const reqAll = store.getAll();

        reqAll.onsuccess = () => {
          const localItems = reqAll.result || [];
          const byCloudId=new Map(localItems.filter(item=>item.cloudId).map(item=>[item.cloudId,item]));
          let addedCount=0;
          data.items.forEach(item=>{
            const existing=byCloudId.get(item.id)||(item.metadata?.requestId?localItems.find(local=>local._cloudRequestId===item.metadata.requestId&&local._cloudOutputIndex===(item.metadata.outputIndex||0)):undefined);
            if(existing)store.put(cloudHistoryItem(item,existing));
            else store.add(cloudHistoryItem(item));
            addedCount++;
          });

          tx.oncomplete = () => {
            db.close();
            if (addedCount > 0) {
              console.log(`☁️ Synced ${addedCount} items from cloud storage!`);
              renderHistoryRecords();
            }
          };
        };
      } catch (e) {
        db.close();
      }
    },undefined,session);
  } catch (err) {
    console.warn('☁️ Cloud history sync check error:', err.message);
  } finally {
    _isCloudSyncing = false;
  }
}

async function saveToHistory(orig, gen, prompt, aspectRatio, extra) {
  const session=sgaiCaptureSession();if(!session)return;
  let cloud=null;if(sgaiCloudOutputs.size&&(gen||extra?.videoUrl))try{cloud=sgaiCloudOutputs.get(await sgaiCloudKey(gen||extra.videoUrl));sgaiAssertSession(session);if(cloud?.email!==session.email)cloud=null;}catch(_){return;}
  initDB((db) => {
    try {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      let item = {
        _historyOwner:session.email,
        original:    orig,
        generated:   gen,
        prompt:      prompt,
        aspectRatio: aspectRatio,
        date:        new Date().toLocaleString(),
        timestamp:   Date.now(),
        type:        (extra && extra.type)        || 'image',
        videoUrl:    (extra && extra.videoUrl)    || null,
        thumbBase64: (extra && extra.thumbBase64) || null,
        glbUrl:      (extra && extra.glbUrl)      || null,
        thumbnailUrl:(extra && extra.thumbnailUrl)|| null,
        taskId:      (extra && extra.taskId)      || null,
        modelUrls:   (extra && extra.modelUrls)   || null,
      };
      if (extra) {
        for (const k in extra) {
          if (!item.hasOwnProperty(k)) item[k] = extra[k];
        }
      }
      if(cloud){item._cloudRequestId=cloud.requestId;item._cloudOutputIndex=cloud.index;if(cloud.item)item=cloudHistoryItem(cloud.item,item);}
      const addReq = store.add(item);
      addReq.onsuccess = (e) => {
        const localId = e.target.result;
        syncItemToCloud(item, localId,session);
      };
      tx.oncomplete = () => { db.close(); enforceHistoryLimit(session); };
      tx.onerror    = () => { console.error('[History] Save failed:', tx.error); db.close(); };
    } catch (error) { console.error('[History] Save failed:', error); db.close(); }
  }, (error) => console.error('[History] initDB failed:', error),session);
}

function enforceHistoryLimit(session=sgaiCaptureSession()) {
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
  }, (error) => console.error('[History] initDB failed:', error),session);
}

function deleteHistoryItem(event, id, cloudId, namespace) {
  const session=sgaiCaptureSession();if(!session)return;
  event.stopPropagation();
  if (confirm("Do you want to delete this render?") && sgaiSessionCurrent(session)) {
    initDB((db) => {
      if(db.name!==namespace){db.close();return;}
      if(cloudId)fetch(`${getApiServerUrl()}/cloud/history/${cloudId}`,{
        method:'DELETE',headers:{Authorization:'Bearer '+session.token}
      }).catch(err=>console.warn('Cloud delete error:',err));
      try {
        const tx = db.transaction(STORE_NAME, 'readwrite');
        const store = tx.objectStore(STORE_NAME);
        store.delete(id);
        tx.oncomplete = () => { db.close(); renderHistoryRecords(); };
        tx.onerror    = () => { alert('Could not delete: ' + historyDbErrorMessage(tx.error)); db.close(); };
      } catch (error) { db.close(); alert('Could not delete: ' + historyDbErrorMessage(error)); }
    }, (error) => alert('Could not open DB: ' + historyDbErrorMessage(error)),session);
  }
}

function escapeHistoryText(str) {
  return String(str || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');
}

function sgaiSafeAssetUrl(value) {
  if (typeof value !== 'string' || value.length > 8192) return '';
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && !url.username && !url.password ? url.href : '';
  } catch (_) { return ''; }
}

function historyImageSrc(b64) {
  if (typeof b64 !== 'string' || !b64) return null;
  if (b64.startsWith('https://')) return sgaiSafeAssetUrl(b64) || null;
  if (/^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/]*={0,2}$/.test(b64)) return b64;
  if (/^[A-Za-z0-9+/]*={0,2}$/.test(b64)) return 'data:image/png;base64,' + b64;
  return null;
}

function loadHistoryUI() {
  renderHistoryRecords();
  syncCloudHistory();
}

function renderHistoryRecords() {
  const cont = document.getElementById('history-container');
  if (!cont) return;
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
            cont.innerHTML = '<div style="font-family:var(--font-mono);font-size:10px;color:var(--text-muted);text-align:center;padding:24px;line-height:1.8;">No renders for this account yet.<br>Older shared-device records are kept separate for privacy.</div>';
            return;
          }
          if (badge) badge.textContent = total + ' render' + (total !== 1 ? 's' : '');
          cont.innerHTML = '';
          h.forEach((item) => {
            item = { ...item, id: Number.isSafeInteger(item.id) ? item.id : 0,
              cloudId: /^[a-f0-9-]{36}$/i.test(item.cloudId || '') ? item.cloudId : '',
              videoUrl: sgaiSafeAssetUrl(item.videoUrl), thumbnailUrl: sgaiSafeAssetUrl(item.thumbnailUrl) };
            const div = document.createElement('div');
            div.className = 'history-item'; div.style.display = 'block';
            const isVideoItem = item.type === 'video' || item.type === 'animate';
            const promptText = escapeHistoryText(item.prompt || '(No prompt)');
            const dateText   = escapeHistoryText(item.date || '');
            const cloudBadge = item.cloudId ? '<span title="Synced to Cloud" style="position:absolute;top:8px;left:8px;font-size:9px;background:rgba(0,0,0,0.6);border-radius:4px;padding:2px 5px;color:#10b981;font-family:var(--font-mono);z-index:5;">☁️</span>' : '';
            if (item.type === '3d') {
              div.onclick = async () => {
                try {item=await freshHistoryItem(item);}catch(error){alert(error.message);return;}
                sgaiOpenSaved3D(item);
              };
              const thumbSrc = escapeHistoryText(item.thumbnailUrl || '');
              div.innerHTML = `
                <button class="prop-remove-btn" style="top:8px;right:8px;width:22px;height:22px;font-size:14px;" data-sg-click="action138" data-sg-arg-0="${sgaiMarkupText(JSON.stringify(item.id))}" data-sg-arg-1="${sgaiMarkupText(JSON.stringify(item.cloudId || ''))}" data-sg-arg-2="${sgaiMarkupText(JSON.stringify(db.name))}">&times;</button>
                ${cloudBadge}
                <div class="history-thumb" style="display:flex;align-items:center;justify-content:center;background:#0a0d14;position:relative;overflow:hidden;">
                  ${thumbSrc ? '<img src="' + thumbSrc + '" style="width:100%;height:100%;object-fit:cover;opacity:0.5;">' : ''}
                  <div style="position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:4px;">
                    <div style="font-size:22px;">🧊</div>
                    <div style="font-family:var(--font-mono);font-size:8px;letter-spacing:1.5px;color:#ffffff;text-transform:uppercase;">3D Model</div>
                  </div>
                </div>
                <div class="history-prompt">${promptText}</div>
                <div style="font-size:0.8em;color:#ffffff;">${dateText}</div>`;
            } else if (isVideoItem) {
              div.onclick = async () => {
                try {item=await freshHistoryItem(item);}catch(error){alert(error.message);return;}
                switchTab('studio');
                const rc = document.getElementById('results-container');
                const borderColor = item.type === 'animate' ? 'rgba(16,185,129,0.3)' : 'var(--border-color)';
                const accentColor = item.type === 'animate' ? '#10b981' : 'var(--accent-primary)';
                const thumbSrc = escapeHistoryText(historyImageSrc(item.thumbBase64 || item.original));
                
                rc.innerHTML = `
                  <div style="width:100%;max-width:860px;margin:0 auto;background:rgba(0,0,0,0.6);border:1px solid ${borderColor};border-radius:10px;overflow:hidden;">
                    <div style="font-family:var(--font-mono);font-size:9px;letter-spacing:1.5px;color:#ffffff;padding:10px 14px;border-bottom:1px solid ${borderColor};display:flex;align-items:center;justify-content:space-between;">
                      <span>${item.type === 'animate' ? '&#127916; ANIMATION' : '&#9654; VIDEO'}</span>
                      <span id="vid-status-hist" style="color:var(--text-muted);">Loading...</span>
                    </div>
                    <video id="sgai-hist-video" poster="${thumbSrc || ''}" controls autoplay loop muted playsinline preload="auto"
                      style="width:100%;display:block;max-height:480px;background:#000;outline:none;"></video>
                    <div style="display:flex;gap:10px;padding:12px 14px;border-top:1px solid ${borderColor};">
                      <button data-video-action="open"
                        style="flex:1;display:flex;align-items:center;justify-content:center;padding:9px;border-radius:6px;border:1px solid ${borderColor};background:transparent;color:#ffffff;font-family:var(--font-mono);font-size:10px;letter-spacing:1px;cursor:pointer;outline:none;">&#127760; OPEN IN BROWSER</button>
                      <button data-video-action="download"
                        style="flex:1;display:flex;align-items:center;justify-content:center;padding:9px;border-radius:6px;border:1px solid ${borderColor};background:transparent;color:#ffffff;font-family:var(--font-mono);font-size:10px;letter-spacing:1px;cursor:pointer;outline:none;">&#11015; DOWNLOAD</button>
                    </div>
                  </div>`;
                rc.querySelector('[data-video-action="open"]').onclick = () => {
                  if (item.videoUrl) sgaiOpenMedia(item.videoUrl);
                };
                rc.querySelector('[data-video-action="download"]').onclick = () => {
                  if (item.videoUrl) window.downloadVideoFile(item.videoUrl, 'SGAI_Video.mp4');
                };
                window.sgaiLoadVideo('sgai-hist-video', item.videoUrl, 'vid-status-hist');
              };
              const thumbSrc = escapeHistoryText(historyImageSrc(item.thumbBase64 || item.original));
              div.innerHTML = `
                <button class="prop-remove-btn" style="top:8px;right:8px;width:22px;height:22px;font-size:14px;" data-sg-click="action139" data-sg-arg-0="${sgaiMarkupText(JSON.stringify(item.id))}" data-sg-arg-1="${sgaiMarkupText(JSON.stringify(item.cloudId || ''))}" data-sg-arg-2="${sgaiMarkupText(JSON.stringify(db.name))}">&times;</button>
                ${cloudBadge}
                <div class="history-thumb" style="display:flex;align-items:center;justify-content:center;background:#0a0d14;position:relative;overflow:hidden;">
                  ${thumbSrc ? '<img src="' + thumbSrc + '" style="width:100%;height:100%;object-fit:cover;opacity:0.5;">' : ''}
                  <div style="position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:4px;">
                    <div style="font-size:22px;">${item.type === 'animate' ? '&#127916;' : '&#127909;'}</div>
                    <div style="font-family:var(--font-mono);font-size:8px;letter-spacing:1.5px;color:#ffffff;text-transform:uppercase;">${item.type === 'animate' ? 'ANIMATION' : 'VIDEO'}</div>
                  </div>
                </div>
                <div class="history-prompt">${promptText}</div>
                <div style="font-size:0.8em;color:#ffffff;">${dateText}</div>`;
            } else {
              div.onclick = async () => {
                try {
                  item=await freshHistoryItem(item);
                  const [original,generated]=await Promise.all([historyImageData(item.original),historyImageData(item.generated)]);
                  capturedAspectRatio=item.aspectRatio||16/9;displayResult(original,generated,capturedAspectRatio);switchTab('studio');
                }catch(error){alert(error.message);}
              };
              const thumbHtml = item.generated
                ? `<img class="history-thumb" src="${escapeHistoryText(historyImageSrc(item.generated))}" style="object-fit:contain;">`
                : `<div class="history-thumb" style="display:flex;align-items:center;justify-content:center;background:rgba(0,0,0,0.3);font-family:var(--font-mono);font-size:9px;color:var(--text-muted);">No Preview</div>`;
              div.innerHTML = `
                <button class="prop-remove-btn" style="top:8px;right:8px;width:22px;height:22px;font-size:14px;" data-sg-click="action140" data-sg-arg-0="${sgaiMarkupText(JSON.stringify(item.id))}" data-sg-arg-1="${sgaiMarkupText(JSON.stringify(item.cloudId || ''))}" data-sg-arg-2="${sgaiMarkupText(JSON.stringify(db.name))}">&times;</button>
                ${cloudBadge}
                ${thumbHtml}
                <div class="history-prompt">${promptText}</div>
                <div style="font-size:0.8em;color:#ffffff;">${dateText}</div>`;
            }
            cont.appendChild(div);
          });
        };
        tx.oncomplete = () => db.close();
        tx.onerror    = () => { showHistoryDBError(cont, tx.error); db.close(); };
      } catch(dbErr) {
        db.close();
        cont.innerHTML = `<div style="color:var(--danger);font-family:var(--font-mono);font-size:10px;padding:16px;">Transaction error: ${escapeHistoryText(dbErr.message)}</div>`;
      }
    }, (error) => showHistoryDBError(cont, error));
  } catch(outerErr) {
    cont.innerHTML = `<div style="color:var(--danger);font-family:var(--font-mono);font-size:10px;padding:16px;">initDB error: ${escapeHistoryText(outerErr.message)}</div>`;
  }
}

function clearAllHistory() {
  const session=sgaiCaptureSession();if(!session)return;
  if (!confirm('Clear all render history? This will delete records on all devices.')) return;
  if(!sgaiSessionCurrent(session))return;
  const token = session.token;
  if (token) {
    fetch(`${getApiServerUrl()}/cloud/history-all`, {
      method: 'DELETE',
      headers: { 'Authorization': 'Bearer ' + token }
    }).catch(err => console.warn('Cloud clear error:', err));
  }
  initDB((db) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    tx.objectStore(STORE_NAME).clear();
    tx.oncomplete = () => { renderHistoryRecords(); console.log('[History] All records cleared.'); };
  },undefined,session);
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
        .filter(r => (!r.type || r.type==='image') && (r.generated || r.thumbBase64))
        .sort((a, b) => b.timestamp - a.timestamp);
      grid.innerHTML = '';
      if (records.length === 0) {
        grid.innerHTML = '<div style="font-size:9px;color:var(--text-muted);font-family:var(--font-mono);padding:8px;grid-column:1/-1;">No history yet.</div>';
        return;
      }
      records.forEach(item => {
        const src = historyImageSrc(item.generated || item.thumbBase64);
        const div = document.createElement('div');
        div.className = 'vid-hist-thumb';
        div.style.backgroundImage = 'url('+JSON.stringify(src || '')+')';
        div.style.width = '100%';
        div.style.height = '80px';
        div.style.backgroundSize = 'cover';
        div.style.backgroundPosition = 'center';
        div.style.borderRadius = '6px';
        div.style.border = '1px solid rgba(255,255,255,0.08)';
        div.style.cursor = 'pointer';
        div.style.transition = '0.2s';
        
        div.onclick = async () => {
          let selected;
          try {item=await freshHistoryItem(item);selected=await historyImageData(historyImageSrc(item.generated||item.thumbBase64));}
          catch(error){alert(error.message);return;}
          if (window._historyPickerCallback) {
            window._historyPickerCallback(selected);
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

// Only the account-partitioned database is used. Never open the legacy shared DB.
window.sgaiVideoDeviceHistory = async function(id) {
  const session=sgaiCaptureSession();sgaiAssertSession(session);
  const records=await new Promise((resolve,reject)=>initDB(db=>{
    try {
      const tx=db.transaction(STORE_NAME,'readonly');
      const req=tx.objectStore(STORE_NAME).getAll();
      req.onsuccess=()=>{try{sgaiAssertSession(session);resolve(req.result||[]);}catch(error){reject(error);}};
      req.onerror=()=>reject(req.error);
      tx.oncomplete=()=>db.close();tx.onabort=()=>{db.close();reject(new Error('History read stopped.'));};
    }catch(error){db.close();reject(error);}
  },reject,session));
  sgaiAssertSession(session);
  const images=records.filter(item=>item._historyOwner===session.email && (!item.type||item.type==='image') &&
    historyImageSrc(item.generated||item.thumbBase64)).sort((a,b)=>Number(b.timestamp)-Number(a.timestamp));
  if(id===undefined)return images.slice(0,100).map(item=>({id:'device-'+item.id,prompt:item.prompt||'Untitled render',
    created_at:new Date(Number(item.timestamp)||0).toISOString()}));
  const item=images.find(item=>'device-'+item.id===id);
  if(!item)throw new Error('Saved image not found for this account.');
  // Embedded account-owned data still works when its cloud copy is unavailable.
  let src=historyImageSrc(item.generated||item.thumbBase64);
  if(!src.startsWith('data:')){const fresh=await freshHistoryItem(item);src=historyImageSrc(fresh.generated||fresh.thumbBase64);}
  const image=await historyImageData(src);sgaiAssertSession(session);
  if(!image||image.length>16*1024*1024+128)throw new Error('Saved image exceeds 12 MB.');
  return image;
};
