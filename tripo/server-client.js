'use strict';
// Hosted SGAI transport for the supplied SG 3D Engine RPC interface.
const tripoSession=sgaiCaptureSession();
const tripoPendingKey=tripoSession?'sgai_tripo_pending:'+tripoSession.email:null;
let tripoPreviewEpoch=0,tripoPreviewTag=null,tripoPreviewAbort=null;
let tripoProfiles={},tripoTransfer=null,tripoLegacy=null,tripoImportRequest=null;
const tripoUploadCache=new Map();
window.sgaiTripoCharge=n=>Number((BigInt(n)*211n*100000n+19048599n)/19048600n)/10;
function tripoPending(){try{return JSON.parse(localStorage.getItem(tripoPendingKey)||'null');}catch(_){return null;}}
function tripoCredits(){parent.postMessage({channel:'sgai-tripo',action:'credits'},location.origin);}
async function tripoAPI(path,options={}){
 sgaiAssertSession(tripoSession);const response=await fetch("https://sketchupgurus-ai-server.onrender.com/api/tripo"+path,{...options,headers:{Authorization:'Bearer '+tripoSession.token,...(options.body?{'Content-Type':'application/json'}:{}),...options.headers},signal:AbortSignal.timeout(120000)});
 const result=await response.json();sgaiAssertSession(tripoSession);if(!response.ok)throw Object.assign(new Error(result.error||'Tripo request unavailable'),{status:response.status,retryable:response.status>=500,definitive:result.definitive===true});return result;
}
const tripoPost=(path,body,headers)=>tripoAPI(path,{method:'POST',headers,body:JSON.stringify(body)});
function tripoGeneration(data,preliminary=false){
 const profile=tripoProfiles[data.model];if(!profile||!['single','multi'].includes(data.mode))throw new Error('Unsupported model or mode');
 const b={model:data.model,texture:data.texture,pbr:data.pbr,export_uv:data.export_uv};
 if(data.face_limit)b.face_limit=data.face_limit;
 if(profile.geometry_quality&&!data.smart_low_poly)b.geometry_quality=data.geometry_quality;
 if(data.smart_low_poly)b.smart_low_poly=true;
 if(profile.auto_size)b.auto_size=data.auto_size;
 if(data.mode==='single')b.enable_image_autofix=data.enable_image_autofix;
 if(data.texture){b.texture_alignment=data.texture_alignment;b.orientation=data.orientation;
  if(profile.texture_quality)b.texture_quality=data.texture_quality;
  if(profile.texture_quality&&data.texture_version!=='auto')b.texture_version=data.texture_version;
  if(data.texture_version==='v3.5-20260815')b.delight=data.delight;
  if(data.texture_seed!==null&&data.texture_seed!==undefined)b.texture_seed=data.texture_seed;
 }
 if(data.model_seed!==null&&data.model_seed!==undefined)b.model_seed=data.model_seed;
 if(profile.family==='P'&&['detailed','extreme'].includes(b.texture_quality))throw new Error('P-series HD/8K generation pricing is not verified');
 if(data.mode==='single'){if(!preliminary)b.input=data.input;}
 else if(!preliminary)b.inputs=data.inputs;
 return {path:'/generation/'+(data.mode==='single'?'image':'multiview')+'-to-model',body:b};
}
function tripoProcessing(data,preliminary=false){
 const b={},request={body:b};if(data.action!=='smart_image')request.source_job=data.source_task;
 if(data.action==='texture'){
  request.path='/models/texture';Object.assign(b,{model:data.model,pbr:data.pbr,bake:true,texture_alignment:'original_image'});
  if(data.model!=='v2.5-20250123')b.texture_quality=data.texture_quality;
  if(data.model==='v3.5-20260815')b.delight=data.delight;
  if(data.texture_seed!==null&&data.texture_seed!==undefined)b.texture_seed=data.texture_seed;
  if(data.reference_token&&!preliminary)b.texture_prompt={image:data.reference_token};else if(data.prompt)b.texture_prompt={text:data.prompt};
 }else if(data.action==='segment'){request.path='/mesh/segment';b.model='v1.0-20250506';}
 else if(data.action==='complete'){request.path='/mesh/complete';b.model='v1.0-20250506';b.completion_mode=data.completion_mode;if(data.part_names?.length)b.part_names=data.part_names;}
 else if(['smart_image','smart_model'].includes(data.action)){request.path='/mesh/smartsegment';b.seg_type=data.action==='smart_image'?'image':'model';b.granularity=data.granularity;if(data.hint)b.hint=data.hint;if(b.seg_type==='image'&&!preliminary)b.input=data.input;}
 else throw new Error('Unsupported refinement');return request;
}
async function tripoSubmit(request,settings){
 if(tripoPending())throw new Error('An earlier request is recorded. Resume checking it before starting another.');
 const price=await tripoPost('/quote',request);
 if(!window.confirm('Use '+price.cost.toFixed(1)+' SGAI credits for this '+(settings.operation?'refinement':'generation')+'?'))throw new Error('Submission cancelled. No generation credits were deducted.');
 const record={id:crypto.randomUUID(),request,settings,cost:price.cost};
 localStorage.setItem(tripoPendingKey,JSON.stringify(record));
 try{await tripoPost('/jobs',request,{'Idempotency-Key':record.id});}
 catch(error){if(error.definitive){localStorage.removeItem(tripoPendingKey);throw error;}/* The durable identifier is retained and checked below; never repeat a paid POST here. */}
 tripoCredits();return {task_id:record.id};
}
async function tripoTask(id){
 let job;
 try{job=await tripoAPI('/jobs/'+id);}catch(error){
  const prior=tripoPending();if(error.status===404&&prior?.id===id){
   // Explicit Resume checks recover the SAME recorded request, never a new identifier.
   await tripoPost('/jobs',prior.request,{'Idempotency-Key':id});job=await tripoAPI('/jobs/'+id);
  }else throw error;
 }
 const terminal=['review','refunded'].includes(job.billingStatus||job.status)||['failed','cancelled'].includes(job.status)||job.status==='success'&&job.archived;
 if(terminal&&tripoPending()?.id===id){localStorage.removeItem(tripoPendingKey);tripoCredits();}
 if(['review','refunded'].includes(job.billingStatus||job.status))return {task_id:id,status:'failed',error_message:(job.billingStatus||job.status)==='refunded'?'This request was refunded.':'Submission requires support review. Credits remain reserved; do not repeat it.'};
 if(job.status==='success'&&!job.archived)throw Object.assign(new Error('Model generated; private saving needs retry. '+(job.archiveIssue?.message||'Resume checking to retry storage without generating again.')+(job.archiveIssue?.code?' ['+job.archiveIssue.code+']':'')),{retryable:false});
 return {task_id:id,status:['reserved','submitted','completed'].includes(job.status)?(job.status==='completed'?'success':'queued'):job.status,progress:job.progress||0,output:job.status==='success'?{model_url:"https://sketchupgurus-ai-server.onrender.com/api/tripo/jobs/"+id+'/model'}:{},credits_consumed:job.cost,settings:job.settings};
}
async function tripoModel(id,signal){
 sgaiAssertSession(tripoSession);let url=tripoLegacy?.id===id?tripoLegacy.url:"https://sketchupgurus-ai-server.onrender.com/api/tripo/jobs/"+id+'/model';
 const response=await fetch(url,{headers:tripoLegacy?.id===id?{}:{Authorization:'Bearer '+tripoSession.token},signal:signal||AbortSignal.timeout(600000)});
 if(!response.ok)throw new Error('The private model could not be downloaded. Refresh its saved asset.');
 const bytes=new Uint8Array(await response.arrayBuffer());sgaiAssertSession(tripoSession);if(bytes.length<20||bytes.length>96*1024*1024)throw new Error('Invalid model download size');return bytes;
}
window.sgaiTripoRPC=async function(operation,data={}){
 sgaiAssertSession(tripoSession);
 if(operation==='hello'){
  const config=await tripoAPI('/config');tripoProfiles=config.profiles;let jobs=[],warning=null;try{jobs=(await tripoAPI('/jobs')).jobs;}catch(error){warning=error.message;}
  const pending=tripoPending();return {...config,email:tripoSession.email,import_supported:!!parent.sketchup?.import_model||!!parent.sketchup?.tripo_import,version:'1.1.3',jobs,pending,warning};
 }
 if(operation==='configure'){const c=await tripoAPI('/config');if(!c.configured)throw new Error('Configure TRIPO_API_KEY in the hosted server environment.');tripoCredits();return {message:'Signed in as '+tripoSession.email+'. SGAI credits are checked before each paid task.'};}
 if(operation==='validate'){tripoGeneration(data,true);return {valid:true};}
 if(operation==='validate_process'){if(tripoLegacy?.id===data.source_task)throw new Error('Select a completed Tripo model for refinement.');tripoProcessing(data,true);return {valid:true};}
 if(operation==='begin'){if(tripoPending())throw new Error('Resume the recorded submission before starting another.');return {ready:true};}
 if(operation==='upload'){
  if(typeof data.data_url!=='string'||data.data_url.length>28*1024*1024)throw new Error('Image exceeds 20 MB');
  const digest=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(data.data_url)))).map(n=>n.toString(16).padStart(2,'0')).join('');
  if(tripoUploadCache.has(digest))return {file_token:tripoUploadCache.get(digest)};
  const uploaded=await tripoPost('/uploads',{image:data.data_url});tripoUploadCache.set(digest,uploaded.id);return {file_token:uploaded.id};
 }
 if(operation==='generate')return tripoSubmit(tripoGeneration(data),{...data,input:undefined,inputs:undefined});
 if(operation==='process')return tripoSubmit(tripoProcessing(data),{operation:data.action,source_task:data.source_task||null,processing_model:data.model||null,texture:data.action==='texture',texture_quality:data.texture_quality,pbr:data.pbr});
 if(operation==='task')return tripoTask(data.task_id);
 if(operation==='preview'){
  tripoPreviewAbort?.abort();const controller=new AbortController();tripoPreviewAbort=controller;
  const epoch=++tripoPreviewEpoch;tripoPreviewTag=data.request_tag;const timer=setTimeout(()=>controller.abort(),600000);
  try{const bytes=await tripoModel(data.task_id,controller.signal);if(epoch!==tripoPreviewEpoch)return {cancelled:true};
   // Hosted RPC runs in this JavaScript context: no JSON/base64 transfer is needed.
   return {buffer:bytes.buffer,total:bytes.byteLength};
  }finally{clearTimeout(timer);if(tripoPreviewAbort===controller)tripoPreviewAbort=null;}
 }
 if(operation==='preview_chunk'){
  if(!tripoTransfer||data.token!==tripoTransfer.token||!Number.isInteger(data.offset)||data.offset<0||data.offset>=tripoTransfer.bytes.length)throw new Error('Preview transfer expired');
  const part=tripoTransfer.bytes.subarray(data.offset,data.offset+256*1024);let binary='';for(let i=0;i<part.length;i+=8192)binary+=String.fromCharCode(...part.subarray(i,i+8192));return {offset:data.offset,data:btoa(binary),done:data.offset+part.length===tripoTransfer.bytes.length};
 }
 if(operation==='preview_cancel'){if(tripoPreviewTag===data.request_tag){tripoPreviewEpoch++;tripoPreviewTag=null;tripoPreviewAbort?.abort();tripoPreviewAbort=null;}if(tripoTransfer?.tag===data.request_tag)tripoTransfer=null;return {cancelled:true};}
 if(operation==='link')return tripoLegacy?.id===data.task_id?tripoLegacy:tripoAPI('/jobs/'+data.task_id+'/import');
 if(operation==='save'&&!parent.sketchup?.tripo_save){const bytes=await tripoModel(data.task_id),url=URL.createObjectURL(new Blob([bytes],{type:'model/gltf-binary'})),link=document.createElement('a');link.href=url;link.download='sgai-tripo-model.glb';link.click();setTimeout(()=>URL.revokeObjectURL(url),30000);return {saved:true};}
 if(operation==='import'||operation==='save'){
  if(tripoImportRequest)throw new Error('An import is already in progress');
  const result=tripoLegacy?.id===data.task_id?tripoLegacy:await tripoAPI('/jobs/'+data.task_id+'/import');
  return new Promise((resolve,reject)=>{const id=crypto.randomUUID(),timer=setTimeout(()=>{if(tripoImportRequest?.id===id){const banner=document.getElementById('importStatusBanner');banner.textContent='SketchUp is still working. Check its status bar; do not start a second import.';}},240000);tripoImportRequest={id,resolve,reject,timer};parent.postMessage({channel:'sgai-tripo',action:operation,url:result.url,payload:{id,height_mm:data.height_mm,rotation:data.rotation}},location.origin);});
 }
 throw new Error('Unsupported SGAI Tripo operation');
};
window.addEventListener('message',event=>{
 if(event.origin!==location.origin||event.source!==parent||event.data?.channel!=='sgai-tripo'||!sgaiSessionCurrent(tripoSession))return;
 if(event.data.action==='import-result'&&event.data.payload?.id===tripoImportRequest?.id){
  if(event.data.payload.progress===true){const banner=document.getElementById('importStatusBanner');banner.textContent=event.data.payload.message||'Import in progress…';banner.style.display='block';return;}
  const request=tripoImportRequest;tripoImportRequest=null;clearTimeout(request.timer);if(event.data.payload.ok)request.resolve({requested:event.data.payload.requested===true,saved:event.data.payload.saved===true});else request.reject(new Error(event.data.payload.message||'Import failed'));}
 if(event.data.action==='error'){if(tripoImportRequest){clearTimeout(tripoImportRequest.timer);tripoImportRequest.reject(new Error(event.data.message));tripoImportRequest=null;}else window.showError?.(event.data.message);}
 if(event.data.action==='open-job'&&/^[a-f0-9-]{36}$/i.test(event.data.id||''))void window.sgaiTripoOpenJob?.(event.data.id);
 if(event.data.action==='legacy'&&typeof event.data.url==='string'){
  const url=new URL(event.data.url);if(url.protocol!=='https:'||!url.hostname.endsWith('.supabase.co'))return;
  const id=crypto.randomUUID();tripoLegacy={id,url:url.href};currentTaskId=id;jobSettings={};onTaskSucceeded({task_id:id,status:'success',output:{model_url:"https://sketchupgurus-ai-server.onrender.com/api/tripo/jobs/"+id+'/model'}});
 }
});
sgaiSessionResource(()=>{tripoPreviewAbort?.abort();tripoTransfer=null;tripoUploadCache.clear();document.body.hidden=true;});
