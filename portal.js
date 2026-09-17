'use strict';

const Portal = (() => {
  const enabled = document.documentElement.dataset.hosted === 'true';
  const scope = 'https://www.googleapis.com/auth/spreadsheets.readonly';
  const editScope = 'https://www.googleapis.com/auth/spreadsheets';
  const queueLimit = 2000;
  let editToken = null;
  let editExpires = 0;
  let sessionConfig = null;
  let submitting = false;
  let editConnecting = false;
  let receipts = [];
  const attempts = new Map();
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
    editToken = null; editExpires = 0; sessionConfig = null; receipts = []; attempts.clear();
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
          sessionConfig = config;
          expires = Date.now() + (Math.min(Number(response.expires_in), 3600) - 30) * 1000;
          generation += 1;
          clearTimeout(expiryTimer);
          expiryTimer = setTimeout(clear, expires - Date.now());
          try { localStorage.setItem('dex.portal-settings', JSON.stringify(config)); } catch {}
          field('portal-login').hidden = true;
          field('portal-session').hidden = false;
          document.dispatchEvent(new Event('portal-connected'));
        }});
      client.requestAccessToken({prompt: ''});
    } catch { error(); }
  }
  async function request(range, {write = false, body} = {}) {
    if (!token || Date.now() >= expires || !sessionConfig) throw new Error(I18n.translate('Vuelve a conectar con Google.'));
    if (write && !canEdit()) throw new Error(I18n.translate('Autoriza la edici\u00f3n con Google.'));
    const current = generation;
    const suffix = write ? ':append?valueInputOption=RAW&insertDataOption=INSERT_ROWS' : '?valueRenderOption=FORMULA';
    const url = `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(sessionConfig.spreadsheet)}/values/${range}${suffix}`;
    const response = await fetch(url, {method: write ? 'POST' : 'GET', headers: {Authorization: `Bearer ${write ? editToken : token}`, ...(write ? {'Content-Type': 'application/json'} : {})}, ...(write ? {body: JSON.stringify(body)} : {}), credentials: 'omit', cache: 'no-store', redirect: 'error', signal: AbortSignal.timeout(20000)});
    if (response.status === 401 || response.status === 403) {
      if (write) { editToken = null; editExpires = 0; document.dispatchEvent(new Event('portal-edit-permission')); }
      throw new Error(I18n.translate('Google no autoriz\u00f3 el acceso. Revisa la cuenta y los permisos.'));
    }
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
    if (current !== generation || !token || Date.now() >= expires) throw new Error('Session ended');
    return JSON.parse(text);
  }
  async function queue() {
    const data = await request(`DEX_solicitudes!A1:B${queueLimit + 2}`);
    const rows = data.values || [];
    if (JSON.stringify(rows[0]) !== JSON.stringify(['id', 'solicitud']) || rows.length > queueLimit + 1) throw new Error(I18n.translate('Cola de cambios no disponible.'));
    return rows.slice(1).map(row => {
      if (row.length !== 2 || !/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(row[0]) || typeof row[1] !== 'string' || row[1].length > 4096) throw new Error('Invalid request queue');
      let command;
      try { command = JSON.parse(row[1]); } catch { command = {}; }
      return {id: row[0], text: row[1], kind: ['salary', 'adjustment'].includes(command?.kind) ? command.kind : 'unknown'};
    });
  }
  async function summary() {
    const data = await SheetsReader.decode((await request('DEX_app!A:E')).values);
    receipts = data.remote_editing?.receipts || [];
    if (data.remote_editing?.enabled) {
      try {
        const rows = await queue();
        data.remote_editing.requests = [...new Map(rows.map(row => [row.id, {
          id: row.id, kind: row.kind, state: receipts.find(item => item.id === row.id)?.state || 'pending'
        }])).values()];
        data.remote_editing.queue_available = true;
      } catch { data.remote_editing.queue_available = false; }
    }
    return data;
  }
  function canEdit() { return !!editToken && !!token && Date.now() < Math.min(editExpires, expires); }
  function authorizeEdits() {
    if (!token || !sessionConfig || editConnecting) return;
    const current = generation;
    editConnecting = true;
    field('google-edit').disabled = true;
    field('portal-edit-error').hidden = true;
    const finish = () => { editConnecting = false; document.dispatchEvent(new Event('portal-edit-permission')); };
    const denied = () => {
      field('portal-edit-error').textContent = I18n.translate('Edici\u00f3n no autorizada. La lectura sigue disponible.');
      field('portal-edit-error').hidden = false;
      finish();
    };
    try {
      const editClient = google.accounts.oauth2.initTokenClient({client_id: sessionConfig.clientId,
        scope: editScope, include_granted_scopes: false, error_callback: denied,
        callback: response => {
          if (current !== generation) { finish(); return; }
          if (response.error || !response.access_token || !google.accounts.oauth2.hasGrantedAllScopes(response, editScope) || !Number.isFinite(Number(response.expires_in)) || Number(response.expires_in) < 60) { denied(); return; }
          editToken = response.access_token;
          editExpires = Date.now() + (Math.min(Number(response.expires_in), 3600) - 30) * 1000;
          finish();
        }});
      editClient.requestAccessToken({prompt: ''});
    } catch { denied(); }
  }
  async function submit(kind, change) {
    if (!canEdit()) throw new Error(I18n.translate('Autoriza la edici\u00f3n con Google.'));
    if (submitting) throw new Error(I18n.translate('Ya hay un env\u00edo en curso.'));
    const current = generation;
    const text = JSON.stringify({version: 1, kind, change});
    if (text.length > 4096 || !['salary', 'adjustment'].includes(kind)) throw new Error('Invalid change');
    const identifier = attempts.get(text) || crypto.randomUUID();
    attempts.set(text, identifier);
    submitting = true;
    try {
      const rows = await queue();
      if (rows.some(row => row.id === identifier && row.text !== text)) throw new Error('Request identity conflict');
      const existing = rows.find(row => row.text === text);
      if (existing) return {id: existing.id, queued: true};
      if (rows.length >= queueLimit) throw new Error(I18n.translate('Se alcanz\u00f3 el l\u00edmite de solicitudes.'));
      if (rows.some(row => row.kind === kind && !receipts.some(receipt => receipt.id === row.id))) throw new Error(I18n.translate('Hay un cambio pendiente. Actualiza antes de editar de nuevo.'));
      if (current !== generation) throw new Error('Session ended');
      await request('DEX_solicitudes!A:B', {write: true, body: {majorDimension: 'ROWS', values: [[identifier, text]]}});
      return {id: identifier, queued: true};
    } catch (error) {
      if (error instanceof TypeError || error.name === 'TimeoutError' || error.name === 'AbortError') throw new Error(I18n.translate('Env\u00edo sin confirmar. Actualiza; reintentar esta misma solicitud no la duplica.'));
      throw error;
    } finally { submitting = false; }
  }
  if (enabled) {
    field('portal-login').hidden = false;
    try {
      const saved = JSON.parse(localStorage.getItem('dex.portal-settings') || 'null');
      if (saved) { field('google-client').value = saved.clientId || ''; field('google-sheet').value = saved.spreadsheet || ''; }
    } catch {}
    field('google-form').addEventListener('submit', connect);
    field('google-disconnect').addEventListener('click', clear);
    field('google-edit').addEventListener('click', authorizeEdits);
    field('google-forget').addEventListener('click', () => {
      try { localStorage.removeItem('dex.portal-settings'); } catch {}
      field('google-form').reset();
      clear();
    });
    document.addEventListener('visibilitychange', () => { if (!document.hidden && token && Date.now() >= expires) clear(); });
  }
  return {enabled, summary, submit, get canEdit() { return canEdit(); }, get editConnecting() { return editConnecting; }, get connected() { return !!token && Date.now() < expires; }};
})();
