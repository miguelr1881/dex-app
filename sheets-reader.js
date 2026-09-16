'use strict';

const SheetsReader = (() => {
  const HEADER = ['id', 'revision', 'parte', 'total_partes', 'json'];
  async function decode(rows) {
    if (!Array.isArray(rows) || JSON.stringify(rows[0]) !== JSON.stringify(HEADER) || rows.length < 2 || rows.length > 200000) throw new Error('Invalid summary table');
    const latest = rows.at(-1);
    if (!Array.isArray(latest) || !/^[a-f0-9]{64}$/.test(latest[1])) throw new Error('Invalid summary revision');
    const revision = latest[1];
    const parts = rows.slice(1).filter(row => row[1] === revision);
    if (!parts.length || parts.length > 200) throw new Error('Invalid summary size');
    parts.sort((first, second) => Number(first[2]) - Number(second[2]));
    parts.forEach((row, index) => {
      if (row.length !== 5 || row[0] !== `${revision}:${index}` || row[2] !== String(index) || row[3] !== String(parts.length) || typeof row[4] !== 'string' || row[4].length > 40000) throw new Error('Incomplete summary revision');
    });
    const text = parts.map(row => row[4]).join('');
    const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
    const actual = Array.from(new Uint8Array(digest), value => value.toString(16).padStart(2, '0')).join('');
    if (actual !== revision) throw new Error('Summary integrity failure');
    const payload = JSON.parse(text);
    if (payload.demo !== false || !Array.isArray(payload.accounts) || !payload.history) throw new Error('Invalid private summary');
    return payload;
  }
  return {decode};
})();