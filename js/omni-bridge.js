'use strict';
window.receiveOmniEvent = function(event) {
  const frame = document.getElementById('omni-frame');
  if (frame && frame.contentWindow) frame.contentWindow.postMessage({ channel: 'sgai-omni', ...event }, location.origin);
};
window.addEventListener('message', event => {
  const frame = document.getElementById('omni-frame');
  if (event.origin !== location.origin || !frame || event.source !== frame.contentWindow || event.data?.channel !== 'sgai-omni') return;
  const { action, payload } = event.data;
  if (action === 'device-history') {
    const session=sgaiCaptureSession();
    if(!session || !payload || typeof payload.requestId!=='string' || payload.requestId.length>80 ||
       (payload.id!==undefined && (typeof payload.id!=='string'||!/^device-\d+$/.test(payload.id))))return;
    Promise.resolve().then(()=>window.sgaiVideoDeviceHistory(payload.id)).then(data=>{
      if(sgaiSessionCurrent(session))receiveOmniEvent({action:'device-history-result',payload:{requestId:payload.requestId,data}});
    }).catch(()=>{
      if(sgaiSessionCurrent(session))receiveOmniEvent({action:'device-history-result',payload:{requestId:payload.requestId,error:'Device history could not be loaded. Reopen Projects and try again.'}});
    });
    return;
  }
  if (action === 'credits') { syncCredits(); return; }
  const callbacks = { scenes: 'omni_scenes', viewport: 'omni_viewport', frames: 'omni_frames', export: 'omni_export',
    'export-start':'omni_export_start', 'export-chunk':'omni_export_chunk',
    'export-finish':'omni_export_finish', 'export-cancel':'omni_export_cancel' };
  if (!callbacks[action]) return;
  if (!window.sketchup) {
    if (action === 'export' || action === 'export-start') { receiveOmniEvent({action:'export-browser'}); return; }
    receiveOmniEvent({ action: 'error', payload: 'Open SGAI in SketchUp to capture scenes or the viewport. Image uploads work in the browser.' });
    return;
  }
  const text = JSON.stringify(payload || {});
  if (text.length > (action==='export-chunk'?64000:16000)) return;
  try { sketchup[callbacks[action]](text); }
  catch (_) {
    receiveOmniEvent({action:action.startsWith('export')?'export-error':'error',
      payload:'This action requires the latest SGAI extension. Install the updated RBZ and restart SketchUp.'});
  }
});
window.addEventListener('DOMContentLoaded', () => window.lucide?.createIcons());
