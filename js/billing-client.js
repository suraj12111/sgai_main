'use strict';

// Persist the ID before sending. An uncertain response or a restarted browser
// must reuse that ID rather than silently starting another paid operation.
async function sgaiPaidFetch(url, options) {
    const session=sgaiCaptureSession();
    const email = localStorage.getItem('sgai_user_email');
    const token = localStorage.getItem('sgai_auth_token');
    if (!email || !token) throw new Error('Please sign in before generating.');
    sgaiAssertSession(session);
    if(options.headers?.Authorization!=='Bearer '+token)throw new Error('Your account changed. Please sign in again.');
    if (!globalThis.crypto?.subtle || !globalThis.crypto?.randomUUID) throw new Error('Secure browser storage and HTTPS are required for paid requests.');
    const bytes = new TextEncoder().encode(JSON.stringify([String(url), options.body]));
    const digest = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)), byte => byte.toString(16).padStart(2, '0')).join('');
    if (localStorage.getItem('sgai_auth_token') !== token) throw new Error('Your account changed. Please try again.');
    const key = 'sgai_paid_request:' + email + ':' + digest;
    let id = localStorage.getItem(key);
    if (!id) { id = crypto.randomUUID(); localStorage.setItem(key, id); }
    const response = await fetch(url, { ...options, headers: { ...options.headers, 'Idempotency-Key': id } });
    let result;
    try { result = await response.clone().json(); } catch (_) { /* Uncertain response: keep ID. */ }
    sgaiAssertSession(session);
    if(response.ok&&result?.success&&typeof window!=='undefined'&&typeof window.sgaiCloudReceived==='function')await window.sgaiCloudReceived(result);
    const safeToForget = response.ok && result?.success === true ||
        [400, 401, 403, 429].includes(response.status) && ['INVALID_REQUEST_ID', 'INVALID_GENERATION_INPUT',
            'REQUEST_REJECTED', 'INSUFFICIENT_FUNDS', 'AUTH_REQUIRED', 'TOKEN_INVALID', 'TOKEN_EXPIRED',
            'RATE_LIMITED', 'TOO_MANY_ACTIVE_REQUESTS'].includes(result?.error);
    if (safeToForget) {
        try { if (localStorage.getItem(key) === id) localStorage.removeItem(key); } catch (_) { /* Keep a stale ID rather than duplicate work. */ }
    }
    return sgaiGuardResponse(response,session);
}

function sgaiPaidError(result) {
    return (result.message || result.error || 'Generation failed.') + (result.requestId ? ' Reference: ' + result.requestId : '');
}
