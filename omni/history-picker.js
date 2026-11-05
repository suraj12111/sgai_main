'use strict';
const historySelection=new Map();
let historyPage=1;
let historyVersion=0;
let historyUrls=[];
let historyAdding=false;
let historySession=null;
const deviceHistoryRequests=new Map();
function deviceHistory(id){
  if(parent===window)return Promise.reject(new Error('Open Video inside SGAI to use device history.'));
  const session=sgaiCaptureSession();sgaiAssertSession(session);
  const requestId=crypto.randomUUID();
  return new Promise((resolve,reject)=>{
    const timer=setTimeout(()=>{deviceHistoryRequests.delete(requestId);reject(new Error('Device history timed out. Refresh to retry.'));},20000);
    deviceHistoryRequests.set(requestId,{resolve,reject,timer,session});
    bridge('device-history',{requestId,...(id===undefined?{}:{id})});
  });
}
window.addEventListener('message',event=>{
  if(event.origin!==location.origin||event.source!==parent||event.data?.channel!=='sgai-omni'||event.data.action!=='device-history-result')return;
  const pending=deviceHistoryRequests.get(event.data.payload?.requestId);if(!pending)return;
  clearTimeout(pending.timer);deviceHistoryRequests.delete(event.data.payload.requestId);
  if(!sgaiSessionCurrent(pending.session))pending.reject(new Error('Your account changed.'));
  else if(event.data.payload.error)pending.reject(new Error(event.data.payload.error));
  else pending.resolve(event.data.payload.data);
});
async function videoHistoryFile(blob,name){
  if(!['image/png','image/jpeg','image/webp'].includes(blob.type)||!blob.size||blob.size>12*1024*1024)throw new Error('Use a PNG, JPEG or WebP render up to 12 MB.');
  if(blob.size<=4*1024*1024)return new File([blob],name,{type:blob.type});
  const url=URL.createObjectURL(blob);
  try{
    const image=await new Promise((resolve,reject)=>{const image=new Image();image.onload=()=>resolve(image);image.onerror=()=>reject(new Error('Saved image could not be decoded.'));image.src=url;});
    if(image.naturalWidth>8192||image.naturalHeight>8192||image.naturalWidth*image.naturalHeight>24000000)throw new Error('Saved image exceeds the supported dimensions.');
    const scale=Math.min(1,2048/image.naturalWidth,2048/image.naturalHeight);
    const canvas=document.createElement('canvas');canvas.width=Math.max(1,Math.round(image.naturalWidth*scale));canvas.height=Math.max(1,Math.round(image.naturalHeight*scale));
    const context=canvas.getContext('2d');if(!context)throw new Error('Image conversion is unavailable.');
    context.fillStyle='#ffffff';context.fillRect(0,0,canvas.width,canvas.height);context.drawImage(image,0,0,canvas.width,canvas.height);
    for(const quality of [.9,.8,.65]){
      const converted=await new Promise(resolve=>canvas.toBlob(resolve,'image/jpeg',quality));
      if(converted?.size&&converted.size<=4*1024*1024)return new File([converted],name+'.jpg',{type:'image/jpeg'});
    }
    throw new Error('Saved image could not be reduced to 4 MB.');
  }finally{URL.revokeObjectURL(url);}
}
const historyDialog=()=>document.getElementById('history-picker');
function clearHistoryUrls(){historyUrls.forEach(url=>URL.revokeObjectURL(url));historyUrls=[];}
function updateHistorySelection(){
  document.getElementById('history-add').disabled=historyAdding || !historySelection.size;
  document.getElementById('history-source').disabled=historyAdding;
  document.getElementById('history-retry').disabled=historyAdding;
  document.querySelector('#history-add span').textContent=historySelection.size?'Add Selected ('+historySelection.size+')':'Add Selected';
}
async function openHistoryPicker(){
  if(busy) return;
  historySession=sgaiCaptureSession();sgaiAssertSession(historySession);
  historySelection.clear();updateHistorySelection();
  historyDialog().showModal();
  await loadHistoryPage(1);
}
async function loadHistoryPage(page,allowFallback=true){
  const version=++historyVersion;
  clearHistoryUrls();historyPage=page;
  const grid=document.getElementById('history-picker-grid');grid.replaceChildren();
  const status=document.getElementById('history-picker-status');status.textContent='Loading saved renders...';
  document.getElementById('history-prev').disabled=true;
  document.getElementById('history-next').disabled=true;
  const source=document.getElementById('history-source').value;
  let failed=0;
  try {
    sgaiAssertSession(historySession);
    let result;
    if(source==='device'){
      const items=await deviceHistory();result={items:items.slice((page-1)*12,page*12),total:items.length};
    }else result=await (await api('history?page='+page)).json();
    sgaiAssertSession(historySession);
    if(!result.items.length&&source==='cloud'&&allowFallback){
      const local=await deviceHistory().catch(()=>[]);sgaiAssertSession(historySession);
      if(version!==historyVersion||!historyDialog().open)return;
      if(local.length){document.getElementById('history-source').value='device';return loadHistoryPage(1,false);}
    }
    if(version!==historyVersion || !historyDialog().open) return;
    status.textContent=result.items.length?'':source==='device'?'No images saved for this account on this device. Older shared-device history stays separate.':'No cloud renders. Try This device for images saved in Projects.';
    document.getElementById('history-page').textContent=page+' / '+Math.max(1,Math.ceil(result.total/12));
    document.getElementById('history-prev').disabled=page<=1;
    document.getElementById('history-next').disabled=page*12>=result.total;
    const queue=[];
    result.items.forEach(item=>{
      const label=document.createElement('label');label.className='history-choice';
      const checkbox=document.createElement('input');checkbox.type='checkbox';checkbox.disabled=true;
      checkbox.setAttribute('aria-label','Select saved render');
      const image=document.createElement('img');image.alt='Saved architectural render';
      const title=document.createElement('span');title.textContent=item.prompt || 'Untitled render';
      const date=document.createElement('small');date.textContent=new Date(item.created_at).toLocaleDateString();
      label.append(checkbox,image,title,date);grid.append(label);
      queue.push(async()=>{
        try {
          let blob;
          if(source==='device'){
            const image=await deviceHistory(item.id);sgaiAssertSession(historySession);
            if(typeof image!=='string'||!/^data:image\/(png|jpeg|webp);base64,/.test(image))throw new Error('Saved image is invalid.');
            const comma=image.indexOf(','),mime=image.slice(5,image.indexOf(';')),raw=atob(image.slice(comma+1));
            blob=new Blob([Uint8Array.from(raw,ch=>ch.charCodeAt(0))],{type:mime});
          }else blob=await (await api('history/'+encodeURIComponent(item.id)+'/image')).blob();
          const file=await videoHistoryFile(blob,'Saved render '+new Date(item.created_at).toLocaleDateString());
          sgaiAssertSession(historySession);
          if(version!==historyVersion || !historyDialog().open) return;
          const url=URL.createObjectURL(file);historyUrls.push(url);image.src=url;
          checkbox.disabled=false;checkbox.checked=historySelection.has(item.id);
          checkbox.addEventListener('change',()=>{
            if(checkbox.checked){
              if(uploadedImages.length+historySelection.size>=8){checkbox.checked=false;status.textContent='Use up to eight images per clip.';return;}
              historySelection.set(item.id,file);
            } else historySelection.delete(item.id);
            status.textContent='';updateHistorySelection();
          });
        } catch (error) {if(version===historyVersion&&historyDialog().open){failed++;label.classList.add('unavailable');date.textContent=error.message||'Image unavailable';status.textContent=failed+' saved image(s) could not load. Try This device or Refresh.';}}
      });
    });
    // Bound thumbnail downloads so paging does not overwhelm the media service.
    await Promise.all(Array.from({length:Math.min(3,queue.length)},async()=>{
      while(queue.length && version===historyVersion && historyDialog().open) await queue.shift()();
    }));
  } catch(error){if(version===historyVersion&&historyDialog().open){
    if(source==='cloud'&&allowFallback){
      document.getElementById('history-source').value='device';return loadHistoryPage(1,false);
    }
    status.textContent=error.message;
  }}
}
async function addHistoryImages(){
  if(historyAdding || !historySelection.size || busy) return;
  historyAdding=true;updateHistorySelection();
  const status=document.getElementById('history-picker-status');
  try {
    sgaiAssertSession(historySession);
    const files=[...historySelection.values()];
    if(uploadedImages.length+files.length>8) throw new Error('Use up to eight images per clip.');
    const total=uploadedImages.reduce((sum,image)=>sum+image.size,0)+files.reduce((sum,file)=>sum+file.size,0);
    if(total>16*1024*1024) throw new Error('Selected images must total 16 MB or less.');
    status.textContent='Adding selected renders...';
    document.getElementById('history-close').disabled=true;
    const images=[];
    for(const file of files){images.push(await readImage(file));sgaiAssertSession(historySession);}
    uploadedImages.push(...images);setMode('images');renderImages();updateCost();
    updateStatus('Saved renders added');historyDialog().close();
  } catch(error){status.textContent=error.message;}
  finally {historyAdding=false;document.getElementById('history-close').disabled=false;updateHistorySelection();}
}
window.addEventListener('DOMContentLoaded',()=>{
  document.getElementById('history-source').addEventListener('change',()=>{historySelection.clear();updateHistorySelection();loadHistoryPage(1);});
  document.getElementById('history-retry').addEventListener('click',()=>loadHistoryPage(historyPage));
  document.getElementById('history-close').addEventListener('click',()=>historyDialog().close());
  document.getElementById('history-prev').addEventListener('click',()=>loadHistoryPage(historyPage-1));
  document.getElementById('history-next').addEventListener('click',()=>loadHistoryPage(historyPage+1));
  document.getElementById('history-add').addEventListener('click',addHistoryImages);
  historyDialog().addEventListener('cancel',event=>{if(historyAdding) event.preventDefault();});
  historyDialog().addEventListener('close',()=>{historyVersion++;clearHistoryUrls();historySelection.clear();for(const pending of deviceHistoryRequests.values()){clearTimeout(pending.timer);pending.reject(new Error('History picker closed.'));}deviceHistoryRequests.clear();updateHistorySelection();});
  refreshIcons();
});
