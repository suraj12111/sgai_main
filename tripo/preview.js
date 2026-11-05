'use strict';

window.createSGPreview = function(rpc, elements, stateChanged) {
  const LIMIT = 150 * 1024 * 1024;
  let epoch = 0, viewer = null, ready = false, activeTag = null, closed = false;
  const cancelDownload = tag => { if (tag !== null) rpc('preview_cancel', {request_tag:tag}).catch(() => {}); };
  const status = (state, text) => {
    elements.status.textContent = text;
    elements.status.hidden = state === 'ready' || state === 'empty';
    elements.retry.hidden = state !== 'error';
    stateChanged(state, text);
  };
  const clear = () => {
    epoch++; ready = false;
    cancelDownload(activeTag); activeTag = null;
    viewer?.clear();
    elements.canvas.hidden = true;
    status('empty', '');
  };
  return {
    clear,
    get ready() { return ready; },
    zoom(factor) { if (ready) viewer.zoom(factor); },
    fit() { if (ready) viewer.fit(); },
    async load(taskId) {
      if (closed) return;
      clear(); const tag = epoch; activeTag = tag;
      status('loading', 'Loading interactive 3D preview…');
      try {
        if (!window.SGModelViewer) throw new Error('The 3D viewer file is missing or failed to load. Verify public/tripo/model-viewer.js in the deployed website.');
        if (!viewer) viewer = window.SGModelViewer.create(elements.canvas, (percent, error) => {
          if (closed) return;
          if (error) { ready = false; elements.canvas.hidden = true; status('error', error); }
          else elements.zoom.textContent = percent + '%';
        });
        const prepared = await rpc('preview', {task_id:taskId, request_tag:tag}, 660000);
        if (tag !== epoch || closed || prepared.cancelled) return;
        let bytes;
        if (prepared.buffer instanceof ArrayBuffer) {
          if (prepared.buffer.byteLength !== prepared.total || prepared.total < 20 || prepared.total > LIMIT) throw new Error('Invalid model preview transfer.');
          bytes = new Uint8Array(prepared.buffer);
        } else {
        if (typeof prepared.token !== 'string' || !Number.isInteger(prepared.total) || prepared.total < 20 || prepared.total > LIMIT) throw new Error('Invalid model preview transfer.');
        bytes = new Uint8Array(prepared.total);
        let offset = 0;
        while (offset < bytes.length) {
          const chunk = await rpc('preview_chunk', {token:prepared.token, offset});
          if (tag !== epoch || closed) return;
          if (chunk.offset !== offset || typeof chunk.data !== 'string' || chunk.data.length > 350000) throw new Error('Invalid preview chunk.');
          const decoded = atob(chunk.data);
          if (!decoded.length || offset + decoded.length > bytes.length) throw new Error('Invalid preview transfer size.');
          for (let i=0; i<decoded.length; i++) bytes[offset+i] = decoded.charCodeAt(i);
          offset += decoded.length;
          if (chunk.done !== (offset === bytes.length)) throw new Error('Incomplete model preview transfer.');
          status('loading', 'Preparing 3D preview… ' + Math.round(100 * offset / bytes.length) + '%');
          await new Promise(resolve => setTimeout(resolve, 0));
        }
        }
        cancelDownload(tag); activeTag = null;
        elements.canvas.hidden = false;
        status('loading', 'Preparing model materials…');
        await new Promise(resolve => requestAnimationFrame(() => setTimeout(resolve, 0)));
        if (tag !== epoch || closed) return;
        const loaded = await viewer.load(bytes.buffer);
        if (tag !== epoch || closed || !loaded) return;
        ready = true;
        status('ready', 'Drag to rotate · scroll to zoom · right-drag to pan');
      } catch (error) {
        if (tag !== epoch || closed) return;
        ready = false; elements.canvas.hidden = true;
        status('error', '3D preview unavailable: ' + error.message + ' You can try Save GLB or Import separately.');
      } finally {
        cancelDownload(tag);
        if (activeTag === tag) activeTag = null;
      }
    },
    retry() { viewer?.dispose(); viewer = null; },
    dispose() { clear(); closed = true; viewer?.dispose(); viewer = null; }
  };
};
