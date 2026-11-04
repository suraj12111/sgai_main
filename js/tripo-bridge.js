'use strict';
window.sgaiOpenSaved3D=function(item){
 switchTab('3d');const frame=document.getElementById('tripo-frame');
 const open=()=>frame.contentWindow.postMessage({channel:'sgai-tripo',action:item.provider==='tripo'?'open-job':'legacy',id:item.taskId,url:item.glbUrl},location.origin);
 if(frame.contentDocument?.readyState==='complete'&&frame.contentDocument?.querySelector('#modelCanvas'))open();else frame.addEventListener('load',open,{once:true});
};
window.addEventListener('message',event=>{
 const frame=document.getElementById('tripo-frame');if(event.origin!==location.origin||event.source!==frame?.contentWindow||event.data?.channel!=='sgai-tripo')return;
 const session=sgaiCaptureSession();if(!session)return;
 if(event.data.action==='credits'){syncCredits();return;}

 if(['import','save'].includes(event.data.action)){
  let url;try{url=new URL(event.data.url);if(url.protocol!=='https:'||!url.hostname.endsWith('.supabase.co')||url.username||url.password)throw new Error();}catch(_){return;}
  const payload=event.data.payload||{};
  const respond=result=>{if(sgaiSessionCurrent(session))frame.contentWindow.postMessage({channel:'sgai-tripo',action:'import-result',payload:{id:payload.id,...result}},location.origin);};
  if(!/^[a-f0-9-]{36}$/i.test(payload.id||'')||!Number.isFinite(payload.height_mm)||payload.height_mm<0||payload.height_mm>1000000||!Number.isFinite(payload.rotation)||Math.abs(payload.rotation)>360)return;
  const callback='tripo_'+event.data.action;
  if(window.sketchup?.[callback]){sgaiAssertSession(session);window.sketchup[callback](JSON.stringify({id:payload.id,url:url.href,height_mm:payload.height_mm,rotation:payload.rotation}));}
  else if(event.data.action==='import'&&window.sketchup?.import_model&&payload.height_mm===0&&payload.rotation===0){window.sketchup.import_model(url.href);respond({ok:true,requested:true});}
  else respond({ok:false,message:window.sketchup?'Install SGAI 1.1.3 to use the supplied tool’s measured height, rotation and native GLB saving.':'Open this tool in SketchUp to import. Browser GLB saving remains available.'});
 }
});
window.receiveTripoImportResult=function(result){
 const frame=document.getElementById('tripo-frame');if(!sgaiCaptureSession()||!frame?.contentWindow||!result||typeof result.id!=='string')return;
 frame.contentWindow.postMessage({channel:'sgai-tripo',action:'import-result',payload:result},location.origin);
};
