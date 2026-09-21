'use strict';

const Snapshot = (() => {
  const databaseName = 'dex-device-v1';
  const maxBytes = 12 * 1024 * 1024;
  const context = new TextEncoder().encode('DEX snapshot v1');
  let record = null;
  let generation = 0;
  let cached = false;
  function database() {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(databaseName, 1);
      request.onupgradeneeded = () => request.result.createObjectStore('device');
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(new Error('Device storage unavailable'));
      request.onblocked = () => reject(new Error('Device storage blocked'));
    });
  }
  async function storage(operation, value, expectedGeneration) {
    const connection = await database();
    try {
      if (expectedGeneration !== undefined && expectedGeneration !== generation) throw new Error('Device changed');
      return await new Promise((resolve, reject) => {
        const transaction = connection.transaction('device', operation === 'get' ? 'readonly' : 'readwrite');
        const store = transaction.objectStore('device');
        const request = operation === 'get' ? store.get('linked') : operation === 'put' ? store.put(value, 'linked') : store.delete('linked');
        transaction.oncomplete = () => resolve(request.result);
        transaction.onerror = transaction.onabort = () => reject(new Error('Device storage failed'));
      });
    } finally { connection.close(); }
  }
  function bytes(value) {
    if (typeof value !== 'string' || value.length > maxBytes || !/^[A-Za-z0-9+/]*={0,2}$/.test(value)) throw new Error('Invalid encrypted summary');
    return Uint8Array.from(atob(value), character => character.charCodeAt(0));
  }
  async function decrypt(envelope, key) {
    if (!envelope || Object.keys(envelope).sort().join(',') !== 'algorithm,ciphertext,nonce,version' || envelope.version !== 1 || envelope.algorithm !== 'AES-256-GCM') throw new Error('Unsupported encrypted summary');
    const nonce = bytes(envelope.nonce);
    const ciphertext = bytes(envelope.ciphertext);
    if (nonce.length !== 12 || ciphertext.length < 16) throw new Error('Invalid encrypted summary');
    const plaintext = await crypto.subtle.decrypt({name: 'AES-GCM', iv: nonce, additionalData: context}, key, ciphertext);
    const payload = JSON.parse(new TextDecoder('utf-8', {fatal: true}).decode(plaintext));
    if (payload.demo !== false || !Array.isArray(payload.accounts) || !payload.history || !Number.isFinite(Date.parse(payload.published_at)) || Date.parse(payload.published_at) > Date.now() + 300000) throw new Error('Invalid private summary');
    return payload;
  }
  async function download() {
    const response = await fetch('./data/dex-snapshot.json', {cache: 'no-store', credentials: 'omit', redirect: 'error', signal: AbortSignal.timeout(15000)});
    if (!response.ok) throw new Error('Published summary unavailable');
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let text = '';
    let size = 0;
    try {
      while (true) {
        const {done, value} = await reader.read();
        if (done) break;
        size += value.length;
        if (size > maxBytes) throw new Error('Summary too large');
        text += decoder.decode(value, {stream: true});
      }
      text += decoder.decode();
    } finally { await reader.cancel(); }
    return JSON.parse(text);
  }
  async function restore() {
    const current = generation;
    try {
      const saved = await storage('get');
      if (!saved?.key || saved.key.extractable || saved.key.algorithm.name !== 'AES-GCM' || saved.key.algorithm.length !== 256) return false;
      await decrypt(saved.envelope, saved.key);
      if (current !== generation) return false;
      record = saved;
      cached = true;
      return true;
    } catch { return false; }
  }
  async function pair(value) {
    const current = ++generation;
    if (!/^[a-fA-F0-9]{64}$/.test(value)) throw new Error('Invalid device key');
    const raw = Uint8Array.from(value.match(/../g), part => parseInt(part, 16));
    let key;
    try { key = await crypto.subtle.importKey('raw', raw, 'AES-GCM', false, ['decrypt']); }
    finally { raw.fill(0); }
    const envelope = await download();
    const payload = await decrypt(envelope, key);
    if (current !== generation) throw new Error('Device changed');
    const saved = {key, envelope};
    await storage('put', saved, current);
    if (current !== generation) throw new Error('Device changed');
    record = saved;
    cached = false;
    navigator.storage?.persist?.().catch(() => {});
    return payload;
  }
  async function summary() {
    const current = generation;
    const saved = record;
    if (!saved) throw new Error('Device not linked');
    const previous = await decrypt(saved.envelope, saved.key);
    try {
      const envelope = await download();
      const payload = await decrypt(envelope, saved.key);
      if (Date.parse(payload.published_at) < Date.parse(previous.published_at)) throw new Error('Older publication rejected');
      if (current !== generation) throw new Error('Device changed');
      const next = {key: saved.key, envelope};
      await storage('put', next, current);
      if (current !== generation) throw new Error('Device changed');
      record = next;
      cached = false;
      return payload;
    } catch {
      if (current !== generation) throw new Error('Device changed');
      cached = true;
      return previous;
    }
  }
  async function forget() {
    generation += 1;
    await storage('delete');
    record = null;
    cached = false;
  }
  return {restore, pair, summary, forget, get connected() { return !!record; }, get cached() { return cached; }};
})();