'use strict';
let serverConfig = null;
let configError = '';
let activeJob = null;
let previewBlob = null;
let pollTimer = null;
const previewRepairs = new Set();
let exportState=null;
let exportAck=null;
let exportCompletionTimer=null;

function finishExport(message) {
  clearTimeout(exportCompletionTimer);
  if (exportAck) { clearTimeout(exportAck.timer); exportAck.reject(new Error(message)); exportAck=null; }
  exportState=null;
  document.getElementById('btn-export').disabled=busy || !currentSavedVideoPath;
  updateStatus(message);
}

async function transferExport(session) {
  if (!exportState || exportState.session) return;
  const state=exportState;
  state.session=session;
  try {
    updateStatus('Downloading original MP4 for export...');
    const response=await api('jobs/'+state.id+'/media?format=mp4');
    const blob=await response.blob();
    if (blob.size<12 || blob.size>96*1024*1024) throw new Error('Invalid MP4 size.');
    const header=new Uint8Array(await blob.slice(0,8).arrayBuffer());
    if (String.fromCharCode(...header.slice(4,8))!=='ftyp') throw new Error('The downloaded file is not an MP4.');
    let sequence=0;
    for (let offset=0;offset<blob.size;offset+=24576) {
      if (exportState!==state) throw new Error('Export stopped.');
      const bytes=new Uint8Array(await blob.slice(offset,offset+24576).arrayBuffer());
      await new Promise((resolve,reject)=>{
        const timer=setTimeout(()=>{exportAck=null;reject(new Error('SketchUp did not acknowledge the export. Please retry.'));},15000);
        exportAck={session,sequence,resolve,reject,timer};
        bridge('export-chunk',{session,sequence,data:btoa(String.fromCharCode(...bytes))});
      });
      sequence++;
      updateStatus('Saving MP4: '+Math.min(100,Math.round((offset+bytes.length)/blob.size*100))+'%');
    }
    exportCompletionTimer=setTimeout(()=>finishExport('Could not confirm the save. Check your chosen folder before retrying Export.'),15000);
    bridge('export-finish',{session,bytes:blob.size});
  } catch(error) {
    bridge('export-cancel',{session});
    finishExport('MP4 export failed: '+error.message);
  }
}
const jobStorageKey = () => 'sgai_omni_job:' + (localStorage.getItem('sgai_user_email') || 'signed-out');
const pendingStorageKey = () => jobStorageKey() + ':submission';
function bridge(action,payload={}) { parent.postMessage({channel:'sgai-omni',action,payload},location.origin); }
async function api(route,options={}) {
  const session=sgaiCaptureSession();sgaiAssertSession(session);
  const token=localStorage.getItem('sgai_auth_token');
  if (!token) throw new Error('Sign in to SGAI first.');
  const response=await fetch("https://sketchupgurus-ai-server.onrender.com/api/omni/"+route,{...options,headers:{'Content-Type':'application/json',
    Authorization:'Bearer '+token,...options.headers},signal:options.signal || AbortSignal.timeout(120000)});
  if (!response.ok) {
    const body=await response.json().catch(()=>({}));
    const error=new Error(body.error || 'Request failed. Please try again.');
    error.status=response.status;
    throw error;
  }
  return sgaiGuardResponse(response,session);
}
function updateCost() {
  const rawCost=serverConfig?.prices?.[document.getElementById('video-duration').value];
  const cost=Number.isFinite(Number(rawCost)) && Number(rawCost)>0 ? Number(rawCost) : null;
  document.getElementById('omni-cost').textContent=cost ? cost+' CR / VIDEO' : 'Pricing unavailable';
  const reason=busy ? 'Video generation is in progress.' : configError ||
    (!serverConfig ? 'Checking video availability...' : !serverConfig.enabled ?
      'Video generation is disabled on the server. Ask the administrator to enable Omni.' :
      !cost ? 'Pricing is unavailable for this duration.' : '');
  const button=document.getElementById('btn-generate');
  button.disabled=!!reason;
  button.title=reason || 'Generate video';
  const notice=document.getElementById('generation-availability');
  if (notice) { notice.textContent=reason; notice.hidden=!reason; }
}
refreshScenes = () => bridge('scenes');
takeScreenshot = () => bridge('viewport',{aspect_ratio:document.getElementById('aspect-ratio').value});

triggerRender = async function() {
  if (busy) return;
  if (!serverConfig?.enabled) { onApiError('Omni generation is not enabled on the server.'); return; }
  const frames=sourceFrames();
  if (!frames.length || frames.length>8) { onApiError('Select one to eight reference frames.'); return; }
  activeJob = {request_id:localStorage.getItem(pendingStorageKey()) || crypto.randomUUID(),base_prompt:document.getElementById('prompt-input').value.trim(),
    aspect_ratio:document.getElementById('aspect-ratio').value,resolution:document.getElementById('video-res').value,
    duration_seconds:Number(document.getElementById('video-duration').value)};
  setBusy(true); updateCost();
  document.getElementById('btn-export').disabled=true;
  document.getElementById('btn-open-video').disabled=true;
  updateStatus('Preparing reference frames...');
  if (currentMode==='scenes') {
    bridge('frames',{aspect_ratio:activeJob.aspect_ratio,scenes:frames.map(f=>({id:f.id,motion:f.motion,transition_time:f.transition_time}))});
  } else {
    await submitFrames(frames.map(f=>({image:f.data || String(f.thumb).split(',')[1],name:f.name || 'Viewport',
      motion:f.motion,transition_time:f.transition_time || 3})));
  }
};
async function submitFrames(frames) {
  if (!activeJob) return;
  try {
    localStorage.setItem(pendingStorageKey(),activeJob.request_id);
    localStorage.setItem(jobStorageKey(),activeJob.request_id);
    updateStatus('Reserving credits and submitting video...');
    const result=await (await api('jobs',{method:'POST',body:JSON.stringify({...activeJob,frames})})).json();
    localStorage.setItem(jobStorageKey(),result.id);
    bridge('credits');
    pollJob(result.id);
  } catch(error) {
    // Preserve request identity so a lost HTTP response cannot cause a duplicate charge.
    if ([400,401,402,429].includes(error.status)) {
      localStorage.removeItem(pendingStorageKey()); localStorage.removeItem(jobStorageKey());
      onApiError(error.message); updateCost(); return;
    }
    updateStatus('Checking submission status. Do not submit another video yet.');
    pollJob(activeJob.request_id,0,error.message);
  }
}
async function pollJob(id, failures=0, submissionError='') {
  clearTimeout(pollTimer);
  let foundJob=false;
  try {
    const result=await (await api('jobs/'+id)).json();
    foundJob=true;
    if (result.status==='completed') {
      localStorage.removeItem(pendingStorageKey());
      let previewWarning='';
      if (result.preview_format!=='webm' && !previewRepairs.has(id)) {
        previewRepairs.add(id);
        updateStatus('Preparing a compatible preview from your saved video. No new generation or credits.');
        try {
          const repair=await (await api('jobs/'+id+'/preview',{
            method:'POST',body:'{}',signal:AbortSignal.timeout(210000)
          })).json();
          result.preview_format=repair.preview_format;
        } catch (_) {
          previewWarning='Compatible preview unavailable. Original MP4 is ready to export.';
        }
      }
      const response=await api('jobs/'+id+'/media?format='+result.preview_format);
      if (previewBlob) URL.revokeObjectURL(previewBlob);
      previewBlob=URL.createObjectURL(await response.blob());
      onVideoReady(previewBlob,id,previewWarning);
      document.getElementById('btn-open-video').disabled=false;
      updateCost(); bridge('credits'); void refreshCloudVideos();
      return;
    }
    if (result.status==='failed' || result.status==='review') {
      localStorage.removeItem(pendingStorageKey());
      onApiError(result.error || 'Video job needs support attention.'); updateCost(); bridge('credits');
      return;
    }
    updateStatus(result.status==='queued'?'Video queued...':'Generating architectural video...');
    failures=0;
  } catch(error) {
    if (error.status===404 && !foundJob) {
      // A failed reservation can leave a local ID with no database job. Never create a new ID or auto-submit.
      localStorage.setItem(pendingStorageKey(),id);
      localStorage.removeItem(jobStorageKey());
      onApiError((submissionError ? submissionError+' ' : '')+
        'This submission has no saved job for this account. Click Generate Video to retry with the same submission ID.');
      updateCost(); bridge('credits');
      return;
    }
    failures++;
    if (failures>=8 || error.status===401) {
      onApiError('Could not confirm this job. Retry will reuse its submission ID. '+error.message); updateCost(); return;
    }
    updateStatus('Waiting for server: '+error.message);
  }
  pollTimer=setTimeout(()=>pollJob(id,failures,submissionError),4000);
}
async function exportBrowserVideo() {
  if (!currentSavedVideoPath) return;
  try {
    const response=await api('jobs/'+currentSavedVideoPath+'/media?format=mp4');
    const url=URL.createObjectURL(await response.blob());
    const link=document.createElement('a'); link.href=url; link.download='SGAI_Omni.mp4';
    document.body.appendChild(link); link.click(); link.remove();
    setTimeout(()=>URL.revokeObjectURL(url),60000);
    finishExport('MP4 download sent to your browser.');
  } catch(error) { finishExport('MP4 export failed: '+error.message); }
};
exportVideo = () => {
  if (!currentSavedVideoPath || exportState) return;
  exportState={id:currentSavedVideoPath};
  document.getElementById('btn-export').disabled=true;
  updateStatus('Choose where to save the original MP4...');
  bridge('export-start',{id:currentSavedVideoPath});
};
openVideo = () => { if (previewBlob) window.open(previewBlob,'_blank','noopener,noreferrer'); };
window.addEventListener('message',event=>{
  if (event.origin!==location.origin || event.source!==parent || event.data?.channel!=='sgai-omni') return;
  const {action,payload}=event.data;
  if (action==='scenes') loadScenes(payload);
  else if (action==='viewport') setScreenshotData(payload);
  else if (action==='frames' && busy) submitFrames(payload);
  else if (action==='export-browser') exportBrowserVideo();
  else if (action==='export-ready') transferExport(payload.session);
  else if (action==='export-ack' && exportAck && payload.session===exportAck.session && payload.sequence===exportAck.sequence) {
    const ack=exportAck; exportAck=null; clearTimeout(ack.timer); ack.resolve();
  }
  else if (action==='export-saved') finishExport('MP4 saved: '+payload.name);
  else if (action==='export-cancelled') finishExport('Export cancelled.');
  else if (action==='export-error') finishExport('MP4 export failed: '+payload);
  else if (action==='error') { onApiError(payload); updateCost(); }
});
window.addEventListener('DOMContentLoaded',async()=>{
  document.getElementById('video-duration').addEventListener('change',updateCost);
  document.getElementById('video-res').addEventListener('change',updateCost);
  setMode('images');
  updateCost();
  try {
    serverConfig=await (await api('config',{signal:AbortSignal.timeout(20000)})).json(); updateCost();
    if (!serverConfig.enabled) updateStatus('Omni is awaiting server configuration.');
    await refreshCloudVideos();
    const saved=localStorage.getItem(jobStorageKey());
    if (saved) { setBusy(true); updateCost(); pollJob(saved); }
  } catch(error) {
    configError=error.name==='TimeoutError' ? 'Video settings timed out. Reopen Omni Studio to retry.' :
      'Unable to load video settings: '+error.message;
    onApiError(configError); updateCost();
  }
});

async function refreshCloudVideos(){
 const select=document.getElementById('cloud-video-library');if(!select)return;
 try{const {jobs}=await(await api('jobs')).json();select.replaceChildren();const empty=document.createElement('option');empty.value='';empty.textContent='Your saved videos';select.append(empty);
 for(const job of jobs||[]){const option=document.createElement('option');option.value=job.id;option.textContent=new Date(job.created_at).toLocaleString()+' · '+job.id.slice(0,8);select.append(option);}
 }catch(_){select.options[0].textContent='Saved videos unavailable — reopen to retry';}
}
if(typeof document!=='undefined')document.getElementById('cloud-video-library')?.addEventListener('change',event=>{const id=event.target.value;if(!/^[a-f0-9-]{36}$/i.test(id)||busy)return;localStorage.setItem(jobStorageKey(),id);setBusy(true);void pollJob(id);});
