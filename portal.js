'use strict';

const Portal = (() => {
  const enabled = document.documentElement.dataset.hosted === 'true';
  const scope = 'https://www.googleapis.com/auth/spreadsheets.readonly';
  let token = null;
  let expires = 0;
  let generation = 0;
  let expiryTimer;
  let client;
  let connecting = false;
  const field = id => document.getElementById(id);
  function settings() {
    const clientId = field('google-client').value.trim();
    const spreadsheet = field('google-sheet').value.trim();
    if (!/^\d+-[a-z0-9]+\.apps\.googleusercontent\.com$/.test(clientId) || !/^[a-zA-Z0-9_-]{20,160}$/.test(spreadsheet)) throw new Error('Invalid connection settings');
    return {clientId, spreadsheet};
  }
  function error() {
    field('portal-error').hidden = false;
    field('portal-error').textContent = I18n.translate('No se pudo conectar. Revisa la cuenta de Google y el acceso al archivo.');
    connecting = false;
    field('google-connect').disabled = false;
  }
  function clear() {
    token = null; expires = 0; generation += 1;
    clearTimeout(expiryTimer);
    document.dispatchEvent(new Event('portal-disconnected'));
    field('portal-login').hidden = false;
    field('portal-session').hidden = true;
  }
  function connect(event) {
    event.preventDefault();
    if (connecting) return;
    try {
      const config = settings();
      if (!globalThis.google?.accounts?.oauth2) throw new Error('Google unavailable');
      connecting = true;
      field('google-connect').disabled = true;
      field('portal-error').hidden = true;
      client = google.accounts.oauth2.initTokenClient({client_id: config.clientId, scope,
        include_granted_scopes: false,
        error_callback: error,
        callback: response => {
          connecting = false; field('google-connect').disabled = false;
          if (response.error || !response.access_token || !google.accounts.oauth2.hasGrantedAllScopes(response, scope) || !Number.isFinite(Number(response.expires_in)) || Number(response.expires_in) < 60) { clear(); error(); return; }
          token = response.access_token;
          expires = Date.now() + (Math.min(Number(response.expires_in), 3600) - 30) * 1000;
          generation += 1;
          clearTimeout(expiryTimer);
          expiryTimer = setTimeout(clear, expires - Date.now());
          try { localStorage.setItem('dex.portal-settings', JSON.stringify(config)); } catch {}
          field('portal-login').hidden = true;
          field('portal-session').hidden = false;
          document.dispatchEvent(new Event('portal-connected'));
        }});
      client.requestAccessToken({prompt: 'select_account'});
    } catch { error(); }
  }
  async function summary() {
    if (!token || Date.now() >= expires) { clear(); throw new Error('Google sign-in required'); }
    const current = generation;
    const config = settings();
    const url = `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(config.spreadsheet)}/values/DEX_app!A:E?valueRenderOption=UNFORMATTED_VALUE`;
    const response = await fetch(url, {headers: {Authorization: `Bearer ${token}`}, credentials: 'omit', cache: 'no-store', redirect: 'error', signal: AbortSignal.timeout(20000)});
    if (response.status === 401 || response.status === 403) { clear(); throw new Error('Google access unavailable'); }
    if (!response.ok) throw new Error('Sheets unavailable');
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let text = ''; let bytes = 0;
    try {
      while (true) {
        const {done, value} = await reader.read();
        if (done) break;
        bytes += value.length;
        if (bytes > 16 * 1024 * 1024) throw new Error('Sheets response too large');
        text += decoder.decode(value, {stream: true});
      }
      text += decoder.decode();
    } finally { await reader.cancel(); }
    const data = await SheetsReader.decode(JSON.parse(text).values);
    if (current !== generation || !token || Date.now() >= expires) throw new Error('Session ended');
    return data;
  }
  if (enabled) {
    field('portal-login').hidden = false;
    try {
      const saved = JSON.parse(localStorage.getItem('dex.portal-settings') || 'null');
      if (saved) { field('google-client').value = saved.clientId || ''; field('google-sheet').value = saved.spreadsheet || ''; }
    } catch {}
    field('google-form').addEventListener('submit', connect);
    field('google-disconnect').addEventListener('click', clear);
    field('google-forget').addEventListener('click', () => {
      try { localStorage.removeItem('dex.portal-settings'); } catch {}
      field('google-form').reset();
      clear();
    });
    document.addEventListener('visibilitychange', () => { if (!document.hidden && token && Date.now() >= expires) clear(); });
  }
  return {enabled, summary, get connected() { return !!token && Date.now() < expires; }};
})();