
'use strict';
(()=>{
 const latest='1.1.7';let reported=null,dismissed=false,started=false;
 const testHost=location.hostname==='sgai-omni-test.onrender.com';
 const filename='sketchupgurus_ai_omni_'+(testHost?'TEST_':'')+latest+'.rbz';
 const path="https://sketchupgurus-ai-server.onrender.com/downloads/"+filename;
 function older(version){
  if(typeof version!=='string'||version.length>32||!/^\d+\.\d+\.\d+$/.test(version))return true;
  const a=version.split('.').map(Number),b=latest.split('.').map(Number);
  for(let i=0;i<3;i++){if(a[i]!==b[i])return a[i]<b[i];}return false;
 }
 function paint(){
  const banner=document.getElementById('plugin-update-banner');
  if(banner)banner.hidden=dismissed||!window.sketchup||!older(reported);
 }
 window.sgaiReceivePluginVersion=version=>{reported=version;if(started)paint();};
 function requestVersion(){try{if(typeof window.sketchup?.sgai_plugin_version==='function')window.sketchup.sgai_plugin_version();}catch(_){/* Older bridges may not have this callback. */}}
 function start(){
  started=true;const banner=document.getElementById('plugin-update-banner');if(!banner)return;
  const download=document.getElementById('plugin-update-download');download.href=path;download.download=filename;
  document.getElementById('plugin-update-version').textContent=latest;
  document.getElementById('plugin-update-dismiss').addEventListener('click',()=>{dismissed=true;paint();});
  document.getElementById('plugin-update-copy').addEventListener('click',async()=>{
   const url=new URL(path,location.origin).href,help=document.getElementById('plugin-update-help');
   try{await navigator.clipboard.writeText(url);help.textContent='Link copied. Open it in your browser to download, then install through SketchUp Extension Manager and restart SketchUp.';}
   catch(_){const input=document.getElementById('plugin-update-link');input.value=url;input.hidden=false;input.focus();input.select();help.textContent='Copy this link into your browser to download the update.';}
  });
  requestVersion();setTimeout(requestVersion,500);setTimeout(paint,1700);
 }
 if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start,{once:true});else start();
})();
