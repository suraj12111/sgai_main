/* Fixed UI actions. Data attributes carry JSON values, never executable source. */
'use strict';
function sgaiMarkupText(value) {
  return String(value == null ? '' : value).replace(/[&<>"']/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
}
function sgaiMediaURL(value) {
  if (typeof value !== 'string' || !value.trim()) return '';
  try {
    const url = new URL(String(value), location.href);
    if (url.protocol === 'https:' && !url.username && !url.password) return url.href;
    if (url.protocol === 'blob:' && url.origin === location.origin) return url.href;
    if (/^data:image\/(?:png|jpeg|webp);base64,[A-Za-z0-9+/=\s]+$/.test(String(value))) return String(value);
  } catch (_) {}
  return '';
}
function sgaiAspectRatio(value) {
  const text = String(value || '');
  if (/^\d+(?:\.\d+)?(?:\s*[/:]\s*\d+(?:\.\d+)?)?$/.test(text) && text.length < 32) return text.replace(/:/g,'/');
  return '16 / 9';
}
function sgaiOpenMedia(value) {
  const url = sgaiMediaURL(value);
  if (url && !url.startsWith('data:')) window.open(url,'_blank','noopener,noreferrer');
}
const sgaiUIActions = Object.freeze({
"drag-over": function(event) { i3dDragOver(event); },
"drag-leave": function(event) { i3dDragLeave(event); },
"drop": function(event) { i3dDrop(event); },
"action0": function(event, sgaiArg) { typeof initGoogleSignIn === 'function' && initGoogleSignIn()
},
"action1": function(event, sgaiArg) { captureViewport()
},
"action2": function(event, sgaiArg) { document.getElementById('base-upload').click()
},
"action3": function(event, sgaiArg) { document.getElementById('style-input').click()
},
"action4": function(event, sgaiArg) { clearStyle()
},
"action5": function(event, sgaiArg) { document.getElementById('prop-input').click()
},
"action6": function(event, sgaiArg) { loadHistoryUI()
},
"action7": function(event, sgaiArg) { clearAllHistory()
},
"action8": function(event, sgaiArg) { videoWorkflowAddNode('image')
},
"action9": function(event, sgaiArg) { videoWorkflowAddNode('video')
},
"action10": function(event, sgaiArg) { resetWorkflowCanvas()
},
"action11": function(event, sgaiArg) { i3dPingServer()
},
"action12": function(event, sgaiArg) { document.getElementById('auth-modal').style.display='flex'
},
"action13": function(event, sgaiArg) { switchTab('studio')
},
"action14": function(event, sgaiArg) { switchTab('history')
},
"action15": function(event, sgaiArg) { switchTab('support')
},
"action16": function(event, sgaiArg) { switchTab('3d')
},
"action17": function(event, sgaiArg) { switchTab('video')
},
"action18": function(event, sgaiArg) { switchTab('omni')
},
"action19": function(event, sgaiArg) { switchLanguage(this.value)
},
"action20": function(event, sgaiArg) { showProfileModal()
},
"action21": function(event, sgaiArg) { showPaywall()
},
"action22": function(event, sgaiArg) { logoutUser()
},
"action23": function(event, sgaiArg) { filterPresets('layouts')
},
"action24": function(event, sgaiArg) { filterPresets('styles')
},
"action25": function(event, sgaiArg) { vidSrcSwitch('capture')
},
"action26": function(event, sgaiArg) { vidSrcSwitch('upload')
},
"action27": function(event, sgaiArg) { vidSrcSwitch('history')
},
"action28": function(event, sgaiArg) { document.getElementById('vid-img-file').click()
},
"action29": function(event, sgaiArg) { vidHandleUpload(event)
},
"action30": function(event, sgaiArg) { vidClearUpload()
},
"action31": function(event, sgaiArg) { vidClearHistoryPick()
},
"action32": function(event, sgaiArg) { vidEndSrcSwitch('none')
},
"action33": function(event, sgaiArg) { vidEndSrcSwitch('upload')
},
"action34": function(event, sgaiArg) { vidEndSrcSwitch('history')
},
"action35": function(event, sgaiArg) { document.getElementById('vid-end-img-file').click()
},
"action36": function(event, sgaiArg) { vidHandleEndFrameUpload(event)
},
"action37": function(event, sgaiArg) { vidClearEndFrame()
},
"action38": function(event, sgaiArg) { vidClearEndHistoryPick()
},
"action39": function(event, sgaiArg) { vidSelectCam(this,'none')
},
"action40": function(event, sgaiArg) { vidSelectCam(this,'dolly_forward')
},
"action41": function(event, sgaiArg) { vidSelectCam(this,'dolly_backward')
},
"action42": function(event, sgaiArg) { vidSelectCam(this,'pan_left')
},
"action43": function(event, sgaiArg) { vidSelectCam(this,'pan_right')
},
"action44": function(event, sgaiArg) { vidSelectCam(this,'tilt_up')
},
"action45": function(event, sgaiArg) { vidSelectCam(this,'tilt_down')
},
"action46": function(event, sgaiArg) { vidSelectCam(this,'orbit_left')
},
"action47": function(event, sgaiArg) { vidSelectCam(this,'orbit_right')
},
"action48": function(event, sgaiArg) { vidSelectAR(this,'16:9')
},
"action49": function(event, sgaiArg) { vidSelectAR(this,'9:16')
},
"action50": function(event, sgaiArg) { vidSelectAR(this,'1:1')
},
"action51": function(event, sgaiArg) { vidSelectSpeed(this,'low')
},
"action52": function(event, sgaiArg) { vidSelectSpeed(this,'medium')
},
"action53": function(event, sgaiArg) { vidSelectSpeed(this,'high')
},
"action54": function(event, sgaiArg) { vidSelectDur(this,4)
},
"action55": function(event, sgaiArg) { vidSelectDur(this,6)
},
"action56": function(event, sgaiArg) { vidSelectDur(this,8)
},
"action57": function(event, sgaiArg) { vidSelectRes(this,'720p')
},
"action58": function(event, sgaiArg) { vidSelectRes(this,'1080p')
},
"action59": function(event, sgaiArg) { selectVideoPreset('drone')
},
"action60": function(event, sgaiArg) { selectVideoPreset('timelapse')
},
"action61": function(event, sgaiArg) { selectVideoPreset('walkthrough')
},
"action62": function(event, sgaiArg) { selectVideoPreset('dolly')
},
"action63": function(event, sgaiArg) { startVideoRender()
},
"action64": function(event, sgaiArg) { i3dSwitchMode('single')
},
"action65": function(event, sgaiArg) { i3dSwitchMode('multi')
},
"action66": function(event, sgaiArg) { document.getElementById('i3d-file-single').click()
},
"action67": function(event, sgaiArg) { i3dHandleFile(event,'single')
},
"action68": function(event, sgaiArg) { i3dClearSingle()
},
"action69": function(event, sgaiArg) { i3dRemoveBackground()
},
"action70": function(event, sgaiArg) { i3dHandleFile(event,'multi')
},
"action71": function(event, sgaiArg) { i3dToggleViewerRotation()
},
"action72": function(event, sgaiArg) { i3dCycleViewerLighting()
},
"action73": function(event, sgaiArg) { i3dResetViewerCamera()
},
"action74": function(event, sgaiArg) { i3dToggleViewerWireframe()
},
"action75": function(event, sgaiArg) { i3dImportSKP()
},
"action76": function(event, sgaiArg) { selectSegment('i3d-model', 'meshy-6', this)
},
"action77": function(event, sgaiArg) { selectSegment('i3d-model', 'meshy-5', this)
},
"action78": function(event, sgaiArg) { selectSegment('i3d-topology', 'quad', this)
},
"action79": function(event, sgaiArg) { selectSegment('i3d-topology', 'triangle', this)
},
"action80": function(event, sgaiArg) { selectSegment('i3d-polycount', '30000', this)
},
"action81": function(event, sgaiArg) { selectSegment('i3d-polycount', '50000', this)
},
"action82": function(event, sgaiArg) { selectSegment('i3d-polycount', '100000', this)
},
"action83": function(event, sgaiArg) { selectSegment('i3d-polycount', '200000', this)
},
"action84": function(event, sgaiArg) { selectSegment('i3d-pose', '', this)
},
"action85": function(event, sgaiArg) { selectSegment('i3d-pose', 'a-pose', this)
},
"action86": function(event, sgaiArg) { selectSegment('i3d-pose', 't-pose', this)
},
"action87": function(event, sgaiArg) { i3dToggle('texture')
},
"action88": function(event, sgaiArg) { i3dToggle('pbr')
},
"action89": function(event, sgaiArg) { i3dToggle('remesh')
},
"action90": function(event, sgaiArg) { i3dGenerate()
},
"action91": function(event, sgaiArg) { 
          const val = this.value;
          const label = document.getElementById('geometry-lock-val');
          if(val < 33) { label.innerText = 'STRICT'; label.style.color = 'var(--accent-gold)'; }
          else if(val < 66) { label.innerText = 'BALANCED'; label.style.color = 'var(--accent-primary)'; }
          else { label.innerText = 'CREATIVE'; label.style.color = 'var(--accent-green)'; }
        
},
"action92": function(event, sgaiArg) { selectQuality('hd')
},
"action93": function(event, sgaiArg) { selectQuality('4k')
},
"action94": function(event, sgaiArg) { startRender()
},
"action95": function(event, sgaiArg) { window.openBatchRenderModal()
},
"action96": function(event, sgaiArg) { hideProfileModal()
},
"action97": function(event, sgaiArg) { hideProfileModal(); showPaywall();
},
"action98": function(event, sgaiArg) { logoutUser(); hideProfileModal();
},
"action99": function(event, sgaiArg) { toggleAuthMode('login')
},
"action100": function(event, sgaiArg) { toggleAuthMode('signup')
},
"action101": function(event, sgaiArg) { submitAuth()
},
"action102": function(event, sgaiArg) { hidePaywall()
},
"action103": function(event, sgaiArg) { updatePaywallPrices()
},
"action104": function(event, sgaiArg) { payWithRazorpay('starter')
},
"action105": function(event, sgaiArg) { copyPaymentLink(event, 'starter')
},
"action106": function(event, sgaiArg) { payWithRazorpay('pro')
},
"action107": function(event, sgaiArg) { copyPaymentLink(event, 'pro')
},
"action108": function(event, sgaiArg) { payWithRazorpay('studio')
},
"action109": function(event, sgaiArg) { copyPaymentLink(event, 'studio')
},
"action110": function(event, sgaiArg) { hidePaywall()
},
"action111": function(event, sgaiArg) { clearMask()
},
"action112": function(event, sgaiArg) { submitEdit()
},
"action113": function(event, sgaiArg) { exitEditMode()
},
"action114": function(event, sgaiArg) { hideHistoryPicker()
},
"action115": function(event, sgaiArg) { window.hideBatchRenderModal()
},
"action116": function(event, sgaiArg) { window.switchBatchTab('scenes')
},
"action117": function(event, sgaiArg) { window.switchBatchTab('upload')
},
"action118": function(event, sgaiArg) { window.switchBatchTab('screenshot')
},
"action119": function(event, sgaiArg) { document.getElementById('batch-file-input').click()
},
"action120": function(event, sgaiArg) { window.handleBatchFileUpload(event)
},
"action121": function(event, sgaiArg) { window.grabBatchScreenshot()
},
"action122": function(event, sgaiArg) { window.addExistingScreenshotToBatch()
},
"action123": function(event, sgaiArg) { window.startBatchRender()
},
"action124": function(event, sgaiArg) { window.hideBatchRenderModal()
},
"action125": function(event, sgaiArg) { this.style.display='none'
},
"action126": function(event, sgaiArg) { document.getElementById('batch-lightbox-modal').style.display='none'
},
"action127": function(event, sgaiArg) { showProfileModal()
},
"action128": function(event, sgaiArg) { removeProp(sgaiArg(0))
},
"action129": function(event, sgaiArg) { window.sgaiVideoPlay('sgai-main-video','vid-play-btn-main')
},
"action130": function(event, sgaiArg) { sgaiOpenMedia(('' + sgaiArg(0) + ''))
},
"action131": function(event, sgaiArg) { window.downloadVideoFile(sgaiMediaURL(sgaiArg(0)))
},
"action132": function(event, sgaiArg) { window.showBatchLightbox(('data:image/jpeg;base64,' + sgaiArg(0) + ''))
},
"action133": function(event, sgaiArg) { window.removeBatchFile(('' + sgaiArg(0) + ''))
},
"action134": function(event, sgaiArg) { window.showBatchLightbox(('data:image/jpeg;base64,' + sgaiArg(0) + ''))
},
"action135": function(event, sgaiArg) { window.removeBatchScreenshot(('' + sgaiArg(0) + ''))
},
"action136": function(event, sgaiArg) { window.showBatchLightbox(('data:image/jpeg;base64,' + sgaiArg(0) + ''))
},
"action137": function(event, sgaiArg) { loadHistoryUI()
},
"action138": function(event, sgaiArg) { deleteHistoryItem(event,sgaiArg(0),('' + sgaiArg(1) + ''),('' + sgaiArg(2) + ''))
},
"action139": function(event, sgaiArg) { deleteHistoryItem(event,sgaiArg(0),('' + sgaiArg(1) + ''),('' + sgaiArg(2) + ''))
},
"action140": function(event, sgaiArg) { deleteHistoryItem(event,sgaiArg(0),('' + sgaiArg(1) + ''),('' + sgaiArg(2) + ''))
},
"action141": function(event, sgaiArg) { selectDraft(sgaiArg(0))
},
"action142": function(event, sgaiArg) { this.style.borderColor='var(--accent-primary)';this.style.color='var(--accent-primary)';
},
"action143": function(event, sgaiArg) { this.style.borderColor='var(--border-color)';this.style.color='white';
},
"action144": function(event, sgaiArg) { updateSlider(this)
},
"action145": function(event, sgaiArg) { enterEditMode()
},
"action146": function(event, sgaiArg) { vidRenderFromResult(('' + sgaiArg(0) + ''))
},
"action147": function(event, sgaiArg) { upscaleRender(('' + sgaiArg(0) + ''))
},
"action148": function(event, sgaiArg) { startAnimate(('' + sgaiArg(0) + ''))
},
"action149": function(event, sgaiArg) { document.getElementById('animate-panel').style.display='none'
},
"action150": function(event, sgaiArg) { sgaiVideoPlay('sgai-anim-video','vid-play-btn-anim')
},
"action151": function(event, sgaiArg) { startDragNode(event, ('' + sgaiArg(0) + ''))
},
"action152": function(event, sgaiArg) { updateNodeData(('' + sgaiArg(0) + ''), 'prompt', this.value)
},
"action153": function(event, sgaiArg) { updateNodeData(('' + sgaiArg(0) + ''), 'model', this.value)
},
"action154": function(event, sgaiArg) { updateNodeData(('' + sgaiArg(0) + ''), 'aspect', this.value)
},
"action155": function(event, sgaiArg) { triggerNodeUpload(('' + sgaiArg(0) + ''))
},
"action156": function(event, sgaiArg) { triggerNodeHistory(('' + sgaiArg(0) + ''))
},
"action157": function(event, sgaiArg) { handleNodeImageUpload(event, ('' + sgaiArg(0) + ''))
},
"action158": function(event, sgaiArg) { sgaiOpenMedia(('' + sgaiArg(0) + ''))
},
"action159": function(event, sgaiArg) { window.downloadVideoFile(sgaiMediaURL(sgaiArg(0)), 'SGAI_Video_Render.mp4')
},
"action160": function(event, sgaiArg) { updateNodeData(('' + sgaiArg(0) + ''), 'prompt', this.value)
},
"action161": function(event, sgaiArg) { updateNodeData(('' + sgaiArg(0) + ''), 'duration', this.value)
},
"action162": function(event, sgaiArg) { updateNodeData(('' + sgaiArg(0) + ''), 'resolution', this.value)
},
"action163": function(event, sgaiArg) { deleteNode(('' + sgaiArg(0) + ''))
},
"action164": function(event, sgaiArg) { runNode(('' + sgaiArg(0) + ''))
},
"action165": function(event, sgaiArg) { clickPort(event, ('' + sgaiArg(0) + ''), 'in')
},
"action166": function(event, sgaiArg) { clickPort(event, ('' + sgaiArg(0) + ''), 'out')
},
"action167": function(event, sgaiArg) { clickPort(event, ('' + sgaiArg(0) + ''), 'in-first')
},
"action168": function(event, sgaiArg) { clickPort(event, ('' + sgaiArg(0) + ''), 'in-last')
},
"action169": function(event, sgaiArg) { clickPort(event, ('' + sgaiArg(0) + ''), 'out')
},
"action170": function(event, sgaiArg) { clickPort(event, ('' + sgaiArg(0) + ''), 'in-video')
},
"action171": function(event, sgaiArg) { deleteLink(('' + sgaiArg(0) + ''))
},
"action172": function(event, sgaiArg) { refreshScenes()
},
"action173": function(event, sgaiArg) { setMode('scenes')
},
"action174": function(event, sgaiArg) { setMode('screenshot')
},
"action175": function(event, sgaiArg) { setMode('images')
},
"action176": function(event, sgaiArg) { takeScreenshot()
},
"action177": function(event, sgaiArg) { document.getElementById('image-files').click()
},
"action178": function(event, sgaiArg) { openHistoryPicker()
},
"action179": function(event, sgaiArg) { uploadImages(this.files)
},
"action180": function(event, sgaiArg) { applyBatchMotion('auto')
},
"action181": function(event, sgaiArg) { applyBatchMotion('orbit_clockwise')
},
"action182": function(event, sgaiArg) { applyBatchMotion('dolly_in')
},
"action183": function(event, sgaiArg) { applyBatchMotion('pan_left_to_right')
},
"action184": function(event, sgaiArg) { applyBatchMotion('crane_up')
},
"action185": function(event, sgaiArg) { applyBatchMotion('drone_flythrough')
},
"action186": function(event, sgaiArg) { setPresetGroup('Interior')
},
"action187": function(event, sgaiArg) { setPresetGroup('Exterior')
},
"action188": function(event, sgaiArg) { togglePreviewFocus()
},
"action189": function(event, sgaiArg) { onPlaybackError()
},
"action190": function(event, sgaiArg) { applyArchitecturePreset(this.value)
},
"action191": function(event, sgaiArg) { clearPrompt()
},
"action192": function(event, sgaiArg) { markCustomPrompt()
},
"action193": function(event, sgaiArg) { invalidateScreenshot(); updatePreviewSettings();
},
"action194": function(event, sgaiArg) { updatePreviewSettings()
},
"action195": function(event, sgaiArg) { updatePreviewSettings(); renderStoryboard();
},
"action196": function(event, sgaiArg) { triggerRender()
},
"action197": function(event, sgaiArg) { exportVideo()
},
"action198": function(event, sgaiArg) { openVideo()
},
"action199": function(event, sgaiArg) { applyArchitecturePreset(('' + sgaiArg(0) + ''))
},
"action200": function(event, sgaiArg) { showReference(sgaiArg(0))
},
"action201": function(event, sgaiArg) { updateSceneMotion(sgaiArg(0), this.value)
},
"action202": function(event, sgaiArg) { updateDuration(sgaiArg(0), this.value)
},
"action203": function(event, sgaiArg) { toggleScene(sgaiArg(0))
},
"action204": function(event, sgaiArg) { updateImageMotion(sgaiArg(0), this.value)
},
"action205": function(event, sgaiArg) { updateImageWeight(sgaiArg(0), this.value)
},
"action206": function(event, sgaiArg) { moveImage(sgaiArg(0), -1)
},
"action207": function(event, sgaiArg) { moveImage(sgaiArg(0), 1)
},
"action208": function(event, sgaiArg) { removeImage(sgaiArg(0))
}
});
function sgaiDispatchUI(event) {
  for (const element of event.composedPath()) {
    if (!element || typeof element.getAttribute !== 'function') continue;
    const key = element.getAttribute('data-sg-' + event.type);
    if (!key || !Object.hasOwn(sgaiUIActions,key) || typeof element['on'+event.type] === 'function') continue;
    const arg = index => JSON.parse(element.getAttribute('data-sg-arg-' + index));
    const result = sgaiUIActions[key].call(element,event,arg);
    if (result === false) event.preventDefault();
    if (event.cancelBubble) break;
  }
}
document.addEventListener("change",sgaiDispatchUI,true);
document.addEventListener("click",sgaiDispatchUI,true);
document.addEventListener("error",sgaiDispatchUI,true);
document.addEventListener("input",sgaiDispatchUI,true);
document.addEventListener("load",sgaiDispatchUI,true);
document.addEventListener("mousedown",sgaiDispatchUI,true);
document.addEventListener("mouseout",sgaiDispatchUI,true);
document.addEventListener("mouseover",sgaiDispatchUI,true);
document.addEventListener("dragover",sgaiDispatchUI,true);
document.addEventListener("dragleave",sgaiDispatchUI,true);
document.addEventListener("drop",sgaiDispatchUI,true);
