'use strict';
(async () => {
  const id = location.hash.slice(1);
  history.replaceState(null, '', location.pathname);
  const status = document.getElementById('status');
  const approve = document.getElementById('approve');
  let credential;
  let code;
  async function request(path, body, token) {
    const response = await fetch("https://sketchupgurus-ai-server.onrender.com/api/" + path, {
      method: body ? 'POST' : 'GET',
      headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: 'Bearer ' + token } : {}) },
      ...(body ? { body: JSON.stringify(body) } : {}), signal: AbortSignal.timeout(20000)
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'Sign-in failed.');
    return data;
  }
  try {
    if (!/^[A-Za-z0-9_-]{43}$/.test(id)) throw new Error('Start sign-in from your SketchUp plugin.');
    const session = await request('desktop-auth/' + id);
    code = session.code;
    document.getElementById('code').textContent = code;
    const config = await request('config');
    if (!config.googleClientId) throw new Error('Google sign-in is not configured.');
    for (let tries = 0; !globalThis.google?.accounts?.id && tries < 100; tries++) {
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    if (!globalThis.google?.accounts?.id) throw new Error('Google sign-in could not load. Please retry.');
    google.accounts.id.initialize({ client_id: config.googleClientId, callback: async result => {
      try {
        credential = await request('google-auth', { idToken: result.credential });
        document.getElementById('account').textContent = 'Connect as ' + credential.email;
        approve.hidden = false;
        status.textContent = 'Approve only if you started this sign-in in SketchUp and the codes match.';
      } catch (error) { status.textContent = error.message; }
    } });
    google.accounts.id.renderButton(document.getElementById('google-button'), { theme: 'filled_black', size: 'large' });
    status.textContent = 'Choose your Google account.';
    approve.onclick = async () => {
      if (!credential) return;
      approve.disabled = true;
      try {
        await request('desktop-auth/' + id + '/complete', { code }, credential.token);
        credential = null;
        approve.hidden = true;
        status.textContent = 'Connected. Return to SketchUp. You can close this tab.';
      } catch (error) { status.textContent = error.message; approve.disabled = false; }
    };
  } catch (error) { status.textContent = error.message; }
})();
